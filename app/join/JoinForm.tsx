"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const EMOJIS = ["🦁", "🐱", "🐻", "🦊", "🐸", "🐼", "🐯", "🦄", "🐙", "🦈", "👑", "⚽", "🔥", "💀", "🤖", "👽"];

type Mode = "register" | "login";

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("register");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🦁");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setErr("PIN — 4–6 цифр");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const url = mode === "register" ? "/api/join" : "/api/login";
      const body =
        mode === "register"
          ? { code: code.trim(), nickname: nickname.trim(), avatar, pin }
          : { nickname: nickname.trim(), pin };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const isReg = mode === "register";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-4">
      {/* переключатель режимов */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-surface-2 text-sm">
        <button
          type="button"
          onClick={() => { setMode("register"); setErr(null); }}
          className={`py-1.5 rounded-md transition ${isReg ? "bg-accent/25 ring-1 ring-accent font-semibold" : "text-muted"}`}
        >
          Регистрация
        </button>
        <button
          type="button"
          onClick={() => { setMode("login"); setErr(null); }}
          className={`py-1.5 rounded-md transition ${!isReg ? "bg-accent/25 ring-1 ring-accent font-semibold" : "text-muted"}`}
        >
          Вход
        </button>
      </div>

      {isReg && (
        <Field label="Инвайт-код">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="например friend-1"
            className="w-full bg-surface-2 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent"
          />
        </Field>
      )}

      <Field label="Никнейм">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="как тебя звать"
          maxLength={24}
          className="w-full bg-surface-2 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent"
        />
      </Field>

      <Field label={isReg ? "PIN (4–6 цифр) — для входа в будущем" : "PIN"}>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          type="password"
          inputMode="numeric"
          autoComplete={isReg ? "new-password" : "current-password"}
          placeholder="••••"
          className="w-full bg-surface-2 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-accent tracking-widest"
        />
      </Field>

      {isReg && (
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
      )}

      {err && <p className="text-sm text-danger">{err}</p>}

      <button
        disabled={busy}
        className="w-full bg-accent text-background font-semibold py-2.5 rounded-lg disabled:opacity-50"
      >
        {busy ? "Секунду…" : isReg ? "Создать аккаунт" : "Войти"}
      </button>

      <p className="text-center text-xs text-muted">
        {isReg ? "Уже есть аккаунт? " : "Впервые тут? "}
        <button
          type="button"
          onClick={() => { setMode(isReg ? "login" : "register"); setErr(null); }}
          className="text-accent font-semibold"
        >
          {isReg ? "Войти" : "Зарегистрироваться"}
        </button>
      </p>
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
