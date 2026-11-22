import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { courseWithTeam, deleteCourse } from "./helpers";

// A throwaway course: the instructor adds slots for tomorrow, a team books one, downloads it, and it's cancelled.
test("the instructor opens office hours and a team books, downloads and loses a slot", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const { code, courseUrl, students: [joy, kim] } = await courseWithTeam(page, browser, ["E2E Joy", "E2E Kim"], "E2E office hours course");
  const tomorrow = new Date(Date.now() + 86_400_000);
  const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  // Three 20-minute slots from 3 PM tomorrow.
  const card = page.getByRole("region", { name: "Office hours" });
  await card.getByRole("button", { name: "Add times" }).click();
  const add = page.getByRole("dialog", { name: "Add office hours" });
  await add.getByLabel("Date").fill(date);
  await add.getByLabel("First slot starts").fill("15:00");
  await add.getByLabel("Length of each").click();
  await page.getByRole("option", { name: "20 minutes" }).click();
  await add.getByLabel("Number of slots").fill("3");
  await add.getByLabel("Where").fill("Room 402");
  await expect(add.getByText("3:00 PM, 3:20 PM, 3:40 PM until 4:00 PM")).toBeVisible();
  await add.getByRole("button", { name: "Add 3 slots" }).click();
  await expect(card.getByRole("listitem")).toHaveCount(3);

  // Joy books 3:20 for her team.
  const studentUrl = courseUrl.replace("/instructor/", "/student/");
  await kim.page.goto(studentUrl);
  await joy.page.goto(studentUrl);
  const joyCard = joy.page.getByRole("region", { name: "Office hours" });
  await expect(joyCard.getByRole("button", { name: /^Book / })).toHaveCount(3);
  await joyCard.getByRole("button", { name: "Book 3:20 PM" }).click();
  const book = joy.page.getByRole("dialog", { name: "Book office hours" });
  await book.getByLabel("What do you want to discuss?").fill("E2E: our database design");
  await book.getByRole("button", { name: "Book this time" }).click();
  await expect(joy.page.getByText("Office hours booked")).toBeVisible();
  const booked = joyCard.getByRole("status");
  await expect(booked).toContainText("Your team is booked:");
  await expect(booked).toContainText("3:20 PM–3:40 PM");
  await expect(booked).toContainText("booked by E2E Joy");
  await expect(joyCard.getByRole("button", { name: /^Book / })).toHaveCount(0); // one booking per team

  // Kim (same team) and the instructor see it live.
  await expect(kim.page.getByRole("region", { name: "Office hours" }).getByRole("status")).toContainText("3:20 PM–3:40 PM");
  await expect(card.getByText("E2E Team: E2E: our database design")).toBeVisible();

  // The calendar file.
  const download = joy.page.waitForEvent("download");
  await booked.getByRole("link", { name: "Add to calendar" }).click();
  const ics = await readFile(await (await download).path(), "utf8");
  expect(ics).toContain(`SUMMARY:Office hours · ${code}`);
  expect(ics).toContain("LOCATION:Room 402");
  expect(ics).toContain("DESCRIPTION:Topic: E2E: our database design");
  expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z\r\nDTEND:\d{8}T\d{6}Z/);

  // My week lists it at its time, and its calendar export has it as a timed event.
  await joy.page.goto("/student/week");
  const row = joy.page.getByRole("link", { name: /Office hours: E2E: our database design/ });
  await expect(row).toContainText("Tomorrow, 3:20 PM");
  await expect(row).toContainText(`E2E Team · ${code} · Room 402`);
  const week = await (await joy.page.request.get("/api/calendar")).text();
  expect(week).toContain(`SUMMARY:Office hours: E2E: our database design · ${code}`);
  expect(week).toMatch(/UID:office-hours-[0-9a-f-]+@scholarsync\r\nDTSTAMP:\d{8}T\d{6}Z\r\nDTSTART:\d{8}T\d{6}Z/);
  await joy.page.goto(studentUrl);

  // The instructor cancels the booking: the team is told and can book again.
  await card.getByRole("button", { name: "Cancel E2E Team's booking at 3:20 PM" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel booking" }).click();
  await expect(booked).toHaveCount(0);
  await expect(joyCard.getByRole("button", { name: /^Book / })).toHaveCount(3);
  await joy.page.goto("/student/notifications");
  await expect(joy.page.getByText("Your office hours booking was cancelled")).toBeVisible();

  // The instructor removes a slot.
  await card.getByRole("button", { name: "Remove the 3:40 PM slot" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove slot" }).click();
  await expect(card.getByRole("listitem")).toHaveCount(2);

  await deleteCourse(page, code);
});
