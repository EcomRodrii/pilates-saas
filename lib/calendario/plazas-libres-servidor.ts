// ─────────────────────────────────────────────────────────────────────────────
// Lo que hace `GET /api/calendario/plazas-libres` con los datos, separado de
// cómo se leen: las lecturas entran inyectadas y así se prueba con
// `node --test` (la ruta solo las conecta con Supabase).
//
//  · Falla CERRADO: si cualquier lectura falla (también las apartadas para
//    ClassPass, las averías o el ajuste de la lista de espera), lanza. Recepción
//    promete con esta pantalla: mejor un error que un número de más.
//  · Las apartadas y las reservas retiradas, por trozos de 100 sesiones:
//    PostgREST corta en silencio a mil filas.
//  · El aforo es el EFECTIVO (`aforoEfectivoSesion`, espejo de `aforo_efectivo()`):
//    con una máquina averiada, el mostrador y la app ya no dejan reservar esa
//    plaza, y esta pantalla tampoco la ofrece.
//  · Una reserva CANCELADA con motivo `plaza_fija_retirada` (la soltó el
//    sistema al pausar la plaza o al quedarse sin cuota) NO cuenta como «ya tiene
//    su fila»: el motor se la vuelve a reservar al volver (B2 de
//    `materializar_plazas_fijas`).
//
// Puro: sin `@/` en tiempo de ejecución.
// ─────────────────────────────────────────────────────────────────────────────

import { apartadasPorSesion } from '../booking-logic.ts';
import { aforoEfectivoSesion } from '../aforo-logic.ts';
import { huecosDeSesiones, type HuecoSesion, type ReservaParaHuecos, type SesionParaHuecos } from './plazas-libres.ts';
import type { BloqueoMaquina, PlazaFija } from '../types.ts';

export const IDS_POR_CONSULTA = 100;

export interface LecturasPlazasLibres {
  /** Clases con `inicio` en [desdeIso, hastaIso) y sus reservas; `null` si falla. */
  rango(desdeIso: string, hastaIso: string): Promise<{ sesiones: SesionParaHuecos[]; reservas: (ReservaParaHuecos & { id: string })[] } | null>;
  /** Plazas fijas ACTIVA y PAUSADA del estudio; `null` si falla. */
  plazasFijas(): Promise<PlazaFija[] | null>;
  /** `studios.lista_espera_reserva_plaza_ofrecida`; `null` si falla. */
  ofertaOcupa(): Promise<boolean | null>;
  /** `plazas_apartadas_de` para esas sesiones; `null` si falla. */
  apartadas(sesionIds: string[]): Promise<{ sesion_id: string; plazas: number }[] | null>;
  /** Ids de las reservas CANCELADA con motivo `plaza_fija_retirada` de esas sesiones; `null` si falla. */
  retiradas(sesionIds: string[]): Promise<string[] | null>;
  /** Averías de máquina que solapan [desdeIso, hastaIso); `null` si falla. */
  averias(desdeIso: string, hastaIso: string): Promise<BloqueoMaquina[] | null>;
}

const trozos = <T>(xs: readonly T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function contarPlazasLibres(
  l: LecturasPlazasLibres,
  p: { desdeIso: string; hastaIso: string; ahoraMs: number },
): Promise<{ ofertaOcupa: boolean; sesiones: HuecoSesion[] }> {
  const [rango, plazas, ofertaOcupa, averias] = await Promise.all([
    l.rango(p.desdeIso, p.hastaIso), l.plazasFijas(), l.ofertaOcupa(), l.averias(p.desdeIso, p.hastaIso),
  ]);
  if (!rango) throw new Error('No se han podido leer las clases del rango');
  if (!plazas) throw new Error('No se han podido leer las clases fijas');
  if (ofertaOcupa === null) throw new Error('No se ha podido leer el ajuste de la lista de espera');
  if (!averias) throw new Error('No se han podido leer las averías');

  const ids = rango.sesiones.map(s => s.id);
  const filasApartadas: { sesion_id: string; plazas: number }[] = [];
  const retiradas = new Set<string>();
  for (const lote of trozos(ids, IDS_POR_CONSULTA)) {
    const [a, r] = await Promise.all([l.apartadas(lote), l.retiradas(lote)]);
    if (!a) throw new Error('No se han podido leer las plazas apartadas');
    if (!r) throw new Error('No se han podido leer las reservas retiradas');
    filasApartadas.push(...a);
    for (const id of r) retiradas.add(id);
  }

  return {
    ofertaOcupa,
    sesiones: huecosDeSesiones({
      sesiones: rango.sesiones.map(s => ({ ...s, aforoMaximo: aforoEfectivoSesion(s.aforoMaximo, s.salaId, s.inicio, s.fin, averias) })),
      // Una reserva retirada por el sistema no es «su fila»: se pasa sin alumna.
      reservas: rango.reservas.map(r => (retiradas.has(r.id) ? { ...r, socioId: null } : r)),
      plazas,
      apartadas: apartadasPorSesion(filasApartadas),
      ahoraMs: p.ahoraMs,
      ofertaOcupa,
    }),
  };
}
