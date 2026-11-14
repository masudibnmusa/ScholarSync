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
  title: "CampusNova - Student Collaboration Hub",
  description: "AI-powered team formation, real-time collaboration, and intelligent task management for university group projects.",
  keywords: ["CampusNova", "Student Collaboration", "University", "Group Projects", "AI Team Matching"],
  authors: [{ name: "CampusNova Team" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "CampusNova - Student Collaboration Hub",
    description: "AI-powered student collaboration platform",
    url: "https://campusnova.vercel.app",
    siteName: "CampusNova",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CampusNova - Student Collaboration Hub",
    description: "AI-powered student collaboration platform",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
