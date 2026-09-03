'use client';

// Pantalla de bienvenida — RÉPLICA EXACTA del prototipo "Tentare Studio App"
// (pantalla «Muévete. Lo demás, ya está.»). Estilos literales a propósito:
// esta pantalla NO pasa por lib/portal-design.ts para que no pueda desviarse.
// Misma API pública que la versión anterior: se monta igual desde el gate.
//
// Prototipo, medidas clave:
//  · Foto a sangre + gradiente OSCURO (texto claro encima — no lavado a crema)
//  · Volanta mono 9.5px uppercase tracking .2em: "STUDIO ALMA · BARCELONA"
//  · Titular 3 líneas, 34px/800, tracking -.03em, blanco #FAF9F5
//  · Sub 13px rgba(250,249,245,.85)
//  · CTA: cápsula BLANCA h52, texto tinta 14.5/800, "Empezar"
//  · Secundario: "Ya tengo cuenta" 12.5/700 blanco, sin caja
//  · Entrada: fade+up escalonado (apUp .5s, delays 0/.1/.2/.3s)

import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';

const JAKARTA = "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace";

export function BienvenidaPortal({
  nombreEstudio, fotoUrl, onSiguiente, onYaTengoCuenta, ciudad, variante = 'foto',
}: {
  nombreEstudio: string; fotoUrl: string | null; onSiguiente: () => void;
  /** Si no se pasa, el enlace secundario también llama a onSiguiente. */
  onYaTengoCuenta?: () => void;
  /** Volanta: "STUDIO ALMA · BARCELONA". Sin ciudad, solo el nombre. */
  ciudad?: string;
  variante?: 'foto' | 'marca';
}) {
  const irLogin = onYaTengoCuenta ?? onSiguiente;
  const volanta = [nombreEstudio, ciudad].filter(Boolean).join(' · ').toUpperCase();
  const esMarca = variante === 'marca';

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: esMarca ? 'var(--portal-brand)' : '#0F0F0C', fontFamily: JAKARTA }}>
      <style>{`@keyframes bpUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.bp-anim{animation:none!important}}`}</style>

      {!esMarca && (
        <>
          <div style={{ position: 'absolute', inset: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagenDeEstudio('vertical', fotoUrl)}
              alt=""
              onError={alFallarImagen(IMAGENES_POR_DEFECTO.vertical[0])}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'var(--portal-foto-pos, center center)', display: 'block' }}
            />
          </div>
          {/* Gradiente del prototipo: oscurece arriba (logo) y abajo (texto), foto visible en medio */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(8,8,8,.42) 0%, rgba(8,8,8,.05) 26%, rgba(8,8,8,.02) 48%, rgba(8,8,8,.66) 82%, rgba(8,8,8,.82) 100%)' }} />
        </>
      )}
      {esMarca && (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(255,255,255,.10) 0%, transparent 46%, rgba(0,0,0,.22) 100%)' }} />
      )}

      {/* Logo del estudio arriba-izquierda, como el prototipo */}
      <div className="bp-anim" style={{ position: 'absolute', top: 'calc(18px + env(safe-area-inset-top))', left: 20, zIndex: 5, color: '#FAF9F5', fontSize: 15, fontWeight: 800, letterSpacing: '-.02em', animation: 'bpUp .5s both' }}>
        {nombreEstudio}
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5, padding: '0 22px calc(20px + env(safe-area-inset-bottom))' }}>
        {volanta && (
          <p className="bp-anim" style={{ margin: '0 0 12px', fontFamily: MONO, fontSize: 9.5, fontWeight: 500, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(250,249,245,.75)', animation: 'bpUp .5s .1s both' }}>
            {volanta}
          </p>
        )}
        <h1 className="bp-anim" style={{ margin: '0 0 10px', fontSize: 34, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.06, color: '#FAF9F5', animation: 'bpUp .55s .18s both' }}>
          Muévete.<br />Lo demás,<br />ya está.
        </h1>
        <p className="bp-anim" style={{ margin: '0 0 22px', fontSize: 13, lineHeight: 1.55, color: 'rgba(250,249,245,.85)', maxWidth: '30ch', animation: 'bpUp .55s .26s both' }}>
          Reserva, bono y acceso a tu estudio en una sola app.
        </p>
        <button
          className="bp-anim"
          onClick={onSiguiente}
          style={{
            width: '100%', height: 52, border: 'none', borderRadius: 999, cursor: 'pointer',
            background: '#FAF9F5', color: '#1A1A1A', fontFamily: JAKARTA, fontSize: 14.5, fontWeight: 800,
            boxShadow: '0 14px 30px -10px rgba(8,8,8,.5)', transition: 'transform .2s cubic-bezier(.2,.7,0,1)',
            animation: 'bpUp .55s .34s both',
          }}
          onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(.97)'; }}
          onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; }}
        >
          Empezar
        </button>
        <button
          className="bp-anim"
          onClick={irLogin}
          style={{
            width: '100%', marginTop: 6, padding: 12, border: 'none', background: 'none', cursor: 'pointer',
            color: 'rgba(250,249,245,.92)', fontFamily: JAKARTA, fontSize: 12.5, fontWeight: 700,
            animation: 'bpUp .55s .4s both',
          }}
        >
          Ya tengo cuenta
        </button>
      </div>
    </div>
  );
}
