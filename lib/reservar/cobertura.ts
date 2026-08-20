// ─────────────────────────────────────────────────────────────────────────────
// §3 — Qué le va a costar a la alumna reservar ESTA clase.
//
// Dos problemas que arregla, los dos reales y verificados en el código:
//
// 1. **El precio del listado se calculaba con la cobertura de OTRA clase.**
//    `construir-slots.ts` y `/reservar/[slug]` resolvían `cubierta` UNA vez, con
//    el tipo de la clase cuya hoja estuviera abierta (`tipoClaseAbierta`), y lo
//    aplicaban a los ~40 slots del listado:
//      · con una hoja abierta de un Reformer que su bono SÍ cubre, todas las
//        filas perdían el precio — incluidas las de Mat, que tendría que pagar;
//      · sin hoja abierta (`tipoClaseAbierta = null`), `planCubreTipoClase`
//        responde "por el plan" y no por la clase, así que una socia con bono
//        SOLO de Reformer tampoco veía precio en Mat.
//    El gate de reserva sí usaba el tipo correcto, así que nunca se cobró mal:
//    lo que pasaba es que llegaba a pulsar "Reservar" creyendo que estaba
//    incluida y se comía un "Tu bono no incluye este tipo de clase". Es
//    exactamente "llegar al checkout sin saber qué estás reservando".
//
// 2. **Nunca se decía QUÉ consume la reserva.** Con plan que cubre, el precio se
//    ponía a `null` y el botón decía "Reservar" a secas: ni con qué bono, ni
//    cuántas sesiones le quedaban después. `sesionesRestantes` estaba ahí, en
//    `suscripciones`, sin usar.
//
// La lógica de "¿tiene derecho?" NO se reimplementa: se decide con las mismas
// piezas que `tieneEntitlementActivo` (`planCubreTipoClase` + vigencia +
// sesiones), y hay un test que recorre una matriz de casos comprobando que
// ambas funciones nunca se contradicen. Si divergen, se cae el test.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlanTarifa, Suscripcion } from '@/lib/types';
// Extensión `.ts` explícita: sin ella pasa en local y rompe en CI (ver
// allowImportingTsExtensions en tsconfig).
import { planCubreTipoClase } from '../bono-logic.ts';

export type Cobertura =
  /** Sin sesión: no se puede saber nada de su saldo. */
  | { estado: 'ANONIMA'; precio: number | null }
  /** Cuota mensual vigente que cubre esta clase: no descuenta sesiones. */
  | { estado: 'MENSUAL'; planNombre: string }
  /**
   * Bono con saldo: se descontará UNA sesión.
   *
   * `planNombre` es el bono del que se va a descontar de verdad (el que elige
   * `bonoConsumible`: el que caduca antes), y `sesionesRestantes` es el saldo
   * TOTAL sumando todos los bonos que cubren esta clase — no el de ese bono
   * suelto. Son dos cosas distintas a propósito: de qué bote sale, y cuánto le
   * queda en la cartera.
   */
  | { estado: 'BONO'; planNombre: string; sesionesRestantes: number }
  /** Tiene algún plan, pero ninguno cubre ESTE tipo de clase. */
  | { estado: 'NO_CUBRE_ESTA_CLASE'; precio: number | null }
  /** No tiene ningún plan activo utilizable. */
  | { estado: 'SIN_PLAN'; precio: number | null };

/** Coberturas en las que no hay nada que pagar aparte. */
export type CoberturaCubierta = Extract<Cobertura, { estado: 'MENSUAL' | 'BONO' }>;

/**
 * ¿Esta cobertura deja reservar sin pagar aparte?
 *
 * Predicado de tipo y no `boolean` a propósito: las variantes cubiertas son las
 * dos que NO llevan `precio`, así que devolver `boolean` deja a
 * `precioDeCobertura` accediendo a un campo que puede no existir. Con el
 * predicado, TypeScript lo estrecha y el error sale en compilación en vez de en
 * un `undefined €` en la pantalla de una alumna.
 */
export function estaCubierta(c: Cobertura): c is CoberturaCubierta {
  return c.estado === 'MENSUAL' || c.estado === 'BONO';
}

/**
 * Cobertura de UNA clase concreta. `tipoClaseId` es obligatorio a propósito —
 * pasarlo opcional es justo cómo se colaba el bug 1: sin él, la respuesta es
 * "por el plan" y no "por la clase".
 */
export function coberturaDeClase(params: {
  socioId: string | null | undefined;
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  hoyISO: string;
  tipoClaseId: string | null;
  precioClaseSuelta: number | null;
}): Cobertura {
  const { socioId, suscripciones, planesTarifa, hoyISO, tipoClaseId, precioClaseSuelta } = params;
  if (!socioId) return { estado: 'ANONIMA', precio: precioClaseSuelta };

  const planPorId = new Map(planesTarifa.map(p => [p.id, p]));
  let teniaAlgunPlanActivo = false;
  // Se recorren todas las suscripciones ACTIVAS, no un índice de una por socia:
  // con planes por tipo de clase, una socia puede tener una MENSUAL y un bono a
  // la vez (mismo punto ciego que ya corrigió F1 del Decision OS).
  // El bono del que saldrá la sesión, y aparte el saldo total. Antes esto era
  // un solo dato —el bono con MENOS saldo— y fallaba por los dos lados: no era
  // el bono que `bonoConsumible` iba a descontar (ese es el que caduca antes),
  // y el número que enseñaba no se movía al comprar otro bono.
  let bonoElegido: { planNombre: string; fechaFin: string; id: string } | null = null;
  let saldoTotal = 0;

  for (const sus of suscripciones) {
    if (sus.socioId !== socioId || sus.estado !== 'ACTIVA') continue;
    const plan = planPorId.get(sus.planId);
    if (!plan) continue;
    const vigente = !sus.fechaFin || sus.fechaFin >= hoyISO;
    const utilizable = plan.tipo === 'MENSUAL'
      ? vigente
      : (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && (sus.sesionesRestantes ?? 0) > 0 && vigente;
    if (!utilizable) continue;
    teniaAlgunPlanActivo = true;
    if (!planCubreTipoClase(plan, tipoClaseId)) continue;

    // La mensual gana: si la cubre, no se le descuenta ninguna sesión de bono, y
    // decirle "te quedan 3" cuando no se le va a restar nada sería mentira.
    if (plan.tipo === 'MENSUAL') {
      return { estado: 'MENSUAL', planNombre: plan.nombre };
    }
    // Todo lo que cubra esta clase suma: es lo que la alumna tiene para
    // gastarse en ella, esté repartido en un bono o en cinco.
    saldoTotal += sus.sesionesRestantes ?? 0;
    // Y el que se nombra es el que se va a descontar: el que caduca antes, con
    // desempate por id. MISMO criterio y mismo desempate que `bonoConsumible`
    // — si divergen, la pantalla nombra un bono y la reserva mueve otro (hay un
    // test que los cruza).
    const fechaFin = sus.fechaFin ?? '9999-12-31';
    const ganaAlActual = !bonoElegido
      || fechaFin < bonoElegido.fechaFin
      || (fechaFin === bonoElegido.fechaFin && sus.id < bonoElegido.id);
    if (ganaAlActual) bonoElegido = { planNombre: plan.nombre, fechaFin, id: sus.id };
  }

  if (bonoElegido) {
    return { estado: 'BONO', planNombre: bonoElegido.planNombre, sesionesRestantes: saldoTotal };
  }
  return teniaAlgunPlanActivo
    ? { estado: 'NO_CUBRE_ESTA_CLASE', precio: precioClaseSuelta }
    : { estado: 'SIN_PLAN', precio: precioClaseSuelta };
}

/**
 * Lo que se le dice a la alumna ANTES de pulsar, en una línea. Es la frase que
 * cierra el hueco de "nunca llega al checkout sin saber qué reserva".
 */
export function textoCobertura(c: Cobertura): string | null {
  switch (c.estado) {
    case 'MENSUAL':
      return `Incluida en tu ${c.planNombre}`;
    case 'BONO':
      // El "después" es lo que de verdad quiere saber: cuánto le queda si
      // reserva. Singular/plural porque "te quedará 1 sesiones" canta.
      return c.sesionesRestantes === 1
        ? `Usarás tu última sesión de ${c.planNombre}`
        : `Descuenta 1 sesión de tu ${c.planNombre} · te quedarán ${c.sesionesRestantes - 1}`;
    case 'NO_CUBRE_ESTA_CLASE':
      // Sin repetir el importe: el CTA ya dice "Reservar · 15 €" justo debajo, y
      // verificado en captura que el mismo número dos veces en 40 px se lee como
      // un descuadre. Aquí lo que hace falta es el POR QUÉ y qué está comprando.
      return c.precio != null
        ? 'Tu bono no cubre esta clase · se cobra como clase suelta'
        : 'Tu bono no cubre este tipo de clase';
    case 'SIN_PLAN':
      return c.precio != null ? `Clase suelta · ${c.precio} €` : null;
    case 'ANONIMA':
      // Sin sesión no se afirma nada sobre su saldo: solo el precio público, si
      // lo hay. Prometer "incluida en tu bono" a quien no ha entrado sería
      // inventarse un saldo que no conocemos.
      return c.precio != null ? `Clase suelta · ${c.precio} €` : null;
  }
}

/** Precio a mostrar en el CTA: `null` cuando no hay nada que pagar. */
export function precioDeCobertura(c: Cobertura): number | null {
  return estaCubierta(c) ? null : c.precio;
}

/**
 * Resolutor cacheado por tipo de clase, para el listado.
 *
 * La cobertura depende SOLO del tipo de clase (no de la sesión concreta), y un
 * listado tiene decenas de sesiones de un puñado de tipos. Sin esto, pasar de
 * "una cobertura para todo el listado" a "una por clase" recorrería las
 * suscripciones una vez por fila. Con esto se recorre una vez por TIPO.
 */
export function resolutorCobertura(base: {
  socioId: string | null | undefined;
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  hoyISO: string;
  precioClaseSuelta: number | null;
}): (tipoClaseId: string | null) => Cobertura {
  const cache = new Map<string, Cobertura>();
  return (tipoClaseId) => {
    const clave = tipoClaseId ?? '';
    const yaEsta = cache.get(clave);
    if (yaEsta) return yaEsta;
    const c = coberturaDeClase({ ...base, tipoClaseId });
    cache.set(clave, c);
    return c;
  };
}
