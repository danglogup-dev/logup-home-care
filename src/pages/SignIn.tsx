import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import LogUpLogo from "@/components/LogUpLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const SignIn = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/app");
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
            Inspection-ready event &amp; evidence management
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl bg-background border-input"
              />
            </div>
            <Button type="submit" className="w-full h-11 rounded-xl font-semibold text-sm">
              Sign in
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground mt-5">
            Forgot your password?{" "}
            <span className="text-primary cursor-pointer hover:underline">Reset it</span>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Protected by LogUp · HIQA-aligned event management
        </p>
      </motion.div>
    </div>
  );
};

export default SignIn;
