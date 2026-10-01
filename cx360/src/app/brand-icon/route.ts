import { prisma } from "@/lib/prisma";

// Reads the tenant from the database, so it must run per request (not at build time).
export const dynamic = "force-dynamic";

/**
 * The browser-tab icon (favicon). Serves the bank's own uploaded logo
 * (Admin → Branding); until one is uploaded it falls back to a "CX" badge in
 * the brand colour. Public on purpose: the browser asks for it before sign-in.
 */
export async function GET() {
  const tenant = await prisma.tenant.findFirst({ select: { logoDataUrl: true, brandColor: true } });

  const m = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(tenant?.logoDataUrl ?? "");
  if (m) {
    return new Response(new Uint8Array(Buffer.from(m[2], "base64")), {
      headers: {
        "Content-Type": m[1],
        "Cache-Control": "public, max-age=300, s-maxage=300",
        // Defence in depth for uploaded SVGs: never let an image run script from our origin.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const color = /^#[0-9a-fA-F]{3,8}$/.test(tenant?.brandColor ?? "") ? tenant!.brandColor : "#5B5FEF";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="14" fill="${color}"/>` +
    `<text x="32" y="43" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" text-anchor="middle" fill="#fff">CX</text>` +
    `</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
