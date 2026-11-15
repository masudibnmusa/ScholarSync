import type { Metadata } from "next";
import { Suspense } from "react";
import { NotificationsPanel } from "@/components/app/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default function Page() {
  return (
    <Suspense>
      <NotificationsPanel />
    </Suspense>
  );
}
