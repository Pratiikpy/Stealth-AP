import { cn } from "@/lib/utils";

type CardVariant = "default" | "metric" | "interactive";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const variantClasses: Record<CardVariant, string> = {
  default: "bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4",
  metric: "bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 border-t-4 border-t-[#C6F15C]",
  interactive: "bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 cursor-pointer hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all duration-150",
};

export function Card({ variant = "default", className, ...props }: CardProps) {
  return (
    <div
      className={cn(variantClasses[variant], className)}
      {...props}
    />
  );
}
