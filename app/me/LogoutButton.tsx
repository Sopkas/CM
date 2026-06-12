"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="text-sm text-muted border border-border rounded-lg px-3 py-1.5 hover:text-foreground"
    >
      Выйти
    </button>
  );
}
