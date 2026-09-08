import { Column, Grid, Row, StatusIndicator, Text } from "@once-ui-system/core";
import { notFound } from "next/navigation";
import { ActivityFeed, AgentRunner, DataTable, Frame, SpecLabel, StatStrip } from "@/components";
import { agentInsights, agentMeta, exampleStatus, findAgentMeta } from "@/lib/agents";
import { CATEGORIES } from "@/lib/types";

/** The whole page is live reads, so let it go stale for a minute at most. */
export const revalidate = 60;

const GLYPH: Record<string, string> = {
  rebalancing: "[ ]",
  grid: "###",
  yield: "/\\/",
  health: "<+>",
};

export function generateStaticParams() {
  return agentMeta().map((agent) => ({ id: agent.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const agent = findAgentMeta((await params).id);
  return { title: agent ? `${agent.name} · nebu` : "nebu" };
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const agent = findAgentMeta((await params).id);
  if (!agent) notFound();

  const category = CATEGORIES.find((entry) => entry.key === agent.category);
  const [status, insights] = await Promise.all([exampleStatus(agent.id), agentInsights(agent.id)]);

  return (
    <Column fillWidth maxWidth="xl" paddingX="l" paddingY="40" gap="32">
      <Row fillWidth gap="24" vertical="center" wrap>
        <Frame radius="m" minWidth={7} minHeight={7} center>
          <Text variant="display-strong-s" onBackground="neutral-weak">
            {GLYPH[agent.category] ?? "( )"}
          </Text>
        </Frame>
        <Column gap="12" flex={1} minWidth={16}>
          <Text variant="display-strong-s">{agent.name}</Text>
          <Row gap="8" vertical="center" wrap>
            <Row paddingX="12" paddingY="4" border="neutral-alpha-weak" radius="xs">
              <SpecLabel>{category?.label ?? agent.category}</SpecLabel>
            </Row>
            <Row paddingX="12" paddingY="4" border="neutral-alpha-weak" radius="xs">
              <SpecLabel>{agent.protocol}</SpecLabel>
            </Row>
            <Row
              paddingX="12"
              paddingY="4"
              border="neutral-alpha-weak"
              radius="xs"
              gap="8"
              vertical="center"
            >
              <StatusIndicator size="s" color={status ? "green" : "gray"} />
              <SpecLabel>{status ? "live" : "no feed"}</SpecLabel>
            </Row>
          </Row>
        </Column>
      </Row>

      <Row
        fillWidth
        gap="24"
        vertical="start"
        s={{ direction: "column" }}
        m={{ direction: "column" }}
      >
        <Column
          maxWidth={22}
          minWidth={20}
          gap="16"
          position="sticky"
          top="80"
          overflowY="auto"
          scrollbar="minimal"
          m={{ maxWidth: undefined, position: "relative" }}
          // The rail follows you down a long page; on a short viewport it scrolls itself.
          style={{ maxHeight: "calc(100dvh - 6rem)" }}
        >
          <AgentRunner agent={agent} initialStatus={status} />
        </Column>

        <Column fillWidth gap="32" minWidth={0}>
          <Text variant="body-default-l" onBackground="neutral-weak">
            {agent.summary}
          </Text>

          {insights && <StatStrip stats={insights.stats} />}
          {insights?.table && <DataTable table={insights.table} />}

          <Column fillWidth gap="12">
            <Text variant="heading-strong-s">What this agent can do with your wallet</Text>
            <Frame fillWidth radius="m" padding="20" gap="12">
              {agent.grants.map((grant) => (
                <Row key={grant} gap="12" vertical="start">
                  <Text variant="code-default-s" onBackground="brand-medium">
                    +
                  </Text>
                  <Text variant="body-default-s" onBackground="neutral-medium">
                    {grant}
                  </Text>
                </Row>
              ))}
            </Frame>
          </Column>

          <Column fillWidth gap="12">
            <Text variant="heading-strong-s">Details</Text>
            <Frame fillWidth radius="m" padding="4">
              <Grid fillWidth columns={2} s={{ columns: 1 }}>
                {[
                  ["Agent id", agent.id],
                  ["Category", category?.label ?? agent.category],
                  ["Venue", agent.protocol],
                  ["Chain", `BNB Smart Chain (${agent.chainId})`],
                  ["Custody", "Non-custodial — you sign, or a capped session key does"],
                  ["Registry", "nebu"],
                ].map(([label, value]) => (
                  <Row key={label} fillWidth horizontal="between" gap="16" padding="16">
                    <SpecLabel>{label}</SpecLabel>
                    <Text variant="code-default-xs" align="right">
                      {value}
                    </Text>
                  </Row>
                ))}
              </Grid>
            </Frame>
          </Column>

          {insights?.activity && <ActivityFeed entries={insights.activity} />}
        </Column>
      </Row>
    </Column>
  );
}
