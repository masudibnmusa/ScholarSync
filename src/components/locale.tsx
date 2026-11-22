"use client";

import * as React from "react";
import { intlOf, setServerLocale, translate, translatePlural, type Locale, type Vars } from "@/lib/i18n";

const LocaleContext = React.createContext<Locale>("en");

/** Set by the root layout from the cookie, so server rendering and the browser agree on the language. */
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  if (typeof document === "undefined") setServerLocale(locale);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Translation for rendering: t("Save"), tn(n, "{n} task", "{n} tasks"), and the Intl tag for dates. */
export function useT() {
  const locale = React.useContext(LocaleContext);
  return React.useMemo(() => ({
    locale,
    intl: intlOf(locale),
    t: (text: string, vars?: Vars) => translate(locale, text, vars),
    tn: (n: number, one: string, other: string, vars?: Vars) => translatePlural(locale, n, one, other, vars),
  }), [locale]);
}
