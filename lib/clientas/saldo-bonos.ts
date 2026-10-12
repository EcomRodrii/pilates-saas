import type { PlanTarifa, Suscripcion } from '../types.ts';
import { saldoSesionesBono } from '../bono-logic.ts';

// El «Quedan N» de la lista de Clientas (y su orden por saldo): lo que le queda
// a cada socia sumando TODOS sus bonos vigentes, para el estudio entero de una
// vez. Una socia sin bono que contar no está en el mapa: ausente no es cero.
//
// El criterio es el de `saldoSesionesBono`, llamado tal cual, no una copia. Lo
// caro era llamarlo una vez por socia sobre las suscripciones de TODO el estudio
// (O(socias × suscripciones)); aquí se agrupan primero en una pasada y cada
// socia se cuenta solo con las suyas.
//
// `hoyISO` es el día del ESTUDIO (`hoyEnEstudio()`), nunca el de UTC: entre las
// 00:00 y las 02:00 de Madrid (01:00 en invierno) UTC sigue en el día anterior,
// y un bono que caducó ayer seguía sumando en la lista.
export function saldoBonosPorSocia(
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string,
): Map<string, number> {
  const porSocia = new Map<string, Suscripcion[]>();
  for (const s of suscripciones) {
    const suyas = porSocia.get(s.socioId);
    if (suyas) suyas.push(s);
    else porSocia.set(s.socioId, [s]);
  }
  const saldo = new Map<string, number>();
  for (const [socioId, suyas] of porSocia) {
    const r = saldoSesionesBono(socioId, suyas, planesTarifa, hoyISO);
    if (r) saldo.set(socioId, r.restantes);
  }
  return saldo;
}
