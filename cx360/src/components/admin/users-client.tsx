"use client";

import { useState } from "react";
import { Plus, Copy, Check } from "lucide-react";

const ROLES = ["ADMIN", "SUPERVISOR", "AGENT", "READ_ONLY"] as const;

const ROLE_PILL: Record<string, string> = {
  ADMIN: "pill-brand",
  SUPERVISOR: "pill-warning",
  AGENT: "pill-neutral",
  READ_ONLY: "pill-neutral",
};

type Member = {
  id: string; // membership id
  role: (typeof ROLES)[number];
  teamId: string | null;
  unitId: string | null;
  user: { id: string; name: string; email: string; createdAt: string };
};
type Option = { id: string; name: string };

export function UsersClient({
  currentUserId,
  initialMembers,
  initialTeams,
  units,
}: {
  currentUserId: string;
  initialMembers: Member[];
  initialTeams: Option[];
  units: Option[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [teams, setTeams] = useState(initialTeams);
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-start gap-3 mb-3">
        <NewTeam onCreated={(t) => setTeams((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)))} />
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary text-xs">
          <Plus size={14} /> New user
        </button>
      </div>

      {showForm && (
        <CreateUserForm
          onCreated={(member) => {
            setMembers((prev) => [...prev, member].sort((a, b) => a.user.name.localeCompare(b.user.name)));
          }}
        />
      )}

      <div className="card divide-y divide-line-light dark:divide-line-dark">
        {members.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            isSelf={m.user.id === currentUserId}
            teams={teams}
            units={units}
            onChanged={(patch) => setMembers((prev) => prev.map((p) => (p.id === m.id ? { ...p, ...patch } : p)))}
          />
        ))}
        {members.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-950/50 dark:text-surface/50">No team members yet.</p>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  teams,
  units,
  onChanged,
}: {
  member: Member;
  isSelf: boolean;
  teams: Option[];
  units: Option[];
  onChanged: (patch: Partial<Pick<Member, "role" | "teamId" | "unitId">>) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(patch: Partial<Pick<Member, "role" | "teamId" | "unitId">>) {
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/admin/users/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to update" }));
      setError(msg);
      return;
    }
    onChanged(patch);
  }
  const changeRole = (role: Member["role"]) => update({ role });

  return (
    <div className="p-4 flex items-center gap-3 text-sm">
      <span className="avatar w-9 h-9 text-xs shrink-0">{member.user.name[0]}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {member.user.name} {isSelf && <span className="text-xs text-ink-950/40 dark:text-surface/40">(you)</span>}
        </div>
        <div className="text-xs text-ink-950/50 dark:text-surface/50 truncate">{member.user.email}</div>
        {error && <div className="text-xs text-sla-breach mt-0.5">{error}</div>}
      </div>
      <select
        value={member.teamId ?? ""}
        onChange={(e) => update({ teamId: e.target.value || null })}
        disabled={saving}
        title="Team"
        className="input !py-1 text-xs w-36 shrink-0"
      >
        <option value="">No team</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={member.unitId ?? ""}
        onChange={(e) => update({ unitId: e.target.value || null })}
        disabled={saving}
        title="Department"
        className="input !py-1 text-xs w-40 shrink-0"
      >
        <option value="">No department</option>
        {units.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <span className={`${ROLE_PILL[member.role]} shrink-0`}>{member.role}</span>
      {!isSelf && (
        <select
          value={member.role}
          onChange={(e) => changeRole(e.target.value as Member["role"])}
          disabled={saving}
          className="input !py-1 text-xs w-32 shrink-0"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function NewTeam({ onCreated }: { onCreated: (t: Option) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSaving(true);
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSaving(false);
    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to create team" }));
      setError(msg);
      return;
    }
    const { team } = await res.json();
    onCreated(team);
    setName("");
  }

  return (
    <form onSubmit={add} className="flex items-center gap-2 flex-wrap">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New team name" className="input !py-1.5 text-xs w-48" />
      <button type="submit" disabled={saving || !name.trim()} className="btn-secondary text-xs">
        Add team
      </button>
      {error && <span className="text-xs text-sla-breach">{error}</span>}
    </form>
  );
}

function CreateUserForm({ onCreated }: { onCreated: (member: Member) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("AGENT");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) return setError("Name and email are required.");

    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });
    setSaving(false);

    if (!res.ok) {
      const { error: msg } = await res.json().catch(() => ({ error: "Failed to create user" }));
      setError(msg);
      return;
    }
    const { member, tempPassword: pw } = await res.json();
    onCreated(member);
    setCreatedEmail(email);
    setTempPassword(pw ?? null);
    setName("");
    setEmail("");
    setRole("AGENT");
  }

  if (tempPassword) {
    return (
      <div className="card p-4 mb-3 border-sla-warning/40 bg-sla-warning/5">
        <p className="text-xs font-medium text-sla-warning mb-1">
          Share this password with {createdEmail} — it won't be shown again.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono bg-surface dark:bg-ink-950 px-2 py-1.5 rounded">
            {tempPassword}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(tempPassword);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="p-1.5 rounded hover:bg-surface dark:hover:bg-ink-900"
          >
            {copied ? <Check size={14} className="text-sla-ok" /> : <Copy size={14} />}
          </button>
        </div>
        <button onClick={() => setTempPassword(null)} className="btn-secondary text-xs mt-3">
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-4 mb-3 space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Amara Agent" />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Work email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          placeholder="amara@demobank.cx360"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value as Member["role"])} className="input">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-sla-breach">{error}</p>}
      <button type="submit" disabled={saving} className="btn-primary w-full text-sm">
        {saving ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}
