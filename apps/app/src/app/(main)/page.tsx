import { Badge, Column, Heading, Line, Row, Schema, Text } from "@once-ui-system/core";
import { Marketplace, WalletBar } from "@/components";
import { agentCards } from "@/lib/agents";
import { baseURL, meta } from "@/resources/seo";

/** Card numbers are read from chain, so let them go stale for a minute at most. */
export const revalidate = 60;

export default async function Home() {
  const agents = await agentCards();

  return (
    <Column fillWidth horizontal="center" paddingX="l" paddingY="24" gap="40">
      <Schema
        as="webPage"
        baseURL={baseURL}
        title={meta.home.title}
        description={meta.home.description}
        path={meta.home.path}
      />

      <Row fillWidth maxWidth="l" horizontal="between" vertical="center" gap="16">
        <Text variant="heading-strong-m">nebu</Text>
        <WalletBar />
      </Row>

      <Column maxWidth="m" horizontal="center" gap="16" align="center">
        <Badge
          textVariant="label-default-s"
          border="neutral-alpha-medium"
          onBackground="neutral-medium"
        >
          Agent marketplace for BNB Smart Chain
        </Badge>
        <Heading variant="display-strong-l" align="center">
          Smart money, without the smart friends
        </Heading>
        <Text variant="body-default-l" onBackground="neutral-weak" align="center">
          Four agents that watch your positions on BNB Chain and hand you the exact transactions to
          fix them. Every number on this page was read from mainnet, not written by hand.
        </Text>
      </Column>

      <Line background="neutral-alpha-weak" maxWidth="l" />

      <Column fillWidth maxWidth="l">
        <Marketplace agents={agents} />
      </Column>
    </Column>
  );
}
