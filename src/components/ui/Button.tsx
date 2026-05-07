import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { sfx } from "@/audio/sfx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Apply a hero-accent glow + tint (overrides variant color treatment). */
  heroAccent?: string;
  /** Override the default click sfx. Pass null to silence. */
  sound?: "ui-tap" | "ui-back" | null;
}

const SIZE: Record<Size, string> = {
  sm: "min-h-tap   px-3 py-2 text-sm",
  md: "min-h-tap-l px-4 py-3 text-base",
  lg: "min-h-tap-xl px-6 py-4 text-d-3 font-display tracking-wider",
};

const VARIANT: Record<Variant, string> = {
  primary:   "bg-brand text-arena-0 shadow-brand hover:brightness-110 active:brightness-95",
  secondary: "surface text-ink hover:text-brand",
  ghost:     "text-muted hover:text-ink",
  danger:    "bg-dmg text-arena-0 hover:brightness-110 active:brightness-95",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, heroAccent, sound = "ui-tap", onClick, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-card font-medium",
        "transition-[filter,transform,color,background] duration-150 ease-out-quart",
        "active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
        "select-none",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
      style={heroAccent ? { backgroundColor: heroAccent, boxShadow: `0 0 24px ${heroAccent}55` } : undefined}
      onClick={(e) => { if (sound) sfx(sound); onClick?.(e); }}
      {...rest}
    >
      {children}
    </button>
  );
});
