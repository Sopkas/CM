"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const EMOJIS = ["🦁", "🐱", "🐻", "🦊", "🐸", "🐼", "🐯", "🦄", "🐙", "🦈", "👑", "⚽", "🔥", "💀", "🤖", "👽"];

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🦁");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), nickname: nickname.trim(), avatar }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Не удалось войти");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setErr("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <Field label="Инвайт-код">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="например friend-1"
          className="w-full bg-surface-2 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>

      <Field label="Никнейм">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="как тебя звать"
          maxLength={24}
          className="w-full bg-surface-2 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>

      <Field label="Аватар">
        <div className="grid grid-cols-8 gap-1.5">
          {EMOJIS.map((e) => (
            <button
              type="button"
              key={e}
              onClick={() => setAvatar(e)}
              className={`text-xl py-1.5 rounded-lg ${
                avatar === e ? "bg-accent/25 ring-1 ring-accent" : "bg-surface-2"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </Field>

      {err && <p className="text-sm text-danger">{err}</p>}

      <button
        disabled={busy}
        className="w-full bg-accent text-background font-semibold py-2.5 rounded-lg disabled:opacity-50"
      >
        {busy ? "Вхожу…" : "Войти"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
