"use client";

import * as React from "react";
import { setLanguage } from "@/app/actions";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/lib/i18n";
import { useT } from "@/components/locale";
import { Segmented } from "@/components/ui/segmented";

/**
 * English / বাংলা. Saves the choice (cookie, and the profile when signed in, so emails follow it) and reloads, because
 * the server renders the page in the chosen language.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, t } = useT();
  const [busy, setBusy] = React.useState(false);

  async function change(next: Locale) {
    if (next === locale || busy) return;
    setBusy(true);
    try {
      await setLanguage(next);
      window.location.reload();
    } catch (err) {
      console.error("Changing the language failed:", err);
      setBusy(false);
    }
  }

  return (
    <Segmented value={locale} onChange={change} label={t("Language")} className={className}
      options={LOCALES.map((l) => ({ value: l, label: <span lang={l}>{LOCALE_NAMES[l]}</span> }))} />
  );
}
