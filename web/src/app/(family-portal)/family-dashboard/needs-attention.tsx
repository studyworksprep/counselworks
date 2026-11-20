import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { LinkButton } from "@/components/ui/link-button";
import { ArrowLink } from "@/components/ui/arrow-link";
import { StatusChip } from "@/components/ui/status-chip";
import { TONE_ICON } from "@/components/ui/tones";
import { TaskCompleteButton } from "@/components/tasks/task-detail-actions";
import type { AttentionItem, AttentionKind } from "@/lib/family/dashboard";
import { cn } from "@/lib/utils";

/** The disc icon names what the item is; the button icon names the verb. */
const KIND_ICON: Record<AttentionKind, IconName> = {
  agreement: "sign",
  payment: "billing",
  document: "documents",
  task: "tasks",
};

function ItemAction({ item }: { item: AttentionItem }) {
  switch (item.kind) {
    case "agreement":
      return (
        <LinkButton size="sm" icon="sign" href={item.href}>
          Review &amp; sign
        </LinkButton>
      );
    case "payment":
      return (
        <LinkButton size="sm" icon="billing" href={item.href}>
          View invoices &amp; pay
        </LinkButton>
      );
    case "document":
      return (
        <LinkButton size="sm" icon="upload" href={item.href}>
          Upload
        </LinkButton>
      );
    case "task":
      // One-step completion where the task allows it (the same rule as the
      // task page's Mark complete); review or evidence tasks open instead.
      return item.canComplete && item.taskId ? (
        <TaskCompleteButton id={item.taskId} size="sm" />
      ) : (
        <LinkButton size="sm" variant="outline" icon="next" href={item.href}>
          Open task
        </LinkButton>
      );
  }
}

/**
 * "Needs your attention" (parent portal rework): the first thing on the
 * family dashboard, so an overdue payment or an unsigned agreement is above
 * the fold on a phone. Every row carries the one action that clears it.
 */
export function NeedsAttention({
  items,
  hiddenTaskCount,
}: {
  items: AttentionItem[];
  hiddenTaskCount: number;
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Needs your attention</h2>
          {items.length > 0 && (
            <StatusChip tone={items.some((i) => i.overdue) ? "problem" : "attention"}>
              {items.length + hiddenTaskCount}
              <span className="sr-only">
                {items.length + hiddenTaskCount === 1 ? " item" : " items"}
              </span>
            </StatusChip>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-gray-600">
            <span
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset",
                TONE_ICON.done
              )}
            >
              <Icon name="check" className="h-4 w-4" />
            </span>
            You&rsquo;re all caught up. Nothing is waiting on you right now.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className={cn(
                    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
                    TONE_ICON[item.overdue ? "problem" : "attention"]
                  )}
                >
                  <Icon name={KIND_ICON[item.kind]} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm font-medium break-words text-gray-900">
                    {item.kind === "task" ? (
                      <Link className="hover:underline" href={item.href}>
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {/* The payment title already says "overdue". */}
                    {item.overdue && item.kind !== "payment" && (
                      <StatusChip tone="problem" className="mr-1.5 align-middle">
                        Overdue
                      </StatusChip>
                    )}
                    {item.detail}
                  </p>
                </div>
                <div className="ml-12 shrink-0 sm:ml-0">
                  <ItemAction item={item} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {hiddenTaskCount > 0 && (
          <ArrowLink className="mt-3" icon="tasks" href="/family-tasks">
            {`${hiddenTaskCount} more of your task${hiddenTaskCount === 1 ? "" : "s"}`}
          </ArrowLink>
        )}
      </CardContent>
    </Card>
  );
}
