import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/deadline";
import { isBracketLocked } from "@/lib/windows";
import { matchWinner } from "@/lib/scoring";
import { BracketView, type BracketMatch } from "@/components/BracketView";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function BracketPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;
  const me = await getCurrentUser();

  const bracketLocked = await isBracketLocked();

  // Чью сетку показываем: свою (редактируемую) или другого участника (read-only).
  const viewUserId = u ?? me?.id ?? null;
  const editable = !!me && viewUserId === me.id && !bracketLocked;

  const [matches, picks, participants, viewUser] = await Promise.all([
    db.match.findMany({
      where: { stage: { not: "group" } },
      orderBy: { matchDate: "asc" },
    }),
    viewUserId
      ? db.knockoutPick.findMany({ where: { userId: viewUserId } })
      : Promise.resolve([]),
    db.user.findMany({
      where: { knockoutPicks: { some: {} } },
      select: { id: true, nickname: true, avatar: true },
      orderBy: { nickname: "asc" },
    }),
    viewUserId
      ? db.user.findUnique({
          where: { id: viewUserId },
          select: { nickname: true },
        })
      : Promise.resolve(null),
  ]);

  const pickByMatch = new Map(picks.map((p) => [p.matchId, p]));

  // Номер матча (M73…M104) и числовой порядок — из внешнего id (espn:760486 → 760486).
  // ESPN отдаёт матчи плей-офф подряд, поэтому ранг по externalId = M73 + позиция.
  const externalNum = (m: (typeof matches)[number]) =>
    Number(m.externalId.replace(/\D/g, "")) || 0;
  const byExternal = [...matches].sort((a, b) => externalNum(a) - externalNum(b));
  const codeByMatch = new Map(byExternal.map((m, i) => [m.id, `M${73 + i}`]));

  const data: BracketMatch[] = matches.map((m) => {
    const winner = matchWinner(m.homeTeam, m.awayTeam, m.homeScore, m.awayScore);
    const pick = pickByMatch.get(m.id);
    return {
      id: m.id,
      code: codeByMatch.get(m.id) ?? "",
      order: externalNum(m),
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      stage: m.stage,
      locked: isLocked(m.matchDate),
      actualWinner: m.status === "finished" ? winner : null,
      myPick: pick?.predictedTeam ?? null,
      pickPoints: pick?.pointsEarned ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">🗂️ Сетка плей-офф</h1>
        {me && (
          <Link
            href="/bracket"
            className={`text-sm px-3 py-1.5 rounded-lg ${
              editable ? "bg-surface-2" : "bg-accent text-background font-semibold"
            }`}
          >
            Моя сетка
          </Link>
        )}
      </div>

      {/* Переключатель участников */}
      {participants.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {participants.map((p) => (
            <Link
              key={p.id}
              href={`/bracket?u=${p.id}`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm whitespace-nowrap border ${
                viewUserId === p.id
                  ? "border-accent bg-accent/10"
                  : "border-border text-muted"
              }`}
            >
              <Avatar avatar={p.avatar} size={18} />
              {p.nickname}
            </Link>
          ))}
        </div>
      )}

      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Матчей плей-офф пока нет. Появятся после группового этапа (или из синка).
        </div>
      ) : (
        <>
          {!editable && viewUser && (
            <p className="text-sm text-muted">
              Сетка участника <span className="text-foreground">{viewUser.nickname}</span> (только просмотр).
            </p>
          )}
          {/* Сетка вырывается из узкой колонки на всю ширину экрана */}
          <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen px-4">
            <div className={bracketLocked ? "blur-[6px] pointer-events-none select-none" : ""}>
              <BracketView matches={data} editable={editable} />
            </div>
            {bracketLocked && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="rounded-xl border border-border bg-surface/95 px-6 py-5 text-center shadow-xl max-w-xs">
                  <div className="text-3xl mb-1">🔒</div>
                  <div className="font-semibold">Сетка пока закрыта</div>
                  <p className="text-sm text-muted mt-1">
                    Откроется, когда закончится групповой этап.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
