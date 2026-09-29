// The handful of pieces every screen repeats. Small on purpose: the design
// system lives in styles.css.

import type { ReactNode } from "react";

export function Card({
  title,
  hint,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[1.0625rem] leading-snug font-semibold">{title}</h2>}
            {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** Stat tile: the value first, the label under it, a fixed-height meta line. */
export function Stat({ label, value, meta, loading }: { label: string; value: ReactNode; meta?: ReactNode; loading?: boolean }) {
  return (
    <div className="card px-4 py-3">
      {loading ? (
        <div className="skeleton h-7 w-20" />
      ) : (
        <div className="tnum text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">{value}</div>
      )}
      <div className="mt-0.5 text-[0.8125rem] font-medium text-muted">{label}</div>
      <div className="mt-0.5 h-4 text-xs text-muted">{loading ? null : meta}</div>
    </div>
  );
}

export const primaryClass =
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm bg-primary px-2.5 text-[0.875rem] font-medium text-on-primary transition-colors duration-150 hover:bg-primary-hover disabled:opacity-50";

export const secondaryClass =
  "raised inline-flex h-7 items-center justify-center gap-1.5 rounded-sm bg-surface px-2.5 text-[0.875rem] font-medium text-foreground transition-colors duration-150 hover:bg-sunken disabled:opacity-50";

export const ghostClass =
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-sm px-2 text-[0.875rem] font-medium text-muted transition-colors duration-150 hover:bg-sunken hover:text-foreground disabled:opacity-50";

export const inputClass =
  "h-8 w-full rounded-sm bg-surface px-3 text-[0.9375rem] shadow-[inset_0_0_0_1px_var(--border)] placeholder:text-faint focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--ring-halo)] focus:outline-none";

/** A fact: language, fork, archived. Quiet gray. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-5 items-center rounded-xs bg-sunken px-2 text-[0.8125rem] text-muted">{children}</span>;
}

/** A signal: tinted fill, same-hue text, no border. */
export function Badge({ tone, children }: { tone: "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  const tones = {
    info: "bg-info-tint text-info",
    success: "bg-success-tint text-success",
    warning: "bg-warning-tint text-warning",
    danger: "bg-danger-tint text-danger",
  } as const;
  return (
    <span className={`inline-flex h-5 items-center rounded-full px-2 text-[0.8125rem] font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A delta as coloured text: data that happens to be good or bad, not a state. */
export function Delta({ value, children }: { value: number | null; children: ReactNode }) {
  const tone = value === null || value === 0 ? "text-muted" : value > 0 ? "text-success" : "text-danger";
  return <span className={`tnum ${tone}`}>{children}</span>;
}

/** Segmented view switcher. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-sunken p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-6 rounded-sm px-2.5 text-[0.8125rem] font-medium transition-colors duration-150 ${
            o.value === value ? "raised bg-surface text-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Never a bare "No data": one line of why, and the way forward. */
export function Empty({ title, hint, action }: { title: string; hint: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
      <p className="text-[0.9375rem] font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Banner({ tone, children }: { tone: "info" | "warning" | "danger"; children: ReactNode }) {
  const tones = { info: "bg-info-tint text-info", warning: "bg-warning-tint text-warning", danger: "bg-danger-tint text-danger" };
  return <div className={`rounded-sm px-4 py-2.5 text-sm ${tones[tone]}`}>{children}</div>;
}

/** Row 1 of the toolbar: identity at the left, the page's actions at the right. */
export function Toolbar({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
        {meta && <div className="mt-0.5 text-[0.8125rem] text-muted">{meta}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A card row: title (and subtitle) left, value right, inset hairline between rows. */
export function Row({
  title,
  subtitle,
  value,
  onClick,
  href,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  value: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9375rem]">{title}</div>
        {subtitle && <div className="truncate text-[0.8125rem] text-muted">{subtitle}</div>}
      </div>
      <div className="tnum shrink-0 text-right text-[0.875rem] font-medium">{value}</div>
    </>
  );
  const cls = "flex min-h-12 w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:bg-sunken";
  return (
    <li className="border-t border-border first:border-t-0">
      {href ? (
        <a
          href={href}
          className={cls}
          onClick={(e) => {
            if (onClick && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
              e.preventDefault();
              onClick();
            }
          }}
        >
          {body}
        </a>
      ) : (
        <div className={cls.replace(" hover:bg-sunken", "")}>{body}</div>
      )}
    </li>
  );
}
