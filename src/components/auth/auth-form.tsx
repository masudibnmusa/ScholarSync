"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, ChalkboardTeacher, EnvelopeSimpleOpen, Eye, EyeSlash, Student, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { supabaseBrowser } from "@/lib/supabase/client";
import { getProfile } from "@/app/actions";
import { homeFor } from "@/components/app/nav";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EASE } from "@/components/ui/motion";
import { useT } from "@/components/locale";
import { t, msg } from "@/lib/i18n";

const MIN_PASSWORD = 6;
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// Local seed accounts (supabase/seed.sql). Shown only by `next dev`.
const demoAccounts = [
  { label: msg("Student demo"), email: "masud@university.edu", icon: Student },
  { label: msg("Instructor demo"), email: "selim.reja@university.edu", icon: ChalkboardTeacher },
];

type Errors = Partial<Record<"name" | "email" | "password", string>>;

export function AuthForm({ mode, next }: { mode: "login" | "register"; next?: string | null }) {
  const { t } = useT();
  const router = useRouter();
  const isLogin = mode === "login";
  const [values, setValues] = React.useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const validate = (v = values): Errors => {
    const e: Errors = {};
    if (!isLogin && v.name.trim().length < 2) e.name = t("Enter your full name.");
    if (!emailOk(v.email)) e.email = t("Enter a valid email, like you@university.edu.");
    if (!v.password) e.password = t("Enter your password.");
    else if (!isLogin && v.password.length < MIN_PASSWORD) e.password = t("Use at least {MIN_PASSWORD} characters.", { MIN_PASSWORD });
    return e;
  };

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    setFormError(null);
  };
  const blur = (key: keyof Errors) => () => {
    if (values[key]) setErrors((er) => ({ ...er, [key]: validate()[key] }));
  };

  async function submit(v = values) {
    const found = validate(v);
    setErrors(found);
    const firstBad = (["name", "email", "password"] as const).find((k) => found[k]);
    if (firstBad) {
      formRef.current?.querySelector<HTMLInputElement>(`#${firstBad}`)?.focus();
      return;
    }
    setLoading(true);
    setFormError(null);
    const sb = supabaseBrowser();
    const email = v.email.trim().toLowerCase();
    try {
      if (isLogin) {
        const { error } = await sb.auth.signInWithPassword({ email, password: v.password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? msg("That email and password don't match. Check both and try again.") : error.message);
      } else {
        const { data, error } = await sb.auth.signUp({ email, password: v.password, options: { data: { name: v.name.trim() } } });
        if (error) throw new Error(error.message);
        if (!data.session) {
          setConfirmEmail(true);
          return;
        }
      }
      const profile = await getProfile();
      router.replace(next ?? `${homeFor(profile.role)}/courses`);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? t(err.message) : t("Something went wrong. Please try again."));
      setLoading(false);
    }
  }

  if (confirmEmail) {
    return (
      <div className="text-center" role="status">
        <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-3xl bg-secondary text-primary">
          <EnvelopeSimpleOpen weight="duotone" className="size-8" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold">{t("Check your inbox")}</h1>
        <p className="mt-2 text-muted-foreground">{t("We sent a confirmation link to")} <strong className="text-foreground">{values.email}</strong>{t(". Open it, then sign in.")}</p>
        <Button asChild size="lg" className="mt-6 w-full"><Link href="/login">{t("Go to sign in")}</Link></Button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <h1 className="text-3xl font-extrabold">{isLogin ? t("Welcome back") : t("Create your account")}</h1>
      <p className="mt-2 text-muted-foreground">
        {isLogin ? t("Sign in to pick up where your team left off.") : t("Join your team's workspace in under a minute.")}
      </p>

      <form ref={formRef} noValidate className="mt-8 space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {formError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 px-3.5 py-3 text-sm font-medium text-destructive">
            <WarningCircle weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </div>
        )}

        {!isLogin && (
          <Field label={t("Full name")} htmlFor="name" error={errors.name}>
            <Input id="name" name="name" autoComplete="name" placeholder={t("Sara Islam")} value={values.name} onChange={set("name")} onBlur={blur("name")}
              aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} />
          </Field>
        )}

        <Field label={t("University email")} htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" spellCheck={false} placeholder={t("you@university.edu")}
            value={values.email} onChange={set("email")} onBlur={blur("email")} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} />
        </Field>

        <Field label={t("Password")} htmlFor="password" error={errors.password} hint={isLogin ? undefined : t("At least {MIN_PASSWORD} characters.", { MIN_PASSWORD })}>
          <div className="relative">
            <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isLogin ? "current-password" : "new-password"}
              className="pr-12" value={values.password} onChange={set("password")} onBlur={blur("password")}
              aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : !isLogin ? "password-hint" : undefined} />
            <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? t("Hide password") : t("Show password")} aria-pressed={showPassword}
              className="tap absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {showPassword ? <EyeSlash className="size-[1.125rem]" /> : <Eye className="size-[1.125rem]" />}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" className="group w-full" loading={loading}>
          {isLogin ? t("Sign in") : t("Create account")}
          {!loading && <ArrowRight className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />}
        </Button>
      </form>

      {!isLogin && (
        <p className="mt-4 rounded-xl bg-muted px-3.5 py-3 text-xs text-muted-foreground">
          <strong className="font-semibold text-foreground">{t("Teaching a course?")}</strong> {t("Sign up here first. Instructor access is turned on by your administrator.")}
        </p>
      )}

      {isLogin && process.env.NODE_ENV === "development" && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Local demo accounts")}</p>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((d) => (
              <Button key={d.email} type="button" variant="outline" disabled={loading}
                onClick={() => { const v = { name: "", email: d.email, password: "password123" }; setValues(v); submit(v); }}>
                <d.icon weight="duotone" className="text-primary" aria-hidden /> {t(d.label)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-sm text-muted-foreground">
        {isLogin ? t("New to ScholarSync?") : t("Already have an account?")}{" "}
        <Link href={`${isLogin ? "/register" : "/login"}${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-primary underline-offset-4 hover:underline">
          {isLogin ? t("Create an account") : t("Sign in")}
        </Link>
      </p>
    </motion.div>
  );
}
