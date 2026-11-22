"use client";

import { useAppStore } from "@/lib/store";
import { avatarColor, cn, getInitials } from "@/lib/utils";
import { useT } from "@/components/locale";

const sizes = { xs: "size-6 text-[0.625rem]", sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg", xl: "size-20 text-2xl" };

/** Initials on a name-based color, or the person's profile photo when `id` is given and they have one. */
export function Avatar({ name, id, size = "md", className }: { name: string; id?: string | null; size?: keyof typeof sizes; className?: string }) {
  const src = useAppStore((s) => (id ? s.avatars[id] : undefined));
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-bold text-white", sizes[size], className)}
      style={{ backgroundColor: avatarColor(name) }}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" decoding="async" /> : getInitials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = "sm", ring = "ring-card" }: { people: { id?: string; name: string }[]; max?: number; size?: keyof typeof sizes; ring?: string }) {
  const { t } = useT();
  const names = people.map((p) => p.name);
  const shown = people.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <div className="flex items-center" role="img" aria-label={names.length ? t("Members: {value}", { value: names.join(", ") }) : t("No members")}>
      {shown.map((p, i) => (
        <Avatar key={(p.id ?? p.name) + i} name={p.name} id={p.id} size={size} className={cn("ring-2", ring, i > 0 && "-ml-1.5")} />
      ))}
      {rest > 0 && (
        <span className={cn("-ml-1.5 inline-flex items-center justify-center rounded-full bg-muted font-bold text-muted-foreground ring-2", ring, sizes[size])}>
          +{rest}
        </span>
      )}
    </div>
  );
}
