'use client';

// Pantalla de bienvenida a pantalla completa — tema "Editorial" (galería de
// temas). Se muestra UNA vez por dispositivo, antes del login, solo para
// estudios con `tabBarStyle: 'pestanaActiva'`. Ver app/portal/[slug]/login/page.tsx
// (gate) y lib/portal-bienvenida.ts (lógica pura de "¿ya la vio?").
//
// Una sola pantalla, no un wizard de varios pasos — el resto del contenido
// (horario, mis reservas, perfil...) ya vive en sus propias pantallas del
// portal, no hace falta reconstruirlo aquí.

import { useModo } from '@/lib/portal-modo';
import { display, texto, altura, radio, sombra, transicion, dur } from '@/lib/portal-design';

export function BienvenidaPortal({
  nombreEstudio, fotoUrl, onSiguiente,
}: {
  nombreEstudio: string; fotoUrl: string | null; onSiguiente: () => void;
}) {
  const { t, noche } = useModo();

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: t.bg, color: t.ink }}>
      <div style={{ position: 'absolute', inset: 0, background: fotoUrl ? t.surface2 : t.hero }}>
        {fotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `linear-gradient(180deg, transparent 34%, ${noche ? 'rgba(18,20,14,.9)' : 'rgba(246,244,239,.96)'} 78%, ${noche ? 'rgba(18,20,14,1)' : 'rgba(246,244,239,1)'} 100%)`,
        }}
      />

      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5,
          padding: '0 22px calc(22px + env(safe-area-inset-bottom))',
        }}
      >
        <h1 style={{ ...display(38, false, 1.08), color: t.ink, marginBottom: 10 }}>
          Empieza donde estás.
        </h1>
        <p style={{ ...texto.meta, color: t.muted, marginBottom: 24 }}>
          Reserva tu clase, lleva tu bono y entra con el pase — todo en {nombreEstudio}.
        </p>

        <button
          onClick={onSiguiente}
          style={{
            width: '100%', height: altura.botonAcceso, borderRadius: radio.hoja,
            background: noche ? t.surface2 : '#FFFFFF', boxShadow: sombra.hojaAcceso,
            border: 'none', cursor: 'pointer', padding: '0 8px 0 26px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: transicion(['transform']),
          }}
        >
          <span style={{ ...texto.boton, color: t.ink }}>Siguiente</span>
          <span
            aria-hidden
            style={{
              width: 50, height: 50, borderRadius: '50%', background: 'var(--portal-brand)',
              color: 'var(--portal-brand-foreground)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 17, transition: transicion(['transform'], dur.color),
            }}
          >
            →
          </span>
        </button>
      </div>
    </div>
  );
}
