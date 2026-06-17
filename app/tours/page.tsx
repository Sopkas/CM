import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Avatar } from "@/components/Avatar";
import { listRounds } from "@/lib/rounds";
import { getRoundStandings } from "@/lib/leagues";

export const dynamic = "force-dynamic";

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = await searchParams;
  const me = await getCurrentUser();

  const matches = await db.match.findMany();
  const rounds = listRounds(matches);
  const played = rounds.filter((x) => x.finished > 0);

  // Дефолт — последний тур с завершёнными матчами.
  const selectedKey =
    r && rounds.some((x) => x.key === r) ? r : played.length ? played[played.length - 1].key : rounds[0]?.key ?? null;
  const selected = rounds.find((x) => x.key === selectedKey) ?? null;

  const standings = selectedKey ? await getRoundStandings(selectedKey) : [];

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <div>
        <h1 className="text-xl font-bold">🏟️ Лига по турам</h1>
        <p className="text-xs text-muted">Очки в рамках одного тура. Топ тура — 🏅 MVP.</p>
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Матчей пока нет.
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {rounds.map((rd) => (
              <Link
                key={rd.key}
                href={`/tours?r=${encodeURIComponent(rd.key)}`}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border ${
                  rd.key === selectedKey
                    ? "bg-accent text-background font-semibold border-accent"
                    : rd.finished > 0
                      ? "bg-surface-2 text-foreground border-border"
                      : "border-transparent text-muted"
                }`}
              >
                {rd.label}
                <span className="opacity-60"> · {rd.finished}/{rd.total}</span>
              </Link>
            ))}
          </div>

          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{selected?.label}</h2>
            {selected?.active && <span className="text-xs text-warn">тур ещё идёт</span>}
          </div>

          {standings.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
              В этом туре ещё нет начисленных очков.
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[2rem_1fr_4rem_3rem] gap-2 px-3 py-2 text-xs text-muted bg-surface-2">
                <span>#</span>
                <span>Участник</span>
                <span className="text-right">Очки</span>
                <span className="text-right">Точн.</span>
              </div>
              {standings.map((s, i) => {
                const isMe = me?.id === s.userId;
                return (
                  <Link
                    key={s.userId}
                    href={isMe ? "/me" : `/u/${s.userId}`}
                    className={`grid grid-cols-[2rem_1fr_4rem_3rem] gap-2 px-3 py-2.5 items-center border-t border-border ${
                      isMe ? "bg-accent/10" : "bg-surface"
                    }`}
                  >
                    <span className="font-mono text-muted">{i === 0 ? "🏅" : i + 1}</span>
                    <span className="flex items-center gap-2 min-w-0">
                      <Avatar avatar={s.avatar} />
                      <span className="font-medium truncate">{s.nickname}</span>
                      {i === 0 && <span className="text-[10px] text-accent">MVP тура</span>}
                    </span>
                    <span className="text-right font-mono font-bold text-accent">{s.points}</span>
                    <span className="text-right text-sm text-muted">{s.accuracy}%</span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
