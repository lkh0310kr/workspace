type Props = {
  children: React.ReactNode;
  className?: string;
  onRefresh?: () => void;
  /** Screen-reader label — no visible section title. */
  ariaLabel?: string;
};

export function DashboardWidget({
  children,
  className,
  onRefresh,
  ariaLabel,
}: Props): React.JSX.Element {
  return (
    <section
      className={`dashboard-widget${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel}
    >
      {onRefresh ? (
        <button
          type="button"
          className="dashboard-widget-refresh"
          onClick={onRefresh}
          aria-label="새로고침"
        >
          ↻
        </button>
      ) : null}
      <div className="dashboard-widget-body">{children}</div>
    </section>
  );
}
