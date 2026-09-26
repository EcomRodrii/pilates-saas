// «Tentare Widgets»: el embudo POR WIDGET, a partir de las filas crudas de
// `embudo_widget_por_origen` (origen, tipo, n). Puro: lo usan «Cómo le va a tu
// página» y el constructor, y se prueba con `node --test`.
//
// La etiqueta es la que pone el constructor en el código (`web-<widget>`), o
// una propia que la propietaria escribió (Avanzado → Etiqueta de seguimiento).
// Una etiqueta no se puede atribuir a un widget si no es la de por defecto:
// se enseña tal cual, sin adivinar.
//
// Mismas definiciones que el embudo general (tab-crecimiento-web.tsx), para
// que las dos pantallas no se contradigan: visitas = `widget_loaded`,
// reservas completadas = `booking_completed` (la compra de un plan se confirma
// por webhook y NO entra aquí).

import { WIDGETS } from './catalogo.ts';

export interface FilaEmbudoOrigen {
  origen: string | null;
  tipo: string;
  n: number;
}

export interface EmbudoWidget {
  /** La etiqueta tal cual (`null` = códigos sin etiqueta, pegados antes). */
  etiqueta: string | null;
  /** El widget del catálogo si la etiqueta es la suya por defecto. */
  widgetId: string | null;
  nombre: string;
  visitas: number;
  /** Tocaron una clase o abrieron su ficha. */
  interacciones: number;
  reservasIniciadas: number;
  reservasCompletadas: number;
  comprasIniciadas: number;
  /**
   * Reservas completadas / visitas, en %, con un decimal. `null` sin visitas,
   * y `null` en los widgets de VENTA: la compra de un plan se confirma por el
   * webhook de Stripe y no entra en este embudo, así que su «0 %» mentiría.
   */
  conversion: number | null;
}

const PREFIJO = 'web-';

export function nombreDeEtiqueta(etiqueta: string | null): { widgetId: string | null; nombre: string } {
  if (etiqueta === null) return { widgetId: null, nombre: 'Sin etiqueta (códigos anteriores)' };
  if (etiqueta.startsWith(PREFIJO)) {
    const w = WIDGETS.find(x => x.id === etiqueta.slice(PREFIJO.length));
    if (w) return { widgetId: w.id, nombre: w.nombre };
  }
  return { widgetId: null, nombre: `Etiqueta «${etiqueta}»` };
}

export function embudoPorWidget(filas: readonly FilaEmbudoOrigen[]): EmbudoWidget[] {
  const porEtiqueta = new Map<string | null, Map<string, number>>();
  for (const f of filas) {
    // Una etiqueta vacía o con espacios no es una etiqueta.
    const clave = f.origen?.trim() ? f.origen.trim() : null;
    const tipos = porEtiqueta.get(clave) ?? new Map<string, number>();
    tipos.set(f.tipo, (tipos.get(f.tipo) ?? 0) + f.n);
    porEtiqueta.set(clave, tipos);
  }
  const out: EmbudoWidget[] = [];
  for (const [etiqueta, tipos] of porEtiqueta) {
    const n = (t: string) => tipos.get(t) ?? 0;
    const visitas = n('widget_loaded');
    const reservasCompletadas = n('booking_completed');
    const nombre = nombreDeEtiqueta(etiqueta);
    const deVenta = nombre.widgetId !== null && WIDGETS.find(w => w.id === nombre.widgetId)?.categoria === 'venta';
    out.push({
      etiqueta,
      ...nombre,
      visitas,
      interacciones: n('class_selected') + n('class_detail_viewed'),
      reservasIniciadas: n('booking_started'),
      reservasCompletadas,
      comprasIniciadas: n('checkout_started'),
      conversion: visitas > 0 && !deVenta ? Math.round((reservasCompletadas / visitas) * 1000) / 10 : null,
    });
  }
  // Lo que más se ve, arriba; lo sin etiqueta, siempre al final.
  return out.sort((a, b) =>
    Number(a.etiqueta === null) - Number(b.etiqueta === null) || b.visitas - a.visitas || a.nombre.localeCompare(b.nombre, 'es'));
}
