import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsPanel } from "@/components/instructor/analytics";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return (
    <Suspense>
      <AnalyticsPanel />
    </Suspense>
  );
}
