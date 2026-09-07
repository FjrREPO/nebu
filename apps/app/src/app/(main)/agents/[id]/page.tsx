import { Button, Column, Heading, Row, Tag, Text } from "@once-ui-system/core";
import { notFound } from "next/navigation";
import { AgentRunner, WalletBar } from "@/components";
import { agentMeta, exampleStatus, findAgentMeta } from "@/lib/agents";
import { CATEGORIES } from "@/lib/types";

/** The example read is live, so do not serve a card from last week. */
export const revalidate = 60;

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
  const initialStatus = await exampleStatus(agent.id);

  return (
    <Column fillWidth horizontal="center" paddingX="l" paddingY="24" gap="40">
      <Row fillWidth maxWidth="m" horizontal="between" vertical="center" gap="16">
        <Button href="/" variant="tertiary" size="s">
          nebu
        </Button>
        <WalletBar />
      </Row>

      <Column fillWidth maxWidth="m" gap="16">
        <Row gap="8" vertical="center" wrap>
          <Tag
            variant="neutral"
            size="s"
            prefixIcon={agent.category}
            label={category?.label ?? agent.category}
          />
          <Tag variant="neutral" size="s" label={agent.protocol} />
          <Tag variant="neutral" size="s" label={`chain ${agent.chainId}`} />
        </Row>
        <Heading variant="display-strong-s">{agent.name}</Heading>
        <Text variant="body-default-l" onBackground="neutral-weak">
          {agent.summary}
        </Text>
      </Column>

      <Column fillWidth maxWidth="m">
        <AgentRunner agent={agent} initialStatus={initialStatus} />
      </Column>
    </Column>
  );
}
