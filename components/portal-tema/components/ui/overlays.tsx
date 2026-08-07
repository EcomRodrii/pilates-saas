"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";

/* ── Velo compartido ────────────────────────────────────────────────────── */

function Overlay({
  kind, open, onClose, children,
}: { kind: "modal" | "sheet" | "drawer"; open: boolean; onClose: () => void; children: React.ReactNode }) {
  // Escape cierra cualquier capa, como en el resto del portal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={"overlay overlay--" + kind + (open ? " is-open" : "")}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────────── */

export function Modal({
  open, onClose, title, text, actions,
}: { open: boolean; onClose: () => void; title: string; text?: string; actions?: React.ReactNode }) {
  const id = useId();
  return (
    <Overlay kind="modal" open={open} onClose={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id}>
        <p className="modal__title" id={id}>{title}</p>
        {text ? <p className="modal__text">{text}</p> : null}
        {actions ? <div className="modal__actions">{actions}</div> : null}
      </div>
    </Overlay>
  );
}

/* ── Hoja inferior ──────────────────────────────────────────────────────── */

export function DialogSheet({
  open, onClose, children,
}: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Overlay kind="sheet" open={open} onClose={onClose}>
      <div className="dialog-sheet" role="dialog" aria-modal="true">
        <div className="dialog-sheet__grip"></div>
        {children}
      </div>
    </Overlay>
  );
}

/* ── Cajón lateral ──────────────────────────────────────────────────────── */

export function Drawer({
  open, onClose, links, activeIndex = 0,
}: { open: boolean; onClose: () => void; links: string[]; activeIndex?: number }) {
  return (
    <Overlay kind="drawer" open={open} onClose={onClose}>
      <nav className="drawer" aria-label="Menú del estudio">
        {links.map((link, i) => (
          <button key={link} className={("drawer__link " + (i === activeIndex ? "is-active" : "")).trim()} onClick={onClose}>
            {link}
          </button>
        ))}
      </nav>
    </Overlay>
  );
}

/* ── Popover / menú ─────────────────────────────────────────────────────── */

export function Popover({
  trigger, align = "left", children,
}: { trigger: React.ReactNode; align?: "left" | "right"; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="popover-wrap" ref={wrap}>
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      <div className={"popover " + (align === "right" ? "popover--right " : "") + (open ? "is-open" : "")} role="menu">
        {children}
      </div>
    </div>
  );
}

export function MenuItem({ danger, children, ...rest }: { danger?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={("menu-item " + (danger ? "is-danger" : "")).trim()} role="menuitem" {...rest}>{children}</button>;
}

export function MenuSeparator() {
  return <div className="menu-sep"></div>;
}

/* ── Tooltip ────────────────────────────────────────────────────────────── */

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="tooltip-wrap" tabIndex={0}>
      {children}
      <span className="tooltip" role="tooltip">{label}</span>
    </span>
  );
}

/* ── Aviso flotante ─────────────────────────────────────────────────────── */

export function Toast({ text, id }: { text: string; id: number }) {
  if (!text) return null;
  // La clave fuerza el remontaje: cada aviso vuelve a entrar animado.
  return <div className="toast is-enter" key={id} role="status" aria-live="polite">{text}</div>;
}

/* ── Acordeón ───────────────────────────────────────────────────────────── */

export function Accordion({ items, initial = 0 }: { items: { q: string; a: string }[]; initial?: number }) {
  const [open, setOpen] = useState<number | null>(initial);
  return (
    <div className="accordion">
      {items.map((item, i) => (
        <div key={item.q} className={("accordion__item " + (open === i ? "is-open" : "")).trim()}>
          <button className="accordion__trigger" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            <span>{item.q}</span>
            <Icon name="chevron" size={18} />
          </button>
          <div className="accordion__panel">
            <div><p className="accordion__body">{item.a}</p></div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Pestañas ───────────────────────────────────────────────────────────── */

export function Tabs({
  items, underline,
}: { items: { label: string; content: React.ReactNode }[]; underline?: boolean }) {
  const [active, setActive] = useState(0);
  return (
    <div className={("tabs " + (underline ? "tabs--underline" : "")).trim()}>
      <div className="tabs__list" role="tablist">
        {items.map((item, i) => (
          <button
            key={item.label}
            role="tab"
            aria-selected={i === active}
            className={("tabs__trigger " + (i === active ? "is-active" : "")).trim()}
            onClick={() => setActive(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, i) => (
        <div key={item.label} role="tabpanel" className={("tabs__panel " + (i === active ? "is-active" : "")).trim()}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
