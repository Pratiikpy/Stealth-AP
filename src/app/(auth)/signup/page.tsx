"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowRight, Check, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type SignupStep = "form" | "sent";

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>("form");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
          },
        },
      });

      if (authError) throw authError;
      setStep("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  if (step === "sent") {
    return (
      <div className="border-2 border-black bg-surface-1 p-6 text-center space-y-4 retro-shadow">
        <div className="h-12 w-12 bg-accent border-2 border-black flex items-center justify-center mx-auto">
          <Check className="h-6 w-6 text-black" />
        </div>
        <h1 className="font-mono text-xl font-black uppercase tracking-tight text-text-1">CHECK YOUR EMAIL</h1>
        <p className="text-[13px] text-text-2 font-mono">
          We sent a verification link to{" "}
          <span className="font-bold text-text-1">{email}</span>.
          Click the link to create your account.
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-surface-1 p-6 space-y-6 retro-shadow">
      <div className="text-center">
        <h1 className="font-mono text-2xl font-black uppercase tracking-tight text-text-1">CREATE ACCOUNT</h1>
        <p className="text-[13px] text-text-3 mt-1 font-mono uppercase tracking-wider">
          Start processing invoices privately
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="First Name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Maya"
          />
          <Input
            label="Last Name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Chen"
          />
        </div>

        <Input
          label="Company Name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Your Company"
          icon={<Building2 className="h-4 w-4" />}
        />

        <Input
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          icon={<Mail className="h-4 w-4" />}
          error={error ?? undefined}
        />

        <Button
          onClick={handleSignup}
          loading={loading}
          disabled={!email || !companyName || !firstName}
          className="w-full"
          variant="primary"
          icon={<ArrowRight className="h-4 w-4" />}
        >
          Create Account
        </Button>
      </div>

      <p className="text-[11px] text-text-3 text-center font-mono uppercase tracking-wider">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-text-1 border-b-2 border-accent hover:bg-accent px-1">
          Sign in
        </Link>
      </p>
    </div>
  );
}
