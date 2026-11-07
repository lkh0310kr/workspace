import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  as?: "div";
}

/** App-wide scroll container — pairs with `.scroll-region` in styles.css. */
export const ScrollRegion = forwardRef<HTMLDivElement, Props>(function ScrollRegion(
  { children, className, as: _as = "div", ...rest },
  ref,
) {
  const classes = ["scroll-region", className].filter(Boolean).join(" ");
  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});
