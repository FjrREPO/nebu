"use client";

import { BNB, BNB_TESTNET, createClient, type PasskeySigner } from "@altananetwork/sdk";
import type { AutoParams, SessionScope } from "@nebu/core";
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
import {
  createPublicClient,
  createWalletClient,
  custom,
  type EIP1193Provider,
  formatEther,
  http,
  parseEther,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { agentAuto, agentScope, buildPlan } from "@/app/actions";
import { clearGrant, readGrant, type StoredGrant, writeGrant } from "@/lib/sessionStore";
import type { AgentMeta } from "@/lib/types";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

/** Testnet by default: a grant registers a key on chain and costs a fee. */
const NETWORK: SessionNetwork =
  (process.env.NEXT_PUBLIC_SESSION_NETWORK as SessionNetwork) ?? "testnet";
const CONFIG = NETWORK === "mainnet" ? BNB : BNB_TESTNET;
const CHAIN = NETWORK === "mainnet" ? bsc : bscTestnet;
const EXPLORER = NETWORK === "mainnet" ? "https://bscscan.com" : "https://testnet.bscscan.com";

const reader = createPublicClient({ chain: CHAIN, transport: http(CONFIG.publicRpcUrl) });

type Phase = "idle" | "opening" | "funding" | "granting" | "running" | "revoking";
type AgentWallet = { address: `0x${string}`; signer: PasskeySigner };

const short = (address: string) => `${address.slice(0, 10)}…${address.slice(-8)}`;

/** The relay's message for an unfunded wallet says nothing useful on its own. */
const explain = (message: string) =>
  /executing calls|insufficient|funds/i.test(message)
    ? `${message} — the agent wallet needs BNB for gas and the key registration.`
    : message;

export function HirePanel({ agent }: { agent: AgentMeta }) {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [auto, setAuto] = useState<AutoParams | null>(null);
  const [scope, setScope] = useState<SessionScope | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [days, setDays] = useState("7");
  const [deposit, setDeposit] = useState("0.05");
  const [grant, setGrant] = useState<StoredGrant | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const busy = phase !== "idle";

  useEffect(() => setGrant(readGrant(agent.id)), [agent.id]);

  /** Everything the panel needs once it knows which wallet it is looking at. */
  const inspect = useCallback(
    async (address: `0x${string}`) => {
      const [funds, chosen] = await Promise.all([
        reader.getBalance({ address }).catch(() => null),
        agentAuto(agent.id, address),
      ]);
      setBalance(funds);
      if (!chosen.ok) return setError(chosen.error);
      setAuto(chosen.data);
      if (!chosen.data) return;

      const derived = await agentScope(agent.id, chosen.data.params);
      if (!derived.ok) return;
      setScope(derived.data);
      setLimits(
        Object.fromEntries(
          derived.data.spend.map((entry) => [entry.token.toLowerCase(), entry.suggested]),
        ),
      );
    },
    [agent.id],
  );

  /** Cached so hire, run and revoke do not each fire their own passkey prompt. */
  const openWallet = useCallback(async () => {
    if (wallet) return wallet;
    const client = createClient({ chains: [CONFIG] });
    const opened = await client
      .recoverFromPasskey({ chainId: CONFIG.chainId })
      .catch(() => client.createPasskeyWallet({ name: "nebu" }));
    const next = { address: opened.address, signer: opened.signer };
    setWallet(next);
    await inspect(next.address);
    return next;
  }, [wallet, inspect]);

  async function guard(next: Phase, work: () => Promise<void>) {
    setPhase(next);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(explain((err as Error).message.split("\n")[0]));
    } finally {
      setPhase("idle");
    }
  }

  /** Top the agent wallet up from whatever extension wallet the user has. */
  const fund = () =>
    guard("funding", async () => {
      const target = await openWallet();
      const injected = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
      if (!injected) throw new Error("No extension wallet found to send from.");
      const sender = createWalletClient({ chain: CHAIN, transport: custom(injected) });
      const [account] = await sender.requestAddresses();
      if ((await sender.getChainId()) !== CHAIN.id) {
        await sender.switchChain({ id: CHAIN.id }).catch(() => sender.addChain({ chain: CHAIN }));
      }
      const hash = await sender.sendTransaction({
        account,
        to: target.address,
        value: parseEther(deposit || "0"),
      });
      setNote(`Sent ${deposit} BNB · ${hash.slice(0, 20)}…`);
      await reader.waitForTransactionReceipt({ hash }).catch(() => null);
      await inspect(target.address);
    });

  const hire = () =>
    guard("granting", async () => {
      if (!auto || !scope) throw new Error("Nothing for this agent to do yet");
      const opened = await openWallet();
      const result = await grantAgentSession({
        network: NETWORK,
        wallet: { address: opened.address },
        signer: opened.signer,
        scope,
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
    });

  /** The whole point: the agent works without asking the user to sign. */
  const runNow = () =>
    guard("running", async () => {
      if (!grant || !auto) return;
      setNote(null);
      const planned = await buildPlan(agent.id, auto.params);
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
      setNote(result.transactionHash ? `Sent · ${result.transactionHash}` : result.status);
    });

  const revoke = () =>
    guard("revoking", async () => {
      if (!grant) return;
      const opened = await openWallet();
      await revokeAgentSession(
        grant.network,
        { address: grant.walletAddress },
        opened.signer,
        restoreSession(grant.stored, grant.sessionKey),
      );
      clearGrant(agent.id);
      setGrant(null);
      setNote("Session revoked.");
    });

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
                ? "Session expired. Hire it again to keep it working."
                : `Working until ${expiresAt(session).toISOString().slice(0, 10)}, inside your caps.`}
            </Text>
            {auto && (
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {auto.reason}
              </Text>
            )}
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
                onClick={revoke}
              >
                Revoke
              </Button>
            </Row>
          </>
        ) : !wallet ? (
          <>
            <Text variant="body-default-s" onBackground="neutral-weak">
              Your agent wallet is a passkey on this device. Create it, send it some BNB, and the
              agent picks its own venue from there.
            </Text>
            <Button
              fillWidth
              prefixIcon="wallet"
              loading={phase === "opening"}
              disabled={busy}
              onClick={() => guard("opening", async () => void (await openWallet()))}
            >
              Create agent wallet
            </Button>
          </>
        ) : (
          <>
            <Column fillWidth gap="4" padding="12" radius="s" background="neutral-alpha-weak">
              <SpecLabel>agent wallet</SpecLabel>
              <Text variant="code-default-xs">{short(wallet.address)}</Text>
              <Text variant="label-strong-s">
                {balance === null ? "—" : `${Number(formatEther(balance)).toFixed(4)} BNB`}
              </Text>
            </Column>

            <Row gap="8" fillWidth vertical="end">
              <Input
                id="deposit"
                height="s"
                label="Deposit BNB"
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
              />
              <Button
                variant="secondary"
                loading={phase === "funding"}
                disabled={busy}
                onClick={fund}
              >
                Send
              </Button>
            </Row>

            {auto ? (
              <>
                <Column fillWidth gap="4" borderLeft="brand-alpha-medium" paddingLeft="12">
                  <SpecLabel>the agent picked</SpecLabel>
                  <Text variant="body-default-s">{auto.reason}</Text>
                </Column>

                {scope && scope.spend.length > 0 && (
                  <Column fillWidth gap="8">
                    <SpecLabel>daily cap</SpecLabel>
                    {scope.spend.map((entry) => (
                      <Input
                        key={entry.token}
                        id={`limit-${entry.token}`}
                        height="s"
                        label={entry.symbol}
                        value={limits[entry.token.toLowerCase()] ?? ""}
                        onChange={(event) =>
                          setLimits({
                            ...limits,
                            [entry.token.toLowerCase()]: event.target.value,
                          })
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
                )}

                <Button
                  fillWidth
                  loading={phase === "granting"}
                  disabled={busy || !scope}
                  onClick={hire}
                >
                  Hire agent
                </Button>
                <Text variant="body-default-xs" onBackground="neutral-weak">
                  It may only call {scope?.calls.length ?? "…"} contracts, only up to these caps,
                  and only until it expires. Revoking takes one transaction.
                </Text>
              </>
            ) : (
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {agent.category === "health"
                  ? "This agent guards a loan you already have rather than deploying a deposit. Once this wallet borrows on Aave V3, it picks its own floor and defends it."
                  : "It picks its venue from the live pool screen, and that feed is not answering right now. Try again in a minute."}
              </Text>
            )}
          </>
        )}
      </Frame>

      {note && <Feedback variant="info" description={note} />}
      {error && <Feedback variant="danger" description={error} />}

      {grant?.transactionHash && (
        <SmartLink href={`${EXPLORER}/tx/${grant.transactionHash}`}>
          <Text variant="code-default-xs">grant {grant.transactionHash.slice(0, 20)}…</Text>
        </SmartLink>
      )}
    </Column>
  );
}
