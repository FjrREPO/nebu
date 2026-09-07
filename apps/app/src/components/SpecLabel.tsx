import { Text } from "@once-ui-system/core";
import type { ReactNode } from "react";

/**
 * The tiny tracked-out caps that title every panel and column. `mark` adds the
 * comment slashes as an expression, so the text never reads as a JSX comment.
 */
export function SpecLabel({ children, mark }: { children: ReactNode; mark?: boolean }) {
  return (
    <Text as="span" className="spec-label">
      {mark ? "// " : null}
      {children}
    </Text>
  );
}
