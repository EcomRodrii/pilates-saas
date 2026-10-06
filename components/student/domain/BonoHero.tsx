'use client';

import Link from 'next/link';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';
import type { Bono } from '@/lib/student/tipos';
import { saldoBono } from '@/lib/student/saldo-bono';
import { textoCaducidadHeroe, textoPrecioPorClase, textoReservadas, textoSirvePara } from '@/lib/student/bonos-vista';

// El bono que se gasta primero, en grande (P4-C, maqueta app-alumna-2): el anillo con lo que le queda, «de M» solo si
// es verdad (`saldoBono`), la caducidad, para qué clases sirve, las que ya tiene reservadas con él (ya descontadas) y
// «X € por clase» solo cuando se sabe (`precioPorClaseDe`). Los demás bonos siguen con su tarjeta de siempre.
//
// ⚠️ El anillo son dos `<circle>` y la cifra va en HTML encima: sin `<path>` sueltos (la guardia de iconos) y la cifra
// se lee y se mide como texto (`bono-restantes`, `--t-display`, el mismo testid que la tarjeta).
// ⚠️ Con una sesión o menos el anillo va en `--warning`, como la barra de la tarjeta: nunca el verde de «ha ido bien».
export function BonoHero({ bono, reservadas, nombresTipo, hoy, hrefDetalle, hrefMisClases }: {
  bono: Bono;
  /** Sus próximas clases ya pagadas con este bono (`reservadasConBono`). */
  reservadas: { fecha: string }[];
  nombresTipo: Record<string, string>;
  hoy: string;
  hrefDetalle: string;
  hrefMisClases: string;
}) {
  const { quedan, de } = saldoBono(bono);
  const base = de ?? (bono.sesionesDelPlan && bono.sesionesDelPlan > 0 ? bono.sesionesDelPlan : Math.max(quedan, 1));
  const pct = Math.max(0, Math.min(1, quedan / base));
  const r = 46;
  const c = 2 * Math.PI * r;
  const pocas = quedan <= 1;
  const precio = textoPrecioPorClase(bono);
  const yaReservadas = textoReservadas(reservadas);
  return (
    <section
      data-testid="bono-hero"
      aria-label={`Tu ${bono.nombre}`}
      style={{ background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', borderRadius: 'var(--radius-hero)', padding: 18, boxShadow: 'var(--shadow-hero)' }}
    >
      <Link href={hrefDetalle} transitionTypes={TRANSICION_ADELANTE} className="tap" style={{ display: 'flex', gap: 14, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
        <span style={{ position: 'relative', width: 112, height: 112, flexShrink: 0 }}>
          <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden data-testid="anillo-bono">
            <circle cx="56" cy="56" r={r} fill="none" stroke="color-mix(in srgb, var(--accent-deep-foreground) 18%, transparent)" strokeWidth="10" />
            <circle
              data-testid="anillo-progreso"
              cx="56" cy="56" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
              style={{ stroke: pocas ? 'var(--warning)' : 'var(--accent-deep-foreground)' }}
              strokeDasharray={`${pct * c} ${c}`} transform="rotate(-90 56 56)"
            />
          </svg>
          <span className="t-display t-num" data-testid="bono-restantes" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-dark)' }}>
            {quedan}
          </span>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="t-label" style={{ display: 'block', color: 'var(--accent-deep-muted)' }}>{bono.nombre}</span>
          {/* «Te quedan» ENCIMA de la cifra, como la tarjeta: «5 · de 8» solo se leería «llevo 5 hechas». */}
          <span className="t-title" style={{ display: 'block', marginTop: 4, color: 'var(--on-dark)' }}>Te quedan</span>
          {de != null && <span className="t-small" style={{ display: 'block', marginTop: 2 }}>de {de} {de === 1 ? 'sesión' : 'sesiones'}</span>}
        </span>
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 14, paddingTop: 12, borderTop: '1px solid color-mix(in srgb, var(--accent-deep-foreground) 18%, transparent)', fontSize: 'var(--t-small)' }}>
        <span data-testid="bono-caduca">{textoCaducidadHeroe(bono, hoy)}</span>
        {precio && <span data-testid="bono-precio-clase" style={{ color: 'var(--accent-deep-muted)' }}>{precio}</span>}
      </div>
      <p className="t-small" style={{ margin: '8px 0 0', color: 'var(--accent-deep-muted)' }}>{textoSirvePara(bono, nombresTipo)}</p>
      {yaReservadas && (
        <Link href={hrefMisClases} className="tap" data-testid="bono-reservadas" style={{ display: 'block', marginTop: 8, fontSize: 'var(--t-small)', fontWeight: 700, color: 'inherit', textDecoration: 'underline' }}>
          {yaReservadas}
        </Link>
      )}
    </section>
  );
}
