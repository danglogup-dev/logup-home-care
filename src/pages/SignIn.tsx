import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import LogUpLogo from "@/components/LogUpLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { signInToLogUp, signInReturnPath } from "@/lib/logupAuth";

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const { loading, session } = useLogUpSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!loading && session) navigate(signInReturnPath(), { replace: true });
  }, [loading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await signInToLogUp(email, password); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not sign in to LogUp."); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-10 flex flex-col items-center">
          <LogUpLogo variant="horizontal" size="lg" className="w-[160px]" />
          <p className="text-muted-foreground mt-3 text-sm">
            Home care workspace
          </p>
        </div>


        <div className="bg-card rounded-2xl shadow-card p-8">
          <h2 className="font-heading font-semibold text-lg mb-6 text-foreground">Sign in to your workspace</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@facility.ie"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl bg-background border-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl bg-background border-input"
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || loading} className="w-full h-11 rounded-xl font-semibold text-sm">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <Button variant="outline" disabled={busy || loading} className="mt-4 w-full min-h-11" onClick={async () => {
            setBusy(true); setError("");
            try {
              const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
              if (result.error) throw result.error;
            } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
            finally { setBusy(false); }
          }}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>Continue with Google</Button>
          <Button variant="outline" disabled={busy || loading} className="mt-3 w-full min-h-11" onClick={async () => {
            setBusy(true); setError("");
            try {
              const result = await lovable.auth.signInWithOAuth("lovable", { redirect_uri: window.location.origin });
              if (result.error) throw result.error;
            } catch (e) { setError(e instanceof Error ? e.message : "Could not sign in."); }
            finally { setBusy(false); }
          }}>Continue with Lovable</Button>
          <p className="mt-4 text-center text-xs text-muted-foreground">Use your existing LogUp account. Staff access is assigned by your organisation.</p>
          <Button variant="ghost" className="mt-4 w-full min-h-11" onClick={() => navigate("/app")}>Explore fictional demo</Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          LogUp Home Care
        </p>
      </motion.div>
    </div>
  );
};

export default SignIn;
