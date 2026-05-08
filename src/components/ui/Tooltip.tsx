/**
 * Tooltip — long-press on touch (400ms) and hover on desktop opens an
 * absolutely-positioned tooltip below the trigger.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;     // long-press threshold in ms
}

export function Tooltip({ content, children, className, delay = 400 }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  function clear() { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } }

  useEffect(() => () => clear(), []);

  return (
    <span
      ref={ref}
      className={cn("relative inline-block", className)}
      onPointerDown={() => { timer.current = window.setTimeout(() => setOpen(true), delay); }}
      onPointerUp={()   => { clear(); setOpen(false); }}
      onPointerLeave={() => { clear(); setOpen(false); }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="
            absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)]
            z-50 max-w-xs whitespace-normal text-left
            px-3 py-2 text-xs leading-snug
            surface text-ink rounded-card shadow-panel
            pointer-events-none
          "
        >
          {content}
        </span>
      )}
    </span>
  );
}
