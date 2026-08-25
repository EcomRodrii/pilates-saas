'use client';

// Pantalla de error de la vista previa del editor de temas. Sin esto, un
// fallo de render en cualquier pantalla del iframe (`/portal-preview/[slug]/
// ...`) se quedaba sin boundary local: ni cambiar de pantalla en el selector
// del editor ni corregir el dato que lo causó lo recuperaba — solo un F5
// completo, sin ningún aviso visible de que algo se había roto (C3 de la
// auditoría de uso real, 2026-08-24). Mismo patrón que
// app/portal/[slug]/error.tsx y app/reservar/[slug]/error.tsx: estilos en
// línea con `var(--portal-*)` y fallback, porque el error puede venir del
// propio tema que se está editando.
import { useEffect } from 'react';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { AlertCircle } from 'lucide-react';

export default function PortalPreviewError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[portal-preview]', error);
    // Sin esta línea el fallo NO llega a Sentry: app/global-error.tsx es el
    // único que reporta, y en cuanto un error.tsx de segmento ATRAPA el error
    // el global-error ya no se monta.
    capturarExcepcion(error, { tags: { area: 'portal-preview' }, extra: { digest: error.digest } });
  }, [error]);

  return (
    <div style={{ minHeight: '60dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 280, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--portal-surface-2, rgba(0,0,0,0.05))', color: 'var(--portal-muted, #6b6b6b)', marginBottom: 6,
          }}
        >
          <AlertCircle size={20} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-ink, #1a1a1a)' }}>Esta vista previa no ha podido cargar</p>
        <p style={{ fontSize: 13, color: 'var(--portal-muted, #6b6b6b)', lineHeight: 1.5 }}>
          Puede que un dato del borrador (por ejemplo, una imagen) no sea válido. Revisa lo último que cambiaste o inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 14, height: 44, padding: '0 22px', borderRadius: 22, border: 'none', cursor: 'pointer',
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
