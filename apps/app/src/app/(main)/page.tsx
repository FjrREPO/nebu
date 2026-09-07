import { Column, Row, Text } from "@once-ui-system/core";
import { Marketplace, SpecLabel } from "@/components";
import { agentCards } from "@/lib/agents";

/** Card numbers are read from chain, so let them go stale for a minute at most. */
export const revalidate = 60;

export default async function Home() {
  const agents = await agentCards();

  return (
    <Column fillWidth maxWidth="xl" paddingX="l" paddingY="40" gap="40">
      <Column fillWidth gap="16" maxWidth="m">
        <SpecLabel mark>{`nebu archive — bnb smart chain — ${agents.length} units`}</SpecLabel>
        <Text variant="display-strong-l">Agents that work your positions</Text>
        <Text variant="body-default-l" onBackground="neutral-weak">
          Four agents covering rebalancing, grid trading, yield routing and liquidation defence.
          Each one reads BNB Smart Chain live, shows the data it decided from, and hands you the
          exact transactions. You sign them.
        </Text>
      </Column>

      <Row fillWidth borderTop="neutral-alpha-weak" />

      <Marketplace agents={agents} />
    </Column>
  );
}
