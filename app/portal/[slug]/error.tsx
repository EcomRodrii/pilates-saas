'use client';

// Pantalla de error del portal de la clienta. Marca blanca: aquí NO puede
// aparecer nada de Tentare — el portal es la app del estudio. Los estilos van
// en línea con neutros y `var(--portal-brand)` con fallback, a propósito: si
// el error vino del propio tema/contexto del portal, esta pantalla tiene que
// pintarse igual (no puede depender de useModo ni de los helpers de
// portal-design). Lenguaje visual del EstadoVacio del portal: círculo suave +
// icono fino + CTA cápsula.
import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[portal]', error);
  }, [error]);

  return (
    <div style={{ minHeight: '60dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 300, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--portal-surface-2, rgba(0,0,0,0.05))', color: 'var(--portal-muted, #6b6b6b)', marginBottom: 6,
          }}
        >
          <AlertCircle size={20} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--portal-ink, #1a1a1a)' }}>Algo ha ido mal</p>
        <p style={{ fontSize: 13, color: 'var(--portal-muted, #6b6b6b)', lineHeight: 1.5 }}>
          No hemos podido cargar esta pantalla. Inténtalo de nuevo en unos segundos.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 14, height: 46, padding: '0 22px', borderRadius: 23, border: 'none', cursor: 'pointer',
            background: 'var(--portal-brand, #131313)', color: 'var(--portal-brand-foreground, #ffffff)',
            fontSize: 13.5, fontWeight: 700,
          }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
