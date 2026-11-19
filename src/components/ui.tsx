import Link from "next/link";
import type { ReactNode } from "react";

export function Notices({ notice, error }: { notice?: string; error?: string }) {
  return (
    <>
      {notice ? (
        <p role="status" className="rounded-lg bg-lime-100 px-3 py-2 text-ok">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-bad">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function PageHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {detail ? <p className="mt-1 max-w-2xl text-stone-700">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, detail, href, label }: { title: string; detail: string; href?: string; label?: string }) {
  return (
    <div className="card border-dashed text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-1 text-stone-600">{detail}</p>
      {href && label ? (
        <Link href={href} className="btn mt-4">
          {label}
        </Link>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  hint,
  autoFocus,
  autoComplete,
  className,
  id,
  min,
  max,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  hint?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  className?: string;
  id?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="grid gap-1 text-sm" htmlFor={id}>
      <span className="font-medium">{label}</span>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        min={min}
        max={max}
        className={`input ${className ?? ""}`}
      />
      {hint ? <span className="text-stone-600">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  children,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  children: ReactNode;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={defaultValue} required={required} className="input">
        {children}
      </select>
    </label>
  );
}

export function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-stone-600">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 text-sm text-stone-600">{detail}</p> : null}
    </div>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>;
}
