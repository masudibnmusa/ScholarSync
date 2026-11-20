import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "tap relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.125rem]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-lift",
        warm: "bg-warm text-warm-foreground shadow-soft hover:brightness-105 hover:shadow-lift",
        outline: "border border-input bg-card text-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/40",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        sm: "h-9 px-3 text-[0.8125rem]",
        default: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? children : (
        <>
          {loading && <CircleNotch className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}
