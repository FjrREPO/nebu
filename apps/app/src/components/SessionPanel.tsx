"use client";

import { BNB, BNB_TESTNET, createClient } from "@altananetwork/sdk";
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
import { useEffect, useState } from "react";
import { agentScope, buildPlan } from "@/app/actions";
import { clearGrant, readGrant, type StoredGrant, writeGrant } from "@/lib/sessionStore";
import type { AgentMeta } from "@/lib/types";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

/** Testnet by default: a grant costs a real registration fee on mainnet. */
const NETWORK: SessionNetwork =
  (process.env.NEXT_PUBLIC_SESSION_NETWORK as SessionNetwork) ?? "testnet";
const NETWORK_CONFIG = NETWORK === "mainnet" ? BNB : BNB_TESTNET;
const EXPLORER = NETWORK === "mainnet" ? "https://bscscan.com" : "https://testnet.bscscan.com";

const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;

type Phase = "idle" | "wallet" | "granting" | "running" | "revoking";

export function SessionPanel({
  agent,
  params,
}: {
  agent: AgentMeta;
  params: Record<string, string>;
}) {
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [days, setDays] = useState("7");
  const [grant, setGrant] = useState<StoredGrant | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ranTx, setRanTx] = useState<string | null>(null);

  useEffect(() => setGrant(readGrant(agent.id)), [agent.id]);

  const busy = phase !== "idle";

  async function loadScope() {
    setError(null);
    const result = await agentScope(agent.id, params);
    if (!result.ok) return setError(result.error);
    setScope(result.data);
    setLimits(
      Object.fromEntries(
        result.data.spend.map((entry) => [entry.token.toLowerCase(), entry.suggested]),
      ),
    );
  }

  /**
   * Injected wallets cannot sign the 7702 delegation Altana needs, so the
   * agent wallet is a passkey wallet. It is still the user's: the passkey
   * lives in their device, and only they can grant or revoke.
   */
  async function connectWallet() {
    setPhase("wallet");
    setError(null);
    try {
      const client = createClient({ chains: [NETWORK_CONFIG] });
      const wallet = await client
        .recoverFromPasskey({ chainId: NETWORK_CONFIG.chainId })
        .catch(() => client.createPasskeyWallet({ name: "nebu" }));
      setNote(
        `Agent wallet ${short(wallet.address)} ready. Fund it with a little BNB before granting.`,
      );
      return wallet;
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
      return null;
    } finally {
      setPhase("idle");
    }
  }

  async function doGrant() {
    if (!scope) return;
    setPhase("granting");
    setError(null);
    setNote(null);
    try {
      const client = createClient({ chains: [NETWORK_CONFIG] });
      const wallet = await client
        .recoverFromPasskey({ chainId: NETWORK_CONFIG.chainId })
        .catch(() => client.createPasskeyWallet({ name: "nebu" }));

      const result = await grantAgentSession({
        network: NETWORK,
        wallet: { address: wallet.address },
        signer: wallet.signer,
        scope,
        limits,
        days: Math.max(1, Number(days) || 7),
      });

      const stored: StoredGrant = {
        agentId: agent.id,
        network: NETWORK,
        walletAddress: wallet.address,
        stored: result.stored,
        sessionKey: result.sessionKey,
        grantedAt: Date.now(),
        transactionHash: result.transactionHash,
      };
      writeGrant(stored);
      setGrant(stored);
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setPhase("idle");
    }
  }

  /** The whole point: the agent acts without asking the user to sign. */
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
        setNote("Nothing to do — the position is already where it should be.");
        return;
      }
      const session = restoreSession(grant.stored, grant.sessionKey);
      const result = await runWithSession(
        grant.network,
        session,
        planned.data.txs.map((tx) => ({ ...tx, value: BigInt(tx.value) })),
      );
      setRanTx(result.transactionHash ?? null);
      setNote(`Agent ran on its own: ${result.status}`);
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setPhase("idle");
    }
  }

  async function doRevoke() {
    if (!grant) return;
    setPhase("revoking");
    setError(null);
    try {
      const client = createClient({ chains: [NETWORK_CONFIG] });
      const wallet = await client.recoverFromPasskey({ chainId: NETWORK_CONFIG.chainId });
      await revokeAgentSession(
        grant.network,
        { address: grant.walletAddress },
        wallet.signer,
        restoreSession(grant.stored, grant.sessionKey),
      );
      clearGrant(agent.id);
      setGrant(null);
      setNote("Session revoked. The key cannot sign for this wallet again.");
    } catch (err) {
      setError((err as Error).message.split("\n")[0]);
    } finally {
      setPhase("idle");
    }
  }

  const session = grant ? restoreSession(grant.stored, grant.sessionKey) : null;
  const expired = session ? isExpired(session) : false;

  return (
    <Frame fillWidth radius="m" padding="20" gap="16">
      <Column gap="8">
        <SpecLabel mark>hire · altana session</SpecLabel>
        <Text variant="heading-strong-xs">
          {grant
            ? expired
              ? "Session expired"
              : "Agent is hired"
            : "Let the agent act on its own"}
        </Text>
        <Text variant="body-default-s" onBackground="neutral-weak">
          {grant
            ? "The agent signs with a session key held in this browser. It can only call the contracts below, only up to your caps, and only until the expiry."
            : "Grant a scoped session and the agent transacts without asking you to sign each time. The account contract enforces the limits on chain — a call outside them reverts."}
        </Text>
      </Column>

      {!grant && !scope && (
        <Button fillWidth variant="secondary" onClick={loadScope}>
          Review permissions
        </Button>
      )}

      {!grant && scope && (
        <Column fillWidth gap="16">
          <Column gap="8">
            <SpecLabel>may call</SpecLabel>
            {scope.calls.map((call) => (
              <Text key={call.to} variant="code-default-xs" onBackground="neutral-medium">
                {call.label} · {short(call.to)}
              </Text>
            ))}
          </Column>

          <Column gap="8">
            <SpecLabel>daily spend cap</SpecLabel>
            {scope.spend.map((entry) => (
              <Input
                key={entry.token}
                id={`limit-${entry.token}`}
                label={`${entry.symbol} per day`}
                value={limits[entry.token.toLowerCase()] ?? ""}
                onChange={(event) =>
                  setLimits({ ...limits, [entry.token.toLowerCase()]: event.target.value })
                }
              />
            ))}
            <Text variant="body-default-xs" onBackground="neutral-weak">
              Zero means the agent may never move that token.
            </Text>
          </Column>

          <Input
            id="expiry-days"
            label="Expires in (days)"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />

          <Row gap="8" fillWidth>
            <Button
              fillWidth
              variant="secondary"
              loading={phase === "wallet"}
              disabled={busy}
              onClick={connectWallet}
            >
              Agent wallet
            </Button>
            <Button fillWidth loading={phase === "granting"} disabled={busy} onClick={doGrant}>
              Grant session
            </Button>
          </Row>
        </Column>
      )}

      {grant && session && (
        <Column fillWidth gap="16">
          <Column gap="4">
            <SpecLabel>wallet</SpecLabel>
            <Text variant="code-default-xs">{short(grant.walletAddress)}</Text>
            <SpecLabel>expires</SpecLabel>
            <Text variant="code-default-xs">
              {expiresAt(session).toISOString().slice(0, 16).replace("T", " ")}
            </Text>
            <SpecLabel>network</SpecLabel>
            <Text variant="code-default-xs">bnb {grant.network}</Text>
          </Column>

          {grant.transactionHash && (
            <SmartLink href={`${EXPLORER}/tx/${grant.transactionHash}`}>
              <Text variant="code-default-xs">grant {grant.transactionHash.slice(0, 18)}…</Text>
            </SmartLink>
          )}

          <Row gap="8" fillWidth>
            <Button
              fillWidth
              prefixIcon="bolt"
              loading={phase === "running"}
              disabled={busy || expired}
              onClick={runNow}
            >
              Run without signing
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
        </Column>
      )}

      {ranTx && (
        <SmartLink href={`${EXPLORER}/tx/${ranTx}`}>
          <Text variant="code-default-xs">ran {ranTx.slice(0, 18)}…</Text>
        </SmartLink>
      )}
      {note && <Feedback variant="info" description={note} />}
      {error && <Feedback variant="danger" title="Session" description={error} />}
    </Frame>
  );
}
