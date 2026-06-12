"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMatchDate } from "@/lib/format";

interface Invite {
  id: string;
  code: string;
  note: string | null;
  used: boolean;
}
interface Match {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  matchDate: string;
}

export function AdminPanel({
  invites,
  matches,
  champion,
  topScorer,
}: {
  invites: Invite[];
  matches: Match[];
  champion: string | null;
  topScorer: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [champ, setChamp] = useState(champion ?? "");
  const [scorer, setScorer] = useState(topScorer ?? "");
  const [origin, setOrigin] = useState("");
  if (typeof window !== "undefined" && !origin) setOrigin(window.location.origin);

  async function createInvite() {
    setBusy("invite");
    await fetch("/api/admin/invites", { method: "POST" });
    router.refresh();
    setBusy(null);
  }

  async function saveSettings() {
    setBusy("settings");
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ champion: champ, topScorer: scorer }),
    });
    const data = await res.json();
    if (!data.ok) alert(data.error ?? "Ошибка");
    router.refresh();
    setBusy(null);
  }

  async function runSync() {
    setBusy("sync");
    const res = await fetch("/api/admin/sync", { method: "POST" });
    const data = await res.json();
    alert(
      data.ok
        ? `Синк (${data.source}): матчей ${data.upserted}, статистики ${data.statsUpdated}, очки пересчитаны.`
        : `Ошибка: ${data.error}`,
    );
    router.refresh();
    setBusy(null);
  }

  async function importEspn() {
    if (!confirm("Импортировать все матчи ЧМ-2026 из ESPN? Это перезапишет счёт/статус матчей.")) return;
    setBusy("import");
    const res = await fetch("/api/admin/import-espn", { method: "POST" });
    const data = await res.json();
    alert(
      data.ok
        ? `Импорт ESPN ок: матчей ${data.upserted}, статистики ${data.statsUpdated}.`
        : `Ошибка: ${data.error}`,
    );
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">⚙️ Админ-панель</h1>

      {/* Синк */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h2 className="font-semibold text-sm">Данные (ESPN)</h2>
        <p className="text-xs text-muted">
          Импорт — все 104 матча из ESPN (разово). Синк — сегодняшние матчи: счёт, статус,
          статистика; затем пересчёт очков.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={importEspn}
            disabled={busy === "import"}
            className="bg-accent text-background font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {busy === "import" ? "Импортирую…" : "Импорт из ESPN (104 матча)"}
          </button>
          <button
            onClick={runSync}
            disabled={busy === "sync"}
            className="bg-accent-2 text-background font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            {busy === "sync" ? "Синкаю…" : "Синк сегодня"}
          </button>
        </div>
      </section>

      {/* Факт турнира */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h2 className="font-semibold text-sm">Факт турнира (для бонусов)</h2>
        <p className="text-xs text-muted">
          Задай чемпиона и бомбардира — очки за бонусы пересчитаются.
        </p>
        <label className="block text-xs text-muted">
          🏆 Чемпион
          <input
            value={champ}
            onChange={(e) => setChamp(e.target.value)}
            placeholder="команда"
            className="mt-1 w-full bg-surface-2 rounded-lg px-3 py-2 text-foreground"
          />
        </label>
        <label className="block text-xs text-muted">
          ⚽ Лучший бомбардир
          <input
            value={scorer}
            onChange={(e) => setScorer(e.target.value)}
            placeholder="игрок"
            className="mt-1 w-full bg-surface-2 rounded-lg px-3 py-2 text-foreground"
          />
        </label>
        <button
          onClick={saveSettings}
          disabled={busy === "settings"}
          className="bg-accent text-background font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {busy === "settings" ? "Сохраняю…" : "Сохранить факт"}
        </button>
      </section>

      {/* Инвайты */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Инвайты</h2>
          <button
            onClick={createInvite}
            disabled={busy === "invite"}
            className="bg-accent text-background font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
          >
            + Создать
          </button>
        </div>
        <div className="space-y-1.5">
          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-2 text-sm bg-surface-2 rounded-lg px-3 py-2"
            >
              <code className="font-mono">{inv.code}</code>
              <button
                onClick={() =>
                  navigator.clipboard?.writeText(`${origin}/join?code=${inv.code}`)
                }
                className="text-xs text-accent-2"
              >
                копировать ссылку
              </button>
              <span className="flex-1" />
              <span className={inv.used ? "text-muted text-xs" : "text-accent text-xs"}>
                {inv.used ? "использован" : "активен"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Ручной ввод результатов */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="font-semibold text-sm">Результаты матчей (ручной ввод)</h2>
        <p className="text-xs text-muted">Fallback, если API лёг. Сохранение сразу пересчитывает очки.</p>
        <div className="space-y-2">
          {matches.map((m) => (
            <ResultRow key={m.id} match={m} onSaved={() => router.refresh()} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultRow({ match, onSaved }: { match: Match; onSaved: () => void }) {
  const [home, setHome] = useState(match.homeScore ?? 0);
  const [away, setAway] = useState(match.awayScore ?? 0);
  const [status, setStatus] = useState(match.status);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/admin/matches/${match.id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeScore: home, awayScore: away, status }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Ошибка");
    } else {
      onSaved();
    }
  }

  return (
    <div className="bg-surface-2 rounded-lg p-2.5 space-y-2">
      <div className="text-xs text-muted">{formatMatchDate(new Date(match.matchDate))}</div>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-right truncate">{match.homeTeam}</span>
        <input
          type="number"
          min={0}
          max={50}
          value={home}
          onChange={(e) => setHome(+e.target.value)}
          className="w-12 bg-background rounded px-2 py-1 text-center font-mono"
        />
        <span className="text-muted">:</span>
        <input
          type="number"
          min={0}
          max={50}
          value={away}
          onChange={(e) => setAway(+e.target.value)}
          className="w-12 bg-background rounded px-2 py-1 text-center font-mono"
        />
        <span className="flex-1 text-sm truncate">{match.awayTeam}</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-background rounded px-2 py-1 text-sm flex-1"
        >
          <option value="scheduled">Скоро</option>
          <option value="live">Идёт</option>
          <option value="finished">Завершён</option>
        </select>
        <button
          onClick={save}
          disabled={saving}
          className="bg-accent text-background font-semibold px-4 py-1.5 rounded text-sm disabled:opacity-50"
        >
          {saving ? "…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
