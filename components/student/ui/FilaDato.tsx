import type { ReactNode } from 'react';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

/**
 * Una fila de dato con su icono, SIN baldosa (P15): el icono de 20 px en el acento del estudio, alineado con la
 * primera línea, el texto y, si hace falta, una segunda línea y una acción («Cómo llegar»). Es la de la ficha de una
 * clase. La de la baldosa redonda (Fija, la cuota) es `FilaAccion`, y la de Perfil, `ProfileSection` + `BaldosaIcono`.
 *
 * Solo tokens del estudio: el color lo pone su tema, nunca uno fijo.
 */
export function FilaDato({ icono, fila, children, sub, accion }: {
  icono: NombreIcono;
  /** Para los tests (`data-fila`): qué dato es. */
  fila: string;
  children: ReactNode;
  sub?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div data-fila={fila} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '11px 0' }}>
      <span aria-hidden style={{ display: 'flex', flexShrink: 0, marginTop: 1, color: 'var(--accent)' }}>
        <Icono nombre={icono} tamano={20} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="t-body" style={{ margin: 0 }}>{children}</p>
        {sub && <p className="t-meta" style={{ margin: '2px 0 0' }}>{sub}</p>}
        {accion && <div style={{ marginTop: 4 }}>{accion}</div>}
      </div>
    </div>
  );
}
