// ─────────────────────────────────────────────────────────────────────────────
// La respuesta de GET /api/regalo, comprobada ANTES de pintarla (pestaña
// «Tarjeta regalo» de Paquetes, `components/regalo/panel-regalo.tsx`). Puro,
// sin `@/` (panel-datos.test.ts).
//
// La pestaña guardaba lo que llegara tal cual y luego leía `datos.tarjetas.length`:
// un 200 con otra forma (`{}` de un proxy, una versión del servidor a medias)
// tumbaba la pantalla de Paquetes entera con «Algo ha ido mal». Nada del panel
// puede dar por hecha la forma de una respuesta. Si no cuadra, `null`: la
// pestaña dice que no ha podido cargar y ofrece «Reintentar», como con un 500.
// Solo lectura: no toca la venta, el cobro ni el libro de la tarjeta.
// ─────────────────────────────────────────────────────────────────────────────

import type { AjustesRegalo } from './reglas.ts';
import type { TarjetaRegaloVista } from './servidor.ts';

export interface DatosPanelRegalo {
  ajustes: AjustesRegalo;
  tarjetas: TarjetaRegaloVista[];
  pasivoVivo: number;
  puedeEditarAjustes: boolean;
}

/** Lo que dice la pestaña cuando la lista no llega o llega con otra forma. */
export const NO_SE_HAN_PODIDO_CARGAR = 'No se han podido cargar las tarjetas regalo.';

type Objeto = Record<string, unknown>;
const esObjeto = (x: unknown): x is Objeto => typeof x === 'object' && x !== null && !Array.isArray(x);
const esNumero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const esTexto = (x: unknown): x is string => typeof x === 'string';
const esTextoONulo = (x: unknown) => x === null || x === undefined || esTexto(x);

function ajustesValidos(a: unknown): a is AjustesRegalo {
  return esObjeto(a)
    && typeof a.activo === 'boolean'
    && Array.isArray(a.importesEur) && a.importesEur.every(esNumero)
    && typeof a.permiteImporteLibre === 'boolean'
    && esNumero(a.importeMinEur) && esNumero(a.importeMaxEur) && esNumero(a.caducidadMeses)
    && esTextoONulo(a.terminos);
}

/** Lo que la pestaña lee de cada tarjeta (el resto de la fila puede faltar sin romper nada). */
function tarjetaValida(t: unknown): t is TarjetaRegaloVista {
  return esObjeto(t)
    && esTexto(t.id) && esTexto(t.estado_efectivo) && esTexto(t.caduca_en) && esTexto(t.origen)
    && esNumero(t.saldo) && esNumero(t.importe_inicial)
    && esTextoONulo(t.destinatario_nombre) && esTextoONulo(t.destinatario_email)
    && esTextoONulo(t.comprador_nombre) && esTextoONulo(t.comprador_email)
    && esTextoONulo(t.anulada_motivo);
}

/** La respuesta, si tiene la forma que pinta la pestaña; si no, `null`. */
export function leerDatosPanelRegalo(json: unknown): DatosPanelRegalo | null {
  if (!esObjeto(json)) return null;
  const { ajustes, tarjetas, pasivoVivo, puedeEditarAjustes } = json;
  if (!ajustesValidos(ajustes)) return null;
  if (!Array.isArray(tarjetas) || !tarjetas.every(tarjetaValida)) return null;
  if (!esNumero(pasivoVivo) || typeof puedeEditarAjustes !== 'boolean') return null;
  return { ajustes, tarjetas, pasivoVivo, puedeEditarAjustes };
}
