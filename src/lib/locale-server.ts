import "server-only";
import { cookies, headers } from "next/headers";
import { fromAcceptLanguage, isLocale, LOCALE_COOKIE, translate, type Locale, type Vars } from "@/lib/i18n";

/** The request's language: the "lang" cookie, else the browser's Accept-Language. */
export async function requestLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : fromAcceptLanguage((await headers()).get("accept-language"));
}

/** A page's <title> in the request's language (the layout's template adds "· ScholarSync"). */
export async function pageTitle(text: string, vars?: Vars) {
  return { title: translate(await requestLocale(), text, vars) };
}
