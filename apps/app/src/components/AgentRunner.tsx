"use client";

import {
  Button,
  Column,
  Feedback,
  Input,
  Row,
  SmartLink,
  StatusIndicator,
  Text,
  useToast,
} from "@once-ui-system/core";
import { useState } from "react";
import { buildPlan, readStatus } from "@/app/actions";
import type { AgentMeta, AgentStatus, WirePlan } from "@/lib/types";
import { sendPlan } from "@/lib/wallet";
import { WalletBar } from "./WalletBar";

type Phase = "idle" | "reading" | "planning" | "signing";

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
  const { addToast } = useToast();

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
    if (!result.data)
      return setNote("Nothing to do right now — the position is already where it should be.");
    setPlan(result.data);
  }

  async function run() {
    if (!plan || !account) return;
    setPhase("signing");
    setError(null);
    try {
      const sent = await sendPlan(account as `0x${string}`, plan.txs, (hash) =>
        setHashes((previous) => [...previous, hash]),
      );
      addToast({ variant: "success", message: `Sent ${sent.length} transaction(s)` });
      setPlan(null);
      await check();
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Column fillWidth gap="24">
      <Column
        fillWidth
        gap="16"
        padding="24"
        radius="l"
        border="neutral-alpha-weak"
        background="surface"
      >
        <Text variant="label-default-s" onBackground="brand-medium">
          Configure
        </Text>
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
        <Row gap="8" wrap>
          <Button
            variant="secondary"
            prefixIcon="refresh"
            loading={phase === "reading"}
            disabled={busy}
            onClick={check}
          >
            Check live status
          </Button>
          <Button
            prefixIcon="bolt"
            loading={phase === "planning"}
            disabled={busy}
            onClick={prepare}
          >
            Build plan
          </Button>
        </Row>
      </Column>

      {status && (
        <Column
          fillWidth
          gap="8"
          padding="24"
          radius="l"
          border="neutral-alpha-weak"
          background="surface"
        >
          <Row gap="8" vertical="center">
            <StatusIndicator size="s" color={status.actionable ? "orange" : "green"} />
            <Text variant="heading-strong-xs">{status.headline}</Text>
          </Row>
          <Text variant="body-default-s" onBackground="neutral-weak">
            {status.detail}
          </Text>
        </Column>
      )}

      {note && <Feedback variant="info" description={note} />}
      {error && <Feedback variant="danger" title="That did not work" description={error} />}

      {plan && (
        <Column
          fillWidth
          gap="16"
          padding="24"
          radius="l"
          border="brand-alpha-medium"
          background="surface"
        >
          <Text variant="label-default-s" onBackground="brand-medium">
            Ready to sign
          </Text>
          <Text variant="body-default-m">{plan.reason}</Text>
          <Column gap="4">
            {plan.txs.map((tx, index) => (
              <Text key={tx.data} variant="code-default-xs" onBackground="neutral-weak">
                {index + 1}. {tx.to} · {tx.data.slice(0, 10)} · {(tx.data.length - 2) / 2} bytes
              </Text>
            ))}
          </Column>
          <Row gap="8" vertical="center" wrap>
            <WalletBar onConnect={setAccount} />
            <Button
              prefixIcon="rocket"
              loading={phase === "signing"}
              disabled={!account || busy}
              onClick={run}
            >
              {account ? `Send ${plan.txs.length} transaction(s)` : "Connect a wallet first"}
            </Button>
          </Row>
        </Column>
      )}

      {hashes.length > 0 && (
        <Column fillWidth gap="8">
          <Text variant="label-default-s" onBackground="neutral-weak">
            Sent
          </Text>
          {hashes.map((hash) => (
            <SmartLink key={hash} href={`https://bscscan.com/tx/${hash}`}>
              {hash}
            </SmartLink>
          ))}
        </Column>
      )}
    </Column>
  );
}
