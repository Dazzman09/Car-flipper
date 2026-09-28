"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { formatMoney, formatSigned, type Cents } from "@/engine/money";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "good";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft disabled:bg-ink/40",
  secondary: "bg-card text-ink border border-line hover:border-ink/40 disabled:text-muted",
  ghost: "text-ink-soft hover:bg-ink/5 disabled:text-muted",
  danger: "bg-bad text-white hover:bg-bad/90 disabled:bg-bad/40",
  good: "bg-good text-white hover:bg-good/90 disabled:bg-good/40",
};

export function Button({
  variant = "primary",
  className = "",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sizing = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

type Tone = "neutral" | "good" | "bad" | "info" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink-soft",
  good: "bg-good/10 text-good",
  bad: "bg-bad/10 text-bad",
  info: "bg-info/10 text-info",
  accent: "bg-accent/15 text-accent-strong",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function Money({ cents, signed = false, className = "" }: { cents: Cents; signed?: boolean; className?: string }) {
  const tone = signed ? (cents > 0 ? "text-good" : cents < 0 ? "text-bad" : "") : "";
  return <span className={`tabular ${tone} ${className}`}>{signed ? formatSigned(cents) : formatMoney(cents)}</span>;
}

export function Stat({ label, children, hint, testId }: { label: string; children: ReactNode; hint?: string; testId?: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="truncate text-lg font-bold">{children}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-pop max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-5 outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="mb-3 text-lg font-bold">
          {title}
        </h2>
        {children}
        {footer && <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function MoneyInput({
  value,
  onChange,
  label,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <div className="flex items-center rounded-lg border border-line bg-card focus-within:border-ink">
        <span className="pl-3 text-muted">$</span>
        <input
          id={id}
          data-testid={testId}
          inputMode="decimal"
          className="tabular w-full bg-transparent px-2 py-2.5 text-base outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
}

export function ProgressDots({ total, filled, label }: { total: number; filled: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={label} title={label}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < filled ? "bg-accent" : "bg-white/25"}`} />
      ))}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}
