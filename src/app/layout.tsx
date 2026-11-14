import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CampusNova: group project workspace for students and faculty",
  description: "Students plan tasks, chat and share files with their team. Faculty match teams by skills, track contribution and spot struggling teams early.",
  keywords: ["CampusNova", "Student Collaboration", "University", "Group Projects", "AI Team Matching"],
  authors: [{ name: "CampusNova Team" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "CampusNova: group project workspace for students and faculty",
    description: "One workspace for every group project on campus.",
    url: "https://campusnova.vercel.app",
    siteName: "CampusNova",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CampusNova: group project workspace for students and faculty",
    description: "One workspace for every group project on campus.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground button-sm"
        >
          Skip to content
        </a>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
