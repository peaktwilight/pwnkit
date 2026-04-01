import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export function SheetOverlay({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn("fixed inset-0 z-50 bg-[rgba(2,8,13,0.78)] backdrop-blur-sm", className)}
      {...props}
    />
  );
}

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 bg-[var(--popover)] text-[var(--popover-foreground)] shadow-[var(--shadow-overlay)] transition ease-in-out outline-none",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-[var(--border-strong)] p-6",
        bottom: "inset-x-0 bottom-0 border-t border-[var(--border-strong)] p-6",
        left: "inset-y-0 left-0 h-full w-[18rem] border-r border-[var(--border-strong)] p-4",
        right: "inset-y-0 right-0 h-full w-[18rem] border-l border-[var(--border-strong)] p-4",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

type SheetContentProps = ComponentPropsWithoutRef<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants>;

export function SheetContent({
  side = "right",
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--secondary)] text-[var(--muted)] transition hover:bg-white/[0.08] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-left", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-auto flex flex-col gap-2", className)} {...props} />;
}
