'use client';

import { useOnline } from '@/lib/student/useOnline';

/**
 * Banner fijo bajo el header. Literal del paquete (`components/shell/OfflineBanner.tsx`),
 * con el copy exacto del handoff §H.
 *
 * Offline = solo lectura. Este banner ANUNCIA la regla; quien la impone son los
 * botones de cada acción crítica, que se deshabilitan por su cuenta.
 */
export function OfflineBanner({ sinCabecera = false }: {
  /**
   * La pantalla no tiene la barra del estudio (la ficha de una clase). Pegado con `sticky` ocupaba su hueco en el
   * flujo y empujaba la foto hacia abajo, dejando una franja crema arriba; sin la barra encima, esa franja se veía.
   * Ahí va fijo y no ocupa sitio: debajo de la fila de volver · favorita · compartir.
   */
  sinCabecera?: boolean;
} = {}) {
  const { online, reconectando } = useOnline();
  if (online && !reconectando) return null;

  const aviso = (
    <div
      role="status"
      aria-live="polite"
      style={{
        ...(sinCabecera ? {} : { position: 'sticky' as const, top: 'calc(56px + var(--safe-top))', zIndex: 45 }),
        margin: '0 18px',
        display: 'flex', alignItems: 'center', gap: 9,
        background: reconectando ? 'var(--accent-soft)' : 'var(--primary)',
        color: reconectando ? 'var(--accent-soft-foreground)' : 'var(--primary-foreground)',
        borderRadius: 12, padding: '9px 13px', fontSize: 'var(--t-small)', fontWeight: 700,
        animation: 'apSlideDown .35s var(--ease) both',
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: reconectando ? 'var(--success)' : 'var(--warning)', animation: 'apPulse 1.6s infinite' }} />
      {reconectando ? 'Conexión recuperada · actualizando' : 'Sin conexión — puedes consultar, pero no reservar ni pagar'}
    </div>
  );
  if (!sinCabecera) return aviso;
  // Fijo con el mismo ancho que el shell (`ancho-shell`, como la cabecera), por debajo de los controles de la foto.
  return (
    <div className="ancho-shell" style={{ position: 'fixed', top: 'calc(56px + var(--safe-top))', width: '100%', zIndex: 45 }}>
      {aviso}
    </div>
  );
}
