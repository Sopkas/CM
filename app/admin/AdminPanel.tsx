"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMatchDate } from "@/lib/format";
import { MARKET_BY_KEY, selectionLabel } from "@/lib/markets";

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
  bettingOpen: boolean;
}
interface PlayerPick {
  id: string;
  userId: string;
  nickname: string;
  matchId: string;
  match: string;
  finished: boolean;
  market: string;
  selection: string;
  points: number;
}

export function AdminPanel({
  invites,
  matches,
  champion,
  topScorer,
  predictionsOpenUntil,
  bracketLocked,
  playerPicks,
  users,
}: {
  invites: Invite[];
  matches: Match[];
  champion: string | null;
  topScorer: string | null;
  predictionsOpenUntil: string | null;
  bracketLocked: boolean;
  playerPicks: PlayerPick[];
  users: { id: string; nickname: string; putintseva: boolean }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [champ, setChamp] = useState(champion ?? "");
  const [scorer, setScorer] = useState(topScorer ?? "");
  const [openUntil, setOpenUntil] = useState(predictionsOpenUntil ?? "");
  const [selUser, setSelUser] = useState("");
  const [origin, setOrigin] = useState("");
  if (typeof window !== "undefined" && !origin) setOrigin(window.location.origin);

  async function saveConfig(body: {
    predictionsOpenUntil?: string | null;
    bracketLocked?: boolean;
  }) {
    setBusy("config");
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) alert(data.error ?? "Ошибка");
    router.refresh();
    setBusy(null);
  }

  // открыть бонусы+группы на N дней вперёд
  function openPredictionsForDays(days: number) {
    const until = new Date(Date.now() + days * 86400_000).toISOString();
    setOpenUntil(until);
    saveConfig({ predictionsOpenUntil: until });
  }

  async function togglePutintseva(userId: string, on: boolean) {
    setBusy("putintseva");
    const res = await fetch("/api/admin/putintseva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, on }),
    });
    if (!res.ok) alert("Ошибка");
    router.refresh();
    setBusy(null);
  }

  async function cancelPicks(body: { pickId?: string; userId?: string; matchId?: string }) {
    setBusy("picks");
    const res = await fetch("/api/admin/picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) alert(data.error ?? "Ошибка");
    router.refresh();
    setBusy(null);
  }

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

      {/* Окна прогнозов */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="font-semibold text-sm">Окна прогнозов</h2>

        <div className="space-y-1.5">
          <p className="text-xs text-muted">
            Бонусы (чемпион/бомбардир) и прогнозы на группы.{" "}
            {openUntil ? (
              <span className="text-accent">
                открыто до {new Date(openUntil).toLocaleString("ru-RU")}
              </span>
            ) : (
              <span className="text-muted">по обычному дедлайну (старт турнира/группы)</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => openPredictionsForDays(7)}
              disabled={busy === "config"}
              className="bg-accent text-background font-semibold px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
            >
              Открыть на неделю
            </button>
            <button
              onClick={() => openPredictionsForDays(3)}
              disabled={busy === "config"}
              className="bg-surface-2 px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
            >
              на 3 дня
            </button>
            {openUntil && (
              <button
                onClick={() => { setOpenUntil(""); saveConfig({ predictionsOpenUntil: "" }); }}
                disabled={busy === "config"}
                className="bg-danger/15 text-danger px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              >
                Закрыть окно
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <div className="text-sm font-medium">Сетка плей-офф</div>
            <div className="text-xs text-muted">
              {bracketLocked ? "закрыта (блюр у участников)" : "открыта для прогнозов"}
            </div>
          </div>
          <button
            onClick={() => saveConfig({ bracketLocked: !bracketLocked })}
            disabled={busy === "config"}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${
              bracketLocked ? "bg-accent text-background" : "bg-surface-2"
            }`}
          >
            {bracketLocked ? "Открыть сетку" : "Закрыть сетку"}
          </button>
        </div>
      </section>

      {/* Правило Путинцева */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-2">
        <h2 className="font-semibold text-sm">🎯 Правило Путинцева</h2>
        <p className="text-xs text-muted">
          У отмеченных: очевидная ставка (кэф &lt; 1.30) два матча подряд → на втором весь
          купон даёт 0 на плюс (минусы остаются). Им же показывается предупреждение.
        </p>
        <div className="space-y-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between bg-surface-2 rounded-lg px-3 py-1.5">
              <span className="text-sm">{u.nickname}</span>
              <button
                onClick={() => togglePutintseva(u.id, !u.putintseva)}
                disabled={busy === "putintseva"}
                className={`text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-50 ${
                  u.putintseva ? "bg-danger/20 text-danger" : "bg-surface text-muted"
                }`}
              >
                {u.putintseva ? "под правилом ✓" : "включить"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Ставки игроков — отмена */}
      <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
        <h2 className="font-semibold text-sm">Ставки игроков (отмена)</h2>
        <p className="text-xs text-muted">
          Выбери участника → отмени промахнувшуюся котировку или весь матч. После отмены
          можно поставить заново (закрытый матч — открой через «🔓 Открыть ставки»).
        </p>
        <PlayerPicksManager
          picks={playerPicks}
          selUser={selUser}
          setSelUser={setSelUser}
          onCancel={cancelPicks}
          busy={busy === "picks"}
        />
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
  const [betOpen, setBetOpen] = useState(match.bettingOpen);
  const [betBusy, setBetBusy] = useState(false);

  async function toggleBetting() {
    setBetBusy(true);
    const next = !betOpen;
    const res = await fetch(`/api/admin/matches/${match.id}/betting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ open: next }),
    });
    if (res.ok) setBetOpen(next);
    else alert("Ошибка");
    setBetBusy(false);
  }

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
      <button
        onClick={toggleBetting}
        disabled={betBusy}
        className={`w-full py-1.5 rounded text-xs font-semibold disabled:opacity-50 ${
          betOpen ? "bg-accent/20 text-accent" : "bg-background text-muted"
        }`}
      >
        {betBusy ? "…" : betOpen ? "🔓 Ставки открыты (анлок) — нажми чтобы закрыть" : "🔒 Открыть ставки (анлок дедлайна)"}
      </button>
    </div>
  );
}

function PlayerPicksManager({
  picks,
  selUser,
  setSelUser,
  onCancel,
  busy,
}: {
  picks: PlayerPick[];
  selUser: string;
  setSelUser: (v: string) => void;
  onCancel: (body: { pickId?: string; userId?: string; matchId?: string }) => void;
  busy: boolean;
}) {
  const users = Array.from(new Map(picks.map((p) => [p.userId, p.nickname])))
    .map(([id, nickname]) => ({ id, nickname }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  if (users.length === 0) {
    return <p className="text-xs text-muted">Ставок пока нет.</p>;
  }

  const mine = picks.filter((p) => p.userId === selUser);
  const byMatch = new Map<string, { match: string; finished: boolean; items: PlayerPick[] }>();
  for (const p of mine) {
    let e = byMatch.get(p.matchId);
    if (!e) {
      e = { match: p.match, finished: p.finished, items: [] };
      byMatch.set(p.matchId, e);
    }
    e.items.push(p);
  }

  return (
    <div className="space-y-3">
      <select
        value={selUser}
        onChange={(e) => setSelUser(e.target.value)}
        className="w-full bg-surface-2 rounded-lg px-3 py-2 text-sm"
      >
        <option value="">— выбери участника —</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nickname}
          </option>
        ))}
      </select>

      {selUser &&
        (byMatch.size === 0 ? (
          <p className="text-xs text-muted">У участника нет ставок.</p>
        ) : (
          [...byMatch.entries()].map(([matchId, g]) => (
            <div key={matchId} className="bg-surface-2 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{g.match}</span>
                <button
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Отменить ВСЕ ставки участника на «${g.match}»?`))
                      onCancel({ userId: selUser, matchId });
                  }}
                  className="text-xs text-danger shrink-0 disabled:opacity-50"
                >
                  отменить матч
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((p) => (
                  <span
                    key={p.id}
                    className="text-xs bg-background rounded-lg px-2 py-1 flex items-center gap-1.5"
                  >
                    <span className="opacity-70">{MARKET_BY_KEY.get(p.market)?.label ?? p.market}:</span>
                    <span className="font-semibold">{selectionLabel(p.market, p.selection)}</span>
                    {g.finished && (
                      <span className={p.points > 0 ? "text-accent" : p.points < 0 ? "text-danger" : "text-muted"}>
                        {p.points > 0 ? `+${p.points}` : p.points}
                      </span>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => onCancel({ pickId: p.id })}
                      className="text-danger font-bold disabled:opacity-50"
                      title="отменить котировку"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))
        ))}
    </div>
  );
}
