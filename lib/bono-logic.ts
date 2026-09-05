// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del consumo de bono (sesiones de un plan BONO/PUNTUAL).
//
// Sin React ni Supabase: deterministas y testeables (ver bono-logic.test.ts).
// El god-context las usa como única fuente de verdad para descontar/devolver
// sesiones al reservar/cancelar y para detectar el bono agotado.
// ─────────────────────────────────────────────────────────────────────────────

import type { Suscripcion, PlanTarifa, TipoPlan } from '@/lib/types';
import { hoyEnEstudio } from './utils.ts';

// ── ¿Este plan cubre ESTA clase? ─────────────────────────────────────────────
//
// Un plan sin tipos de clase asignados cubre TODO — es como se han comportado
// siempre y es lo que sigue pasando por defecto. Con tipos asignados, solo esos:
// permite el "Bono 10 Reformer" que no sirve para Mat.
//
// Sin `tipoClaseId` (p. ej. al preguntar "¿tiene bono?" sin una clase concreta
// delante) se responde por el plan, no por la clase: no se puede descartar una
// cobertura que aún no sabemos si aplica.
//
// Misma semántica que `plazas_fijas.tipo_clase_id` (0083), donde null = cualquiera.
// Su gemela en SQL es `plan_cubre_tipo_clase` (migr 20260905143242), que la
// usa `reservar_plaza` para el límite semanal por actividad. Si cambia una,
// cambia la otra: la regla es la misma en los dos lados.
export function planCubreTipoClase(plan: PlanTarifa, tipoClaseId?: string | null): boolean {
  const tipos = plan.tiposClaseIds;
  if (!tipos || tipos.length === 0) return true;
  if (!tipoClaseId) return true;
  return tipos.includes(tipoClaseId);
}

// Encuentra la suscripción activa de bono/puntual de la socia sobre la que se
// descuenta o devuelve una sesión. Devuelve null si no aplica (sin suscripción
// activa, plan no de sesiones, o saldo no gestionado por sesiones).
export function bonoConsumible(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string = new Date().toISOString().slice(0, 10),
  // Tipo de clase que se está reservando. Sin él se mantiene el comportamiento
  // de siempre; con él, un bono que no cubra esa clase no es candidato — si no,
  // con un "Bono Reformer" y un "Bono Mat" a la vez se descontaría del que
  // caduque antes, aunque no fuera el que cubre la clase.
  tipoClaseId?: string | null,
): { suscripcion: Suscripcion; plan: PlanTarifa; sesionesRestantes: number } | null {
  return elegirBono(socioId, suscripciones, planesTarifa, hoyISO, tipoClaseId,
    // Para CONSUMIR hace falta que quede algo que descontar.
    (restantes) => restantes > 0);
}

// I-5: el espejo de `bonoConsumible` para DEVOLVER. Parece el mismo problema y
// no lo es: para consumir hace falta saldo > 0, pero para devolver hace falta
// HUECO — y el bono al que hay que devolverle la sesión es justo el que se quedó
// a 0 al gastarla.
//
// Usar `bonoConsumible` para las dos cosas tenía una consecuencia fea: cancelar
// la clase que gastó la ÚLTIMA sesión no devolvía nada (el bono a 0 ya no era
// "consumible"), y el llamador marcaba `bonoDevuelto = true` igualmente, así que
// el email le decía a la socia que le habíamos devuelto la sesión. Y es el peor
// momento posible: al llegar a 0 se le crea además el recibo de renovación, o
// sea que se quedaba con 0 sesiones, nada devuelto y una factura pendiente.
export function bonoDevolvible(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string = new Date().toISOString().slice(0, 10),
  tipoClaseId?: string | null,
): { suscripcion: Suscripcion; plan: PlanTarifa; sesionesRestantes: number } | null {
  return elegirBono(socioId, suscripciones, planesTarifa, hoyISO, tipoClaseId,
    // Para DEVOLVER hace falta sitio por debajo del total del plan. Un plan sin
    // `sesiones` (saldo no acotado) siempre admite la devolución.
    (restantes, plan) => restantes < (plan.sesiones ?? Number.POSITIVE_INFINITY));
}

// El cuerpo común. Lo único que cambia entre consumir y devolver es qué hace
// apto a un bono; el resto —vigencia, cobertura por tipo de clase y el orden
// determinista— tiene que ser IDÉNTICO, o se devolvería a un bono distinto del
// que se descontó.
function elegirBono(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string,
  tipoClaseId: string | null | undefined,
  esApto: (sesionesRestantes: number, plan: PlanTarifa) => boolean,
): { suscripcion: Suscripcion; plan: PlanTarifa; sesionesRestantes: number } | null {
  const candidatas = suscripciones.filter(s => {
    if (s.socioId !== socioId || s.estado !== 'ACTIVA' || s.sesionesRestantes === null) return false;
    const plan = planesTarifa.find(p => p.id === s.planId);
    if (!plan || (plan.tipo !== 'BONO' && plan.tipo !== 'PUNTUAL')) return false;
    // ⚠️ Para CONSUMIR, un bono AGOTADO no es candidato. Parece obvio y no lo
    // era: el filtro solo miraba `!== null`, así que un bono a 0 seguía
    // compitiendo — y con el desempate por id podía GANAR siempre. Visto en
    // producción: una socia con cuatro bonos (uno a 0 y tres a 4) reservaba y no
    // se descontaba de ningún sitio, porque el elegido ya no tenía nada que
    // descontar. Doce sesiones pagadas que no se iban a gastar nunca, sin un
    // solo error por ningún lado.
    // Para DEVOLVER la aptitud es la CONTRARIA (hace falta hueco, no saldo), y
    // usar la de consumir para las dos cosas era el bug I-5.
    if (!esApto(s.sesionesRestantes, plan)) return false;
    if (!planCubreTipoClase(plan, tipoClaseId)) return false;
    // Vigente: mismo criterio que tieneEntitlementActivo. Un bono ACTIVA pero
    // CADUCADO (fechaFin < hoy) NO se consume ni se devuelve — antes se descontaba
    // igual cuando la política del estudio no exigía plan (se saltaba esa puerta).
    return !s.fechaFin || s.fechaFin >= hoyISO;
  });
  if (candidatas.length === 0) return null;
  // Con varias activas, elección DETERMINISTA (antes cogía la primera que devolvía
  // la BD): la que caduca antes primero (consumir la más urgente); las sin
  // caducidad al final; desempate por id para estabilidad.
  candidatas.sort((a, b) => {
    const fa = a.fechaFin ?? '9999-12-31';
    const fb = b.fechaFin ?? '9999-12-31';
    return fa !== fb ? (fa < fb ? -1 : 1) : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const sus = candidatas[0];
  const plan = planesTarifa.find(p => p.id === sus.planId)!;
  return { suscripcion: sus, plan, sesionesRestantes: sus.sesionesRestantes! };
}

// Nuevo saldo tras consumir una sesión (nunca baja de 0) y si el bono queda
// agotado (lo que dispara el recibo de renovación en el contexto).
export function calcularConsumoBono(sesionesRestantes: number): { nuevasRestantes: number; agotado: boolean } {
  const nuevasRestantes = Math.max(0, sesionesRestantes - 1);
  return { nuevasRestantes, agotado: nuevasRestantes === 0 };
}

// `calcularDevolucionBono` vivía aquí y se ha BORRADO (I-10): calculaba
// `min(tope, restantes + 1)` en JS a partir de un saldo leído antes, que es
// justo el read-modify-write que perdía devoluciones cuando dos cancelaciones
// coincidían. El tope lo aplica ahora la RPC `devolver_sesion_bono` dentro de su
// propio WHERE. Dejar viva la versión no atómica era invitar a volver al bug.

// C-4: ¿la socia tiene derecho a reservar? Cierto si tiene una suscripción
// ACTIVA que sea o bien un plan MENSUAL vigente (sin fecha fin, o fin >= hoy),
// o bien un BONO/PUNTUAL con al menos una sesión restante Y no caducado (F2 B2.1:
// respeta fecha_fin también en bonos; fecha_fin null = sin caducidad). Una
// suscripción PAUSADA (congelada) nunca da derecho. hoyISO = 'YYYY-MM-DD'.
export function tieneEntitlementActivo(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string,
  // Con una clase concreta delante, un plan que no la cubra no vale (un bono de
  // Reformer no da derecho a reservar Mat). Sin ella se responde por el plan.
  tipoClaseId?: string | null,
): boolean {
  return suscripciones.some(sus => {
    if (sus.socioId !== socioId || sus.estado !== 'ACTIVA') return false;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return false;
    if (!planCubreTipoClase(plan, tipoClaseId)) return false;
    const vigente = !sus.fechaFin || sus.fechaFin >= hoyISO;
    if (plan.tipo === 'MENSUAL') return vigente;
    return (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && (sus.sesionesRestantes ?? 0) > 0 && vigente;
  });
}

// ── Cuánto le queda EN TOTAL, no cuánto le queda al bono de turno ────────────
//
// Una socia puede tener varios bonos vivos a la vez, y no es un caso raro: es
// el diseño (ver el comentario de `asignarPlan` en studio-context — los bonos
// con saldo TIENEN que convivir, si no, acotar un bono a ciertos tipos de clase
// no serviría de nada). Comprar otro bono NO recarga el anterior: crea una fila
// nueva.
//
// El problema es que casi toda la UI preguntaba por UNA suscripción
// (`suscripciones.find(s => s.estado === 'ACTIVA')`) y enseñaba su saldo como
// si fuera el de la socia. Como la consulta no lleva `order by`, "la primera"
// la decide Postgres, así que el número ni siquiera era estable — y sobre todo
// NO SE MOVÍA al comprar: la fila nueva se añadía detrás y la pantalla seguía
// enseñando la vieja. Visto en producción el 2026-08-18: una socia con 6 bonos
// activos y 17 sesiones pagadas compró 4 más y el panel siguió diciendo lo
// mismo que antes. Nada se había perdido; simplemente no se sumaba en pantalla.
//
// `total` es el denominador honesto ("le quedan 17 de las 24 que ha pagado"),
// mismo criterio que ya usa `bonos-portal.ts` para el portal: un bono agotado
// pero vigente cuenta en los DOS lados de la fracción — pagó esas sesiones y ya
// las gastó, que es justo lo que la fracción cuenta. Sacarlo del denominador
// haría que el total comprado bajase solo al terminar un bono.
//
// Devuelve `null` cuando no tiene ningún bono que contar sesiones (solo
// mensual, o nada): ahí no hay saldo, y un 0 se leería como "se le acabó".
export function saldoSesionesBono(
  socioId: string,
  suscripciones: Suscripcion[],
  planesTarifa: PlanTarifa[],
  hoyISO: string = new Date().toISOString().slice(0, 10),
  // Con una clase concreta delante solo cuentan los bonos que la cubren: sumar
  // un bono de Reformer y otro de Mat en "te quedarán N" para una clase de Mat
  // sería el mismo tipo de mentira, en la otra dirección.
  tipoClaseId?: string | null,
): { restantes: number; total: number; bonos: number } | null {
  let restantes = 0;
  let total = 0;
  let bonos = 0;
  for (const s of suscripciones) {
    if (s.socioId !== socioId || s.estado !== 'ACTIVA' || s.sesionesRestantes === null) continue;
    const plan = planesTarifa.find(p => p.id === s.planId);
    if (!plan || (plan.tipo !== 'BONO' && plan.tipo !== 'PUNTUAL')) continue;
    if (!planCubreTipoClase(plan, tipoClaseId)) continue;
    // Mismo criterio de vigencia que `bonoConsumible`/`tieneEntitlementActivo`:
    // un bono caducado no se puede gastar, así que no es saldo.
    if (s.fechaFin && s.fechaFin < hoyISO) continue;
    restantes += s.sesionesRestantes;
    // Sin `sesiones` en el plan no hay total conocido; se usa lo que le queda
    // para no inventar un denominador menor que el numerador.
    total += plan.sesiones ?? s.sesionesRestantes;
    bonos += 1;
  }
  return bonos > 0 ? { restantes, total, bonos } : null;
}

// ── F2 · Bonos con validez / límite / congelación (puras, testeables) ─────────

// Fecha de caducidad de un bono al comprarlo: fecha_inicio + validez_dias, en
// 'YYYY-MM-DD'. null si el plan no caduca (validezDias null). Acepta fechaInicio
// como fecha o timestamp ISO — usa el DÍA del estudio (Madrid), no el de UTC.
//
// P-9 (auditoría 21ª pasada): antes tomaba `.slice(0, 10)` del ISO tal cual
// (la parte de fecha en UTC). Sus 3 llamadores pasan `new Date().toISOString()`
// — un alta cobrada a la 01:30 de Madrid (23:30 UTC del día anterior) hacía
// arrancar la validez del bono un día antes de cuando la clienta lo compró.
// Mismo bug que ya documenta `hoyEnEstudio`.
export function calcularFechaFinBono(fechaInicioISO: string, validezDias: number | null): string | null {
  if (validezDias === null || validezDias <= 0) return null;
  const base = new Date(`${hoyEnEstudio(new Date(fechaInicioISO))}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + validezDias);
  return base.toISOString().slice(0, 10);
}

// Hallazgo B (auditoría dunning 2026-08-10) — REACTIVAR una suscripción
// CANCELADA/EXPIRADA (botón "Reactivar" en la ficha de clienta), a diferencia
// de PAUSAR/DESCONGELAR (que solo cierra una ventana de congelación) o de
// aplicarRenovacionServidor (que TOPA UN CICLO YA VIGENTE: en BONO/PUNTUAL
// deja fecha_fin intacta a propósito). Aquí el ciclo anterior ya terminó del
// todo — reactivar con la fecha_fin vieja la dejaría caducada al instante —
// así que se recalcula igual que un alta nueva (mismo criterio que
// `assignPlan` en studio-context.tsx): BONO/PUNTUAL arranca hoy con las
// sesiones del plan a tope; MENSUAL con el próximo ciclo a un mes vista.
export function calcularReactivacion(
  plan: Pick<PlanTarifa, 'tipo' | 'sesiones' | 'validezDias'>,
  ahoraISO: string,
): { fechaFin: string | null; sesionesRestantes: number | null } {
  if (plan.tipo === 'MENSUAL') {
    // P-9 (auditoría 21ª pasada): mismo bug que ya arregla
    // `calcularFechaFinBono` — el día del estudio, no el de UTC.
    const nuevaFin = new Date(`${hoyEnEstudio(new Date(ahoraISO))}T00:00:00Z`);
    nuevaFin.setUTCMonth(nuevaFin.getUTCMonth() + 1);
    return { fechaFin: nuevaFin.toISOString().slice(0, 10), sesionesRestantes: null };
  }
  return { fechaFin: calcularFechaFinBono(ahoraISO, plan.validezDias ?? null), sesionesRestantes: plan.sesiones };
}


// Nueva fecha_fin tras una congelación: se empuja por los días congelados
// [desde, hasta] para que no consuman la validez. null si no había caducidad.
export function nuevaFechaFinTrasCongelar(fechaFin: string | null, desdeISO: string, hastaISO: string): string | null {
  if (!fechaFin) return null;
  const dias = Math.max(0, Math.round(
    (Date.parse(`${hastaISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${desdeISO.slice(0, 10)}T00:00:00Z`)) / 86_400_000,
  ));
  const fin = new Date(`${fechaFin.slice(0, 10)}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + dias);
  return fin.toISOString().slice(0, 10);
}

/**
 * ¿Tiene sentido exigir plan para reservar? Solo si el estudio vende alguno.
 *
 * Desde la 0114 el ajuste «exigir plan o bono activo» viene ACTIVADO de fábrica,
 * que es lo correcto para un estudio en marcha. Pero un estudio recién creado lo
 * tiene activado y todavía no ha creado ni un plan: su primera clienta vería
 * «necesitas un plan o bono activo» y, al ir a contratarlo, nada que comprar.
 * Un callejón sin salida en el primer minuto de vida del negocio.
 *
 * Exigir algo que no se puede conseguir no protege nada: solo bloquea. Cuando la
 * dueña crea su primer plan, el gate empieza a aplicar solo.
 */
export function hayAlgoQueContratar(planes: { activo: boolean }[]): boolean {
  return planes.some(p => p.activo);
}

// Los dos motivos por los que el servidor rechaza una reserva y la salida es
// COMPRAR algo. Viven aquí, y no sueltos en el módulo de servidor, para que la
// pantalla que los recibe pueda reconocerlos sin copiar la frase a mano.
export const ERROR_SIN_PLAN = 'Necesitas un plan o bono activo para reservar';
export const ERROR_BONO_NO_CUBRE = 'Tu bono no incluye este tipo de clase';

/**
 * ¿Este fallo al reservar se arregla comprando algo?
 *
 * El portal ya tiene la tienda (`/compras`) y la pantalla de Bonos ya invita a
 * ir a ella cuando no hay bono. Lo que faltaba era el eslabón del medio: al
 * intentar reservar sin plan, la hoja mostraba «Necesitas un plan o bono activo
 * para reservar» como texto plano y ahí se acababa. La socia tenía que deducir
 * sola que existe una pestaña «Bonos» y que dentro hay un botón para comprar.
 *
 * El momento en que alguien quiere reservar y no puede es exactamente el
 * momento de ofrecerle la compra, no dos pantallas después.
 *
 * `includes` y no igualdad: la página pública añade una coletilla al mismo
 * mensaje, y si algún día se envuelve, el botón desaparece en vez de aparecer
 * donde no toca.
 */
export function seArreglaComprando(mensajeError: string): boolean {
  return mensajeError.includes(ERROR_SIN_PLAN) || mensajeError.includes(ERROR_BONO_NO_CUBRE);
}

/**
 * ¿Agotar este plan debe AVISAR de que se ha quedado a cero?
 *
 * Ojo con lo que esta función ya NO decide: hasta el 2026-09-05 se llamaba
 * `generaRenovacionAlAgotarse` y gobernaba dos cosas a la vez — el aviso y un
 * recibo de RENOVACIÓN en estado PENDIENTE. Ese recibo nacía con
 * `proximo_reintento`, así que entraba en el ciclo de dunning y la tarjeta
 * guardada de la socia se cobraba SOLA: un bono de 4 clases se comportaba como
 * una suscripción que nadie había contratado.
 *
 * Visto en producción el 2026-09-04: un «Bono 4 clases» se autocobró el 02-09
 * (`pi_3UB9Ya…`) al gastarse la cuarta sesión, y al agotarse otra vez generó
 * el siguiente recibo con su reintento ya programado. Es el MISMO defecto que
 * ya se había corregido para `PUNTUAL` el 2026-08-20 —«la clienta acababa
 * debiendo algo que nunca pidió»— pero `BONO` se dejó dentro entonces dando
 * por hecho que el recibo era solo un aviso. No lo era: era una deuda con
 * cobro automático.
 *
 * Un bono es una compra ÚNICA de N sesiones. Se acaba y se acabó; si la socia
 * quiere otro, lo compra (portal: «Renovar en un toque»,
 * `app/api/public/renovar-plan`, que sí es un acto explícito suyo) o se lo
 * cobra el estudio a mano desde /cobros. Nada lo renueva por su cuenta.
 *
 * Lo que SÍ se conserva es el aviso, que es información útil y no mueve dinero.
 * Por eso esta función sobrevive en vez de desaparecer: sin ella, quitar el
 * recibo se llevaría por delante la notificación, y quitar el guard entero
 * haría que una CLASE SUELTA anunciara «bono agotado» al usarse, que es
 * justo lo contrario de lo que se arregló en agosto.
 *
 * Vive aquí, en la lógica pura, porque hay DOS caminos gemelos que la aplican
 * —`consumirBonoServidor` (servidor) y `consumirSesionBono` (cliente)— y
 * repetir la condición en los dos es exactamente cómo se vuelven a separar.
 */
export function avisaBonoAgotado(plan: { tipo: TipoPlan }): boolean {
  return plan.tipo === 'BONO';
}
