import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="max-w-sm mx-auto space-y-5 pt-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          <span className="text-accent">WC</span>2026
        </h1>
        <p className="text-muted text-sm mt-1">Прогнозы на ЧМ для своих</p>
      </div>
      <Suspense>
        <JoinForm />
      </Suspense>
    </div>
  );
}
