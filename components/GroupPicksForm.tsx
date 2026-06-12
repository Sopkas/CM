"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface GroupData {
  group: string;
  teams: string[];
  locked: boolean;
  first: string | null;
  second: string | null;
}

export function GroupPicksForm({ groups }: { groups: GroupData[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {groups.map((g) => (
        <GroupRow key={g.group} data={g} />
      ))}
    </div>
  );
}

function GroupRow({ data }: { data: GroupData }) {
  const router = useRouter();
  const [first, setFirst] = useState(data.first ?? "");
  const [second, setSecond] = useState(data.second ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!first || !second) return setMsg("Выбери обе команды");
    if (first === second) return setMsg("Должны быть разные");
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/group-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: data.group, firstTeam: first, secondTeam: second }),
    });
    const d = await res.json();
    setBusy(false);
    setMsg(res.ok ? "✓" : (d.error ?? "Ошибка"));
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Группа {data.group}</span>
        {data.locked && <span className="text-xs text-muted">закрыто</span>}
      </div>

      {data.locked ? (
        <div className="text-sm space-y-1">
          <Row label="🥇" team={data.first} />
          <Row label="🥈" team={data.second} />
        </div>
      ) : (
        <>
          <label className="block text-xs text-muted">
            🥇 1-е место
            <select
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="mt-1 w-full bg-surface-2 rounded-lg px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            🥈 2-е место
            <select
              value={second}
              onChange={(e) => setSecond(e.target.value)}
              className="mt-1 w-full bg-surface-2 rounded-lg px-2 py-1.5 text-sm text-foreground"
            >
              <option value="">—</option>
              {data.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={save}
            disabled={busy}
            className="w-full bg-accent text-background font-semibold py-1.5 rounded-lg text-sm disabled:opacity-50"
          >
            {busy ? "…" : "Сохранить"}
          </button>
          {msg && <p className="text-xs text-center text-muted">{msg}</p>}
        </>
      )}
    </div>
  );
}

function Row({ label, team }: { label: string; team: string | null }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <span className={team ? "" : "text-muted"}>{team ?? "не выбрано"}</span>
    </div>
  );
}
