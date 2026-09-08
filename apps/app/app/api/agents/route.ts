import { plugins } from "@nebu/plugins";
import { NextResponse } from "next/server";

/** Live reads behind every field, so a minute of staleness is the ceiling. */
export const revalidate = 60;

/** Every agent and the shape of its parameters. */
export function GET() {
  return NextResponse.json(
    plugins.map(({ id, name, category, protocol, chainId, summary, grants, paramSchema }) => ({
      id,
      name,
      category,
      protocol,
      chainId,
      summary,
      grants,
      paramSchema,
    })),
    { headers: { "access-control-allow-origin": "*" } },
  );
}
