import type { StatTile } from "@nebu/core";
import { Column, Grid, Text } from "@once-ui-system/core";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

export function StatStrip({ stats }: { stats: StatTile[] }) {
  return (
    <Frame fillWidth radius="m" padding="4">
      <Grid fillWidth columns={4} m={{ columns: 2 }} s={{ columns: 2 }}>
        {stats.map((stat) => (
          <Column key={stat.label} gap="8" padding="20">
            <SpecLabel>{stat.label}</SpecLabel>
            <Text variant="heading-strong-m">{stat.value}</Text>
            {stat.hint && (
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {stat.hint}
              </Text>
            )}
          </Column>
        ))}
      </Grid>
    </Frame>
  );
}
