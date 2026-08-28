// Vector Editor toolbar icons — real glyphs, not placeholder characters.
// Stroke-style (viewBox 0 0 24 24, round caps/joins, currentColor),
// matching the common Feather/Lucide-family convention so every icon in
// the toolbar reads at a consistent weight — except SelectIcon, which is
// a solid cursor-arrow glyph since cursor icons are conventionally filled,
// not outlined, in every mainstream toolset (Figma, Illustrator, macOS
// itself).

interface IconProps {
  className?: string;
}

const STROKE = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SelectIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon fill="currentColor" points="6,3 6,19 9.7,15.6 12.4,21 15.2,19.6 12.5,14.3 18,14.3" />
    </svg>
  );
}

export function RectIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect {...STROKE} x="4" y="6" width="16" height="12" rx="1.5" />
    </svg>
  );
}

export function EllipseIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse {...STROKE} cx="12" cy="12" rx="8" ry="6" />
    </svg>
  );
}

export function LineIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="5" y1="19" x2="19" y2="5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PenIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M4 20l3-1 9.5-9.5-2-2L5 17z" />
      <path {...STROKE} d="M14.5 7.5l2 2" />
      <circle cx="18.5" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TextIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M5 6.5h14" />
      <path {...STROKE} d="M12 6.5v13" />
      <path {...STROKE} d="M9 19.5h6" />
    </svg>
  );
}

export function GroupIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect {...STROKE} x="4" y="4" width="11" height="11" rx="1.5" />
      <rect {...STROKE} x="9" y="9" width="11" height="11" rx="1.5" />
    </svg>
  );
}

export function UngroupIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect {...STROKE} x="3" y="3" width="8" height="8" rx="1.5" />
      <rect {...STROKE} x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M10 3 5 7l5 4" />
      <path {...STROKE} d="M5 7h11a5 5 0 0 1 0 10h-5" />
    </svg>
  );
}

export function RedoIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M14 3l5 4-5 4" />
      <path {...STROKE} d="M19 7H8a5 5 0 0 0 0 10h5" />
    </svg>
  );
}

export function BringToFrontIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="5" y1="4" x2="19" y2="4" />
      <path {...STROKE} d="M12 20V8" />
      <path {...STROKE} d="M7 12l5-5 5 5" />
    </svg>
  );
}

export function BringForwardIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M12 19V5" />
      <path {...STROKE} d="M6 11l6-6 6 6" />
    </svg>
  );
}

export function SendBackwardIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M12 5v14" />
      <path {...STROKE} d="M18 13l-6 6-6-6" />
    </svg>
  );
}

export function SendToBackIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="5" y1="20" x2="19" y2="20" />
      <path {...STROKE} d="M12 4v12" />
      <path {...STROKE} d="M7 12l5 5 5-5" />
    </svg>
  );
}

export function FlipHorizontalIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="12" y1="3" x2="12" y2="21" strokeDasharray="2.5 2.5" />
      <path {...STROKE} d="M8 7L4 12l4 5" />
      <path {...STROKE} d="M16 7l4 5-4 5" />
    </svg>
  );
}

export function FlipVerticalIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="3" y1="12" x2="21" y2="12" strokeDasharray="2.5 2.5" />
      <path {...STROKE} d="M7 8l5-4 5 4" />
      <path {...STROKE} d="M7 16l5 4 5-4" />
    </svg>
  );
}

export function ZoomOutIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle {...STROKE} cx="11" cy="11" r="7" />
      <line {...STROKE} x1="21" y1="21" x2="16.65" y2="16.65" />
      <line {...STROKE} x1="8" y1="11" x2="14" y2="11" />
    </svg>
  );
}

export function ZoomInIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle {...STROKE} cx="11" cy="11" r="7" />
      <line {...STROKE} x1="21" y1="21" x2="16.65" y2="16.65" />
      <line {...STROKE} x1="8" y1="11" x2="14" y2="11" />
      <line {...STROKE} x1="11" y1="8" x2="11" y2="14" />
    </svg>
  );
}

export function ZoomToSelectionIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M4 9V4h5" />
      <path {...STROKE} d="M15 4h5v5" />
      <path {...STROKE} d="M20 15v5h-5" />
      <path {...STROKE} d="M9 20H4v-5" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M12 3v12" />
      <path {...STROKE} d="M7 10l5 5 5-5" />
      <path {...STROKE} d="M4 21h16" />
    </svg>
  );
}

export function AlignLeftIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="4" y1="3" x2="4" y2="21" />
      <rect {...STROKE} x="4" y="5" width="7" height="5" />
      <rect {...STROKE} x="4" y="14" width="13" height="5" />
    </svg>
  );
}

export function AlignRightIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="20" y1="3" x2="20" y2="21" />
      <rect {...STROKE} x="13" y="5" width="7" height="5" />
      <rect {...STROKE} x="7" y="14" width="13" height="5" />
    </svg>
  );
}

export function AlignHCenterIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="12" y1="3" x2="12" y2="21" />
      <rect {...STROKE} x="8" y="5" width="8" height="5" />
      <rect {...STROKE} x="6" y="14" width="12" height="5" />
    </svg>
  );
}

export function AlignTopIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="3" y1="4" x2="21" y2="4" />
      <rect {...STROKE} x="5" y="4" width="5" height="7" />
      <rect {...STROKE} x="14" y="4" width="5" height="13" />
    </svg>
  );
}

export function AlignBottomIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="3" y1="20" x2="21" y2="20" />
      <rect {...STROKE} x="5" y="13" width="5" height="7" />
      <rect {...STROKE} x="14" y="7" width="5" height="13" />
    </svg>
  );
}

export function AlignVCenterIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <line {...STROKE} x1="3" y1="12" x2="21" y2="12" />
      <rect {...STROKE} x="5" y="8" width="5" height="8" />
      <rect {...STROKE} x="14" y="6" width="5" height="12" />
    </svg>
  );
}

export function DistributeHorizontalIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect {...STROKE} x="3" y="7" width="4" height="10" />
      <rect {...STROKE} x="10" y="7" width="4" height="10" />
      <rect {...STROKE} x="17" y="7" width="4" height="10" />
    </svg>
  );
}

export function DistributeVerticalIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect {...STROKE} x="7" y="3" width="10" height="4" />
      <rect {...STROKE} x="7" y="10" width="10" height="4" />
      <rect {...STROKE} x="7" y="17" width="10" height="4" />
    </svg>
  );
}

export function SaveIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path {...STROKE} d="M5 4h11l4 4v12H5z" />
      <path {...STROKE} d="M8 4v5h8V4" />
      <rect {...STROKE} x="8" y="13" width="8" height="6" />
    </svg>
  );
}
