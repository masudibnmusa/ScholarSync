import type { Metadata } from "next";
import { CoursesDashboard } from "@/components/app/courses";

export const metadata: Metadata = { title: "Course dashboard" };

export default function Page() {
  return <CoursesDashboard />;
}
