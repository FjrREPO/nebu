import { Column, Row, Text } from "@once-ui-system/core";
import { Marketplace } from "@/components";
import { agentCards } from "@/lib/agents";

/** Card numbers are read from chain, so let them go stale for a minute at most. */
export const revalidate = 60;

export default async function Home() {
  const agents = await agentCards();

  return (
    <Column fillWidth maxWidth="xl" paddingX="l" paddingY="40" gap="40">
      <Text variant="display-strong-l">Nebu Agents</Text>

      <Row fillWidth borderTop="neutral-alpha-weak" />

      <Marketplace agents={agents} />
    </Column>
  );
}
