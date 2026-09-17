"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export function LoginForm() {
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
    <form onSubmit={handleSubmit} className="card p-7">
      <h1 className="text-lg font-semibold mb-1">Sign in</h1>
      <p className="text-sm text-ink-950/60 mb-6">Use your agent or admin credentials.</p>

      <label className="block text-sm font-medium mb-1.5" htmlFor="email">
        Work email
      </label>
      <input
        id="email"
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input mb-4"
        placeholder="you@bank.com"
      />

      <label className="block text-sm font-medium mb-1.5" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="input mb-2"
        placeholder="••••••••"
      />

      {error && (
        <p role="alert" className="text-sm text-sla-breach mb-3 mt-2">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-primary w-full mt-4">
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
