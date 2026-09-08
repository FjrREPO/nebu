"use client";

import { Column, Row, SmartLink, Text } from "@once-ui-system/core";
import type { AgentCardData } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";
import { Frame } from "./Frame";
import { formatValue, Sparkline, trendOf } from "./Sparkline";
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
  const trend = trendOf(agent.series);
  const tone = trend?.direction ?? "flat";

  return (
    <SmartLink href={`/agents/${agent.id}`} unstyled style={{ height: "100%" }}>
      <Frame fillWidth fillHeight radius="m" padding="16" gap="16" transition="micro-medium">
        <Row gap="12" vertical="center" fillWidth>
          <Row
            minWidth={2.5}
            minHeight={2.5}
            center
            radius="s"
            background="neutral-alpha-weak"
            border="neutral-alpha-weak"
          >
            <Text variant="code-default-xs" onBackground="neutral-medium">
              {GLYPH[agent.category] ?? "( )"}
            </Text>
          </Row>
          <Column gap="2">
            <Text variant="label-strong-m">{agent.name}</Text>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              {categoryLabel(agent.category)} · {agent.protocol}
            </Text>
          </Column>
        </Row>

        <Column
          className={`tint tint-${tone}`}
          fillWidth
          flex={1}
          radius="m"
          paddingTop="16"
          paddingX="16"
          gap="4"
          overflow="hidden"
        >
          {agent.series && <SpecLabel>{agent.series.label}</SpecLabel>}
          <Text variant="display-strong-xs">
            {agent.error
              ? "—"
              : trend
                ? `${formatValue(trend.last, agent.series?.unit)}${agent.series?.unit ?? ""}`
                : (agent.status?.headline ?? "—")}
          </Text>

          {trend ? (
            <Text variant="code-default-s" className={`tone tone-${tone}`}>
              {tone === "up" ? "▲" : tone === "down" ? "▼" : "■"}{" "}
              {formatValue(Math.abs(trend.delta), agent.series?.unit)}
              {agent.series?.unit ?? ""} over the window
            </Text>
          ) : (
            <SpecLabel>{agent.error ? "feed unavailable" : "no history yet"}</SpecLabel>
          )}

          {agent.series && (
            <Column fillWidth marginTop="8" style={{ marginInline: "-1rem" }}>
              <Sparkline series={agent.series} />
            </Column>
          )}
        </Column>

        {/* With a price feed the panel shows the price, so the reading goes here.
            Without one the panel already shows the reading. */}
        {(agent.error || trend) && (
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {agent.error ?? agent.status?.headline}
          </Text>
        )}
      </Frame>
    </SmartLink>
  );
}
