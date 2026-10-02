// Reserva metida por el MOSTRADOR desde el panel (`POST /api/reservas/crear`).
//
// Lo puro de la ruta vive aquí para poder probarlo sin Supabase: qué petición
// se acepta y quién puede apuntar a alguien en qué clase.
import { puedeMoverDinero, puedeOperarClase } from '../permisos-reglas.ts';
import type { Rol } from '../types.ts';

export interface PeticionReservaMostrador {
  sesionId: string;
  socioId: string;
  /** Lo genera el panel (`res-<uid>`): así un reintento del mismo intento es reconocible. */
  reservaId: string;
  /** «Avisar a la alumna». Solo un `false` explícito lo apaga. */
  avisar: boolean;
  /**
   * Lo mandaban las pestañas con el panel de #2467, que cobraban la clase
   * suelta como un recibo aparte. Ahora solo sirve para reconocerlas: sin
   * `claseSuelta`, la ruta les pide recargar (`MENSAJE_PANEL_VIEJO`). El
   * panel nuevo lo sigue mandando junto a
   * `claseSuelta` para que, si se volviera al servidor anterior, este supiera
   * no gastar un bono además de la clase suelta.
   */
  comoClaseSuelta: boolean;
  /**
   * Venderle la clase suelta al reservar (la PUNTUAL de una sesión que gasta
   * la reserva). `importeEsperado`: lo que dice el botón del mostrador.
   */
  claseSuelta: { importeEsperado: number } | null;
}

/**
 * Con qué venía de verdad a la clase quien el mostrador iba a cobrar como
 * suelta (la cartera leída por el servidor al reservar). Si llega, no se cobra.
 */
export interface CubiertaPor {
  tipo: 'BONO' | 'MENSUAL';
  /** El nombre del plan, para decírselo a recepción. */
  plan: string;
  /**
   * Lo que la cubre es una clase suelta que recuperó al cancelar a tiempo:
   * entra con ella, y `debe` es lo que aún debe de aquella (0 si está pagada;
   * `null` si no se ha podido leer: que se mire, no que se dé por pagada).
   */
  suelta?: { debe: number | null };
}

/** Una pestaña con el panel de antes de vender la clase suelta (#2467). */
export const MENSAJE_PANEL_VIEJO = 'Hay una versión nueva del panel: recarga la página para cobrar la clase suelta.';

/** La clase suelta vendida al reservar: su recibo PENDIENTE, que se cobra después. */
export interface VentaClaseSuelta {
  reciboId: string;
  importe: number;
  concepto: string;
}

const MAX_ID = 200;

function idValido(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && v.trim() === v ? v : null;
}

// ⚠️ `res-pf-` NO se acepta, y no es estética: es el prefijo de las plazas fijas
// materializadas, y `ejecutarCancelacionReserva` lo usa para decidir que al
// cancelar NO se devuelve bono y SÍ se da una recuperación. Una reserva normal
// con ese prefijo se cancelaría como plaza fija.
const RESERVA_ID = /^res-[A-Za-z0-9_-]{1,96}$/;

export function leerPeticionReservaMostrador(body: unknown):
  | { ok: true; datos: PeticionReservaMostrador }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Petición no válida' };
  const b = body as Record<string, unknown>;
  const sesionId = idValido(b.sesionId);
  if (!sesionId) return { ok: false, error: 'Falta la clase' };
  const socioId = idValido(b.socioId);
  if (!socioId) return { ok: false, error: 'Falta la clienta' };
  const reservaId = typeof b.reservaId === 'string' ? b.reservaId : '';
  if (!RESERVA_ID.test(reservaId) || reservaId.startsWith('res-pf-')) {
    return { ok: false, error: 'Identificador de reserva no válido' };
  }
  // Mismo criterio que `avisar === false` en app/api/sustituciones (acción
  // 'confirmar'): ante la duda, se avisa. Un cliente viejo que no mande el
  // campo no deja a nadie sin enterarse.
  // Un importe que no es un número positivo no vende nada: se rechaza, no se ignora.
  let claseSuelta: { importeEsperado: number } | null = null;
  if (b.claseSuelta != null) {
    const importe = (b.claseSuelta as { importeEsperado?: unknown }).importeEsperado;
    if (typeof importe !== 'number' || !Number.isFinite(importe) || importe <= 0) {
      return { ok: false, error: 'Importe de la clase suelta no válido' };
    }
    claseSuelta = { importeEsperado: importe };
  }
  return {
    ok: true,
    datos: { sesionId, socioId, reservaId, avisar: b.avisar !== false, comoClaseSuelta: b.comoClaseSuelta === true, claseSuelta },
  };
}

/**
 * ¿Puede vender una clase suelta al apuntar? Mueve dinero (crea un recibo y
 * luego se cobra), así que además de apuntar hace falta poder mover dinero.
 */
export function puedeVenderClaseSuelta(rol: Rol): boolean {
  return puedeApuntarEnClase(rol) && puedeMoverDinero(rol);
}

/**
 * ¿Puede este miembro del equipo apuntar a alguien en una clase desde el panel?
 *
 * PROPIETARIO, MANAGER y RECEPCION en cualquier clase. INSTRUCTOR en ninguna,
 * tampoco en las suyas: Tentare Core se retiró (14-sep-2026) y la ruta ya no
 * resuelve su ficha. Con service-role la guardia de `reservar_plaza` no corre,
 * por eso la comprueba la ruta.
 */
export function puedeApuntarEnClase(rol: Rol): boolean {
  return puedeOperarClase(rol);
}
