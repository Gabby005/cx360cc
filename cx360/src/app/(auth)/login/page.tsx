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

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <style dangerouslySetInnerHTML={{ __html: buildBrandStyleTag(tenant?.brandColor ?? "#5B5FEF") }} />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center justify-center mb-8 text-center">
          {tenant?.logoDataUrl ? (
            // Large, uncropped logo — works for square marks and wide wordmarks alike.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoDataUrl}
              alt={tenant.name}
              className="h-24 w-auto max-w-[280px] object-contain"
            />
          ) : (
            <>
              <div className="w-20 h-20 rounded-2xl bg-brand text-white grid place-items-center font-semibold text-2xl">
                CX
              </div>
              <span className="font-semibold text-xl mt-3">{tenant?.name ?? "CX360"}</span>
            </>
          )}
        </div>

        <LoginForm />

        {/* Demo logins are hidden by default. Set SHOW_DEMO_LOGINS=true in the host environment to show them. */}
        {process.env.SHOW_DEMO_LOGINS === "true" && (
          <p className="mt-6 text-center text-xs text-ink-950/45">
            Demo: <code className="kbd">agent@demobank.cx360</code> /{" "}
            <code className="kbd">supervisor@demobank.cx360</code> — password{" "}
            <code className="kbd">demo1234</code>
          </p>
        )}
      </div>
    </div>
  );
}
