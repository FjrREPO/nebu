"use client";

import { Column, Grid, Row, SmartLink, StatusIndicator, Text } from "@once-ui-system/core";
import type { AgentCardData } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

const categoryLabel = (key: string) => CATEGORIES.find((entry) => entry.key === key)?.label ?? key;

/** Four glyphs, one per category — the agent's face in a UI with no images. */
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
      <Frame fillWidth fillHeight radius="m" transition="micro-medium">
        <Column fillWidth padding="20" gap="32" minHeight={20}>
          <Row fillWidth horizontal="between" vertical="start" gap="12">
            <Column gap="4">
              <SpecLabel mark>agent</SpecLabel>
              <Text variant="heading-strong-s">{agent.name}</Text>
            </Column>
            <Row gap="8" vertical="center">
              <StatusIndicator size="s" color={live ? "green" : "gray"} />
              <SpecLabel>{live ? "live" : "offline"}</SpecLabel>
            </Row>
          </Row>

          <Row fillWidth horizontal="center" paddingY="24">
            <Text variant="display-strong-l" onBackground="neutral-weak">
              {GLYPH[agent.category] ?? "( )"}
            </Text>
          </Row>

          <Column gap="8" fillWidth>
            <Text variant="body-default-s" onBackground="neutral-weak">
              {agent.summary}
            </Text>
          </Column>

          <Column
            fillWidth
            gap="8"
            paddingY="12"
            paddingX="16"
            radius="s"
            background="neutral-alpha-weak"
          >
            <SpecLabel>{agent.error ? "feed" : "reading now"}</SpecLabel>
            <Text variant="label-strong-s">
              {agent.error ? "unavailable" : (agent.status?.headline ?? "")}
            </Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {agent.error ?? agent.status?.detail}
            </Text>
          </Column>
        </Column>

        <Grid
          fillWidth
          columns={4}
          s={{ columns: 2 }}
          borderTop="neutral-alpha-weak"
          paddingX="20"
          paddingY="16"
          gap="16"
        >
          <Column gap="4">
            <SpecLabel>id</SpecLabel>
            <Text variant="code-default-xs">{agent.id.split("-")[0]}</Text>
          </Column>
          <Column gap="4">
            <SpecLabel>class</SpecLabel>
            <Text variant="code-default-xs">{categoryLabel(agent.category)}</Text>
          </Column>
          <Column gap="4">
            <SpecLabel>venue</SpecLabel>
            <Text variant="code-default-xs">{agent.protocol}</Text>
          </Column>
          <Column gap="4">
            <SpecLabel>chain</SpecLabel>
            <Text variant="code-default-xs">bsc {agent.chainId}</Text>
          </Column>
        </Grid>
      </Frame>
    </SmartLink>
  );
}
