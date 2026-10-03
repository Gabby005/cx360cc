import { prisma } from "@/lib/prisma";
import { buildBrandStyleTag } from "@/lib/theme";
import { LoginForm } from "@/components/auth/login-form";

// Reads the tenant from the DB on every request — keeps `next build` from needing
// a database connection and keeps login branding fresh after admin changes.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // This app is deployed single-tenant-per-instance (one bank per Netlify
  // site), so there's no session yet to resolve a tenant from — take the
  // first (only) one for pre-login branding. A true multi-tenant SaaS
  // deployment would resolve this from the request's subdomain instead.
  const tenant = await prisma.tenant.findFirst({ select: { name: true, brandColor: true, logoDataUrl: true } });
  const name = tenant?.name ?? "CX360";

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-surface">
      <style dangerouslySetInnerHTML={{ __html: buildBrandStyleTag(tenant?.brandColor ?? "#5B5FEF") }} />

      {/* Left: the bank's logo, large, on the brand colour */}
      <div className="relative flex flex-col items-center justify-center bg-brand px-8 py-12 lg:py-0 lg:min-h-screen overflow-hidden">
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-black/10" />

        <div className="relative flex flex-col items-center text-center">
          {tenant?.logoDataUrl ? (
            // Uncropped, on a white plate so any logo colours stay readable on the brand colour.
            <div className="rounded-3xl bg-white p-8 shadow-2xl shadow-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tenant.logoDataUrl} alt={name} className="h-32 lg:h-48 w-auto max-w-[260px] lg:max-w-[360px] object-contain" />
            </div>
          ) : (
            <div className="w-40 h-40 rounded-3xl bg-white text-brand grid place-items-center font-semibold text-5xl shadow-2xl shadow-black/20">CX</div>
          )}
          <p className="mt-8 text-white/90 text-lg font-medium">{name}</p>
        </div>
      </div>

      {/* Right: product name and sign in */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <p className="text-sm font-semibold tracking-[0.2em] text-brand">CX360</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">Customer Relationship Management Tool</h1>
          </div>

          <LoginForm />

          {/* Demo logins are hidden by default. Set SHOW_DEMO_LOGINS=true in the host environment to show them. */}
          {process.env.SHOW_DEMO_LOGINS === "true" && (
            <p className="mt-6 text-center text-xs text-ink-950/45">
              Demo: <code className="kbd">agent@demobank.cx360</code> /{" "}
              <code className="kbd">supervisor@demobank.cx360</code> — password <code className="kbd">demo1234</code>
            </p>
          )}
          <p className="mt-8 text-xs text-ink-950/40">Internal use only. Activity is recorded.</p>
        </div>
      </div>
    </div>
  );
}
