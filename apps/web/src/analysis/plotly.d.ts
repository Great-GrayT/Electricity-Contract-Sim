// plotly.js-dist-min ships no types; the analysis page only uses react/purge/newPlot with
// plain figure objects, so a structural stub is enough and keeps @types/plotly.js out.
declare module "plotly.js-dist-min" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Plotly: any;
  export default Plotly;
}
