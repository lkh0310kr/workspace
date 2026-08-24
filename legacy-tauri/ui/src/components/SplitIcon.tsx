interface Props {
  direction: "vertical" | "horizontal";
}

/** Side-by-side (vertical divider) or stacked (horizontal divider) split glyphs. */
export function SplitIcon({ direction }: Props) {
  return (
    <span
      className={`split-icon split-icon-${direction}`}
      aria-hidden="true"
    />
  );
}
