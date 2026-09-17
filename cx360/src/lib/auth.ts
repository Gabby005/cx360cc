import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { memberships: { include: { tenant: true } } },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

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
