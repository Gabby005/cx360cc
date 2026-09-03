"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Email or password is incorrect.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between bg-ink-950 text-surface p-12">
        <div className="font-mono text-sm tracking-wide text-brand-light/70">CX360</div>
        <div className="max-w-md">
          <p className="text-3xl leading-snug font-medium">
            One customer. One view. Every interaction.
          </p>
          <p className="mt-4 text-surface/60 text-sm leading-relaxed">
            Every case, every channel and every SLA clock your team is
            carrying right now, in one workspace.
          </p>
        </div>
        <div className="text-xs text-surface/40 font-mono">
          Contact Centre CRM · Multi-tenant · SOC2-ready architecture
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-ink-950/60 dark:text-surface/60 mb-6">
            Use your agent or admin credentials.
          </p>

          <label className="block text-sm font-medium mb-1" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded border border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 text-sm"
            placeholder="you@bank.com"
          />

          <label className="block text-sm font-medium mb-1" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-2 px-3 py-2 rounded border border-line-light dark:border-line-dark bg-surface-raised dark:bg-ink-900 text-sm"
            placeholder="••••••••"
          />

          {error && (
            <p role="alert" className="text-sm text-sla-breach mb-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-2 rounded bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="mt-6 text-xs text-ink-950/50 dark:text-surface/50">
            Demo credentials: agent@demobank.cx360 / supervisor@demobank.cx360
            — password <code className="kbd">demo1234</code> (see seed script).
          </p>
        </form>
      </div>
    </div>
  );
}
