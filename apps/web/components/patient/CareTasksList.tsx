import { type Lang, patientDate } from "@/lib/portal/i18n";
import { Card, cn } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { CareTask } from "./types";
import { daysFromToday } from "./logic";

export function CareTasksList({
  tasks,
  L,
  lang,
}: {
  tasks: CareTask[];
  L: boolean;
  lang: Lang;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Icon name="inbox" className="h-4 w-4 text-brand-700" />
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
          {L ? "రాబోయే ఫాలో-అప్‌లు" : "Upcoming follow-ups"}
        </h2>
      </div>

      <ul className="mt-4 space-y-2.5">
        {tasks.map((task) => {
          const days = daysFromToday(task.due_on);
          const overdue = days < 0;
          return (
            <li
              key={task.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3",
                overdue ? "border-accent-rose/30 bg-accent-rose/[0.05]" : "border-line",
              )}
            >
              <Icon
                name={overdue ? "warning" : "clock"}
                className={cn("h-4 w-4 shrink-0", overdue ? "text-accent-rose" : "text-ink-subtle")}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{task.title}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs",
                    overdue ? "font-medium text-accent-rose" : "text-ink-subtle",
                  )}
                >
                  {overdue
                    ? L
                      ? `${Math.abs(days)} రోజులు ఆలస్యం`
                      : `${Math.abs(days)} days overdue`
                    : `${L ? "గడువు" : "Due"} ${patientDate(`${task.due_on}T09:00:00`, "Asia/Kolkata", lang)}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-subtle">
        {L
          ? "వీటి కోసం క్లినిక్ మీకు గుర్తు చేస్తుంది. ముందుగా రావాలంటే కాల్ చేయండి."
          : "The clinic will remind you about these. Call if you would like to come in sooner."}
      </p>
    </Card>
  );
}
