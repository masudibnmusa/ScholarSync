"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/components/locale";

export default function Loading() {
  const { t } = useT();
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" aria-busy="true" aria-label={t("Loading")}>
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
