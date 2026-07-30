'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ACC, ACC_SOFT } from './theme';

// ─── Scroll-reveal wrapper ───────────────────────────────────────────────────

export function Reveal({
  children,
  delay = 0,
  from = 'up',
  style,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: 'up' | 'left' | 'right';
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // useLayoutEffect (no useEffect): corre antes del primer pintado. Si el
  // elemento ya está en el viewport al montar —carga inicial por encima del
  // pliegue, o un salto directo a una sección por ancla (#precio, #faq)— lo
  // marcamos visible ya, sin esperar al primer callback async del
  // IntersectionObserver. Sin esto, esa sección aparecía un instante en su
  // estado "oculto" (opacidad baja) antes de revelarse, aunque ya estuviera
  // a la vista — se notaba como un fogonazo al entrar por ancla.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const yaVisible = r.top < window.innerHeight * 0.92 && r.bottom > 0;
    if (yaVisible) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden =
    from === 'left' ? 'translateX(-30px)' : from === 'right' ? 'translateX(30px)' : 'translateY(22px)';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : hidden,
        transition: `opacity .8s cubic-bezier(.2,.7,0,1) ${delay}ms, transform .8s cubic-bezier(.2,.7,0,1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, color = '#22251A' }: { children: React.ReactNode; color?: string }) {
  return (
    <Reveal
      className="lp-mono"
      style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color, marginBottom: 16 }}
    >
      {children}
    </Reveal>
  );
}

export function Chip({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className="lp-mono"
      style={{
        fontSize: 11.5,
        color: dark ? '#C2C9A8' : ACC,
        background: dark ? 'rgba(90,97,66,.16)' : ACC_SOFT,
        padding: '6px 12px',
        borderRadius: 999,
      }}
    >
      {children}
    </span>
  );
}

export function Avatar({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        flexShrink: 0,
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

// ─── Hover-lift card: translateY + shadow + a radial glow that follows the
// cursor, matching the source design's .tnt-lift treatment. Uses a plain
// mousemove handler writing CSS custom properties directly to the DOM node
// (no React state) so the glow tracks the pointer without re-rendering.

export function LiftCard({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }

  return (
    <div ref={ref} className={`tnt-lift${className ? ` ${className}` : ''}`} style={style} onMouseMove={onMouseMove}>
      {children}
    </div>
  );
}
