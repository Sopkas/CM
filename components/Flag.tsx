import { flagOf } from "@/lib/flags";

export function Flag({ team, className = "" }: { team: string | null; className?: string }) {
  return (
    <span className={className} aria-hidden>
      {flagOf(team)}
    </span>
  );
}
