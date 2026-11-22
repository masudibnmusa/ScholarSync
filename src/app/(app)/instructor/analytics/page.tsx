import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { AnalyticsPanel } from "@/components/instructor/analytics";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Analytics");

export default function Page() {
  return (
    <Suspense>
      <AnalyticsPanel />
    </Suspense>
  );
}
