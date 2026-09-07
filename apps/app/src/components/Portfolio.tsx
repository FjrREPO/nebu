"use client";

import { Button, Column, Row, SmartLink, StatusIndicator, Text } from "@once-ui-system/core";
import { useState } from "react";
import { type PortfolioRow, scanWallet } from "@/app/actions";
import { connect, currentAccount } from "@/lib/wallet";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

const query = (params: Record<string, string>) => new URLSearchParams(params).toString();

export function Portfolio() {
  const [account, setAccount] = useState<string | null>(null);
  const [rows, setRows] = useState<PortfolioRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function scan(wallet: string) {
    setBusy(true);
    setError(null);
    const result = await scanWallet(wallet);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setRows(result.data);
  }

  async function start() {
    try {
      const found = (await currentAccount()) ?? (await connect());
      setAccount(found);
      await scan(found);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const flagged = rows?.filter((row) => row.status?.actionable) ?? [];

  return (
    <Column fillWidth gap="24">
      <Frame fillWidth radius="m" padding="24" gap="16">
        <Column gap="8">
          <SpecLabel mark>scan</SpecLabel>
          <Text variant="heading-strong-s">
            {account ? account : "Point every agent at your wallet"}
          </Text>
          <Text variant="body-default-s" onBackground="neutral-weak">
            The lending and grid agents read your address directly. The rebalancer looks up the
            PancakeSwap V3 position NFTs you actually hold and checks each one.
          </Text>
        </Column>
        <Row gap="8">
          <Button prefixIcon="wallet" loading={busy} onClick={start}>
            {account ? "Rescan" : "Connect wallet"}
          </Button>
        </Row>
        {error && (
          <Text variant="body-default-s" onBackground="danger-medium">
            {error}
          </Text>
        )}
      </Frame>

      {rows && (
        <Row fillWidth gap="16" wrap>
          <SpecLabel>
            {rows.length} checks · {flagged.length} need attention
          </SpecLabel>
        </Row>
      )}

      {rows?.map((row) => (
        <Frame
          key={`${row.agentId}-${JSON.stringify(row.params)}`}
          fillWidth
          radius="m"
          padding="20"
          gap="12"
        >
          <Row fillWidth horizontal="between" vertical="center" gap="16" wrap>
            <Row gap="12" vertical="center">
              <StatusIndicator
                size="s"
                color={row.error ? "gray" : row.status?.actionable ? "orange" : "green"}
              />
              <Text variant="label-strong-s">{row.agentName}</Text>
              <SpecLabel>{row.category}</SpecLabel>
            </Row>
            <SmartLink href={`/agents/${row.agentId}?${query(row.params)}`}>
              <SpecLabel>open →</SpecLabel>
            </SmartLink>
          </Row>
          <Text variant="body-default-s">{row.error ?? row.status?.headline}</Text>
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {row.status?.detail}
          </Text>
        </Frame>
      ))}

      {rows?.length === 0 && (
        <Text variant="body-default-s" onBackground="neutral-weak">
          Nothing for these agents to watch on that wallet yet.
        </Text>
      )}
    </Column>
  );
}
