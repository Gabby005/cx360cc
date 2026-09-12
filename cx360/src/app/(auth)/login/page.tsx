import { prisma } from "@/lib/prisma";
import { buildBrandStyleTag } from "@/lib/theme";
import { LoginForm } from "@/components/auth/login-form";

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
        <div className="flex items-center justify-center gap-2 mb-8">
          {tenant?.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoDataUrl} alt={tenant.name} className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-brand text-white grid place-items-center font-semibold text-sm">
              CX
            </div>
          )}
          <span className="font-semibold text-lg">{tenant?.name ?? "CX360"}</span>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-xs text-ink-950/45">
          Demo: <code className="kbd">agent@demobank.cx360</code> /{" "}
          <code className="kbd">supervisor@demobank.cx360</code> — password{" "}
          <code className="kbd">demo1234</code>
        </p>
      </div>
    </div>
  );
}
