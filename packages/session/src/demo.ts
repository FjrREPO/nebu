/**
 * End-to-end proof of the session lifecycle on BNB Smart Chain testnet:
 * grant -> verify in the KeyStore -> the session acts alone -> revoke.
 *
 *   NEBU_ADMIN_KEY=0x... pnpm --filter @nebu/session demo
 *
 * The admin key needs a little tBNB: granting registers the key on chain and
 * that costs a fee. https://testnet.bnbchain.org/faucet-smart
 */
import { BNB_TESTNET, createClient, signerFromPrivateKey } from "@altananetwork/sdk";
import { healthMonitor } from "@nebu/plugin-lending";
import { createPublicClient, formatEther, type Hex, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { grantAgentSession, restoreSession, revokeAgentSession, toPermissions } from "./index.ts";

const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
const step = (n: string, v?: unknown) =>
  console.log(
    `\n== ${n} ==${v === undefined ? "" : `\n${typeof v === "string" ? v : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2)}`}`,
  );

const adminKey = process.env.NEBU_ADMIN_KEY as Hex | undefined;
if (!adminKey) throw new Error("NEBU_ADMIN_KEY is required (a funded BSC testnet key)");

const account = privateKeyToAccount(adminKey);
const publicClient = createPublicClient({
  chain: bscTestnet,
  transport: http(BNB_TESTNET.publicRpcUrl),
});
const balance = await publicClient.getBalance({ address: account.address });
step("admin", { address: account.address, tBNB: formatEther(balance) });
if (balance === 0n) throw new Error(`Fund ${account.address} with testnet BNB first`);

const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(adminKey);
const wallet = await client.createWallet({ signer });
step("agent wallet", wallet.address);

// The permissions the health guard would actually ask for, derived from the
// same params its plan() uses. Printed so the grant can be checked against it.
const scope = await healthMonitor.scope(healthMonitor.example);
step("scope the agent asks for", scope);
step("permissions that becomes", toPermissions(scope, {}));

// Grant a session that can only send dust to one address, so the execute below
// is a real transaction the session signed by itself and nothing more.
const granted = await grantAgentSession({
  network: "testnet",
  wallet,
  signer,
  // Sending native value needs a native permission, not just a call permission.
  scope: { calls: [{ to: DEAD, label: "burn address" }], spend: [], nativeSpend: "0.001" },
  limits: {},
  days: 1,
});
step("granted", { publicKey: granted.session.publicKey, tx: granted.transactionHash });

const keys = await publicClient.readContract({
  address: BNB_TESTNET.keyStore,
  abi: [
    {
      name: "getKeys",
      type: "function",
      stateMutability: "view",
      inputs: [{ type: "address" }],
      outputs: [{ type: "bytes32[]" }],
    },
  ] as const,
  functionName: "getKeys",
  args: [wallet.address],
});
step("keys registered on chain for this wallet", keys);

const session = restoreSession(granted.stored, granted.sessionKey);
const ran = await client.execute({ session, calls: { to: DEAD, value: 1n, data: "0x" } });
step("session acted with no admin signature", { status: ran.status, tx: ran.transactionHash });

const revoked = await revokeAgentSession("testnet", wallet, signer, session);
step("revoked", { status: revoked.status, tx: revoked.transactionHash });

const after = await publicClient.readContract({
  address: BNB_TESTNET.keyStore,
  abi: [
    {
      name: "getKeys",
      type: "function",
      stateMutability: "view",
      inputs: [{ type: "address" }],
      outputs: [{ type: "bytes32[]" }],
    },
  ] as const,
  functionName: "getKeys",
  args: [wallet.address],
});
step("keys after revoke", after);
step("explorer", `https://testnet.bscscan.com/address/${wallet.address}`);
