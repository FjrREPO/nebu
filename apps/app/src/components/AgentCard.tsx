"use client";

import { Card, Column, Icon, Row, StatusIndicator, Tag, Text } from "@once-ui-system/core";
import { type AgentCardData, CATEGORIES } from "@/lib/types";

const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

export function AgentCard({ agent }: { agent: AgentCardData }) {
  const tone = agent.error ? "gray" : agent.status?.actionable ? "orange" : "green";

  return (
    <Card
      href={`/agents/${agent.id}`}
      direction="column"
      fillWidth
      fillHeight
      gap="16"
      padding="24"
      radius="l"
      border="neutral-alpha-weak"
      background="surface"
    >
      <Row fillWidth horizontal="between" vertical="center" gap="8">
        <Tag
          variant="neutral"
          size="s"
          prefixIcon={agent.category}
          label={categoryLabel(agent.category)}
        />
        <Icon name="arrowRight" size="s" onBackground="neutral-weak" />
      </Row>

      <Column gap="4" fillWidth>
        <Text variant="heading-strong-s">{agent.name}</Text>
        <Text variant="label-default-s" onBackground="brand-medium">
          {agent.protocol}
        </Text>
      </Column>

      <Text variant="body-default-s" onBackground="neutral-weak">
        {agent.summary}
      </Text>

      <Column
        fillWidth
        gap="8"
        marginTop="8"
        paddingY="12"
        paddingX="16"
        radius="m"
        background="neutral-alpha-weak"
      >
        <Row gap="8" vertical="center">
          <StatusIndicator size="s" color={tone} />
          <Text variant="label-strong-s">
            {agent.error ? "Live data unavailable" : (agent.status?.headline ?? "")}
          </Text>
        </Row>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {agent.error ?? agent.status?.detail}
        </Text>
      </Column>
    </Card>
  );
}
