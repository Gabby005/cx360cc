import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      tenantName: string;
      role: "ADMIN" | "SUPERVISOR" | "AGENT" | "READ_ONLY";
    } & DefaultSession["user"];
  }
}
