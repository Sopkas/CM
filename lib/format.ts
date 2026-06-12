import type { MatchStatus } from "@prisma/client";

export function statusLabel(status: MatchStatus, minute: number | null): string {
  switch (status) {
    case "live":
      return minute != null ? `LIVE ${minute}'` : "LIVE";
    case "finished":
      return "Завершён";
    default:
      return "Скоро";
  }
}

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMatchDate(d: Date): string {
  return dt.format(d);
}

export function stageLabel(stage: string, group: string | null): string {
  if (stage === "group") return group ? `Группа ${group}` : "Группа";
  const map: Record<string, string> = {
    R32: "1/16 финала",
    R16: "1/8 финала",
    QF: "1/4 финала",
    SF: "1/2 финала",
    Final: "Финал",
    Third: "За 3-е место",
  };
  return map[stage] ?? stage;
}
