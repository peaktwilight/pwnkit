import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        neutral: "border-[var(--border)] bg-[var(--secondary)] text-[var(--muted)]",
        accent: "border-[var(--primary)]/25 bg-[var(--danger-soft)] text-[var(--foreground)]",
        success: "border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--foreground)]",
        warning: "border-[var(--warning)]/25 bg-[var(--warning-soft)] text-[var(--foreground)]",
        danger: "border-[var(--destructive)]/25 bg-[var(--danger-soft)] text-[var(--foreground)]",
        info: "border-[var(--info)]/25 bg-[var(--info-soft)] text-[var(--foreground)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ className, variant }))} {...props} />;
}
