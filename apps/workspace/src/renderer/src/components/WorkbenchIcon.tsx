import type { SVGProps } from "react";

export type WorkbenchIconName =
  | "home" | "explorer" | "search" | "settings" | "terminal" | "browser"
  | "code" | "viewer" | "rss" | "book" | "plus" | "close" | "chevron-right"
  | "refresh" | "sun" | "cloud" | "drizzle" | "rain" | "snow" | "storm" | "fog";

type Props = SVGProps<SVGSVGElement> & { name: WorkbenchIconName; size?: number };

export function WorkbenchIcon({ name, size = 16, ...props }: Props): React.JSX.Element {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.35, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let art: React.ReactNode;
  switch (name) {
    case "home": art = <><path d="m2 7 6-5 6 5v7H9v-4H7v4H2z" /></>; break;
    case "explorer": art = <><path d="M2 3.5h4l1.4 1.7H14v7.3H2z" /><path d="M2 5.2h12l-1.5 8H2z" /></>; break;
    case "search": art = <><circle cx="6.8" cy="6.8" r="4.3" /><path d="m10 10 3.7 3.7" /></>; break;
    case "settings": art = <><path d="M6.2 1.7h3.6l.4 1.7 1.2.7 1.7-.5 1.8 3.1-1.3 1.2v1.4l1.3 1.2-1.8 3.1-1.7-.5-1.2.7-.4 1.7H6.2l-.4-1.7-1.2-.7-1.7.5-1.8-3.1 1.3-1.2V7.9L1.1 6.7l1.8-3.1 1.7.5 1.2-.7z" /><circle cx="8" cy="8" r="2.1" /></>; break;
    case "terminal": art = <><path d="M2 3h12v10H2z" /><path d="m4.2 6 2 2-2 2M7.5 10h3.2" /></>; break;
    case "browser": art = <><rect x="1.4" y="2" width="13.2" height="12" rx="1.7" /><path d="M1.8 5.2h12.4M4 3.65h.1M6 3.65h.1" /><circle cx="8" cy="9.65" r="2.75" /><path d="M5.25 9.65h5.5M8 6.9c-.8.72-1.2 1.64-1.2 2.75s.4 2.03 1.2 2.75M8 6.9c.8.72 1.2 1.64 1.2 2.75s-.4 2.03-1.2 2.75" /></>; break;
    case "code": art = <><path d="m5.2 4-3.4 4 3.4 4M10.8 4l3.4 4-3.4 4M9.3 2.8 6.7 13.2" /></>; break;
    case "viewer": art = <><path d="M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4S1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="1.8" /></>; break;
    case "rss": art = <><circle cx="3" cy="12" r=".7" /><path d="M2.5 7.7a5.8 5.8 0 0 1 5.8 5.8M2.5 3.5a10 10 0 0 1 10 10" /></>; break;
    case "book": art = <><path d="M2 3.2c2.2-.8 4.2-.5 6 1v9c-1.8-1.5-3.8-1.8-6-1zM14 3.2c-2.2-.8-4.2-.5-6 1v9c1.8-1.5 3.8-1.8 6-1z" /></>; break;
    case "plus": art = <><path d="M8 3v10M3 8h10" /></>; break;
    case "close": art = <><path d="m4 4 8 8M12 4l-8 8" /></>; break;
    case "chevron-right": art = <><path d="m6 3 5 5-5 5" /></>; break;
    case "refresh": art = <><path d="M12.8 6A5.2 5.2 0 0 0 3.4 4.4L2 6M2 2.5V6h3.5M3.2 10a5.2 5.2 0 0 0 9.4 1.6L14 10M14 13.5V10h-3.5" /></>; break;
    case "sun": art = <><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" /></>; break;
    case "cloud": art = <><path d="M4 11.8h7a2.6 2.6 0 0 0 .2-5.2 3.6 3.6 0 0 0-6.8.6A2.3 2.3 0 0 0 4 11.8Z" /></>; break;
    case "drizzle": art = <><path d="M4 9.5h7a2.6 2.6 0 0 0 .2-5.2 3.6 3.6 0 0 0-6.8.6A2.3 2.3 0 0 0 4 9.5Z" /><path d="m5 11.5-.5 1M8 11.5l-.5 1M11 11.5l-.5 1" /></>; break;
    case "rain": art = <><path d="M4 8.5h7a2.6 2.6 0 0 0 .2-5.2 3.6 3.6 0 0 0-6.8.6A2.3 2.3 0 0 0 4 8.5Z" /><path d="m5 10.5-1 2M8 10.5l-1 2M11 10.5l-1 2" /></>; break;
    case "snow": art = <><path d="M4 8.5h7a2.6 2.6 0 0 0 .2-5.2 3.6 3.6 0 0 0-6.8.6A2.3 2.3 0 0 0 4 8.5Z" /><path d="M5 11v2M4 12h2M9 11v2M8 12h2" /></>; break;
    case "storm": art = <><path d="M4 8.5h7a2.6 2.6 0 0 0 .2-5.2 3.6 3.6 0 0 0-6.8.6A2.3 2.3 0 0 0 4 8.5Z" /><path d="m8.5 9.5-2 3h2l-.5 2 2.5-3.5h-2z" /></>; break;
    case "fog": art = <><path d="M4 7.5h7a2.6 2.6 0 0 0 .2-5.2 3.6 3.6 0 0 0-6.8.6A2.3 2.3 0 0 0 4 7.5ZM2 10.5h10M4 13h9" /></>; break;
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" {...common} {...props}>{art}</svg>;
}

export function isWorkbenchIconName(value: string): value is WorkbenchIconName {
  return ["home", "explorer", "search", "settings", "terminal", "browser", "code", "viewer", "rss", "book", "plus", "close", "chevron-right", "refresh", "sun", "cloud", "drizzle", "rain", "snow", "storm", "fog"].includes(value);
}
