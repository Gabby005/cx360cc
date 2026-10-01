/**
 * Role names as people see them. The stored value for "Super Admin" stays
 * `ADMIN` (renaming it in the database would touch every permission check
 * for no benefit) — only the label changes.
 *
 *   Super Admin  everything: Admin centre, Workflows, users, branding, integrations
 *   Supervisor   everything an Agent can do + management: all cases, team &
 *                department views, analytics + exports, batch close, QA review
 *   Agent        logs and works tickets; sees their own tickets, plus their
 *                team's / department's tickets if they belong to one
 *   Read only    looks, doesn't change anything
 */
export type Role = "ADMIN" | "SUPERVISOR" | "AGENT" | "READ_ONLY";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Super Admin",
  SUPERVISOR: "Supervisor",
  AGENT: "Agent",
  READ_ONLY: "Read only",
};

export const ROLE_HELP: Record<Role, string> = {
  ADMIN: "Full access, including the Admin centre and Workflows.",
  SUPERVISOR: "Everything an agent does, plus all cases, team views, analytics, exports and batch close. No Admin centre or Workflows.",
  AGENT: "Logs and works tickets. Sees their own tickets and their department's.",
  READ_ONLY: "View only.",
};
