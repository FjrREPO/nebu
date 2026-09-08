"use client";

import { BNB, BNB_TESTNET, createClient, type PasskeySigner } from "@altananetwork/sdk";
import type { SessionScope } from "@nebu/core";
import {
  expiresAt,
  grantAgentSession,
  isExpired,
  restoreSession,
  revokeAgentSession,
  runWithSession,
  type SessionNetwork,
} from "@nebu/session";
import { Button, Column, Feedback, Input, Row, SmartLink, Text } from "@once-ui-system/core";
import { useCallback, useEffect, useState } from "react";
import { agentScope, buildPlan } from "@/app/actions";
import { clearGrant, readGrant, type StoredGrant, writeGrant } from "@/lib/sessionStore";
import type { AgentMeta } from "@/lib/types";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

/** Testnet by default: a grant registers a key on chain and costs a fee. */
const NETWORK: SessionNetwork =
  (process.env.NEXT_PUBLIC_SESSION_NETWORK as SessionNetwork) ?? "testnet";
const NETWORK_CONFIG = NETWORK === "mainnet" ? BNB : BNB_TESTNET;
const EXPLORER = NETWORK === "mainnet" ? "https://bscscan.com" : "https://testnet.bscscan.com";

type Phase = "idle" | "granting" | "running" | "revoking";
type AgentWallet = { address: `0x${string}`; signer: PasskeySigner };

/** The relay's message for an unfunded wallet says nothing useful on its own. */
function explain(message: string) {
  return /executing calls|insufficient|funds/i.test(message)
    ? `${message} The agent wallet needs a little BNB — a grant registers a key on chain.`
    : message;
}

export function HirePanel({ agent }: { agent: AgentMeta }) {
  const [params, setParams] = useState<Record<string, string>>({ ...agent.example });
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [days, setDays] = useState("7");
  const [grant, setGrant] = useState<StoredGrant | null>(null);
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ranTx, setRanTx] = useState<string | null>(null);

  const busy = phase !== "idle";

  const loadScope = useCallback(
    async (next: Record<string, string>) => {
      const result = await agentScope(agent.id, next);
      if (!result.ok) return null;
      setScope(result.data);
      setLimits((current) =>
        Object.fromEntries(
          result.data.spend.map((entry) => [
            entry.token.toLowerCase(),
            current[entry.token.toLowerCase()] ?? entry.suggested,
          ]),
        ),
      );
      return result.data;
    },
    [agent.id],
  );

  // Params start prefilled with live values, so the caps can be shown at once.
  useEffect(() => {
    setGrant(readGrant(agent.id));
    loadScope({ ...agent.example });
  }, [agent.id, agent.example, loadScope]);

  /** Cached so grant, run and revoke do not each fire their own passkey prompt. */
  async function openWallet(): Promise<AgentWallet> {
    if (wallet) return wallet;
    const client = createClient({ chains: [NETWORK_CONFIG] });
    const opened = await client
      .recoverFromPasskey({ chainId: NETWORK_CONFIG.chainId })
      .catch(() => client.createPasskeyWallet({ name: "nebu" }));
    const next = { address: opened.address, signer: opened.signer };
    setWallet(next);
    return next;
  }

  async function doGrant() {
    setPhase("granting");
    setError(null);
    setNote(null);
    try {
      // Re-read the scope against the params as they stand now, so the grant
      // matches the calls the agent will actually make.
      const current = (await loadScope(params)) ?? scope;
      if (!current) throw new Error("Could not work out what this agent needs");

      const opened = await openWallet();
      const result = await grantAgentSession({
        network: NETWORK,
        wallet: { address: opened.address },
        signer: opened.signer,
        scope: current,
        limits,
        days: Math.max(1, Number(days) || 7),
      });
      const stored: StoredGrant = {
        agentId: agent.id,
        network: NETWORK,
        walletAddress: opened.address,
        stored: result.stored,
        sessionKey: result.sessionKey,
        grantedAt: Date.now(),
        transactionHash: result.transactionHash,
      };
      writeGrant(stored);
      setGrant(stored);
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  /** The whole point: the agent works without asking the user to sign. */
  async function runNow() {
    if (!grant) return;
    setPhase("running");
    setError(null);
    setNote(null);
    setRanTx(null);
    try {
      const planned = await buildPlan(agent.id, params);
      if (!planned.ok) throw new Error(planned.error);
      if (!planned.data) {
        setNote("Nothing to do right now.");
        return;
      }
      const result = await runWithSession(
        grant.network,
        restoreSession(grant.stored, grant.sessionKey),
        planned.data.txs.map((tx) => ({ ...tx, value: BigInt(tx.value) })),
      );
      setRanTx(result.transactionHash ?? null);
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  async function doRevoke() {
    if (!grant) return;
    setPhase("revoking");
    setError(null);
    try {
      const opened = await openWallet();
      await revokeAgentSession(
        grant.network,
        { address: grant.walletAddress },
        opened.signer,
        restoreSession(grant.stored, grant.sessionKey),
      );
      clearGrant(agent.id);
      setGrant(null);
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  const session = grant ? restoreSession(grant.stored, grant.sessionKey) : null;
  const expired = session ? isExpired(session) : false;

  return (
    <Column fillWidth gap="16">
      <Frame fillWidth radius="m" padding="20" gap="16">
        <SpecLabel mark>hire</SpecLabel>

        {grant && session ? (
          <>
            <Text variant="body-default-s" onBackground="neutral-weak">
              {expired
                ? "Expired. Grant a new session to keep it running."
                : `Working until ${expiresAt(session).toISOString().slice(0, 10)}, inside your caps.`}
            </Text>
            <Row gap="8" fillWidth>
              <Button
                fillWidth
                prefixIcon="bolt"
                loading={phase === "running"}
                disabled={busy || expired}
                onClick={runNow}
              >
                Run now
              </Button>
              <Button
                fillWidth
                variant="danger"
                loading={phase === "revoking"}
                disabled={busy}
                onClick={doRevoke}
              >
                Revoke
              </Button>
            </Row>
          </>
        ) : (
          <>
            <Column fillWidth gap="8">
              {agent.paramSchema.map((spec) => (
                <Input
                  key={spec.key}
                  id={spec.key}
                  height="s"
                  label={spec.label}
                  placeholder={spec.placeholder}
                  value={params[spec.key] ?? ""}
                  onChange={(event) => setParams({ ...params, [spec.key]: event.target.value })}
                />
              ))}
            </Column>

            <Column fillWidth gap="8" borderTop="neutral-alpha-weak" paddingTop="16">
              <SpecLabel>daily cap</SpecLabel>
              {scope?.spend.map((entry) => (
                <Input
                  key={entry.token}
                  id={`limit-${entry.token}`}
                  height="s"
                  label={entry.symbol}
                  value={limits[entry.token.toLowerCase()] ?? ""}
                  onChange={(event) =>
                    setLimits({ ...limits, [entry.token.toLowerCase()]: event.target.value })
                  }
                />
              ))}
              <Input
                id="expiry-days"
                height="s"
                label="Expires in days"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </Column>

            <Button fillWidth loading={phase === "granting"} disabled={busy} onClick={doGrant}>
              Grant session
            </Button>
            <Text variant="body-default-xs" onBackground="neutral-weak">
              The agent may only call {scope?.calls.length ?? "…"} contracts, only up to these caps,
              and only until it expires. Revoking takes one transaction.
            </Text>
          </>
        )}
      </Frame>

      {ranTx && (
        <SmartLink href={`${EXPLORER}/tx/${ranTx}`}>
          <Text variant="code-default-xs">{ranTx.slice(0, 22)}…</Text>
        </SmartLink>
      )}
      {note && <Feedback variant="info" description={note} />}
      {error && <Feedback variant="danger" description={error} />}
    </Column>
  );
}
