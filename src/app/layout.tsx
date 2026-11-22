import type { Metadata, Viewport } from "next";
import { Noto_Sans_Bengali, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { LocaleProvider } from "@/components/locale";
import { translate } from "@/lib/i18n";
import { requestLocale } from "@/lib/locale-server";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
// Rounder face for headings only; body text stays in Jakarta for readability. Capped at 600 so the
// existing font-bold/extrabold headings render at the softer semibold weight of the reference design.
// Bangla glyphs: Jakarta and Outfit have none, so the browser falls back to this face letter by letter.
const bengali = Noto_Sans_Bengali({ variable: "--font-bengali", subsets: ["bengali"], weight: ["400", "500", "600", "700"], display: "swap" });
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: { default: translate(locale, "ScholarSync: group projects that actually work"), template: "%s · ScholarSync" },
    description: translate(locale,
      "One workspace for university group projects. Students chat, plan tasks and share files; faculty match teams by skills, track contribution and spot struggling teams early."),
    icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "ScholarSync", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#171310" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  return (
    // suppressHydrationWarning: next-themes sets the theme class before React hydrates
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${jakarta.variable} ${outfit.variable} ${bengali.variable}`}>
        <LocaleProvider locale={locale}><Providers>{children}</Providers></LocaleProvider>
      </body>
    </html>
  );
}
