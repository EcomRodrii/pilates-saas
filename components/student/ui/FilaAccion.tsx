import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

/**
 * Una fila de acción con su icono en BALDOSA redonda (la de la maqueta app-alumna-2): qué es, una segunda línea y, si
 * toca, su botón. Tocar la fila hace lo suyo: `href` la convierte en enlace, `onClick` en botón (las dos llevan el
 * chevron); sin ninguna de las dos, la fila no se toca y `accion` va a la derecha.
 *
 * La usan «Tu clase fija» (Mis clases → Fijas) y la cuota en Bonos. La de dato SIN baldosa es `FilaDato` (la ficha de
 * una clase) y la de Perfil, `ProfileSection` + `BaldosaIcono`.
 */
export function FilaAccion({ icono, titulo, detalle, accion, onClick, href, acento, peligro, disabled, testId }: {
  icono: NombreIcono; titulo: string; detalle?: string; accion?: ReactNode; onClick?: () => void;
  /** Lleva a esta ruta (ya resuelta con `usePortalHref`). */
  href?: string;
  acento?: boolean; peligro?: boolean; disabled?: boolean; testId?: string;
}) {
  const dentro = (
    <>
      <span aria-hidden style={{
        width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        // ⚠️ Lo rojo va en la pareja `--destructive-foreground` sobre `--destructive-soft`, la de `btn--danger`:
        // `--destructive` en texto sobre la tarjeta no llega a AA con el estilo «Carbón» (3,4:1), que no lo redefine.
        background: peligro ? 'var(--destructive-soft)' : acento ? 'var(--accent-soft)' : 'var(--muted)',
        color: peligro ? 'var(--destructive-foreground)' : acento ? 'var(--accent-soft-foreground)' : 'var(--foreground)',
      }}>
        <Icono nombre={icono} tamano={20} />
      </span>
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 'var(--t-body)', fontWeight: peligro ? 700 : 800, color: 'var(--foreground)' }}>{titulo}</span>
        {detalle && <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{detalle}</span>}
      </span>
    </>
  );
  const chevron = <span aria-hidden style={{ color: 'var(--subtle-foreground)', display: 'flex' }}><Icono nombre="chevron-derecha" tamano={18} /></span>;
  const fila: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', width: '100%' };
  return (
    <div data-testid={testId} style={{ borderTop: '1px solid var(--border)', marginTop: -1 }}>
      {href ? (
        <Link href={href} className="tap" style={{ ...fila, color: 'inherit', textDecoration: 'none' }}>
          {dentro}
          {chevron}
        </Link>
      ) : onClick ? (
        <button type="button" className="tap" onClick={onClick} disabled={disabled} style={{ ...fila, border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', opacity: disabled ? 0.6 : 1 }}>
          {dentro}
          {!peligro && chevron}
        </button>
      ) : (
        <div style={fila}>{dentro}{accion}</div>
      )}
    </div>
  );
}
