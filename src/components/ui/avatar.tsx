import { avatarColor, cn, getInitials } from "@/lib/utils";

const sizes = { xs: "size-6 text-[0.625rem]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-20 text-2xl" };

export function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof sizes; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white", sizes[size], className)}
      style={{ backgroundColor: avatarColor(name) }}
    >
      {getInitials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4, size = "sm", ring = "ring-card" }: { names: string[]; max?: number; size?: keyof typeof sizes; ring?: string }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <div className="flex items-center" role="img" aria-label={names.length ? `Members: ${names.join(", ")}` : "No members"}>
      {shown.map((n, i) => (
        <Avatar key={n + i} name={n} size={size} className={cn("ring-2", ring, i > 0 && "-ml-1.5")} />
      ))}
      {rest > 0 && (
        <span className={cn("-ml-1.5 inline-flex items-center justify-center rounded-full bg-muted font-bold text-muted-foreground ring-2", ring, sizes[size])}>
          +{rest}
        </span>
      )}
    </div>
  );
}
