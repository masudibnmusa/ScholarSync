import type { Metadata } from "next";
import { CourseDetail } from "@/components/app/course-detail";

export const metadata: Metadata = { title: "Course" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CourseDetail id={id} />;
}
