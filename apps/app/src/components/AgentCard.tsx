"use client";

import { Column, Row, SmartLink, StatusIndicator, Text } from "@once-ui-system/core";
import type { AgentCardData } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

const categoryLabel = (key: string) => CATEGORIES.find((entry) => entry.key === key)?.label ?? key;

/** Four glyphs, one per category — the agent's mark in a UI with no images. */
const GLYPH: Record<string, string> = {
  rebalancing: "[ ]",
  grid: "###",
  yield: "/\\/",
  health: "<+>",
};

export function AgentCard({ agent }: { agent: AgentCardData }) {
  const live = !agent.error;

  return (
    <SmartLink href={`/agents/${agent.id}`} unstyled style={{ height: "100%" }}>
      <Frame fillWidth fillHeight radius="m" padding="20" gap="20" transition="micro-medium">
        <Row fillWidth horizontal="between" vertical="center" gap="12">
          <SpecLabel>{categoryLabel(agent.category)}</SpecLabel>
          <Row gap="8" vertical="center">
            <StatusIndicator size="s" color={live ? "green" : "gray"} />
            <SpecLabel>{live ? "live" : "offline"}</SpecLabel>
          </Row>
        </Row>

        <Row gap="12" vertical="center" fillWidth>
          <Text variant="code-default-l" onBackground="neutral-weak">
            {GLYPH[agent.category] ?? "( )"}
          </Text>
          <Text variant="heading-strong-s">{agent.name}</Text>
        </Row>

        <Column gap="4" fillWidth>
          <Text variant="label-strong-s">
            {agent.error ? "Feed unavailable" : (agent.status?.headline ?? "")}
          </Text>
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {agent.error ?? agent.status?.detail}
          </Text>
        </Column>

        <Row fillWidth horizontal="between" vertical="center" gap="12" marginTop="8">
          <SpecLabel>{agent.protocol}</SpecLabel>
          <SpecLabel>open →</SpecLabel>
        </Row>
      </Frame>
    </SmartLink>
  );
}
