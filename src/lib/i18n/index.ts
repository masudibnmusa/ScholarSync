// Interface language. Strings are keyed by their English text, so code stays readable and anything missing from a
// dictionary falls back to English. Placeholders: {name}. Numbers in placeholders use the language's digits.
// Pure (no React, no server APIs): shared by components, the store, emails and the unit check.
import { bn } from "./bn.ts";

export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_COOKIE = "lang";
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", bn: "বাংলা" };
const DICTS: Record<Locale, Record<string, string>> = { en: {}, bn };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** The tag for Intl and toLocale*: English keeps the browser's own format (as before); Bangla uses bn-BD. */
export const intlOf = (l: Locale) => (l === "bn" ? "bn-BD" : undefined);

/** A language from an Accept-Language header, for visitors who haven't chosen yet. */
export function fromAcceptLanguage(header: string | null | undefined): Locale {
  return /(^|,)\s*bn\b/i.test(header ?? "") ? "bn" : "en";
}

export type Vars = Record<string, string | number | null | undefined>;

export function translate(locale: Locale, text: string, vars?: Vars): string {
  const s = DICTS[locale][text] ?? text;
  if (!vars) return s;
  const nf = new Intl.NumberFormat(intlOf(locale) ?? "en-US", { useGrouping: false });
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = vars[k];
    return v == null ? m : typeof v === "number" ? nf.format(v) : v;
  });
}

/** "1 task" / "3 tasks": English picks by count; the dictionary has both forms (Bangla uses one). */
export const translatePlural = (locale: Locale, n: number, one: string, other: string, vars?: Vars) =>
  translate(locale, n === 1 ? one : other, { n, ...vars });

// shortcut: one module-wide value on the server, so two requests in different languages rendering at the same moment
// could swap a date's language (React then repairs it on hydration); move to AsyncLocalStorage if that shows up.
let serverLocale: Locale = "en";
/** Called by LocaleProvider while server rendering, so t() and intl() in helpers match the page's language. */
export const setServerLocale = (l: Locale) => { serverLocale = l; };

/** The page's language: from <html lang> in the browser; the request's language while server rendering. */
export function currentLocale(): Locale {
  if (typeof document === "undefined") return serverLocale;
  return isLocale(document.documentElement.lang) ? document.documentElement.lang : "en";
}

/** For code outside React rendering (toasts, event handlers, the store). Components use useT(). */
export const t = (text: string, vars?: Vars) => translate(currentLocale(), text, vars);
export const tn = (n: number, one: string, other: string, vars?: Vars) => translatePlural(currentLocale(), n, one, other, vars);
/** The Intl tag for toLocale* calls outside React rendering. */
export const intl = () => intlOf(currentLocale());
/** Marks module-level text (labels in constant lists) for the dictionary check; translate it where it renders with t(). */
export const msg = <S extends string>(text: S) => text;
