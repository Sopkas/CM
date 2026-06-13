import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getSetting } from "@/lib/recompute";
import { AdminPanel } from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/join");
  if (!user.isAdmin) redirect("/");

  const [invites, matches, champion, topScorer, predictionsOpenUntil, bracketLockedRaw] =
    await Promise.all([
      db.invite.findMany({ orderBy: { createdAt: "desc" } }),
      db.match.findMany({ orderBy: { matchDate: "asc" } }),
      getSetting("actualChampion"),
      getSetting("actualTopScorer"),
      getSetting("predictionsOpenUntil"),
      getSetting("bracketLocked"),
    ]);

  return (
    <AdminPanel
      champion={champion}
      topScorer={topScorer}
      predictionsOpenUntil={predictionsOpenUntil || null}
      bracketLocked={bracketLockedRaw !== "false"}
      invites={invites.map((i) => ({
        id: i.id,
        code: i.code,
        note: i.note,
        used: !!i.usedAt,
      }))}
      matches={matches.map((m) => ({
        id: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        status: m.status,
        matchDate: m.matchDate.toISOString(),
        bettingOpen: m.bettingOpen,
      }))}
    />
  );
}
