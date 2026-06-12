import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getDashboard } from "@/lib/breakdown";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();

  // свой профиль — редиректим на /me
  if (me?.id === id) redirect("/me");

  const dash = await getDashboard(id);
  if (!dash) notFound();

  return (
    <div className="space-y-5">
      <Link href="/leaderboard" className="text-sm text-muted">
        ← к лидерборду
      </Link>

      <Dashboard
        data={dash}
        headerRight={
          me ? (
            <Link
              href={`/compare?a=${me.id}&b=${dash.user.id}`}
              className="text-xs bg-surface-2 rounded-lg px-3 py-2 shrink-0"
            >
              ⚔️ Сравнить
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
