import { handleOGFetch } from "@once-ui-system/core/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return handleOGFetch(request);
}
