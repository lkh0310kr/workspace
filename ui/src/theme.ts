export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "workspace.theme";

export function getStoredThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function setStoredThemePreference(preference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, preference);
}

function systemPrefersLight(): boolean {
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersLight() ? "light" : "dark";
  }
  return preference;
}

/** Applies a resolved theme to the document root and the flexlayout-react
 * theme wrapper class (see `flexlayout-react/style/combined.css`, imported
 * instead of a single fixed `dark.css` so both themes are available to
 * switch between at runtime). */
export function applyResolvedTheme(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.remove("flexlayout__theme_light", "flexlayout__theme_dark");
  document.documentElement.classList.add(`flexlayout__theme_${resolved}`);
}

/** Applies `preference`, and if it's "system", keeps it in sync with OS
 * theme changes until the returned cleanup function is called. */
export function applyThemePreference(preference: ThemePreference): () => void {
  applyResolvedTheme(resolveTheme(preference));
  if (preference !== "system") {
    return () => {};
  }
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const onChange = () => applyResolvedTheme(resolveTheme("system"));
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
