import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import LogUpLogo from "@/components/LogUpLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleStore } from "@/lib/roleStore";

/** Prototype sign-in: no credentials are checked. The chosen view decides the landing page. */
export const SIGN_IN_VIEWS = [
  { presetId: "admin", label: "Admin" },
  { presetId: "manager-multi", label: "Manager" },
  { presetId: "coordinator", label: "Coordinator · East Cork" },
  { presetId: "keyworker-aisling", label: "Carer · Aisling Doherty" },
  { presetId: "family-patrick", label: "Family · Mary Murphy" },
] as const;

export function prototypeSignIn(presetId: string) {
  roleStore.setPreset(presetId);
  return roleStore.get().role === "family" ? "/family" : "/app";
}

const SignIn = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<string>("admin");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(prototypeSignIn(view), { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-sm">
        <div className="text-center mb-10 flex flex-col items-center">
          <LogUpLogo variant="horizontal" size="lg" className="w-[160px]" />
          <p className="text-muted-foreground mt-3 text-sm">Home care workspace</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl shadow-card p-8 space-y-5">
          <h1 className="font-heading font-semibold text-lg text-foreground">Sign in</h1>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@provider.ie" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="view">Sign in as</Label>
            <Select value={view} onValueChange={setView}>
              <SelectTrigger id="view" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{SIGN_IN_VIEWS.map((v) => <SelectItem key={v.presetId} value={v.presetId}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full h-11 rounded-xl font-semibold">Sign in</Button>
          <p className="text-center text-xs text-muted-foreground">Prototype: no password needed. All people and records are fictional.</p>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-8">LogUp Home Care</p>
      </motion.div>
    </div>
  );
};

export default SignIn;
