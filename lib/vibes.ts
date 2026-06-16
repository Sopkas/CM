// Авто-титулы (клеймо) и стрики участников — из их ставок. Read-only, без схемы.
import { db } from "@/lib/db";
import { buildModel, coefForPick } from "@/lib/odds";

export interface Title {
  emoji: string;
  name: string;
  tone: "good" | "bad" | "neutral";
}
export interface UserVibe {
  titles: Title[];
  streak: { kind: "win" | "loss"; n: number } | null;
}

interface Agg {
  coefSum: number;
  coefN: number;
  edgeSum: number;
  edgeN: number;
  matchNet: Map<string, { date: number; net: number }>; // только завершённые матчи
}

function streakOf(matchNet: Agg["matchNet"]): UserVibe["streak"] {
  const arr = [...matchNet.values()].sort((a, b) => b.date - a.date);
  let kind: "win" | "loss" | null = null;
  let n = 0;
  for (const m of arr) {
    const s = m.net > 0 ? "win" : m.net < 0 ? "loss" : null;
    if (s === null) break; // ничья по очкам рвёт серию
    if (kind === null) { kind = s; n = 1; }
    else if (s === kind) n++;
    else break;
  }
  return kind && n >= 2 ? { kind, n } : null;
}

export async function getVibes(): Promise<Map<string, UserVibe>> {
  const [users, picks] = await Promise.all([
    db.user.findMany({ select: { id: true, putintseva: true } }),
    db.marketPick.findMany({
      select: {
        userId: true,
        market: true,
        selection: true,
        coef: true,
        pointsEarned: true,
        matchId: true,
        match: {
          select: {
            status: true, matchDate: true,
            pHome: true, pDraw: true, pAway: true, goalLine: true, pOver: true,
          },
        },
      },
    }),
  ]);

  const agg = new Map<string, Agg>();
  const get = (u: string) => {
    let a = agg.get(u);
    if (!a) { a = { coefSum: 0, coefN: 0, edgeSum: 0, edgeN: 0, matchNet: new Map() }; agg.set(u, a); }
    return a;
  };

  for (const p of picks) {
    const a = get(p.userId);
    const mm = p.match;
    if (p.coef != null) {
      a.coefSum += p.coef;
      a.coefN++;
      // эдж против закрытия
      if (mm.pHome != null && mm.pDraw != null && mm.pAway != null && mm.goalLine != null) {
        const closing = coefForPick(p.market, p.selection, buildModel({
          pHome: mm.pHome, pDraw: mm.pDraw, pAway: mm.pAway, goalLine: mm.goalLine, pOver: mm.pOver ?? undefined,
        }));
        if (closing != null && closing > 0) { a.edgeSum += p.coef / closing - 1; a.edgeN++; }
      }
    }
    if (mm.status === "finished") {
      const cur = a.matchNet.get(p.matchId) ?? { date: mm.matchDate.getTime(), net: 0 };
      cur.net += p.pointsEarned;
      a.matchNet.set(p.matchId, cur);
    }
  }

  const result = new Map<string, UserVibe>();
  for (const u of users) {
    const a = agg.get(u.id);
    const titles: Title[] = [];
    if (u.putintseva) titles.push({ emoji: "🎯", name: "Путинцев", tone: "bad" });
    result.set(u.id, { titles, streak: a ? streakOf(a.matchNet) : null });
  }

  // Соревновательные титулы (по одному держателю, минимум выборки).
  const avgEdge = (a: Agg) => a.edgeSum / a.edgeN;
  const avgCoef = (a: Agg) => a.coefSum / a.coefN;
  const eligible = (min: (a: Agg) => boolean) =>
    users.map((u) => ({ id: u.id, a: agg.get(u.id) })).filter((x): x is { id: string; a: Agg } => !!x.a && min(x.a));

  const byEdge = eligible((a) => a.edgeN >= 3);
  if (byEdge.length) {
    const best = byEdge.reduce((p, c) => (avgEdge(c.a) > avgEdge(p.a) ? c : p));
    const worst = byEdge.reduce((p, c) => (avgEdge(c.a) < avgEdge(p.a) ? c : p));
    result.get(best.id)!.titles.push({ emoji: "🔥", name: "Капер", tone: "good" });
    if (worst.id !== best.id) result.get(worst.id)!.titles.push({ emoji: "🤡", name: "Клоун", tone: "bad" });
  }

  const byCoef = eligible((a) => a.coefN >= 3);
  if (byCoef.length) {
    const lud = byCoef.reduce((p, c) => (avgCoef(c.a) > avgCoef(p.a) ? c : p));
    const chalk = byCoef.reduce((p, c) => (avgCoef(c.a) < avgCoef(p.a) ? c : p));
    result.get(lud.id)!.titles.push({ emoji: "🎰", name: "Лудоман", tone: "neutral" });
    if (chalk.id !== lud.id) result.get(chalk.id)!.titles.push({ emoji: "🐔", name: "Куколд линии", tone: "bad" });
  }

  return result;
}
