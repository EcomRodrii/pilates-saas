// ─────────────────────────────────────────────────────────────────────────────
// Las cifras de arriba de Cobros en el panel nuevo (14-oct-2026): «Te deben»,
// «Devueltos y fallidos» y «Próximos 7 días». La de «Cobrado este mes» es la
// del Resumen (`ingresosAlDia`, `lib/inicio/cifras.ts`), no se calcula aquí.
//
// Nada nuevo que decidir: se resume lo que ya deciden las reglas de la lista.
//   · La deuda sale de los grupos de `agruparDeudas` (que leen cada recibo con
//     `situacion-recibo.ts`), así que «Te deben» es la suma que enseña el pie de
//     «Quién me debe», céntimo a céntimo.
//   · «Devueltos y fallidos» son los recibos cuyo estado visible es «Devuelto
//     por el banco» o «No se pudo cobrar» (`estadoVisible`): los que ya se
//     intentaron cobrar y no entraron. Lo que solo está «Sin cobrar» no.
//   · Lo que viene sale de `proximasCuotas`, la misma lista que «Próximas
//     cuotas». La cuota con la baja programada no se renueva: no suma.
//
// Puro (sin `@/`): se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { aCentimos, importeAdeudado, importeEnCurso, type ReciboParaCifras } from '../billing/situacion-recibo.ts';
import { estadoVisible, type GrupoDeDeuda, type ReciboDeDeuda } from './deudas.ts';
import type { ComoSeCobraraLaCuota } from './proximas-cuotas.ts';

/** ¿Lo devolvió el banco o se intentó cobrar y no entró? */
export function reciboRequiereAtencion(r: ReciboDeDeuda): boolean {
  const e = estadoVisible(r);
  return e === 'DEVUELTO_BANCO' || e === 'NO_SE_PUDO';
}

/** ¿Alguno de los recibos de esta clienta requiere atención? (el filtro de la cifra) */
export function grupoRequiereAtencion(g: { recibos: readonly ReciboDeDeuda[] }): boolean {
  return g.recibos.some(reciboRequiereAtencion);
}

export interface ResumenDeuda {
  /** La suma de la lista «Quién me debe». */
  teDeben: number;
  /** Las filas de la lista (clientas, ventas de mostrador sin clienta y clientas eliminadas). */
  grupos: number;
  /** Lo que está en el banco sin contestar: todavía no es deuda. */
  enElBanco: number;
  atencion: {
    /** Lo que se debe por recibos devueltos o que no se pudieron cobrar (solo esos recibos). */
    importe: number;
    /** Filas de la lista con alguno de esos recibos. */
    grupos: number;
    recibos: number;
  };
}

export function resumenDeLaDeuda<R extends ReciboDeDeuda>(
  grupos: readonly GrupoDeDeuda<R>[],
  recibos: readonly ReciboParaCifras[],
): ResumenDeuda {
  let teDeben = 0;
  let importe = 0;
  let nRecibos = 0;
  let nGrupos = 0;
  for (const g of grupos) {
    teDeben += g.total;
    let alguno = false;
    for (const r of g.recibos) {
      if (!reciboRequiereAtencion(r)) continue;
      importe += importeAdeudado(r);
      nRecibos += 1;
      alguno = true;
    }
    if (alguno) nGrupos += 1;
  }
  return {
    teDeben: aCentimos(teDeben),
    grupos: grupos.length,
    enElBanco: aCentimos(recibos.reduce((t, r) => t + importeEnCurso(r), 0)),
    atencion: { importe: aCentimos(importe), grupos: nGrupos, recibos: nRecibos },
  };
}

export interface ResumenProximas {
  /** Cuotas que se renuevan (sin las que tienen la baja programada). */
  n: number;
  importe: number;
  /** De ellas, las que cobra el estudio a mano (sin tarjeta ni domiciliación). */
  aMano: number;
  /** De ellas, las que fallarán porque la tarjeta caduca antes. */
  tarjetaCaduca: number;
  /** De ellas, aquellas cuyos datos de pago no se pudieron leer. */
  sinDatos: number;
}

export function resumenProximasCuotas(cuotas: readonly { importe: number; como: ComoSeCobraraLaCuota }[]): ResumenProximas {
  const r: ResumenProximas = { n: 0, importe: 0, aMano: 0, tarjetaCaduca: 0, sinDatos: 0 };
  for (const c of cuotas) {
    if (c.como === 'NO_SE_RENUEVA') continue;
    r.n += 1;
    r.importe += c.importe;
    if (c.como === 'A_MANO') r.aMano += 1;
    else if (c.como === 'TARJETA_CADUCA') r.tarjetaCaduca += 1;
    else if (c.como === 'NO_SE_SABE') r.sinDatos += 1;
  }
  r.importe = aCentimos(r.importe);
  return r;
}
