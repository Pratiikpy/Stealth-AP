import { Shield } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface-0 flex flex-col items-center justify-center px-4">
      <Link href="/" className="flex items-center gap-3 mb-8">
        <div className="w-8 h-8 bg-accent border-2 border-black retro-shadow flex items-center justify-center">
          <Shield className="h-4 w-4 text-black" />
        </div>
        <span className="font-mono text-[22px] font-black uppercase tracking-tight text-text-1">
          STEALTH<span className="bg-accent text-black px-1.5 ml-1 border-2 border-black text-[14px]">AP</span>
          <span className="text-text-3 text-[13px] ml-1">_SYS</span>
        </span>
      </Link>

      <div className="w-full max-w-sm">{children}</div>

      <p className="mt-8 text-[11px] text-text-3 font-mono uppercase tracking-wider font-bold">
        Private invoice payments on Aleo
      </p>
    </div>
  );
}
