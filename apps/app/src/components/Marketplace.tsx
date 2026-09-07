"use client";

import { Button, Column, Grid, Row, SmartLink } from "@once-ui-system/core";
import { useState } from "react";
import { type AgentCardData, CATEGORIES } from "@/lib/types";
import { AgentCard } from "./AgentCard";
import { SpecLabel } from "./SpecLabel";

const ALL = "all";

/** Rectangular chips, the active one inverted — the dopler filter row. */
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      size="s"
      radius="none"
      weight="default"
      variant={active ? "primary" : "secondary"}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

export function Marketplace({ agents }: { agents: AgentCardData[] }) {
  const [filter, setFilter] = useState<string>(ALL);
  const shown = filter === ALL ? agents : agents.filter((agent) => agent.category === filter);
  const blurb = CATEGORIES.find((category) => category.key === filter)?.blurb;

  return (
    <Column fillWidth gap="24">
      <Row fillWidth gap="8" wrap>
        <Chip
          label={`All ${agents.length}`}
          active={filter === ALL}
          onClick={() => setFilter(ALL)}
        />
        {CATEGORIES.map((category) => (
          <Chip
            key={category.key}
            label={category.label}
            active={filter === category.key}
            onClick={() => setFilter(category.key)}
          />
        ))}
      </Row>

      <Row fillWidth horizontal="between" vertical="center" gap="16" wrap>
        <SpecLabel>{blurb ?? "every reading on this page came off mainnet"}</SpecLabel>
        <SmartLink href="/status">
          <SpecLabel>data sources →</SpecLabel>
        </SmartLink>
      </Row>

      <Grid fillWidth columns={3} m={{ columns: 2 }} s={{ columns: 1 }} gap="16">
        {shown.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </Grid>
    </Column>
  );
}
