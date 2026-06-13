// Окна приёма прогнозов, управляемые админом через Setting (key-value).
// - predictionsOpenUntil: дата, до которой открыты бонусы + прогнозы на группы
//   (перекрывает обычные дедлайны старта турнира/группы).
// - bracketLocked: сетка плей-офф закрыта (по умолчанию ДА, пока админ не откроет).
import { getSetting } from "@/lib/recompute";

export const SETTING_KEYS = {
  predictionsOpenUntil: "predictionsOpenUntil",
  bracketLocked: "bracketLocked",
} as const;

export async function predictionsOpenUntil(): Promise<Date | null> {
  const v = await getSetting(SETTING_KEYS.predictionsOpenUntil);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Открыто ли сейчас окно бонусов/групп (админ-override обычных дедлайнов).
export async function predictionsWindowOpen(now: Date = new Date()): Promise<boolean> {
  const until = await predictionsOpenUntil();
  return !!until && now < until;
}

// Прошёл ли дедлайн (now внутри — чтобы не дёргать Date в рендере компонента).
export function deadlinePassed(deadline: Date | null, now: Date = new Date()): boolean {
  return !!deadline && now.getTime() >= deadline.getTime();
}

// Сетка закрыта? По умолчанию закрыта (открыта только если явно выставлено "false").
export async function isBracketLocked(): Promise<boolean> {
  const v = await getSetting(SETTING_KEYS.bracketLocked);
  return v !== "false";
}
