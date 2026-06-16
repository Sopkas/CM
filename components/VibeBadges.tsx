// Клеймо: стрик (🔥/🥶) + авто-титулы. compact — только эмодзи, showNames — с подписями.
import type { UserVibe } from "@/lib/vibes";

export function VibeBadges({
  vibe,
  showNames = false,
}: {
  vibe?: UserVibe;
  showNames?: boolean;
}) {
  if (!vibe || (vibe.titles.length === 0 && !vibe.streak)) return null;
  const { titles, streak } = vibe;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap align-middle">
      {streak && (
        <span
          className={`text-[10px] font-bold font-mono px-1 rounded ${
            streak.kind === "win" ? "bg-accent/20 text-accent" : "bg-danger/15 text-danger"
          }`}
          title={streak.kind === "win" ? "серия побед" : "серия сливов"}
        >
          {streak.kind === "win" ? "🔥" : "🥶"}
          {streak.n}
        </span>
      )}
      {titles.map((t) =>
        showNames ? (
          <span
            key={t.name}
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              t.tone === "good"
                ? "bg-accent/20 text-accent"
                : t.tone === "bad"
                  ? "bg-danger/15 text-danger"
                  : "bg-surface-2 text-muted"
            }`}
          >
            {t.emoji} {t.name}
          </span>
        ) : (
          <span key={t.name} title={t.name} className="text-xs">
            {t.emoji}
          </span>
        ),
      )}
    </span>
  );
}
