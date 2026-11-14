"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  GraduationCap,
  Eye,
  EyeOff,
  BookOpen,
  Users,
  BarChart3,
  Sparkles,
  Shield,
  Loader2,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

export function AuthPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const { login, register, isLoading, error, setView } = useAppStore();
  const { toast } = useToast();

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("student");
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!loginEmail.trim()) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(loginEmail)) errors.email = "Invalid email format";
    if (!loginPassword) errors.password = "Password is required";
    else if (loginPassword.length < 6) errors.password = "Password must be at least 6 characters";

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
    else if (!/\S+@\S+\.\S+/.test(regEmail)) errors.email = "Invalid email format";
    if (!regPassword) errors.password = "Password is required";
    else if (regPassword.length < 6) errors.password = "Password must be at least 6 characters";

    if (Object.keys(errors).length > 0) {
      setRegErrors(errors);
      return;
    }
    setRegErrors({});
    const success = await register(regName, regEmail, regPassword, regRole);
    if (success) {
      toast({
        title: "Account created successfully!",
        description: `Welcome to CampusNova, ${regName}!`,
      });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-primary/70" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full bg-white/15 blur-2xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-primary-foreground">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <GraduationCap className="w-9 h-9" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">CampusNova</h1>
              <p className="text-primary-foreground/80 text-sm">
                Student Collaboration Hub
              </p>
            </div>
          </div>
          <h2 className="text-3xl font-semibold mb-4 leading-tight">
            Smarter Teams,<br />Better Projects
          </h2>
          <p className="text-primary-foreground/70 text-lg leading-relaxed max-w-md mb-12">
            AI-powered team formation, real-time collaboration, and intelligent
            task management — all in one platform built for university group
            projects.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[
              {
                icon: Sparkles,
                title: "AI Team Matching",
                desc: "Intelligent team formation",
              },
              {
                icon: Users,
                title: "Real-Time Chat",
                desc: "WebSocket messaging",
              },
              {
                icon: BarChart3,
                title: "Smart Analytics",
                desc: "Contribution tracking",
              },
              {
                icon: Shield,
                title: "Conflict Detection",
                desc: "Sentiment monitoring",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
              >
                <f.icon className="w-5 h-5 mb-2 opacity-80" />
                <p className="font-medium text-sm">{f.title}</p>
                <p className="text-primary-foreground/60 text-xs">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">CampusNova</h1>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-6">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <h3 className="text-2xl font-bold">Welcome back</h3>
                  <p className="text-muted-foreground text-sm">
                    Sign in to your CampusNova account
                  </p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">University Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your.name@university.edu"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                      {loginErrors.email && (
                        <p className="text-xs text-destructive">{loginErrors.email}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {loginErrors.password && (
                        <p className="text-xs text-destructive">{loginErrors.password}</p>
                      )}
                    </div>
                    {error && (
                      <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        {error}
                      </div>
                    )}
                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="register">
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-2">
                  <h3 className="text-2xl font-bold">Create account</h3>
                  <p className="text-muted-foreground text-sm">
                    Join CampusNova to start collaborating
                  </p>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Full Name</Label>
                      <Input
                        id="reg-name"
                        placeholder="John Doe"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                      />
                      {regErrors.name && (
                        <p className="text-xs text-destructive">{regErrors.name}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-email">University Email</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        placeholder="your.name@university.edu"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                      {regErrors.email && (
                        <p className="text-xs text-destructive">{regErrors.email}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          className={
                            "flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors " +
                            (regRole === "student"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50")
                          }
                          onClick={() => setRegRole("student")}
                        >
                          <BookOpen className="w-4 h-4" />
                          Student
                        </button>
                        <button
                          type="button"
                          className={
                            "flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-colors " +
                            (regRole === "instructor"
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50")
                          }
                          onClick={() => setRegRole("instructor")}
                        >
                          <GraduationCap className="w-4 h-4" />
                          Instructor
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="reg-password"
                          type={showRegPassword ? "text" : "password"}
                          placeholder="Create a strong password"
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showRegPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {regErrors.password && (
                        <p className="text-xs text-destructive">{regErrors.password}</p>
                      )}
                    </div>
                    {error && (
                      <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        {error}
                      </div>
                    )}
                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
