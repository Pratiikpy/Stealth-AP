"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Wallet, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConnectButton } from "@/components/wallet/connect-button";
import { createClient } from "@/lib/supabase/client";

type AuthMethod = "choose" | "email" | "wallet" | "email-sent";

export default function LoginPage() {
  const [method, setMethod] = useState<AuthMethod>("choose");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmailLogin() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });

      if (authError) throw authError;
      setMethod("email-sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (method === "email-sent") {
    return (
      <div className="border-2 border-black bg-surface-1 p-6 text-center space-y-4 retro-shadow">
        <div className="h-12 w-12 bg-accent border-2 border-black flex items-center justify-center mx-auto">
          <Check className="h-6 w-6 text-black" />
        </div>
        <h1 className="font-mono text-xl font-black uppercase tracking-tight text-text-1">CHECK YOUR EMAIL</h1>
        <p className="text-[13px] text-text-2 font-mono">
          We sent a magic link to{" "}
          <span className="font-bold text-text-1">{email}</span>.
          Click the link to sign in.
        </p>
        <button
          onClick={() => setMethod("choose")}
          className="text-[12px] text-text-1 font-mono font-bold uppercase tracking-wider hover:bg-accent px-2 py-1 border-2 border-black retro-shadow retro-shadow-active"
        >
          Use a different method
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-surface-1 p-6 space-y-6 retro-shadow">
      <div className="text-center">
        <h1 className="font-mono text-2xl font-black uppercase tracking-tight text-text-1">WELCOME BACK</h1>
        <p className="text-[13px] text-text-3 mt-1 font-mono uppercase tracking-wider">
          Sign in to your StealthAP account
        </p>
      </div>

      {method === "choose" && (
        <div className="space-y-3">
          <button
            onClick={() => setMethod("email")}
            className="w-full flex items-center gap-3 border-2 border-black bg-surface-2 p-4 hover:bg-accent hover:text-black retro-shadow retro-shadow-active"
          >
            <Mail className="h-5 w-5 flex-shrink-0" />
            <div className="text-left flex-1">
              <p className="text-[13px] font-mono font-bold uppercase tracking-wider text-text-1">
                Email magic link
              </p>
              <p className="text-[11px] text-text-3 font-mono">
                Sign in with a link sent to your email
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-text-3" />
          </button>

          <button
            onClick={() => setMethod("wallet")}
            className="w-full flex items-center gap-3 border-2 border-black bg-purple p-4 hover:bg-purple/80 retro-shadow retro-shadow-active"
          >
            <Wallet className="h-5 w-5 text-black flex-shrink-0" />
            <div className="text-left flex-1">
              <p className="text-[13px] font-mono font-bold uppercase tracking-wider text-black">
                Connect wallet
              </p>
              <p className="text-[11px] text-black/70 font-mono">
                Sign in with your Aleo wallet
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-black" />
          </button>
        </div>
      )}

      {method === "email" && (
        <div className="space-y-4">
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
            onClick={handleEmailLogin}
            loading={loading}
            disabled={!email}
            className="w-full"
            variant="primary"
            icon={<ArrowRight className="h-4 w-4" />}
          >
            Send magic link
          </Button>

          <button
            onClick={() => { setMethod("choose"); setError(null); }}
            className="w-full text-[12px] text-text-3 font-mono font-bold uppercase tracking-wider hover:text-text-1 text-center"
          >
            &larr; Other sign in options
          </button>
        </div>
      )}

      {method === "wallet" && (
        <div className="space-y-4">
          <p className="text-[13px] text-text-3 text-center font-mono uppercase tracking-wider">
            Connect your Aleo wallet to sign in.
          </p>

          <div className="flex justify-center">
            <ConnectButton />
          </div>

          <button
            onClick={() => setMethod("choose")}
            className="w-full text-[12px] text-text-3 font-mono font-bold uppercase tracking-wider hover:text-text-1 text-center"
          >
            &larr; Other sign in options
          </button>
        </div>
      )}

      <p className="text-[11px] text-text-3 text-center font-mono uppercase tracking-wider">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-bold text-text-1 border-b-2 border-accent hover:bg-accent px-1">
          Sign up
        </Link>
      </p>
    </div>
  );
}
