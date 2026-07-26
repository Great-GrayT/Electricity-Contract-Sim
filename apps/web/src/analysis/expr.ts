/**
 * Small, safe formula language for custom fields and conditions.
 *
 * No eval: the source is tokenised, parsed with a recursive-descent parser and compiled to
 * a closure over the row index, reading series from the SeriesStore.
 *
 * Grammar (loosest to tightest):
 *   or   := and ( "or" and )*
 *   and  := not ( "and" not )*
 *   not  := "not" not | cmp
 *   cmp  := add ( ( ">" | ">=" | "<" | "<=" | "=" | "==" | "!=" ) add )?
 *   add  := mul ( ( "+" | "-" ) mul )*
 *   mul  := unary ( ( "*" | "/" | "%" ) unary )*
 *   unary:= ( "-" | "+" ) unary | power
 *   power:= atom ( "^" unary )?
 *   atom := number | ident | ident "(" args ")" | "(" or ")"
 *
 * Booleans are 1 / 0. Any comparison involving NaN is false, so a missing observation can
 * never satisfy a condition. Arithmetic propagates NaN, so a missing input yields a missing
 * result rather than a silently wrong number.
 */

export type RowFn = (i: number) => number;

export interface CompileResult {
  fn: RowFn;
  /** Field keys the expression reads. */
  refs: string[];
}

export class ExprError extends Error {
  constructor(message: string, readonly position: number) {
    super(message);
    this.name = "ExprError";
  }
}

type Tok =
  | { t: "num"; v: number; p: number }
  | { t: "id"; v: string; p: number }
  | { t: "op"; v: string; p: number };

const OPS = [">=", "<=", "==", "!=", "<>", ">", "<", "=", "+", "-", "*", "/", "%", "^", "(", ")", ","];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`bad number at ${i}`, i);
      out.push({ t: "num", v: parseFloat(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], p: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`unexpected character "${c}"`, i);
    out.push({ t: "op", v: op === "<>" ? "!=" : op, p: i });
    i += op.length;
  }
  return out;
}

const FUNCTIONS: Record<string, { arity: number[]; fn: (...a: number[]) => number; help: string }> = {
  abs: { arity: [1], fn: (x) => Math.abs(x!), help: "abs(x)" },
  sqrt: { arity: [1], fn: (x) => Math.sqrt(x!), help: "sqrt(x)" },
  ln: { arity: [1], fn: (x) => Math.log(x!), help: "ln(x)" },
  log10: { arity: [1], fn: (x) => Math.log10(x!), help: "log10(x)" },
  exp: { arity: [1], fn: (x) => Math.exp(x!), help: "exp(x)" },
  floor: { arity: [1], fn: (x) => Math.floor(x!), help: "floor(x)" },
  ceil: { arity: [1], fn: (x) => Math.ceil(x!), help: "ceil(x)" },
  round: { arity: [1, 2], fn: (x, d) => { const f = Math.pow(10, d ?? 0); return Math.round(x! * f) / f; }, help: "round(x[, dp])" },
  sign: { arity: [1], fn: (x) => Math.sign(x!), help: "sign(x)" },
  min: { arity: [2, 3, 4, 5, 6], fn: (...a) => Math.min(...a), help: "min(a, b, …)" },
  max: { arity: [2, 3, 4, 5, 6], fn: (...a) => Math.max(...a), help: "max(a, b, …)" },
  clamp: { arity: [3], fn: (x, lo, hi) => Math.min(Math.max(x!, lo!), hi!), help: "clamp(x, lo, hi)" },
  if: { arity: [3], fn: (c, a, b) => (c ? a! : b!), help: "if(condition, then, else)" },
  isnan: { arity: [1], fn: (x) => (x !== x ? 1 : 0), help: "isnan(x)" },
  coalesce: { arity: [2, 3, 4], fn: (...a) => a.find((v) => v === v) ?? NaN, help: "coalesce(a, b, …)" },
};

export const FUNCTION_HELP = Object.values(FUNCTIONS).map((f) => f.help);

/** Compile a formula against a set of known field keys. Throws ExprError on any problem. */
export function compile(src: string, known: Set<string>, series: (key: string) => Float64Array): CompileResult {
  const toks = tokenize(src);
  if (!toks.length) throw new ExprError("empty expression", 0);
  const refs = new Set<string>();
  let pos = 0;

  const peek = () => toks[pos];
  const at = (v: string) => { const t = peek(); return !!t && t.t === "op" && t.v === v; };
  const atWord = (w: string) => { const t = peek(); return !!t && t.t === "id" && t.v.toLowerCase() === w; };
  const eat = (v: string) => {
    if (!at(v)) throw new ExprError(`expected "${v}"`, peek()?.p ?? src.length);
    pos++;
  };

  function parseOr(): RowFn {
    let left = parseAnd();
    while (atWord("or")) {
      pos++;
      const right = parseAnd();
      const l = left;
      left = (i) => (truthy(l(i)) || truthy(right(i)) ? 1 : 0);
    }
    return left;
  }
  function parseAnd(): RowFn {
    let left = parseNot();
    while (atWord("and")) {
      pos++;
      const right = parseNot();
      const l = left;
      left = (i) => (truthy(l(i)) && truthy(right(i)) ? 1 : 0);
    }
    return left;
  }
  function parseNot(): RowFn {
    if (atWord("not")) { pos++; const inner = parseNot(); return (i) => (truthy(inner(i)) ? 0 : 1); }
    return parseCmp();
  }
  function parseCmp(): RowFn {
    const left = parseAdd();
    const t = peek();
    if (t && t.t === "op" && [">", ">=", "<", "<=", "=", "==", "!="].includes(t.v)) {
      pos++;
      const right = parseAdd();
      const op = t.v;
      return (i) => {
        const a = left(i), b = right(i);
        if (a !== a || b !== b) return 0; // NaN never satisfies a condition
        switch (op) {
          case ">": return a > b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
          case "<": return a < b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case "!=": return a !== b ? 1 : 0;
          default: return a === b ? 1 : 0;
        }
      };
    }
    return left;
  }
  function parseAdd(): RowFn {
    let left = parseMul();
    for (;;) {
      if (at("+")) { pos++; const r = parseMul(); const l = left; left = (i) => l(i) + r(i); }
      else if (at("-")) { pos++; const r = parseMul(); const l = left; left = (i) => l(i) - r(i); }
      else return left;
    }
  }
  function parseMul(): RowFn {
    let left = parseUnary();
    for (;;) {
      if (at("*")) { pos++; const r = parseUnary(); const l = left; left = (i) => l(i) * r(i); }
      else if (at("/")) { pos++; const r = parseUnary(); const l = left; left = (i) => { const d = r(i); return d === 0 ? NaN : l(i) / d; }; }
      else if (at("%")) { pos++; const r = parseUnary(); const l = left; left = (i) => l(i) % r(i); }
      else return left;
    }
  }
  function parseUnary(): RowFn {
    if (at("-")) { pos++; const inner = parseUnary(); return (i) => -inner(i); }
    if (at("+")) { pos++; return parseUnary(); }
    return parsePower();
  }
  function parsePower(): RowFn {
    const base = parseAtom();
    if (at("^")) { pos++; const e = parseUnary(); return (i) => Math.pow(base(i), e(i)); }
    return base;
  }
  function parseAtom(): RowFn {
    const t = peek();
    if (!t) throw new ExprError("unexpected end of expression", src.length);
    if (t.t === "num") { pos++; const v = t.v; return () => v; }
    if (t.t === "op" && t.v === "(") { pos++; const inner = parseOr(); eat(")"); return inner; }
    if (t.t === "id") {
      pos++;
      const name = t.v;
      if (at("(")) {
        const spec = FUNCTIONS[name.toLowerCase()];
        if (!spec) throw new ExprError(`unknown function "${name}"`, t.p);
        pos++;
        const args: RowFn[] = [];
        if (!at(")")) {
          args.push(parseOr());
          while (at(",")) { pos++; args.push(parseOr()); }
        }
        eat(")");
        if (!spec.arity.includes(args.length)) {
          throw new ExprError(`${name}() takes ${spec.arity.join(" or ")} argument(s), got ${args.length}`, t.p);
        }
        const f = spec.fn;
        if (name.toLowerCase() === "if") {
          const [c, a, b] = args as [RowFn, RowFn, RowFn];
          return (i) => (truthy(c(i)) ? a(i) : b(i));
        }
        return (i) => f(...args.map((a) => a(i)));
      }
      const lower = name.toLowerCase();
      if (lower === "true") return () => 1;
      if (lower === "false") return () => 0;
      if (lower === "pi") return () => Math.PI;
      if (!known.has(name)) throw new ExprError(`unknown field "${name}"`, t.p);
      refs.add(name);
      const col = series(name);
      return (i) => col[i]!;
    }
    throw new ExprError(`unexpected "${t.v}"`, t.p);
  }

  const fn = parseOr();
  if (pos !== toks.length) throw new ExprError(`unexpected "${toks[pos]!.v}"`, toks[pos]!.p);
  return { fn, refs: [...refs] };
}

function truthy(v: number): boolean {
  return v === v && v !== 0;
}

/** Materialise a compiled expression over every row. */
export function evaluate(fn: RowFn, rows: number): Float64Array {
  const out = new Float64Array(rows);
  for (let i = 0; i < rows; i++) out[i] = fn(i);
  return out;
}
