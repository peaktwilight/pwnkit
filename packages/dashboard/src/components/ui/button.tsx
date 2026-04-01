import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:bg-white/[0.06]",
        secondary: "border-transparent bg-white/[0.06] text-[var(--secondary-foreground)] hover:bg-white/[0.1]",
        outline: "border-[var(--border)] bg-transparent text-[var(--foreground)] hover:bg-white/[0.04]",
        ghost: "border-transparent bg-transparent text-[var(--muted)] hover:bg-white/[0.04] hover:text-[var(--foreground)]",
        accent: "border-[var(--primary)]/35 bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[#ef4444]",
        success: "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--foreground)] hover:bg-[var(--success)]/20",
        warning: "border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--foreground)] hover:bg-[var(--warning)]/20",
        danger: "border-[var(--destructive)]/30 bg-[var(--danger-soft)] text-[var(--foreground)] hover:bg-[var(--danger)]/20",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-5",
        icon: "size-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ className, size, variant }))} {...props} />;
}

export { buttonVariants };
