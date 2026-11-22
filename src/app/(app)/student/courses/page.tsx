import type { Metadata } from "next";
import { getCourses } from "@/app/actions";
import { pageTitle } from "@/lib/locale-server";
import { CoursesDashboard } from "@/components/app/courses";

export const generateMetadata = (): Promise<Metadata> => pageTitle("Course dashboard");

export default async function Page() {
  // Loaded here so the dashboard renders with the courses; if this fails, the dashboard loads them itself.
  const courses = await getCourses().catch(() => null);
  return <CoursesDashboard initialCourses={courses} />;
}
