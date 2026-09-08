import { type Address, getAddress, isAddress } from "viem";
import { type AgentParams, InvalidParams } from "./types.ts";

export function requireAddress(params: AgentParams, key: string): Address {
  const raw = params[key]?.trim();
  if (!raw) throw new InvalidParams(`${key} is required`);
  if (!isAddress(raw, { strict: false })) throw new InvalidParams(`${key} is not an address`);
  return getAddress(raw);
}

export function requireInt(params: AgentParams, key: string): number {
  const raw = params[key]?.trim();
  if (!raw) throw new InvalidParams(`${key} is required`);
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new InvalidParams(`${key} must be a whole number`);
  return n;
}

export function requireNumber(params: AgentParams, key: string): number {
  const raw = params[key]?.trim();
  if (!raw) throw new InvalidParams(`${key} is required`);
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new InvalidParams(`${key} must be a number`);
  return n;
}

/**
 * A number a form field can hold. toPrecision hands back "1.931e+7" past seven
 * digits, which an input will happily submit and every parser will reject.
 */
export function plainNumber(value: number, digits = 6) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, useGrouping: false });
}
