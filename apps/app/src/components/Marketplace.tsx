"use client";

import { Column, Grid, Row, SegmentedControl, Text } from "@once-ui-system/core";
import { useState } from "react";
import { type AgentCardData, CATEGORIES } from "@/lib/types";
import { AgentCard } from "./AgentCard";

const ALL = "all";

export function Marketplace({ agents }: { agents: AgentCardData[] }) {
  const [filter, setFilter] = useState<string>(ALL);
  const shown = filter === ALL ? agents : agents.filter((agent) => agent.category === filter);
  const blurb = CATEGORIES.find((category) => category.key === filter)?.blurb;

  return (
    <Column fillWidth gap="24">
      <Column fillWidth gap="12">
        <SegmentedControl
          selected={filter}
          onToggle={setFilter}
          buttons={[
            { value: ALL, label: `All ${agents.length}` },
            ...CATEGORIES.map((category) => ({
              value: category.key,
              label: category.label,
              prefixIcon: category.key,
            })),
          ]}
        />
        <Row fillWidth horizontal="center">
          <Text variant="body-default-s" onBackground="neutral-weak" align="center">
            {blurb ?? "Every agent below reads BNB Smart Chain live. Nothing here is a mock."}
          </Text>
        </Row>
      </Column>

      <Grid fillWidth columns={2} m={{ columns: 2 }} s={{ columns: 1 }} gap="16">
        {shown.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </Grid>
    </Column>
  );
}
