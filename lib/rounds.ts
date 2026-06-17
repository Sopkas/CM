// Туры: группировка матчей в «туры» для лиги по турам.
// Группы → тур = календарный игровой день. Плей-офф → тур = раунд (R32/R16/QF/SF/Final).
import type { Match } from "@prisma/client";
import { stageLabel } from "@/lib/format";

export interface RoundInfo {
  key: string;
  label: string;
  date: number; // min matchDate тура (для сортировки)
  total: number;
  finished: number;
  active: boolean; // есть незавершённые матчи
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

// Ключ тура матча.
export function roundKeyOf(m: Pick<Match, "stage" | "matchDate">): string {
  if (m.stage === "group") return `g:${dayKey(new Date(m.matchDate))}`;
  return `ko:${m.stage}`;
}

// Человекочитаемая подпись тура.
export function roundLabelOf(m: Pick<Match, "stage" | "group" | "matchDate">): string {
  if (m.stage === "group") return `Группы · ${dayLabel(new Date(m.matchDate))}`;
  return stageLabel(m.stage, m.group ?? null);
}

// Список туров по всем матчам, отсортирован по дате (раньше → позже).
export function listRounds(matches: Match[]): RoundInfo[] {
  const map = new Map<string, RoundInfo>();
  for (const m of matches) {
    const key = roundKeyOf(m);
    let r = map.get(key);
    if (!r) {
      r = {
        key,
        label: roundLabelOf(m),
        date: m.matchDate.getTime(),
        total: 0,
        finished: 0,
        active: false,
      };
      map.set(key, r);
    }
    r.total++;
    if (m.status === "finished") r.finished++;
    else r.active = true;
    r.date = Math.min(r.date, m.matchDate.getTime());
  }
  return [...map.values()].sort((a, b) => a.date - b.date);
}
