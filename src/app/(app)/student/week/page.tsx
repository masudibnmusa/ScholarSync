import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { MyWeek } from "@/components/student/my-week";

export const generateMetadata = (): Promise<Metadata> => pageTitle("My week");

export default function Page() {
  return <MyWeek />;
}
