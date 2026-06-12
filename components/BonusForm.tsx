"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BonusForm({
  teams,
  initialChampion,
  initialTopScorer,
}: {
  teams: string[];
  initialChampion: string | null;
  initialTopScorer: string | null;
}) {
  const router = useRouter();
  const [champion, setChampion] = useState(initialChampion ?? "");
  const [topScorer, setTopScorer] = useState(initialTopScorer ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(type: "champion" | "top_scorer", value: string) {
    if (!value.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? "Сохранено ✓" : (data.error ?? "Ошибка"));
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold">🏆 Чемпион</span>
          <span className="text-xs text-accent">+10 очков</span>
        </div>
        <select
          value={champion}
          onChange={(e) => setChampion(e.target.value)}
          className="w-full bg-surface-2 rounded-lg px-3 py-2"
        >
          <option value="">— выбери команду —</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          onClick={() => save("champion", champion)}
          disabled={busy || !champion}
          className="w-full bg-accent text-background font-semibold py-2 rounded-lg disabled:opacity-50"
        >
          Сохранить чемпиона
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold">⚽ Лучший бомбардир</span>
          <span className="text-xs text-accent">+5 очков</span>
        </div>
        <input
          value={topScorer}
          onChange={(e) => setTopScorer(e.target.value)}
          placeholder="Имя игрока"
          maxLength={60}
          className="w-full bg-surface-2 rounded-lg px-3 py-2"
        />
        <button
          onClick={() => save("top_scorer", topScorer)}
          disabled={busy || !topScorer.trim()}
          className="w-full bg-accent text-background font-semibold py-2 rounded-lg disabled:opacity-50"
        >
          Сохранить бомбардира
        </button>
      </div>

      {msg && <p className="text-center text-sm text-muted">{msg}</p>}
    </div>
  );
}
