import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        solid: "bg-primary text-primary-foreground",
        outline: "border border-border text-muted-foreground",
        muted: "bg-muted text-muted-foreground",
        success: "bg-success/12 text-success",
        warning: "bg-warning/14 text-warning",
        danger: "bg-rose text-destructive ring-1 ring-inset ring-destructive/15", // solid: a tint on a rose card fell below 4.5:1
        info: "bg-info/12 text-info",
        warm: "bg-warm/15 text-warm-text",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
