import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import LogUpLogo from "@/components/LogUpLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { useLogUpSession } from "@/hooks/useLogUpSession";
import { signInToLogUp, signInReturnPath } from "@/lib/logupAuth";
import { useEffect } from "react";

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
          }}>Continue with Google</Button>
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
