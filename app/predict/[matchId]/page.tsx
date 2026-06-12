import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { deadlineFor, isLocked } from "@/lib/deadline";
import { formatMatchDate, stageLabel, statusLabel } from "@/lib/format";
import { selectionLabel, MARKET_BY_KEY } from "@/lib/markets";
import { PredictForm } from "@/components/PredictForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Avatar } from "@/components/Avatar";
import { MatchStatsView } from "@/components/MatchStatsView";
import { RecentForm } from "@/components/RecentForm";
import { Lineups } from "@/components/Lineups";
import { Flag } from "@/components/Flag";
import { fetchEspnMatchExtras, type MatchStats, type MatchExtras } from "@/lib/espn";

export const dynamic = "force-dynamic";

export default async function PredictPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const user = await getCurrentUser();

  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) notFound();

  // Составы + форма из ESPN (есть только для матчей с espn-id). Падать не должно.
  let extras: MatchExtras = { lineups: null, form: null };
  if (match.externalId.startsWith("espn:")) {
    extras = await fetchEspnMatchExtras(match.externalId).catch(() => ({
      lineups: null,
      form: null,
    }));
  }

  const locked = isLocked(match.matchDate);
  const showScore = match.status === "live" || match.status === "finished";

  const myPicks = user
    ? await db.marketPick.findMany({ where: { userId: user.id, matchId } })
    : [];
  const hasBet = myPicks.length > 0;

  // Чужие прогнозы видны всем залогиненным в любой момент.
  const others = user
    ? await db.marketPick.findMany({
        where: { matchId },
        include: { user: { select: { id: true, nickname: true, avatar: true } } },
      })
    : [];

  // группируем по пользователю
  const byUser = new Map<
    string,
    {
      id: string;
      nickname: string;
      avatar: string | null;
      picks: { market: string; selection: string; pointsEarned: number }[];
      total: number;
    }
  >();
  for (const p of others) {
    let e = byUser.get(p.user.id);
    if (!e) {
      e = { id: p.user.id, nickname: p.user.nickname, avatar: p.user.avatar, picks: [], total: 0 };
      byUser.set(p.user.id, e);
    }
    e.picks.push({ market: p.market, selection: p.selection, pointsEarned: p.pointsEarned });
    e.total += p.pointsEarned;
  }
  const participants = [...byUser.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-5">
      {match.status === "live" && <AutoRefresh seconds={60} />}

      <Link href="/matches" className="text-sm text-muted">
        ← к матчам
      </Link>

      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <div className="text-xs text-muted mb-2">
          {stageLabel(match.stage, match.group)} · {formatMatchDate(match.matchDate)}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <span className="flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-right truncate">{match.homeTeam}</span>
            <Flag team={match.homeTeam} className="text-xl" />
          </span>
          <span className="score text-3xl">
            {showScore ? `${match.homeScore ?? 0}–${match.awayScore ?? 0}` : <span className="text-muted not-italic">—</span>}
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <Flag team={match.awayTeam} className="text-xl" />
            <span className="font-semibold text-left truncate">{match.awayTeam}</span>
          </span>
        </div>
        <div className="mt-2 text-sm">
          {match.status === "live" ? (
            <span className="text-danger font-semibold">
              {statusLabel(match.status, match.minute)}
            </span>
          ) : (
            <span className="text-muted">{statusLabel(match.status, match.minute)}</span>
          )}
        </div>
      </div>

      {match.stats ? (
        <MatchStatsView
          stats={match.stats as unknown as MatchStats}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
        />
      ) : null}

      {extras.form && (
        <RecentForm home={extras.form.home} away={extras.form.away} />
      )}

      {!user ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm">
          <Link href="/join" className="text-accent font-semibold">
            Войди
          </Link>
          , чтобы сделать прогноз.
        </div>
      ) : locked || hasBet ? (
        <MyPicksSummary
          picks={myPicks}
          finished={match.status === "finished"}
          locked={locked}
        />
      ) : (
        <PredictForm
          matchId={match.id}
          homeTeam={match.homeTeam}
          awayTeam={match.awayTeam}
          deadlineMs={deadlineFor(match.matchDate).getTime()}
        />
      )}

      {user && (
        <section>
          <h2 className="text-sm font-semibold text-muted mb-2">
            Прогнозы участников
          </h2>
          {participants.length === 0 ? (
            <p className="text-sm text-muted">Никто не сделал прогноз.</p>
          ) : (
            <div className="space-y-2">
              {participants.map((p, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-surface p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Link
                      href={user.id === p.id ? "/me" : `/u/${p.id}`}
                      className="flex items-center gap-2 flex-1 min-w-0"
                    >
                      <Avatar avatar={p.avatar} size={24} />
                      <span className="font-medium truncate">{p.nickname}</span>
                    </Link>
                    {match.status === "finished" && (
                      <span className="font-mono font-bold text-accent">+{p.total}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.picks.map((pick, j) => (
                      <PickChip
                        key={j}
                        market={pick.market}
                        selection={pick.selection}
                        points={pick.pointsEarned}
                        finished={match.status === "finished"}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {extras.lineups && (
        <Lineups home={extras.lineups.home} away={extras.lineups.away} />
      )}
    </div>
  );
}

function MyPicksSummary({
  picks,
  finished,
  locked,
}: {
  picks: { market: string; selection: string; pointsEarned: number }[];
  finished: boolean;
  locked: boolean;
}) {
  if (picks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center text-muted text-sm">
        Ты не сделал прогноз на этот матч.
      </div>
    );
  }
  const total = picks.reduce((s, p) => s + p.pointsEarned, 0);
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">Твой прогноз</span>
        {finished ? (
          <span className="font-mono font-bold text-accent">+{total}</span>
        ) : (
          <span className="text-xs text-muted">
            {locked ? "приём закрыт" : "ставка принята — изменить нельзя"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {picks.map((p, i) => (
          <PickChip
            key={i}
            market={p.market}
            selection={p.selection}
            points={p.pointsEarned}
            finished={finished}
          />
        ))}
      </div>
    </div>
  );
}

function PickChip({
  market,
  selection,
  points,
  finished,
}: {
  market: string;
  selection: string;
  points: number;
  finished: boolean;
}) {
  const def = MARKET_BY_KEY.get(market);
  const tone = !finished
    ? "bg-surface-2 text-foreground"
    : points > 0
      ? "bg-accent/20 text-accent"
      : "bg-danger/15 text-danger";
  return (
    <span className={`text-xs px-2 py-1 rounded-lg ${tone}`}>
      <span className="opacity-70">{def?.label ?? market}:</span>{" "}
      <span className="font-semibold">{selectionLabel(market, selection)}</span>
      {finished && points > 0 && <span className="ml-1">+{points}</span>}
    </span>
  );
}
