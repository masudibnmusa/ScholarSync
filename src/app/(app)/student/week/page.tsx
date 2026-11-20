import type { Metadata } from "next";
import { MyWeek } from "@/components/student/my-week";

export const metadata: Metadata = { title: "My week" };

export default function Page() {
  return <MyWeek />;
}
