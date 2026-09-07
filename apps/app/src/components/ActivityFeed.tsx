"use client";

import type { ActivityEntry } from "@nebu/core";
import { Column, Row, SmartLink, Text } from "@once-ui-system/core";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

function ago(timestamp: number) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Column fillWidth gap="12">
      <Row fillWidth horizontal="between" vertical="end" gap="16" wrap>
        <Text variant="heading-strong-s">Recent activity</Text>
        <SpecLabel>last ~9,000 blocks</SpecLabel>
      </Row>

      <Frame fillWidth radius="m">
        {entries.length === 0 && (
          <Row fillWidth horizontal="center" paddingY="32">
            <Text variant="body-default-s" onBackground="neutral-weak">
              Nothing in this agent's scope moved in the window scanned.
            </Text>
          </Row>
        )}
        {entries.map((entry, index) => (
          <Row
            key={entry.id}
            fillWidth
            gap="16"
            paddingX="20"
            paddingY="12"
            vertical="center"
            horizontal="between"
            borderTop={index === 0 ? undefined : "neutral-alpha-weak"}
            wrap
          >
            <Row gap="16" vertical="center" flex={1} minWidth={0}>
              <Row paddingX="8" paddingY="4" border="neutral-alpha-weak" radius="xs">
                <SpecLabel>{entry.kind}</SpecLabel>
              </Row>
              <Text variant="body-default-s" onBackground="neutral-medium">
                {entry.text}
              </Text>
            </Row>
            <Row gap="16" vertical="center">
              <SpecLabel>{ago(entry.timestamp)}</SpecLabel>
              {entry.hash && (
                <SmartLink href={`https://bscscan.com/tx/${entry.hash}`}>
                  <Text variant="code-default-xs" onBackground="neutral-weak">
                    {entry.hash.slice(0, 10)}…
                  </Text>
                </SmartLink>
              )}
            </Row>
          </Row>
        ))}
      </Frame>
    </Column>
  );
}
