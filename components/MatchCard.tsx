import Link from "next/link";
import type { MatchStatus } from "@prisma/client";
import { statusLabel, formatMatchDate, stageLabel } from "@/lib/format";
import { isLocked } from "@/lib/deadline";
import { Flag } from "@/components/Flag";

export interface MatchCardData {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  minute: number | null;
  stage: string;
  group: string | null;
  matchDate: Date;
  // сводка моих рыночных прогнозов на матч
  myPrediction?: { count: number; outcome: string | null; points: number } | null;
}

export function MatchCard({ m }: { m: MatchCardData }) {
  const locked = isLocked(m.matchDate);
  const showScore = m.status === "live" || m.status === "finished";

  return (
    <Link
      href={`/predict/${m.id}`}
      className="block rounded-md border border-border bg-surface hover:bg-surface-2/50 transition p-3"
    >
      <div className="flex items-center justify-between text-[11px] text-muted mb-2 uppercase tracking-wide">
        <span>{stageLabel(m.stage, m.group)}</span>
        <StatusBadge status={m.status} minute={m.minute} matchDate={m.matchDate} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-right font-medium truncate">{m.homeTeam}</span>
          <Flag team={m.homeTeam} />
        </span>
        <span className="score text-lg text-center min-w-14">
          {showScore ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : <span className="text-muted not-italic text-sm">vs</span>}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <Flag team={m.awayTeam} />
          <span className="text-left font-medium truncate">{m.awayTeam}</span>
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted">{formatMatchDate(m.matchDate)}</span>
        <PredictionTag m={m} locked={locked} />
      </div>
    </Link>
  );
}

function StatusBadge({
  status,
  minute,
  matchDate,
}: {
  status: MatchStatus;
  minute: number | null;
  matchDate: Date;
}) {
  if (status === "live") {
    return (
      <span className="flex items-center gap-1 text-danger font-semibold">
        <span className="live-dot w-1.5 h-1.5 rounded-full bg-danger" />
        {statusLabel(status, minute)}
      </span>
    );
  }
  if (status === "finished") {
    return <span className="text-muted">{statusLabel(status, minute)}</span>;
  }
  void matchDate;
  return <span className="text-accent-2">{statusLabel(status, minute)}</span>;
}

const OUTCOME_LABEL: Record<string, string> = { home: "П1", draw: "Х", away: "П2" };

function PredictionTag({ m, locked }: { m: MatchCardData; locked: boolean }) {
  if (m.myPrediction && m.myPrediction.count > 0) {
    const { count, outcome, points } = m.myPrediction;
    const scored = m.status === "finished";
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-muted">прогноз:</span>
        <span className="font-semibold">
          {outcome ? OUTCOME_LABEL[outcome] : `${count} рынк.`}
        </span>
        {count > 1 && outcome && <span className="text-muted">+{count - 1}</span>}
        {scored && (
          <span
            className={`px-1.5 rounded font-semibold ${
              points > 0 ? "bg-accent/20 text-accent" : "bg-danger/20 text-danger"
            }`}
          >
            +{points}
          </span>
        )}
      </span>
    );
  }
  if (locked) return <span className="text-muted">прогноз закрыт</span>;
  return <span className="text-accent font-semibold">сделать прогноз →</span>;
}
