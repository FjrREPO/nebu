import assert from "node:assert/strict";
import { allocate, blendedApr, type DeskAgent, MAX_SHARE, MIN_TICKET } from "./desk.ts";

const earner = (id: string, apr: number, risk: number | null): DeskAgent => ({
  id,
  outlook: { apr, risk, kind: "return", reason: `${id} reason` },
});
const guard = (id: string, needs: number): DeskAgent => ({
  id,
  outlook: { apr: 0.05, risk: 0.04, kind: "reserve", needs, reason: "cover" },
});

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// The whole point: a wallet split between agents, better odds getting more.
{
  const split = allocate([earner("a", 0.6, 0.04), earner("b", 0.2, 0.04)], 1);
  assert.ok(split[0].amount > split[1].amount, "the better risk-adjusted return gets more");
  assert.ok(
    sum(split.map((entry) => entry.amount)) <= 1 + 1e-9,
    "never allocates more than it has",
  );
  assert.ok(split[0].share <= MAX_SHARE + 1e-9, "no agent takes the whole desk");
}

// Same return, less movement, more capital.
{
  const [calm, wild] = allocate([earner("calm", 0.3, 0.01), earner("wild", 0.3, 0.09)], 1);
  assert.ok(calm.amount > wild.amount, "risk is what separates two equal yields");
}

// A stablecoin's near-zero volatility must not divide into an infinite score.
{
  const split = allocate([earner("stable", 0.05, 0.0001), earner("pool", 0.8, 0.05)], 1);
  assert.ok(split[0].share <= MAX_SHARE + 1e-9, "the risk floor keeps a quiet asset honest");
  assert.ok(split[1].amount > 0, "and leaves something for the rest");
}

// Cover comes off the top, and the rest still gets invested.
{
  const split = allocate([guard("health", 0.2), earner("pool", 0.5, 0.04)], 1);
  assert.equal(split[0].amount, 0.2, "a reserve is held at what it asked for");
  assert.ok(split[1].amount > 0.7, "the remainder is still put to work");
}

// Insurance cannot swallow the desk, however much it asks for.
{
  const [held, working] = allocate([guard("health", 5), earner("pool", 0.5, 0.04)], 1);
  assert.equal(held.amount, 0.5, "trimmed to the reserve cap");
  assert.ok(working.amount > 0, "so something is still earning");
}

// Nothing on offer pays for its risk: the money stays in the wallet.
{
  const split = allocate([earner("a", 0, 0.04), earner("b", -0.2, 0.04)], 1);
  assert.deepEqual(
    split.map((entry) => entry.amount),
    [0, 0],
  );
}

// An agent nowhere near the others is not diversification, it is a donation.
{
  const split = allocate([earner("big", 1, 0.02), earner("dust", 0.0005, 0.4)], 0.05);
  assert.equal(split[1].amount, 0, "the outclassed agent gets nothing");
  assert.ok(split[1].note.includes("behind"), "and says why");
  assert.equal(split[0].amount, 0.05, "the capital it freed is used");
}

// A share too small to cover its gas goes back to the others rather than out
// of the wallet as a fee.
{
  // A fifth of a small wallet is not enough to be worth placing.
  const split = allocate([earner("big", 0.9, 0.02), earner("small", 0.2, 0.02)], 0.02);
  assert.equal(split[1].amount, 0, "the dust ticket is not placed");
  assert.ok(split[1].note.includes("gas"), "and says why");
  assert.equal(split[0].amount, 0.02, "the capital it freed is used");
  assert.ok(split[0].amount >= MIN_TICKET);
}

// An empty wallet allocates nothing and says so, rather than dividing by zero.
{
  const split = allocate([earner("a", 0.5, 0.04)], 0);
  assert.equal(split[0].amount, 0);
  assert.ok(split[0].note.length > 0);
}

// The headline number is the split, not the best agent on it.
{
  const agents = [earner("a", 0.6, 0.04), earner("b", 0.2, 0.04)];
  const split = allocate(agents, 1);
  const blended = blendedApr(agents, split);
  assert.ok(blended > 0.2 && blended < 0.6, "a blend sits between its parts");
}

console.log("ok");
