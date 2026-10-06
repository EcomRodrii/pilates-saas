// Lo que dicen el héroe del bono y la cabecera de la cuota en Bonos (P4-C y E, maqueta app-alumna-2, 5-oct-2026).
// Puro, sin `@/` y con imports relativos con `.ts`: lo prueba `node --test` (bonos-vista.test.ts).
//
// ⚠️ La regla de todo este fichero es la de la app: sin un dato que lo sostenga, no se dice. La maqueta mentía en
// cuatro sitios —«se renueva sola · 69 €», «Renovar» con pago, «1 ya reservada · 2 para reservar» (la reservada ya
// está descontada) y «no cuenta en las 2»— y aquí no entra ninguno.

import { euros, fechaCorta } from './formato.ts';
import { cubreTipo, esCuota } from './bono-cubre.ts';
import { saldoBono } from './saldo-bono.ts';
import { pagosPendientes } from './pagos-agrupados.ts';
import type { Bono, Clase, Pago, Reserva } from './tipos.ts';
import type { ProductoTienda } from './tienda.ts';

/** «31 oct», sin el día de la semana. */
function diaMes(iso: string): string {
  return fechaCorta(iso.slice(0, 10)).split(' ').slice(1).join(' ');
}

/** Días enteros de `hoy` a `fecha` (las dos YYYY-MM-DD del estudio). */
function diasHasta(hoy: string, fecha: string): number {
  return Math.round((Date.parse(`${fecha.slice(0, 10)}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
}

/** Un bono de SESIONES vivo (no una cuota, no sin límite). */
export function esBonoDeSesiones(b: Bono): boolean {
  return b.estado === 'activo' && !esCuota(b) && Number.isFinite(b.creditosTotales)
    && (b.tipoPlan === 'BONO' || b.tipoPlan === 'PUNTUAL');
}

/**
 * Sus próximas clases YA pagadas con ESTE bono: confirmadas, sin terminar y con `bonoId` igual (lo escribe
 * `reservar_plaza` en `reservas.bono_suscripcion_id`). Una reserva sin ese dato (importada, anterior al rastreo) no se
 * atribuye a ningún bono. Ya están descontadas del saldo: se dicen para que no las cuente dos veces.
 */
export function reservadasConBono(
  reservas: Pick<Reserva, 'id' | 'claseId' | 'estado' | 'bonoId'>[],
  clases: Pick<Clase, 'id' | 'fecha' | 'hora' | 'inicio' | 'fin'>[],
  bonoId: string, ahoraMs: number | null, hoy: string,
): Pick<Clase, 'id' | 'fecha' | 'hora' | 'inicio' | 'fin'>[] {
  const porId = new Map(clases.map((c) => [c.id, c]));
  return reservas
    .filter((r) => r.estado === 'confirmada' && r.bonoId === bonoId)
    .map((r) => porId.get(r.claseId))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .filter((c) => (ahoraMs === null ? c.fecha >= hoy : Date.parse(c.fin) > ahoraMs))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** «Ya reservada con este bono: mié 8» · «…: mié 8 y jue 9» · «…: mié 8, jue 9 y 2 más». `null` sin ninguna. */
export function textoReservadas(clases: Pick<Clase, 'fecha'>[]): string | null {
  if (clases.length === 0) return null;
  const dias = clases.slice(0, 2).map((c) => fechaCorta(c.fecha).split(' ').slice(0, 2).join(' '));
  const resto = clases.length - dias.length;
  const lista = resto > 0 ? `${dias.join(', ')} y ${resto} más` : dias.join(' y ');
  return `${clases.length === 1 ? 'Ya reservada' : 'Ya reservadas'} con este bono: ${lista}`;
}

/** «Sirve para Reformer y Mat» o «Sirve para cualquier clase» (sin tipos = todas, la regla del servidor). */
export function textoSirvePara(b: Pick<Bono, 'tiposClaseIds'>, nombres: Record<string, string>): string {
  const ids = b.tiposClaseIds ?? [];
  if (ids.length === 0) return 'Sirve para cualquier clase';
  const tipos = ids.map((t) => nombres[t]).filter(Boolean);
  if (tipos.length === 0) return 'Sirve para algunas clases';
  const lista = tipos.length === 1 ? tipos[0] : `${tipos.slice(0, -1).join(', ')} y ${tipos[tipos.length - 1]}`;
  return `Sirve para ${lista}`;
}

/** «Caduca el 31 oct · en 26 días» / «Caduca hoy» / «Caduca mañana» / «Sin caducidad». */
export function textoCaducidadHeroe(b: Pick<Bono, 'expiraEn'>, hoy: string): string {
  if (!b.expiraEn) return 'Sin caducidad';
  const n = diasHasta(hoy, b.expiraEn);
  if (n <= 0) return 'Caduca hoy';
  if (n === 1) return 'Caduca mañana';
  return `Caduca el ${diaMes(b.expiraEn)} · en ${n} días`;
}

/**
 * El aviso de debajo del héroe: caduca pronto o le queda poco. Nunca «Renueva» (renovar es cobrar, y eso es otro
 * bloque) ni «Te quedan» (lo dice ya el héroe con la cifra). Suma TODOS sus bonos de sesiones: con 1 en este y 6 en
 * otro no le queda poco.
 */
export function avisoBono(bonos: Bono[], principal: Bono | null, hoy: string): string | null {
  if (!principal) return null;
  const vivos = bonos.filter(esBonoDeSesiones);
  const total = vivos.reduce((n, b) => n + saldoBono(b).quedan, 0);
  if (principal.expiraEn && saldoBono(principal).quedan > 0) {
    const n = diasHasta(hoy, principal.expiraEn);
    if (n >= 0 && n <= 7) {
      const cuando = n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`;
      return `Tu bono caduca ${cuando}: las sesiones que no uses se pierden.`;
    }
  }
  if (total > 0 && total <= 2) {
    const cuantas = total === 1 ? 'Una sesión más' : 'Dos sesiones más';
    return `${cuantas} y ${vivos.length > 1 ? 'se acaban tus bonos' : 'se acaba tu bono'}.`;
  }
  return null;
}

/**
 * La etiqueta de pagos de la cuota: «Pago pendiente» si debe algún recibo de ESA suscripción (los mismos estados que
 * /pagos cuenta como deuda), «Al día» solo si no debe nada y al menos uno está pagado; sin recibos, nada.
 */
export function etiquetaPagos(pagos: Pago[], suscripcionId: string): 'Pago pendiente' | 'Al día' | null {
  const suyos = pagos.filter((p) => p.bonoId === suscripcionId);
  if (pagosPendientes(suyos).length > 0) return 'Pago pendiente';
  if (suyos.some((p) => p.estado === 'success')) return 'Al día';
  return null;
}

/** «Vigente hasta el 1 nov», «Termina el 1 nov · no se renueva» o «Sin fecha de fin». Nunca «se renueva sola». */
export function textoVigencia(b: Pick<Bono, 'expiraEn' | 'bajaAlVencer'>): string {
  if (!b.expiraEn) return 'Sin fecha de fin';
  return b.bajaAlVencer ? `Termina el ${diaMes(b.expiraEn)} · no se renueva` : `Vigente hasta el ${diaMes(b.expiraEn)}`;
}

/** «12 € por clase», solo si el dato existe (`precioPorClaseDe`, lib/student/mapeo.ts). */
export function textoPrecioPorClase(b: Pick<Bono, 'precioPorClase'>): string | null {
  return b.precioPorClase != null && b.precioPorClase > 0 ? `${euros(b.precioPorClase)} por clase` : null;
}

/**
 * «Si quieres más» de una cuota: lo que se vende y da clases que su cuota NO incluye (bonos y clases sueltas que cubren
 * alguno de esos tipos). Con una cuota que lo cubre todo, nada: con un tope, el servidor rechaza por «límite semanal»
 * una clase de más aunque se pague con bono o suelta, así que ofrecerlo sería vender algo que no sirve.
 */
export function masParaCuota(
  cuota: Pick<Bono, 'tiposClaseIds'>, productos: ProductoTienda[], tiposDelHorario: string[], nombres: Record<string, string>,
): { productos: ProductoTienda[]; noIncluye: string[] } {
  const fuera = [...new Set(tiposDelHorario)].filter((t) => !cubreTipo(cuota, t));
  if (fuera.length === 0) return { productos: [], noIncluye: [] };
  const sirven = productos.filter((p) => (p.familia === 'bono' || p.familia === 'suelta') && fuera.some((t) => cubreTipo(p, t)));
  return { productos: sirven, noIncluye: fuera.map((t) => nombres[t]).filter(Boolean) };
}

/** «Último: 1 oct · 69 € · Pagado». El estado lo pone quien llama, con las MISMAS palabras que /pagos. */
export function textoUltimoRecibo(pagos: Pago[], suscripcionId: string, etiqueta: (p: Pago) => string): string | null {
  const ultimo = pagos.filter((p) => p.bonoId === suscripcionId).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (!ultimo) return null;
  return [ultimo.fecha ? `Último: ${diaMes(ultimo.fecha)}` : 'Último', euros(ultimo.importe), etiqueta(ultimo)].join(' · ');
}
