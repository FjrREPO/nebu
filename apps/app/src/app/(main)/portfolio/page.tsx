import { Column, Row, Text } from "@once-ui-system/core";
import { Portfolio, SpecLabel } from "@/components";

export const metadata = { title: "Portfolio · nebu" };

export default function PortfolioPage() {
  return (
    <Column fillWidth maxWidth="l" paddingX="l" paddingY="40" gap="32">
      <Column gap="16" maxWidth="m">
        <SpecLabel mark>portfolio</SpecLabel>
        <Text variant="display-strong-s">Every agent, pointed at your wallet</Text>
        <Text variant="body-default-l" onBackground="neutral-weak">
          One pass over all four agents. Nothing is stored — the scan runs when you ask for it and
          the result lives only in this tab.
        </Text>
      </Column>
      <Row fillWidth borderTop="neutral-alpha-weak" />
      <Portfolio />
    </Column>
  );
}
