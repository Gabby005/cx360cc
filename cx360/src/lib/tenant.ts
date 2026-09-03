import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type SessionContext = {
  userId: string;
  tenantId: string;
  role: "ADMIN" | "SUPERVISOR" | "AGENT" | "READ_ONLY";
};

/**
 * Resolves the current request's tenant + role from the session.
 * Every Prisma query in an API route MUST filter by tenantId using this,
 * so a bug elsewhere in the code can never leak data across tenants.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new ApiError(401, "Not authenticated");
  }
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
  };
}

const ROLE_RANK: Record<SessionContext["role"], number> = {
  READ_ONLY: 0,
  AGENT: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

export function requirePermission(ctx: SessionContext, minRole: SessionContext["role"]) {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minRole]) {
    throw new ApiError(403, `Requires ${minRole} role or higher`);
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
