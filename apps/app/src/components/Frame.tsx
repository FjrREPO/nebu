import { Column, type Flex } from "@once-ui-system/core";
import type { ComponentProps, ReactNode } from "react";

type FrameProps = ComponentProps<typeof Column> & { children: ReactNode };

/** A panel with crop marks at its corners — the archive frame the whole UI uses. */
export function Frame({ children, className, ...rest }: FrameProps) {
  return (
    <Column
      className={["framed", className].filter(Boolean).join(" ")}
      border="neutral-alpha-weak"
      background="surface"
      {...rest}
    >
      <Column className="framed-corners" position="absolute" fill pointerEvents="none" />
      {children}
    </Column>
  );
}

export type { Flex };
