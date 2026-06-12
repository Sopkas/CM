// Дедлайн прогноза — за 15 минут до старта матча (PRD §3.2).

export const LOCK_MINUTES_BEFORE = 15;

export function deadlineFor(matchDate: Date): Date {
  return new Date(matchDate.getTime() - LOCK_MINUTES_BEFORE * 60_000);
}

export function isLocked(matchDate: Date, now: Date = new Date()): boolean {
  return now >= deadlineFor(matchDate);
}

// Сколько миллисекунд до закрытия (для таймера на клиенте). <=0 = закрыто.
export function msUntilDeadline(matchDate: Date, now: Date = new Date()): number {
  return deadlineFor(matchDate).getTime() - now.getTime();
}
