import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 mb-6", className)}>
      <div>
        <h1 className="font-mono text-3xl md:text-4xl font-black uppercase tracking-tighter text-text-1">
          {title}
        </h1>
        {description && (
          <p className="font-mono text-sm text-text-3 font-bold mt-2">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
