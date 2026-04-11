"use client";

import Link from "next/link";
import { Shield, Lock, Upload, CheckSquare, ArrowRight, Cpu } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-surface-0 flex flex-col relative">
      {/* Dot pattern overlay */}
      <div className="fixed inset-0 dot-pattern pointer-events-none" />

      {/* Nav */}
      <header className="h-14 border-b-2 border-black bg-surface-1 flex items-center justify-between px-6 flex-shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent border-2 border-black retro-shadow flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-mono text-[14px] font-black uppercase tracking-tight text-text-1">
            STEALTH<span className="bg-accent text-black px-1 ml-0.5 border border-black text-[11px]">AP</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="font-mono text-[12px] font-bold uppercase tracking-wider text-text-1 border-2 border-black px-3 py-1.5 bg-surface-2 hover:bg-surface-3 retro-shadow retro-shadow-active"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="font-mono text-[12px] font-bold uppercase tracking-wider text-black bg-accent border-2 border-black px-3 py-1.5 retro-shadow retro-shadow-active"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1 relative z-10">

        {/* Hero */}
        <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-surface-1 border-2 border-black retro-shadow font-mono text-[11px] font-bold uppercase tracking-wider mb-10">
            <span className="w-2 h-2 bg-accent border border-black" />
            Live on Aleo Testnet
          </div>
          <h1 className="font-sans text-6xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9] mb-8">
            <span className="text-text-1">Pay Vendors.</span>
            <br />
            <span className="text-transparent" style={{ WebkitTextStroke: "3px #000" }}>
              Stay Invisible.
            </span>
          </h1>
          <p className="font-mono font-bold text-[15px] text-text-2 max-w-xl mx-auto mb-10 leading-relaxed">
            AI extracts your invoices. Zero-knowledge proofs hide every payment.
            <span className="bg-accent text-black px-1 mx-1">Competitors never see</span>
            who you pay, how much, or when.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-black border-2 border-black font-mono text-[14px] font-black uppercase tracking-wider retro-shadow retro-shadow-hover retro-shadow-active"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-surface-1 text-text-1 border-2 border-black font-mono text-[14px] font-bold uppercase tracking-wider retro-shadow retro-shadow-active"
            >
              Sign in
            </Link>
          </div>
          <p className="font-mono text-[11px] text-text-3 mt-6 uppercase tracking-wider font-bold">
            $1.2M settled &nbsp;/&nbsp; 100% private &nbsp;/&nbsp; ~1m 45s avg settlement
          </p>
        </section>

        {/* How It Works */}
        <section className="border-t-2 border-black">
          <div className="max-w-4xl mx-auto px-6 py-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-3 font-bold mb-8 text-center">
              HOW IT WORKS
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "UPLOAD PDF", desc: "Drop any invoice. AI extracts vendor, amounts, line items instantly.", color: "bg-[#C6F15C]", icon: Upload, step: "01" },
                { label: "AI EXTRACTS", desc: "NVIDIA NIM + Gemini vision models read your invoices with 98%+ accuracy.", color: "bg-surface-1", icon: Cpu, step: "02" },
                { label: "APPROVE", desc: "Private multi-sig approval. Chain sees '3 approved' but NOT who.", color: "bg-[#B3A0FF]", icon: CheckSquare, step: "03" },
                { label: "SETTLE", desc: "ZK proof settles on Aleo. Cryptographically private. Fully verifiable.", color: "bg-surface-1", icon: Lock, step: "04" },
              ].map((card) => (
                <div
                  key={card.step}
                  className={`${card.color} p-6 border-2 border-black retro-shadow`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <card.icon className="w-5 h-5 text-black" />
                    <span className="font-mono text-[10px] font-bold text-text-3">{card.step}</span>
                  </div>
                  <div className="font-mono text-[14px] font-black uppercase tracking-tight text-black mb-2">{card.label}</div>
                  <div className="font-mono text-[11px] text-text-2 leading-relaxed">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t-2 border-black">
          <div className="max-w-md mx-auto px-6 py-16 text-center">
            <h2 className="font-mono text-2xl font-black uppercase tracking-tight text-text-1 mb-3">
              PRIVATE PAYABLES, STARTING TODAY.
            </h2>
            <p className="font-mono text-[13px] text-text-3 mb-6 uppercase tracking-wider">
              No crypto expertise required. Connects to your wallet in seconds.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-black border-2 border-black font-mono text-[14px] font-black uppercase tracking-wider retro-shadow retro-shadow-hover retro-shadow-active"
            >
              Get started for free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-black bg-surface-1 px-6 py-4 flex items-center justify-between font-mono text-[11px] text-text-3 uppercase tracking-wider font-bold relative z-10">
        <span>StealthAP -- Private AP on Aleo</span>
        <span>Zero-knowledge by default</span>
      </footer>
    </div>
  );
}
