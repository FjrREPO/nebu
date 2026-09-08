import { Column } from "@once-ui-system/core";
import type { ComponentProps, ReactNode } from "react";

type FrameProps = ComponentProps<typeof Column> & { children: ReactNode };

/**
 * A panel with crop marks at its corners — the archive frame the whole UI uses.
 *
 * The corner span is deliberately a bare element: sizing it with layout props
 * puts an inline height on it that no longer matches the panel's box, and the
 * bottom marks drift outside the border. CSS owns its box, nothing else.
 */
export function Frame({ children, className, ...rest }: FrameProps) {
  return (
    <Column
      className={["framed", className].filter(Boolean).join(" ")}
      border="neutral-alpha-weak"
      background="surface"
      {...rest}
    >
      <span className="framed-corners" aria-hidden="true" />
      {children}
    </Column>
  );
}
