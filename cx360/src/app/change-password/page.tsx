import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { mustChangePassword: true } });
  return (
    <div className="min-h-screen grid place-items-center bg-surface dark:bg-ink-950 p-6">
      <div className="card w-full max-w-md p-6">
        <h1 className="text-lg font-semibold">{u?.mustChangePassword ? "Choose your own password" : "Change password"}</h1>
        <p className="text-sm text-ink-950/60 dark:text-surface/60 mt-1 mb-5">
          {u?.mustChangePassword ? "Your account uses a temporary password. Set a new one to continue." : "Use at least 10 characters with a letter and a number."}
        </p>
        <ChangePasswordForm forced={!!u?.mustChangePassword} />
      </div>
    </div>
  );
}
