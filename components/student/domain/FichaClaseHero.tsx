'use client';

import { useRouter } from 'next/navigation';
import type { Clase } from '@/lib/student/tipos';
import { Foto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';

/**
 * La cabecera con foto de una clase: la comparten la ficha de una clase del
 * horario (`/reservar/[claseId]`) y la de una clase fija (`/clases-fijas/[sesionId]`),
 * que enseñan la misma clase para dos cosas distintas.
 *
 * Va con `StudentShell headerTransparente`: la foto sube hasta arriba y la
 * cabecera flota encima (el `marginTop: -56` de la página compensa su hueco).
 */
export function FichaClaseHero({ clase, chips, derecha }: { clase: Clase; chips: string[]; derecha?: React.ReactNode }) {
  const router = useRouter();
  return (
    // ⚠️ `background`: `clase.fotoUrl` puede no existir, y sin tinta detrás el
    // héroe degradaba a crema — título y cabecera en blanco sobre claro,
    // ilegibles. `#0F0F0C` es la misma tinta que el kit pone bajo la foto del
    // layout de acceso (`.st-auth-hero`).
    <section style={{ position: 'relative', height: 290, overflow: 'hidden', background: '#0F0F0C' }}>
      <Foto
        src={clase.fotoUrl}
        ancho={640}
        alto={290}
        sizes="(min-width:1024px) 1040px, (min-width:768px) 640px, 100vw"
        prioritaria
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'apKen 18s ease-in-out infinite' }}
      />
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,15,.36), rgba(15,15,15,0) 36%, rgba(15,15,15,0) 55%, rgba(15,15,15,.64))' }}
      />
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Volver"
        className="tap tap--icono"
        style={{ position: 'absolute', top: 'calc(56px + var(--safe-top))', left: 14, width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Icono nombre="flecha-izquierda" tamano={18} />
      </button>
      {derecha && <div style={{ position: 'absolute', top: 'calc(56px + var(--safe-top))', right: 14 }}>{derecha}</div>}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, color: '#fff' }}>
        {/* El LOGO de la clase: el banner HEREDA (tipo → sala → estudio), así que a
            menudo es la misma foto para todas y el logo es lo único que la
            identifica. No hereda a propósito: sin logo propio no se pinta nada. */}
        {clase.logoUrl && (
          <span
            aria-hidden
            data-testid="logo-clase"
            style={{
              display: 'block', width: 44, height: 44, borderRadius: 12, marginBottom: 9,
              background: `url(${clase.logoUrl}) center/cover`,
              border: '1px solid rgba(255,255,255,.5)',
            }}
          />
        )}
        <p className="t-label" style={{ color: 'rgba(255,255,255,.82)' }}>{clase.tipo} · nivel {clase.nivel.toLowerCase()}</p>
        <h1 style={{ margin: '3px 0 0', fontSize: 'var(--t-h1)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1.05 }}>{clase.nombre}</h1>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {chips.map((t) => (
            <span key={t} className="badge" style={{ background: 'rgba(250,249,245,.2)', border: '1px solid rgba(255,255,255,.45)', color: '#fff' }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
