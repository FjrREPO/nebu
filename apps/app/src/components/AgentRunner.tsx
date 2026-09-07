"use client";

import { Button, Column, Feedback, Input, Row, SmartLink, Text } from "@once-ui-system/core";
import { useState } from "react";
import { buildPlan, readStatus } from "@/app/actions";
import type { AgentMeta, AgentStatus, WirePlan } from "@/lib/types";
import { connect, sendPlan } from "@/lib/wallet";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

type Phase = "idle" | "reading" | "planning" | "signing";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function AgentRunner({
  agent,
  initialStatus,
}: {
  agent: AgentMeta;
  initialStatus: AgentStatus | null;
}) {
  const [params, setParams] = useState<Record<string, string>>({ ...agent.example });
  const [status, setStatus] = useState<AgentStatus | null>(initialStatus);
  const [plan, setPlan] = useState<WirePlan | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hashes, setHashes] = useState<string[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const busy = phase !== "idle";

  async function check() {
    setPhase("reading");
    setError(null);
    setNote(null);
    setPlan(null);
    const result = await readStatus(agent.id, params);
    setPhase("idle");
    if (!result.ok) return setError(result.error);
    setStatus(result.data);
  }

  async function prepare() {
    setPhase("planning");
    setError(null);
    setNote(null);
    const result = await buildPlan(agent.id, params);
    setPhase("idle");
    if (!result.ok) return setError(result.error);
    if (!result.data) return setNote("Nothing to do — the position is already where it should be.");
    setPlan(result.data);
  }

  async function run() {
    if (!plan || !account) return;
    setPhase("signing");
    setError(null);
    try {
      await sendPlan(account as `0x${string}`, plan.txs, (hash) =>
        setHashes((previous) => [...previous, hash]),
      );
      setPlan(null);
      await check();
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Column fillWidth gap="16">
      <Frame fillWidth radius="m" padding="20" gap="16">
        <Column gap="8">
          <SpecLabel mark>hire</SpecLabel>
          <Text variant="heading-strong-xs">
            {account ? `Connected ${short(account)}` : "Connect to run this agent"}
          </Text>
          <Text variant="body-default-s" onBackground="neutral-weak">
            The agent reads your position and hands back the transactions. You sign each one from
            your own wallet — nothing is delegated, and nothing can move out of your control.
          </Text>
        </Column>

        {!account && (
          <Button
            fillWidth
            prefixIcon="wallet"
            onClick={async () => {
              try {
                setAccount(await connect());
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            Connect wallet
          </Button>
        )}

        <Column fillWidth gap="12" borderTop="neutral-alpha-weak" paddingTop="16">
          <SpecLabel mark>parameters</SpecLabel>
          {agent.paramSchema.map((spec) => (
            <Input
              key={spec.key}
              id={spec.key}
              label={spec.label}
              placeholder={spec.placeholder}
              value={params[spec.key] ?? ""}
              onChange={(event) => setParams({ ...params, [spec.key]: event.target.value })}
            />
          ))}
          <Row gap="8" fillWidth>
            <Button
              fillWidth
              variant="secondary"
              prefixIcon="refresh"
              loading={phase === "reading"}
              disabled={busy}
              onClick={check}
            >
              Read
            </Button>
            <Button
              fillWidth
              prefixIcon="bolt"
              loading={phase === "planning"}
              disabled={busy}
              onClick={prepare}
            >
              Plan
            </Button>
          </Row>
        </Column>
      </Frame>

      {status && (
        <Frame fillWidth radius="m" padding="20" gap="8">
          <SpecLabel mark>reading now</SpecLabel>
          <Text variant="heading-strong-xs">{status.headline}</Text>
          <Text variant="body-default-s" onBackground="neutral-weak">
            {status.detail}
          </Text>
        </Frame>
      )}

      {note && <Feedback variant="info" description={note} />}
      {error && <Feedback variant="danger" title="That did not work" description={error} />}

      {plan && (
        <Frame fillWidth radius="m" padding="20" gap="16">
          <Column gap="8">
            <SpecLabel mark>ready to sign</SpecLabel>
            <Text variant="body-default-s">{plan.reason}</Text>
          </Column>
          <Column gap="4">
            {plan.txs.map((tx, index) => (
              <Text key={tx.data} variant="code-default-xs" onBackground="neutral-weak">
                {String(index + 1).padStart(2, "0")} {tx.to.slice(0, 10)}… {tx.data.slice(0, 10)}{" "}
                {(tx.data.length - 2) / 2}b
              </Text>
            ))}
          </Column>
          <Button
            fillWidth
            prefixIcon="rocket"
            loading={phase === "signing"}
            disabled={!account || busy}
            onClick={run}
          >
            {account ? `Send ${plan.txs.length} transaction(s)` : "Connect a wallet first"}
          </Button>
        </Frame>
      )}

      {hashes.length > 0 && (
        <Column fillWidth gap="8">
          <SpecLabel mark>sent</SpecLabel>
          {hashes.map((hash) => (
            <SmartLink key={hash} href={`https://bscscan.com/tx/${hash}`}>
              <Text variant="code-default-xs">{hash.slice(0, 22)}…</Text>
            </SmartLink>
          ))}
        </Column>
      )}
    </Column>
  );
}
