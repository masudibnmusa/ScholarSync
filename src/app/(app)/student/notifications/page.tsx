import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { Suspense } from "react";
import { NotificationsPanel } from "@/components/app/notifications";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Notifications");

export default function Page() {
  return (
    <Suspense>
      <NotificationsPanel />
    </Suspense>
  );
}
