import type { Metadata } from "next";
import { pageTitle } from "@/lib/locale-server";
import { CoursesDashboard } from "@/components/app/courses";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Course dashboard");

export default function Page() {
  return <CoursesDashboard />;
}
