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

  const [invites, matches, champion, topScorer, predictionsOpenUntil, bracketLockedRaw, picks] =
    await Promise.all([
      db.invite.findMany({ orderBy: { createdAt: "desc" } }),
      db.match.findMany({ orderBy: { matchDate: "asc" } }),
      getSetting("actualChampion"),
      getSetting("actualTopScorer"),
      getSetting("predictionsOpenUntil"),
      getSetting("bracketLocked"),
      db.marketPick.findMany({
        include: {
          user: { select: { nickname: true } },
          match: { select: { homeTeam: true, awayTeam: true, status: true, matchDate: true } },
        },
        orderBy: { match: { matchDate: "asc" } },
      }),
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
      playerPicks={picks.map((p) => ({
        id: p.id,
        userId: p.userId,
        nickname: p.user.nickname,
        matchId: p.matchId,
        match: `${p.match.homeTeam} — ${p.match.awayTeam}`,
        finished: p.match.status === "finished",
        market: p.market,
        selection: p.selection,
        points: p.pointsEarned,
      }))}
    />
  );
}
