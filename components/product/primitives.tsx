"use client";
import { useId, useRef, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { motion, useReducedMotion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
// Adapted from SmoothUI AnimatedTabs (MIT); complete attribution in THIRD_PARTY_NOTICES.md.
export function FilterTabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { id: string; label: string; count?: number }[];
}) {
  const uid = useId();
  const reduced = useReducedMotion();
  return (
    <div className="filter-tabs" role="tablist" aria-label="Task status">
      {items.map((item, i) => (
        <button
          key={item.id}
          id={`${uid}-${item.id}`}
          role="tab"
          aria-selected={value === item.id}
          aria-controls="task-panel"
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => {
            let n = i;
            if (e.key === "ArrowRight") n = (i + 1) % items.length;
            else if (e.key === "ArrowLeft")
              n = (i - 1 + items.length) % items.length;
            else if (e.key === "Home") n = 0;
            else if (e.key === "End") n = items.length - 1;
            else return;
            e.preventDefault();
            onChange(items[n].id);
            document.getElementById(`${uid}-${items[n].id}`)?.focus();
          }}
        >
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
          {value === item.id && (
            <motion.i
              layoutId={`${uid}-indicator`}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: "spring", duration: 0.25, bounce: 0.05 }
              }
            />
          )}
        </button>
      ))}
    </div>
  );
}
// Amicro FadeUp pattern, shortened and made reduced-motion aware.
export function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`reveal-enter ${className}`}>{children}</div>;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus();
        }}
        className={`product-dialog ${wide ? "wide-dialog" : ""}`}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function MobileAssistant({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mobile-assistant-overlay" />
        <DialogPrimitive.Content
          className="mobile-assistant-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Your second brain
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function Empty({
  icon,
  heading,
  children,
  action,
}: {
  icon: ReactNode;
  heading: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{heading}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
