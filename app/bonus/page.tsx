import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getAllTeams, tournamentDeadline } from "@/lib/tournament";
import { getSetting } from "@/lib/recompute";
import { predictionsWindowOpen, deadlinePassed } from "@/lib/windows";
import { BonusForm } from "@/components/BonusForm";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function BonusPage() {
  const user = await getCurrentUser();
  const [teams, deadline, actualChampion, actualTopScorer, windowOpen] = await Promise.all([
    getAllTeams(),
    tournamentDeadline(),
    getSetting("actualChampion"),
    getSetting("actualTopScorer"),
    predictionsWindowOpen(),
  ]);

  // Окно прогнозов (админ) перекрывает обычный дедлайн.
  const locked = windowOpen ? false : deadlinePassed(deadline);

  const myPicks = user
    ? await db.bonusPrediction.findMany({ where: { userId: user.id } })
    : [];
  const myChampion = myPicks.find((p) => p.type === "champion")?.value ?? null;
  const myTopScorer = myPicks.find((p) => p.type === "top_scorer")?.value ?? null;

  const all = locked
    ? await db.bonusPrediction.findMany({
        include: { user: { select: { nickname: true, avatar: true } } },
      })
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">⭐ Бонусные прогнозы</h1>
        <p className="text-sm text-muted mt-1">
          До старта турнира. Чемпион +10, бомбардир +5.
        </p>
      </div>

      {!user ? (
        <Card>
          <Link href="/join" className="text-accent font-semibold">
            Войди
          </Link>
          , чтобы сделать бонусный прогноз.
        </Card>
      ) : locked ? (
        <Card>Приём бонусных прогнозов закрыт — турнир начался.</Card>
      ) : (
        <BonusForm
          teams={teams}
          initialChampion={myChampion}
          initialTopScorer={myTopScorer}
        />
      )}

      {locked && (
        <section className="space-y-3">
          <BonusList
            title="🏆 Чемпион"
            actual={actualChampion}
            picks={all.filter((p) => p.type === "champion")}
          />
          <BonusList
            title="⚽ Бомбардир"
            actual={actualTopScorer}
            picks={all.filter((p) => p.type === "top_scorer")}
          />
        </section>
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm">
      {children}
    </div>
  );
}

function BonusList({
  title,
  actual,
  picks,
}: {
  title: string;
  actual: string | null;
  picks: {
    id: string;
    value: string;
    pointsEarned: number;
    user: { nickname: string; avatar: string | null };
  }[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 flex items-center justify-between text-sm">
        <span className="font-semibold">{title}</span>
        {actual && <span className="text-accent text-xs">факт: {actual}</span>}
      </div>
      {picks.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted">Никто не загадал.</p>
      ) : (
        picks.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 px-3 py-2 border-t border-border text-sm"
          >
            <Avatar avatar={p.user.avatar} size={22} />
            <span className="truncate flex-1">{p.user.nickname}</span>
            <span className="text-muted">{p.value}</span>
            {actual && (
              <span
                className={`px-1.5 rounded text-xs font-semibold ${
                  p.pointsEarned > 0
                    ? "bg-accent/20 text-accent"
                    : "bg-danger/20 text-danger"
                }`}
              >
                {p.pointsEarned > 0 ? `+${p.pointsEarned}` : "0"}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
