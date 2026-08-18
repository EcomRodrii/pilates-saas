"use client";

import { Icon, type IconName } from "./Icon";

/* ── Botón ──────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "ghost" | "quiet" | "done";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  pressable?: boolean;
}

export function Button({
  variant = "primary", size = "md", block, loading, pressable = true,
  disabled, className = "", children, ...rest
}: ButtonProps) {
  const cls = [
    "btn",
    "btn--" + variant,
    size !== "md" ? "btn--" + size : "",
    block ? "btn--block" : "",
    pressable && !disabled ? "is-pressable" : "",
    loading ? "is-loading" : "",
    disabled ? "is-disabled" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner"></span> : null}
      {children}
    </button>
  );
}

export function IconButton({
  name, label, glass, bell, dot, size = 21, stroke = 1.7, className = "", ...rest
}: {
  name: IconName; label: string; glass?: boolean; bell?: boolean; dot?: boolean;
  size?: number; stroke?: number; className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = ["icon-btn", glass ? "icon-btn--glass" : "", bell ? "icon-btn--bell" : "", "is-pressable", className]
    .filter(Boolean).join(" ");
  return (
    <button className={cls} aria-label={label} {...rest}>
      <Icon name={name} size={size} stroke={stroke} />
      {dot ? <i className="icon-btn__dot"></i> : null}
    </button>
  );
}

/* ── Superficies ────────────────────────────────────────────────────────── */

export function Card({ className = "", children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={("card " + className).trim()} {...rest}>{children}</section>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="section-title">{children}</p>;
}

export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="section-head">
      <p className="section-title">{title}</p>
      {action ? <button className="link" onClick={onAction}>{action}</button> : null}
    </div>
  );
}

export function Divider() {
  return <div className="divider"></div>;
}

/* ── Piezas pequeñas ────────────────────────────────────────────────────── */

export function Avatar({ children, size }: { children: React.ReactNode; size?: "xs" | "sm" }) {
  return <span className={("avatar " + (size ? "avatar--" + size : "")).trim()}>{children}</span>;
}

export function Chip({ active, children, ...rest }: { active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={("chip " + (active ? "is-active" : "")).trim()} {...rest}>{children}</button>;
}

export function Pill({ glass, children }: { glass?: boolean; children: React.ReactNode }) {
  return <span className={("pill " + (glass ? "pill--glass" : "")).trim()}>{children}</span>;
}

export function Status({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={"status status--" + tone}>{children}</span>;
}

export function Spinner() {
  return <span className="spinner"></span>;
}

export function Skeleton({ width, height, radius = 12 }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }}></span>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "danger"; children: React.ReactNode }) {
  const icon: IconName = tone === "info" ? "info" : "warning";
  return (
    <div className={"notice notice--" + tone}>
      <Icon name={icon} size={17} />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ title, text, cta, onAction }: { title: string; text: string; cta?: string; onAction?: () => void }) {
  if (onAction) {
    return (
      <button className="empty is-pressable" onClick={onAction}>
        <span className="empty__title">{title}</span>
        <span className="empty__text">{text}</span>
        {cta ? <span className="empty__cta">{cta}</span> : null}
      </button>
    );
  }
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
    </div>
  );
}

export function Switch({ on }: { on: boolean }) {
  return <span className={("switch " + (on ? "is-on" : "")).trim()}><i className="switch__ball"></i></span>;
}

/* ── Formulario ─────────────────────────────────────────────────────────── */

export function Field({
  label, htmlFor, hint, error, children,
}: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className={("field " + (error ? "has-error" : "")).trim()}>
      <label className="field__label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {hint && !error ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/**
 * Algo ha fallado y se puede reintentar.
 *
 * ⚠️ Distinto de `EmptyState` a propósito, aunque se parezcan: vacío significa
 * «aquí no hay nada todavía» y error significa «esto debería tener algo y no he
 * podido traerlo». Enseñar el vacío cuando la red ha fallado le dice a la socia
 * que no tiene reservas cuando sí las tiene.
 *
 * Siempre con salida: un error sin botón deja a la socia sin nada que hacer más
 * que cerrar la app.
 */
export function ErrorState({ title = "No hemos podido cargarlo", text, onRetry, cta = "Reintentar" }: {
  title?: string; text?: string; onRetry?: () => void; cta?: string;
}) {
  return (
    <div className="empty empty--error" role="alert">
      <p className="empty__title">{title}</p>
      {/* Sin detalle no se inventa uno: un «Error desconocido» no ayuda a nadie
          y suena a que la app no sabe lo que le pasa. */}
      {text ? <p className="empty__text">{text}</p> : null}
      {onRetry ? (
        <Button variant="ghost" size="sm" className="empty__accion" onClick={onRetry}>{cta}</Button>
      ) : null}
    </div>
  );
}

export function Input({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={("input " + className).trim()} {...rest} />;
}

export function InputGroup({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="input-group">
      <span className="input-group__icon"><Icon name={icon} size={18} /></span>
      {children}
    </div>
  );
}

export function Select({ className = "", children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={("select " + className).trim()} {...rest}>{children}</select>;
}

export function Checkbox({
  checked, onChange, children,
}: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="check__box"><Icon name="check" size={14} stroke={3} /></span>
      <span className="check__label">{children}</span>
    </label>
  );
}

export function Segmented({
  items, value, onChange,
}: { items: string[]; value: string; onChange?: (v: string) => void }) {
  return (
    <div className="segmented">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={("segmented__item " + (item === value ? "is-active" : "")).trim()}
          onClick={() => onChange?.(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
