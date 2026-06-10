import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "uc-theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Colors for recharts/lightweight-charts, which can't read CSS variables directly. */
export interface ChartColors {
  axisColor: string;
  gridColor: string;
  tooltipBg: string;
  tooltipBorder: string;
  /** High-contrast line/text color for "net" series that need to stand out. */
  strongColor: string;
}

const LIGHT_CHART: ChartColors = {
  axisColor: "#57606a",
  gridColor: "#d7dee3",
  tooltipBg: "#ffffff",
  tooltipBorder: "#d7dee3",
  strongColor: "#1b232a",
};

const DARK_CHART: ChartColors = {
  axisColor: "#8b949e",
  gridColor: "#21262d",
  tooltipBg: "#161b22",
  tooltipBorder: "#30363d",
  strongColor: "#e6edf3",
};

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  return theme === "dark" ? DARK_CHART : LIGHT_CHART;
}
