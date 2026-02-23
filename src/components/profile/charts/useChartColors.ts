import { useState, useEffect } from "react";

interface ChartColors {
  accent: string;
  accentSecondary: string;
  success: string;
  warning: string;
  error: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  bgSecondary: string;
  bgTertiary: string;
  border: string;
}

function readColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    accent: get("--color-accent-primary"),
    accentSecondary: get("--color-accent-secondary"),
    success: get("--color-accent-success"),
    warning: get("--color-accent-warning"),
    error: get("--color-accent-error"),
    textPrimary: get("--color-text-primary"),
    textSecondary: get("--color-text-secondary"),
    textTertiary: get("--color-text-tertiary"),
    bgSecondary: get("--color-bg-secondary"),
    bgTertiary: get("--color-bg-tertiary"),
    border: get("--color-border-subtle"),
  };
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(readColors);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
