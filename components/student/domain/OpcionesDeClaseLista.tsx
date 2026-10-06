import type { OpcionDeClase } from '@/lib/reservar/opciones-de-clase';
import { euros } from '@/lib/student/formato';

/**
 * Las formas de venir a esta clase pagando aquí, con su precio (P01/P02, bloque de dinero). Solo se LEEN: el gesto de
 * pagar es «Ver cómo venir» en la hoja o «Ver opciones» en «Cómo vienes», que llevan a la tienda con esta clase. Sin
 * botones a propósito (antes de la barra fija no puede haber ninguno con «reservar»).
 *
 * Los precios son los de la tarifa (`opcionesDeClase`), la MISMA regla con que cobra el servidor; el código y la
 * matrícula, si los hay, se suman al pagar y se enseñan en el desglose.
 */
export function OpcionesDeClaseLista({ opciones }: { opciones: readonly OpcionDeClase[] }) {
  const visibles = opciones.filter((o) => !o.noPagable).slice(0, 3);
  if (visibles.length === 0) return null;
  return (
    <ul className="card" data-testid="opciones-de-clase" aria-label="Cómo venir a esta clase" style={{ listStyle: 'none', margin: 0, padding: '4px 14px' }}>
      {visibles.map((o, i) => (
        <li
          key={o.planId}
          data-plan={o.planId}
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>{o.tipo === 'suelta' ? 'Clase suelta' : o.nombre}</p>
            <p className="t-meta" style={{ margin: '1px 0 0' }}>
              {o.tipo === 'suelta'
                ? 'Solo esta clase'
                : `${o.sesiones} clases · ${euros(o.precioPorClase)}/clase${o.ahorroPct ? ` · ahorras un ${o.ahorroPct} %` : ''}`}
            </p>
          </div>
          <span className="t-num no-shrink" style={{ fontWeight: 800 }}>{euros(o.importe)}</span>
        </li>
      ))}
    </ul>
  );
}
