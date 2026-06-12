"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function CompareSelect({
  users,
  value,
  param,
}: {
  users: { id: string; nickname: string }[];
  value: string;
  param: "a" | "b";
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(sp.toString());
    next.set(param, e.target.value);
    router.push(`/compare?${next.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full bg-surface-2 rounded-lg px-2 py-1.5 text-sm"
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nickname}
        </option>
      ))}
    </select>
  );
}
