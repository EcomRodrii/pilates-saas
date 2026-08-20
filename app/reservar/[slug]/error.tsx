'use client';

// Pantalla de error del widget público de reservas — la superficie que el
// estudio incrusta en su web, donde una socia con el widget roto se va y no
// lo cuenta. Antes caía al global-error raíz (fondo oscuro, marca Tentare).
// Variables --portal-* con fallback a neutros y fuente de sistema: si la
// paleta del estudio sobrevive al error se respeta (temas oscuros incluidos),
// y si el fallo se llevó el tema por delante cae a neutros legibles. Círculo
// 52px + icono, el patrón único de "estado no feliz" del widget
// (reserva-calendario.tsx).
import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function ReservarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[reservar]', error);
  }, [error]);

  return (
    <div style={{ minHeight: '50dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 300, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--portal-surface-2, #f4f4f3)', color: 'var(--portal-muted, #6b6b6b)', marginBottom: 6,
          }}
        >
          <AlertCircle size={20} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--portal-ink, #1a1a1a)' }}>No hemos podido cargar el horario</p>
        <p style={{ fontSize: 13, color: 'var(--portal-muted, #6b6b6b)', lineHeight: 1.5 }}>
          Parece un problema temporal. Inténtalo de nuevo en unos segundos.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 14, height: 44, padding: '0 22px', borderRadius: 22, cursor: 'pointer',
            border: '1px solid var(--portal-line, #d9d9d6)', background: 'var(--portal-surface, #ffffff)', color: 'var(--portal-ink, #1a1a1a)',
            fontSize: 13.5, fontWeight: 700,
          }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
