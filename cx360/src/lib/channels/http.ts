import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/** Which organisation a webhook is for: ?tenant=<slug> (the Channels screen shows the full address). */
export async function tenantFromRequest(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("tenant");
  if (!slug) return null;
  return prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, channelSettings: true } });
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Email / SMS / voice webhooks authenticate with a shared token in the x-cx360-token header (server variable CX360_INBOUND_TOKEN). */
export function inboundAuthorized(req: NextRequest): boolean {
  const secret = process.env.CX360_INBOUND_TOKEN;
  const given = req.headers.get("x-cx360-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return !!secret && !!given && safeEq(given, secret);
}
