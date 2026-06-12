import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getGroupTeams, groupDeadline } from "@/lib/tournament";
import { GroupPicksForm, type GroupData } from "@/components/GroupPicksForm";

export const dynamic = "force-dynamic";

export default async function GroupPredictPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Прогноз на выход из групп</h1>
        <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm">
          <Link href="/join" className="text-accent font-semibold">
            Войди
          </Link>
          , чтобы прогнозировать.
        </div>
      </div>
    );
  }

  const teamsByGroup = await getGroupTeams();
  const myPicks = await db.groupPick.findMany({ where: { userId: user.id } });
  const pickByGroup = new Map(myPicks.map((p) => [p.group, p]));

  const groups: GroupData[] = [];
  for (const [group, teams] of teamsByGroup) {
    const deadline = await groupDeadline(group);
    const locked = !!deadline && Date.now() >= deadline.getTime();
    const pick = pickByGroup.get(group);
    groups.push({
      group,
      teams,
      locked,
      first: pick?.firstTeam ?? null,
      second: pick?.secondTeam ?? null,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Кто выйдет из групп</h1>
        <p className="text-sm text-muted mt-1">
          Победитель группы +3, оба вышедших +5. Закрывается перед стартом группы.
        </p>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Группы появятся после синка матчей.
        </div>
      ) : (
        <GroupPicksForm groups={groups} />
      )}
      <Link href="/groups" className="block text-center text-sm text-accent-2">
        Смотреть живые таблицы групп →
      </Link>
    </div>
  );
}
