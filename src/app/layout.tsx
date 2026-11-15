import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "ScholarSync: group projects that actually work", template: "%s · ScholarSync" },
  description:
    "One workspace for university group projects. Students chat, plan tasks and share files; faculty match teams by skills, track contribution and spot struggling teams early.",
  icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0d1f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the theme class before React hydrates
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={jakarta.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
