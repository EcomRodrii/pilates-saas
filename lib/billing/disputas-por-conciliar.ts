// ─────────────────────────────────────────────────────────────────────────────
// Qué hacer con cada recibo que tiene una disputa conocida, en el barrido de
// `conciliarDisputasAbiertasEstudio` (lib/inngest/conciliar-reembolsos.ts).
//
// Vive aparte y sin Stripe ni BD porque es lo único del barrido que DECIDE
// algo, y el cron importa con `@/` (no se puede cargar bajo `node --test`).
//
// Además de las disputas abiertas de siempre, rescata la disputa PERDIDA que se
// quedó a medio aplicar. `procesarDisputeClosed` escribe en dos pasos
// (`disputa_estado` y después `estado = 'DEVUELTO'`) y luego anota la
// devolución: si el proceso muere entre medias, el recibo queda `lost` sin el
// resto, y ni el webhook (ya respondió 200) ni el otro barrido (ventana de 24 h
// sobre una disputa que se resuelve semanas después) vuelven a pasar por él.
// Una disputa SEPA que llega ya como `lost` al crearse deja el mismo rastro.
//
// ⚠️ `lost` + estado ≠ DEVUELTO NO basta para rescatar: la propietaria puede
// cobrar a mano un recibo DEVUELTO (`dbMarcarCobrado` lo admite) y ese recibo
// queda `lost` + COBRADO con toda la razón. Lo que distingue los dos casos:
//   · la fila de `devoluciones` con referencia `dispute:<id>` — solo existe si
//     el cierre llegó a aplicarse entero;
//   · `fecha_devolucion` — la pone el paso a DEVUELTO y el cobro manual no la
//     borra (solo la limpia el fallo de reembolso D-8, que ya excluye `lost`).
// Ante la duda, no se toca el estado del dinero: se avisa a Sentry.
// ─────────────────────────────────────────────────────────────────────────────
import { referenciaDevolucion } from './registrar-devolucion.ts';

/** Estados de Stripe en los que la disputa ya no va a cambiar. */
export const ESTADOS_DISPUTA_CERRADA: readonly string[] = ['lost', 'won', 'warning_closed', 'prevented'];

/**
 * Cerradas que el barrido ya no necesita volver a mirar nunca: todas menos
 * `lost`, que se sigue trayendo para poder rescatarla.
 */
export const ESTADOS_DISPUTA_SIN_RESCATE: readonly string[] = ESTADOS_DISPUTA_CERRADA.filter(e => e !== 'lost');

/**
 * Días naturales, contados desde `fecha_devolucion`, durante los que se sigue
 * mirando un recibo que YA pasó por DEVUELTO: para reintentar anotar su
 * chargeback, o para avisar si alguien lo cambió a mano sin que se anotara.
 * Acotado para no fabricar tarjetas ni avisos de disputas antiguas, para que el
 * aviso de un caso dudoso no se repita cada 2 h para siempre, y para que la
 * lista de referencias a comprobar no crezca con cada recibo cobrado a mano.
 */
export const VENTANA_RESCATE_DEVUELTO_DIAS = 7;

export interface ReciboConDisputa {
  id: string;
  disputa_stripe_id: string;
  disputa_estado: string | null;
  estado: string;
  fecha_devolucion: string | null;
}

/**
 * - `consultar`: disputa abierta — preguntar a Stripe si ya se cerró.
 * - `rescatar`: perdida a medio aplicar — volver a pasar por `procesarDisputeClosed`.
 * - `dudosa`: perdida, sin anotar, pero con señales de que alguien tocó el
 *   recibo a mano — solo avisar.
 * - `ignorar`: nada que hacer.
 */
export type AccionDisputa = 'consultar' | 'rescatar' | 'dudosa' | 'ignorar';

// `recibos.fecha_devolucion` es de tipo `date`: se compara como fecha
// (`YYYY-MM-DD`, que ordena igual como texto), no con milisegundos — si no, la
// ventana real quedaría en «entre 6 y 7 días» según la hora del cron.
function dentroDeVentana(fecha: string, ahora: Date): boolean {
  const limite = new Date(ahora.getTime() - VENTANA_RESCATE_DEVUELTO_DIAS * 86_400_000).toISOString().slice(0, 10);
  return fecha.slice(0, 10) >= limite;
}

/** ¿Hace falta mirar en `devoluciones` para decidir sobre este recibo? */
function necesitaComprobarAnotacion(rec: ReciboConDisputa, ahora: Date): boolean {
  if (rec.disputa_estado !== 'lost') return false;
  // Sin fecha: nunca llegó a pasar a DEVUELTO. Si no está DEVUELTO, es el caso
  // a rescatar y no caduca (la disputa pudo cerrarse hace semanas).
  if (!rec.fecha_devolucion) return rec.estado !== 'DEVUELTO';
  return dentroDeVentana(rec.fecha_devolucion, ahora);
}

/**
 * Referencias de chargeback que hay que buscar en `devoluciones` antes de
 * clasificar. Vacío en el régimen normal (perdidas ya DEVUELTAS hace tiempo),
 * así que la consulta extra solo se hace cuando hay algo que decidir.
 */
export function referenciasChargebackPorComprobar(recibos: ReciboConDisputa[], ahora: Date): string[] {
  return recibos
    .filter(r => necesitaComprobarAnotacion(r, ahora))
    .map(r => referenciaDevolucion({ tipo: 'chargeback', disputeId: r.disputa_stripe_id }));
}

/**
 * @param anotadas referencias de `devoluciones` ya existentes para el estudio;
 *   `null` si no se pudieron leer — entonces ninguna perdida se rescata
 *   (sin saber si ya se aplicó, no se mueve el estado de un recibo).
 */
export function clasificarReciboConDisputa(
  rec: ReciboConDisputa, anotadas: ReadonlySet<string> | null, ahora: Date,
): AccionDisputa {
  if (!rec.disputa_estado || !ESTADOS_DISPUTA_CERRADA.includes(rec.disputa_estado)) return 'consultar';
  if (rec.disputa_estado !== 'lost') return 'ignorar';
  if (!necesitaComprobarAnotacion(rec, ahora) || !anotadas) return 'ignorar';
  if (anotadas.has(referenciaDevolucion({ tipo: 'chargeback', disputeId: rec.disputa_stripe_id }))) return 'ignorar';

  if (rec.estado === 'DEVUELTO') return 'rescatar'; // pasó a DEVUELTO y murió antes de anotar.
  return rec.fecha_devolucion ? 'dudosa' : 'rescatar';
}
