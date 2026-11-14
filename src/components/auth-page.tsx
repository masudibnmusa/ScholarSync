"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  GraduationCap,
  Eye,
  EyeOff,
  BookOpen,
  Users,
  BarChart3,
  Sparkles,
  Shield,
  Loader2,
} from "@/components/icons";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const { login, register, isLoading, error, setView, currentView } = useAppStore();
  const { toast } = useToast();

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState<"student" | "instructor">("student");
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!loginEmail.trim()) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(loginEmail)) errors.email = "Enter an email like name@university.edu";
    if (!loginPassword) errors.password = "Password is required";
    else if (loginPassword.length < 6) errors.password = "Use at least 6 characters";

    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors);
      return;
    }
    setLoginErrors({});
    await login(loginEmail, loginPassword);
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!regName.trim()) errors.name = "Name is required";
    if (!regEmail.trim()) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(regEmail)) errors.email = "Enter an email like name@university.edu";
    if (!regPassword) errors.password = "Password is required";
    else if (regPassword.length < 6) errors.password = "Use at least 6 characters";

    if (Object.keys(errors).length > 0) {
      setRegErrors(errors);
      return;
    }
    setRegErrors({});
    const success = await register(regName, regEmail, regPassword, regRole);
    if (success) {
      toast({
        title: "Account created",
        description: `Signed in as ${regName}.`,
      });
    }
  };

  const features = [
    { icon: Sparkles, title: "Team matching", desc: "Teams formed from skills and availability" },
    { icon: Users, title: "Live team chat", desc: "Messages and files in one place" },
    { icon: BarChart3, title: "Contribution view", desc: "Who did what, week by week" },
    { icon: Shield, title: "Conflict alerts", desc: "Early signs a team is struggling" },
  ];

  const passwordToggle = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown ? "Hide password" : "Show password"}
      className="absolute right-0 top-1/2 -translate-y-1/2 size-11 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  const errorText = (id: string, msg?: string) =>
    msg ? (
      <p id={id} className="caption-4 text-destructive">
        {msg}
      </p>
    ) : null;

  const roleButton = (value: "student" | "instructor", label: string, Icon: typeof BookOpen) => (
    <button
      type="button"
      aria-pressed={regRole === value}
      onClick={() => setRegRole(value)}
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg border body-5 transition-[color,background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        regRole === value
          ? "border-primary bg-brand/40"
          : "border-border hover:border-primary/50 hover:bg-muted"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex">
      {/* Left: what the product does */}
      <aside className="hidden lg:flex lg:w-1/2 bg-primary text-primary-foreground">
        <div className="flex flex-col justify-center px-16 max-w-2xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-brand text-brand-foreground flex items-center justify-center">
              <GraduationCap className="w-6 h-6" />
            </div>
            <p className="title-1">CampusNova</p>
          </div>
          <h2 className="heading-3 mb-4">
            Group projects where
            <br />
            everyone pulls their weight
          </h2>
          <p className="body-3 text-primary-foreground/70 max-w-md mb-12">
            Students plan, chat and share files with their team. Instructors see
            how every team is doing and step in before a deadline slips.
          </p>
          <ul className="grid grid-cols-2 gap-4 max-w-md">
            {features.map((f) => (
              <li key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <f.icon className="w-5 h-5 mb-2 text-brand" />
                <p className="title-4">{f.title}</p>
                <p className="caption-5 text-primary-foreground/60">{f.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Right: the form */}
      <main id="main" className="flex-1 flex items-center justify-center p-6 sm:p-8 bg-background">
        <div className="w-full max-w-md">
          <button
            type="button"
            onClick={() => setView("landing")}
            className="mb-8 inline-flex items-center gap-2 min-h-11 rounded-md body-5 text-muted-foreground hover:text-foreground transition-colors duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </button>

          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-brand text-brand-foreground flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <p className="title-1">CampusNova</p>
          </div>

          <Tabs
            value={currentView === "register" ? "register" : "login"}
            onValueChange={(v) => setView(v as "login" | "register")}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-2 mb-6 h-11">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <h1 className="heading-5">Welcome back</h1>
                  <p className="body-6 text-muted-foreground">Sign in with your university email.</p>
                </CardHeader>
                <CardContent className="pt-4">
                  <form onSubmit={handleLogin} noValidate className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">University email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        placeholder="name@university.edu"
                        value={loginEmail}
                        aria-invalid={!!loginErrors.email}
                        aria-describedby={loginErrors.email ? "email-error" : undefined}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                      {errorText("email-error", loginErrors.email)}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="Your password"
                          className="pr-12"
                          value={loginPassword}
                          aria-invalid={!!loginErrors.password}
                          aria-describedby={loginErrors.password ? "password-error" : undefined}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                        {passwordToggle(showPassword, () => setShowPassword(!showPassword))}
                      </div>
                      {errorText("password-error", loginErrors.password)}
                    </div>
                    {error && (
                      <div role="alert" className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive body-6">
                        {error}
                      </div>
                    )}
                    <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Signing in
                        </>
                      ) : (
                        "Sign in"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="shadow-sm">
                <CardHeader className="pb-2">
                  <h1 className="heading-5">Create your account</h1>
                  <p className="body-6 text-muted-foreground">Join your course team in under a minute.</p>
                </CardHeader>
                <CardContent className="pt-4">
                  <form onSubmit={handleRegister} noValidate className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Full name</Label>
                      <Input
                        id="reg-name"
                        autoComplete="name"
                        placeholder="Amina Rahman"
                        value={regName}
                        aria-invalid={!!regErrors.name}
                        aria-describedby={regErrors.name ? "reg-name-error" : undefined}
                        onChange={(e) => setRegName(e.target.value)}
                      />
                      {errorText("reg-name-error", regErrors.name)}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">University email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        placeholder="name@university.edu"
                        value={regEmail}
                        aria-invalid={!!regErrors.email}
                        aria-describedby={regErrors.email ? "reg-email-error" : undefined}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                      {errorText("reg-email-error", regErrors.email)}
                    </div>
                    <div className="space-y-2">
                      <p id="role-label" className="title-4">I am a</p>
                      <div role="group" aria-labelledby="role-label" className="grid grid-cols-2 gap-3">
                        {roleButton("student", "Student", BookOpen)}
                        {roleButton("instructor", "Instructor", GraduationCap)}
                      </div>
                      {regRole === "instructor" && (
                        <p className="caption-5 text-muted-foreground">
                          Instructor access is approved by an administrator. Until then you can use the student workspace.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="reg-password"
                          type={showRegPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="At least 6 characters"
                          className="pr-12"
                          value={regPassword}
                          aria-invalid={!!regErrors.password}
                          aria-describedby={regErrors.password ? "reg-password-error" : undefined}
                          onChange={(e) => setRegPassword(e.target.value)}
                        />
                        {passwordToggle(showRegPassword, () => setShowRegPassword(!showRegPassword))}
                      </div>
                      {errorText("reg-password-error", regErrors.password)}
                    </div>
                    {error && (
                      <div role="alert" className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive body-6">
                        {error}
                      </div>
                    )}
                    <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Creating account
                        </>
                      ) : (
                        "Create account"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
