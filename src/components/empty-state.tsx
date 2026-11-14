import { Button } from "@/components/ui/button";
import type { Icon } from "@phosphor-icons/react";

// A composed "getting started" view for panels with nothing to show yet.
export function EmptyState({
  icon: IconCmp,
  title,
  body,
  action,
}: {
  icon: Icon;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand/40 text-foreground">
        <IconCmp className="w-6 h-6" />
      </span>
      <p className="title-3 mb-1">{title}</p>
      <p className="body-6 text-muted-foreground max-w-sm">{body}</p>
      {action && (
        <Button size="sm" className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
