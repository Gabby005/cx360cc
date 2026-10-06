import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

const MAX_FAILS = 5; // wrong passwords in a row before the account pauses
const LOCK_MINUTES = 15;
// Used so an unknown email takes as long to reject as a wrong password.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.1vYb8yqE6xZ3o3dGQnQd1h8P6y2e";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.trim();
        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { include: { tenant: true } } },
        });
        if (!user) {
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          return null;
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          const fails = user.failedLogins + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: fails >= MAX_FAILS
              ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
              : { failedLogins: fails },
          });
          return null;
        }
        if (user.failedLogins > 0 || user.lockedUntil) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
        }

        // Single-tenant-per-session for simplicity; a tenant switcher can
        // extend this to let a user re-authenticate into a different
        // membership if they belong to more than one tenant.
        const membership = user.memberships[0];
        if (!membership) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: membership.tenantId,
          tenantName: membership.tenant.name,
          role: membership.role,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.tenantId = (user as any).tenantId;
        token.tenantName = (user as any).tenantName;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).tenantId = token.tenantId;
        (session.user as any).tenantName = token.tenantName;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};
