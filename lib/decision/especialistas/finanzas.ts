// Especialista en Finanzas — ¿qué ingresos recurrentes están en riesgo?
// MVP: F1 · bono casi agotado → proponer renovación antes de que la socia se
// quede sin sesiones (y deje de venir). Cubre el tipo PROPONER_RENOVACION_BONO,
// que existía en el catálogo pero ningún especialista generaba.
// F2 (informe fila 16): bono repetido cuyo coste real por sesión supera el
// plan mensual equivalente → PROPONER_SUSCRIPCION_MENSUAL.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import type { Suscripcion } from '@/lib/types';
import { construirIndices, frecuenciaHabitual, frecuenciaHabitualPorTipoClase, historialCobroDeSocio, historialCobroDelEstudio, type IndicesSenal } from '../senales.ts';
import {
  confianzaRenovarBono, confianzaProponerSuscripcionMensual, confianzaBonoCaducaSinUsar,
  confianzaTarjetaCaduca, confianzaRiesgoDeCobro,
} from '../confianza.ts';
import { estimarProbabilidad, tasaBase } from '../prediccion.ts';
import { caducaAntesDe } from '../../billing/caducidad-tarjeta.ts';
import { planCubreTipoClase } from '../../bono-logic.ts';

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const MS_DIA = 86400000;

/**
 * F1 · Bono con 1 o 0 sesiones → PROPONER_RENOVACION_BONO. Itera TODAS las
 * suscripciones ACTIVAS, no `idx.suscripcionActivaPorSocio` (índice de UNA
 * sola suscripción por socia, pensado para "cuánto vale al mes" — con
 * `planes_por_tipo_de_clase` una socia puede tener un plan MENSUAL de
 * reformer Y un bono de mat sueltos a la vez; el índice solo se queda con
 * la primera y la segunda quedaba invisible para F1, punto ciego real del
 * feedback P2-5).
 */
function reglaF1(sus: Suscripcion, idx: IndicesSenal): Candidata | null {
  if (sus.sesionesRestantes == null || sus.sesionesRestantes > 1) return null;
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'BONO') return null;
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio) return null;

  const confianza = confianzaRenovarBono({ bonoCasiAgotado: sus.sesionesRestantes <= 1, socioActivo: socio.activo });
  if (!confianza) return null;

  const restantes = sus.sesionesRestantes;
  const motivoMotor = restantes === 0
    ? `${socio.nombre} ha gastado todas las sesiones de su bono. Es el momento de proponerle renovar antes de que se enfríe.`
    : `A ${socio.nombre} le queda 1 sesión de su bono. Si le proponemos renovar ahora, no se queda sin venir.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'PROPONER_RENOVACION_BONO',
    dedupeKey: `FINANZAS:PROPONER_RENOVACION_BONO:${socio.id}`,
    tituloMotor: `A ${socio.nombre} se le acaba el bono`,
    motivoMotor,
    datosUsados: { nombre: socio.nombre, sesionesRestantes: restantes, plan: plan.nombre, precio: plan.precio },
    riesgo: 'PERDIDA',
    impacto: plan.precio > 0 ? { valor: redondear2(plan.precio), unidad: 'EUR', formula: `renovación del bono ${plan.nombre}: ${plan.precio}€` } : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 14,
    urgencia: restantes === 0 ? 0.7 : 0.55,
    esfuerzo: 0.3,
  };
}

const AHORRO_MINIMO = 0.20; // ≥20% más barata la mensual para que valga molestar
const VENTANA_PATRON_DIAS = 90;
const MIN_BONOS_PATRON = 2; // el activo cuenta, así que exige al menos 1 renovación previa

/**
 * F2 · Bono repetido (informe fila 16) → PROPONER_SUSCRIPCION_MENSUAL. Solo
 * cuando el estudio vende un plan MENSUAL que cubre el mismo tipo de clase
 * (si no, no hay nada real que ofrecer — se descarta, no se inventa un plan).
 * `frecuenciaHabitual` exige ≥4 asistencias en las últimas 8 semanas: sin eso
 * no hay dato fiable de cuánto gastaría al mes, así que tampoco genera candidata.
 */
function reglaF2(sus: Suscripcion, idx: IndicesSenal, s: SnapshotEstudio, now: Date): Candidata | null {
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'BONO' || !plan.sesiones || plan.precio <= 0) return null;
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio || !socio.activo) return null;

  const tipoClaseId = plan.tiposClaseIds?.[0] ?? null;
  const planMensual = s.planesTarifa.find(p =>
    p.studioId === plan.studioId && p.tipo === 'MENSUAL' && p.activo && p.precio > 0
    && planCubreTipoClase(p, tipoClaseId)
  );
  if (!planMensual) return null;

  // Acotada al tipo de clase del bono, no la frecuencia TOTAL de la socia —
  // si no, una socia que también asiste a otra disciplina con otro plan
  // (planes_por_tipo_de_clase) infla la frecuencia y abarata artificialmente
  // el coste estimado del mensual (mismo punto ciego que P2-5 ya corrigió en F1).
  const freq = frecuenciaHabitualPorTipoClase(sus.socioId, tipoClaseId, idx);
  if (freq === null || freq <= 0) return null;

  const costeEfectivoPorSesion = plan.precio / plan.sesiones;
  const costeMensualPorSesion = planMensual.precio / (freq * 4.33);
  if (costeMensualPorSesion >= costeEfectivoPorSesion) return null;
  const ahorroRelativo = (costeEfectivoPorSesion - costeMensualPorSesion) / costeEfectivoPorSesion;

  const desde = now.getTime() - VENTANA_PATRON_DIAS * MS_DIA;
  const bonosRecientes = (idx.suscripcionesPorSocio.get(sus.socioId) ?? []).filter(x => {
    const p = idx.planPorId.get(x.planId);
    if (!p || p.tipo !== 'BONO') return false;
    if (p.id !== plan.id) return false; // mismo bono exacto, no solo el mismo tipo de clase
    return new Date(x.fechaInicio).getTime() >= desde;
  });

  const confianza = confianzaProponerSuscripcionMensual({
    ahorroClaro: ahorroRelativo >= AHORRO_MINIMO,
    patronSostenido: bonosRecientes.length >= MIN_BONOS_PATRON,
  });
  if (!confianza) return null;

  const ahorroMensualEur = redondear2((costeEfectivoPorSesion - costeMensualPorSesion) * freq * 4.33);
  const motivoMotor = `${socio.nombre} lleva varios bonos de ${plan.nombre} seguidos y viene ${redondear2(freq)}×/semana de media. Con el plan ${planMensual.nombre} pagaría menos por lo mismo — le ahorraría unos ${ahorroMensualEur}€/mes.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'PROPONER_SUSCRIPCION_MENSUAL',
    dedupeKey: `FINANZAS:PROPONER_SUSCRIPCION_MENSUAL:${socio.id}`,
    tituloMotor: `${socio.nombre} saldría ganando con una mensualidad`,
    motivoMotor,
    datosUsados: {
      nombre: socio.nombre, bonoActual: plan.nombre, planMensual: planMensual.nombre,
      frecuenciaSemanal: redondear2(freq), ahorroRelativoPct: redondear2(ahorroRelativo * 100),
    },
    riesgo: 'OPORTUNIDAD',
    impacto: { valor: ahorroMensualEur, unidad: 'EUR_MES', formula: `diferencia de coste mensual entre ${plan.nombre} y ${planMensual.nombre} a su frecuencia real` },
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: 21,
    urgencia: 0.3,
    esfuerzo: 0.3,
  };
}

// ── F3 · Bono que CADUCA con sesiones sin usar (Fase 3 del Brain) ───────────
//
// El punto ciego de F1: mira `sesionesRestantes <= 1`, o sea el bono casi
// agotado. El caso contrario es igual de caro y no lo veía nadie — un bono con
// 8 sesiones que caduca el viernes. La socia pagó por algo que no llegó a usar,
// y así es como se pierde a una socia sin que se queje nunca.
//
// Lo que la propietaria hace con esto es una llamada de treinta segundos ("te
// quedan 5 y caducan el viernes, ¿te reservo?"), y la socia acaba viniendo,
// gastándolas y renovando. Por eso el impacto es el precio del bono: la
// renovación es lo que está en juego para el negocio.

// La ventana de aviso NO es fija: depende de cuánto tardaría ESTA socia en
// gastar lo que le queda a su ritmo real. Con 8 sesiones y viniendo una vez por
// semana necesita dos meses, así que avisarla a 14 días vista es avisarla
// cuando ya no hay nada que hacer — que es peor que no avisar.
//
// Comprobado contra producción (2026-08-11): con ventana fija de 14 días, los
// dos únicos bonos reales que caducan con sesiones sin usar (4 sesiones a 21
// días y 8 sesiones a 35) no se habrían avisado a tiempo ninguno de los dos.
const F3_DIAS_MINIMO = 14;     // suelo: por debajo siempre se avisa
const F3_DIAS_MAXIMO = 45;     // techo: más allá suena a spam, no a aviso
const F3_SESIONES_MINIMAS = 2; // con 1 sola ya lo cubre F1 (bono casi agotado)

/** Días que necesitaría para gastarlas a su ritmo, o `null` si no hay ritmo fiable. */
function diasQueNecesita(socioId: string, sesiones: number, idx: IndicesSenal): number | null {
  const porSemana = frecuenciaHabitual(socioId, idx);
  if (porSemana === null || porSemana <= 0) return null;
  return Math.ceil((sesiones / porSemana) * 7);
}

function reglaF3(sus: Suscripcion, idx: IndicesSenal, now: Date): Candidata | null {
  if (!sus.fechaFin) return null;
  const restantes = sus.sesionesRestantes;
  if (restantes == null || restantes < F3_SESIONES_MINIMAS) return null;

  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'BONO') return null;
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio || !socio.activo) return null;

  // Días naturales hasta la caducidad. Ya caducado no se avisa: no hay nada que
  // salvar, y decírselo entonces es peor que callarse.
  const diasParaCaducar = Math.ceil((new Date(sus.fechaFin).getTime() - now.getTime()) / MS_DIA);
  if (diasParaCaducar < 0) return null;

  const necesita = diasQueNecesita(socio.id, restantes, idx);
  // Sin ritmo fiable se cae al suelo de siempre: es lo único honesto que se
  // puede decir de alguien de quien no se sabe cada cuánto viene.
  const ventana = Math.min(F3_DIAS_MAXIMO, Math.max(F3_DIAS_MINIMO, necesita ?? 0));
  if (diasParaCaducar > ventana) return null;

  const confianza = confianzaBonoCaducaSinUsar({
    caducaPronto: true,
    // "Le sobran bastantes" = no le da tiempo a gastarlas viniendo a su ritmo.
    // Sin frecuencia fiable, 3+ sesiones en 2 semanas ya es mucho pedir.
    // "Le sobran bastantes" = a su ritmo real NO le da tiempo. Sin ritmo
    // conocido se cae al criterio de antes (3+ sesiones en dos semanas).
    bastantesSesionesSinUsar: necesita !== null ? necesita > diasParaCaducar : restantes >= 3,
  });
  if (!confianza) return null;

  const cuando = diasParaCaducar === 0 ? 'hoy'
    : diasParaCaducar === 1 ? 'mañana'
    : `en ${diasParaCaducar} días`;
  const motivoMotor = `A ${socio.nombre} le quedan ${restantes} sesiones de su ${plan.nombre} y le caducan ${cuando}. Pagó por ellas y se le van a quedar sin usar — una llamada ahora y todavía le da tiempo a venir.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'PROPONER_RENOVACION_BONO',
    // Misma dedupeKey que F1 a propósito: son dos caras del mismo aviso ("tu
    // bono se acaba") y a la socia no se le puede escribir dos veces por lo
    // mismo. `detectar` ya garantiza que solo salga una por socia.
    dedupeKey: `FINANZAS:PROPONER_RENOVACION_BONO:${socio.id}`,
    tituloMotor: `A ${socio.nombre} le caducan ${restantes} sesiones sin usar`,
    motivoMotor,
    datosUsados: {
      nombre: socio.nombre, sesionesRestantes: restantes, diasParaCaducar,
      // 0 = no hay ritmo fiable con el que estimarlo (ver diasQueNecesita).
      diasQueNecesitaria: necesita ?? 0,
      plan: plan.nombre, precio: plan.precio,
    },
    riesgo: 'PERDIDA',
    impacto: plan.precio > 0
      ? { valor: redondear2(plan.precio), unidad: 'EUR', formula: `renovación del bono ${plan.nombre}: ${plan.precio}€` }
      : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    // Caduca con el bono: pasada esa fecha el aviso ya no sirve de nada.
    expiraEnDias: Math.max(1, diasParaCaducar),
    // Cuanto menos queda, más urge: el último día es lo más urgente que hay.
    urgencia: Math.min(0.95, 0.5 + Math.max(0, ventana - diasParaCaducar) / (ventana * 2)),
    esfuerzo: 0.3,
  };
}

// ── F4 · La tarjeta caduca antes del próximo cobro (Fase 3 del Brain) ───────
//
// La causa de impago más predecible que existe, y la más barata de evitar: un
// mensaje una semana antes. Hasta ahora era estructuralmente invisible porque
// la caducidad de la tarjeta no se guardaba en ninguna parte (migr
// 20260811090114 + lib/billing/caducidad-tarjeta.ts).
//
// ⚠️ Solo se mira a quien tiene tarjeta guardada Y cuota recurrente: a quien
// paga en mostrador le da igual que su tarjeta caduque.

const F4_DIAS_VISTA = 45; // margen para avisar sin que suene a urgencia falsa

function reglaF4(sus: Suscripcion, idx: IndicesSenal, now: Date): Candidata | null {
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio || !socio.activo) return null;
  // Sin tarjeta guardada no hay nada que caduque; sin caducidad conocida no se
  // afirma nada (null NO es "no caduca" — ver caducidad-tarjeta.ts).
  if (!socio.stripePaymentMethodId) return null;
  if (socio.tarjetaExpMes == null || socio.tarjetaExpAnio == null) return null;

  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'MENSUAL') return null; // solo cuota recurrente

  // El próximo cobro: su fecha de fin si la tiene, y si no el horizonte de aviso.
  const proximoCobro = sus.fechaFin ? new Date(sus.fechaFin) : new Date(now.getTime() + F4_DIAS_VISTA * MS_DIA);
  if (proximoCobro.getTime() - now.getTime() > F4_DIAS_VISTA * MS_DIA) return null;

  const tarjeta = { expMes: socio.tarjetaExpMes, expAnio: socio.tarjetaExpAnio };
  if (!caducaAntesDe(tarjeta, proximoCobro)) return null;

  const confianza = confianzaTarjetaCaduca({ caducaAntesDelCobro: true });
  if (!confianza) return null;

  const yaCaducada = caducaAntesDe(tarjeta, now);
  const comoSeLlama = [socio.tarjetaMarca, socio.tarjetaUltimos4 ? `···${socio.tarjetaUltimos4}` : null]
    .filter(Boolean).join(' ');
  // Sin marca ni últimos 4 se dice "su tarjeta" y ya: mejor vago que inventado.
  const laTarjeta = comoSeLlama ? `su ${comoSeLlama}` : 'su tarjeta';
  const mmaa = `${String(socio.tarjetaExpMes).padStart(2, '0')}/${socio.tarjetaExpAnio}`;

  const motivoMotor = yaCaducada
    ? `${laTarjeta} caducó en ${mmaa} y su cuota de ${plan.nombre} se le cobra con ella. El próximo cobro va a fallar seguro — mejor pedirle que la actualice antes de que salte el aviso de impago.`
    : `${laTarjeta} caduca en ${mmaa}, antes de su próximo cobro de ${plan.nombre}. Un mensaje ahora evita el impago y el mal rato de los dos.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'COBRAR_PENDIENTE',
    dedupeKey: `FINANZAS:TARJETA_CADUCA:${socio.id}`,
    tituloMotor: yaCaducada
      ? `${socio.nombre} tiene la tarjeta caducada`
      : `A ${socio.nombre} le caduca la tarjeta en ${mmaa}`,
    motivoMotor,
    datosUsados: {
      nombre: socio.nombre, caducidad: mmaa, yaCaducada,
      plan: plan.nombre, tarjeta: comoSeLlama || 'sin identificar',
    },
    riesgo: 'PERDIDA',
    impacto: plan.precio > 0
      ? { valor: redondear2(plan.precio), unidad: 'EUR_MES', formula: `cuota de ${plan.nombre} que no se podrá cobrar` }
      : undefined,
    confianza,
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 2,
    expiraEnDias: 21,
    urgencia: yaCaducada ? 0.9 : 0.6,
    esfuerzo: 0.2,
  };
}

// ── F5 · Riesgo de que el próximo cobro falle (Fase 3 del Brain) ────────────
//
// El dunning es 100 % reactivo: reintenta DESPUÉS del fallo. Esto mira hacia
// delante con lo único honesto que hay — lo que le ha pasado a ESTA socia
// comparado con el resto del estudio.
//
// ⚠️ Es una ESTIMACIÓN, no un hecho como F4. Por eso `confianzaRiesgoDeCobro`
// nunca llega a ALTA, y por eso la acción es avisar, nunca cobrar: mover dinero
// por una probabilidad no se hace en este repo.

// El corte es RELATIVO al propio estudio, no un número absoluto. Dos motivos:
// el suavizado hacia la media del estudio ya empuja a todo el mundo hacia esa
// media (con 7 observaciones el prior pesa casi la mitad), así que un umbral
// fijo tipo 0.35 casi nunca se alcanza; y "cobra mal" significa cosas distintas
// en un estudio donde entra el 98% y en otro donde entra el 70%. Así se señala
// a quien se desvía de SU estudio, que es la pregunta que importa — mismo
// criterio que `calibrarUmbral`, que también calibra contra el propio historial.
const F5_FRACCION_DEL_ESTUDIO = 0.7;

function reglaF5(sus: Suscripcion, idx: IndicesSenal, s: SnapshotEstudio, now: Date): Candidata | null {
  const socio = idx.socioPorId.get(sus.socioId);
  if (!socio || !socio.activo) return null;
  const plan = idx.planPorId.get(sus.planId);
  if (!plan || plan.tipo !== 'MENSUAL' || plan.precio <= 0) return null;

  // Solo si tiene un cobro por delante: avisar de un riesgo sin cobro pendiente
  // no le da a nadie nada que hacer.
  if (!sus.fechaFin) return null;
  const diasHastaCobro = Math.ceil((new Date(sus.fechaFin).getTime() - now.getTime()) / MS_DIA);
  if (diasHastaCobro < 0 || diasHastaCobro > 30) return null;

  const suyo = historialCobroDeSocio(socio.id, s);
  const delEstudio = historialCobroDelEstudio(s);
  const prior = tasaBase(delEstudio.cobrados, delEstudio.resueltos);
  if (prior === null) return null; // el estudio no ha cobrado nada todavía

  const prediccion = estimarProbabilidad({
    exitos: suyo.cobrados,
    total: suyo.resueltos,
    prior,
    base: `le han entrado ${suyo.cobrados} de sus ${suyo.resueltos} cobros`,
  });
  // `null` = sin historial suficiente. NO se avisa: acusar a alguien de que va a
  // dejar de pagar con dos datos es exactamente lo que no se hace aquí.
  if (!prediccion) return null;

  const confianza = confianzaRiesgoDeCobro({
    historialSuficiente: true,
    probabilidadAlta: prediccion.probabilidad < prior * F5_FRACCION_DEL_ESTUDIO,
  });
  if (!confianza || confianza.nivel === 'BAJA') return null;

  const pctFallo = Math.round((1 - prediccion.probabilidad) * 100);
  const motivoMotor = `A ${socio.nombre} se le cobra ${plan.nombre} en ${diasHastaCobro} ${diasHastaCobro === 1 ? 'día' : 'días'} y su historial no acompaña: ${prediccion.base}. Hay bastantes papeletas (${pctFallo}%) de que este también falle — merece la pena hablar con ella antes que perseguir el impago después.`;

  return {
    especialista: 'FINANZAS',
    tipo: 'COBRAR_PENDIENTE',
    dedupeKey: `FINANZAS:RIESGO_COBRO:${socio.id}`,
    tituloMotor: `El cobro de ${socio.nombre} tiene mala pinta`,
    motivoMotor,
    datosUsados: {
      nombre: socio.nombre, diasHastaCobro, plan: plan.nombre,
      cobrosEntrados: suyo.cobrados, cobrosResueltos: suyo.resueltos,
      probabilidadFalloPct: pctFallo,
    },
    riesgo: 'PERDIDA',
    impacto: { valor: redondear2(plan.precio), unidad: 'EUR_MES', formula: `cuota de ${plan.nombre} en riesgo` },
    confianza,
    prediccion,
    // Avisar, nunca cobrar: COBRAR_RECIBOS sigue fuera de todo lo automático.
    accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP', textoSugerido: motivoMotor },
    socioId: socio.id,
    tiempoEstimadoMin: 3,
    expiraEnDias: Math.max(1, diasHastaCobro),
    urgencia: Math.min(0.8, 0.4 + (30 - diasHastaCobro) / 60),
    esfuerzo: 0.3,
  };
}

export const finanzas: Especialista = {
  id: 'FINANZAS',
  pregunta: '¿Qué ingresos recurrentes están en riesgo?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);
    const candidatas: Candidata[] = [];
    for (const sus of s.suscripciones) {
      if (sus.estado !== 'ACTIVA') continue;
      // Orden a propósito: F1 (bono AGOTADO) manda sobre F3 (bono que CADUCA
      // con sesiones sin usar) — con 1 sesión y caducando, lo urgente es que se
      // le acaba, no que caduque. Y las dos comparten dedupeKey, así que solo
      // puede salir una por socia de todas formas.
      const candidata = reglaF1(sus, idx) ?? reglaF3(sus, idx, now) ?? reglaF2(sus, idx, s, now);
      if (candidata) candidatas.push(candidata);

      // F4/F5 van APARTE de la cadena de bono: hablan de la cuota mensual, no
      // del bono, tienen su propia dedupeKey y pueden convivir con un aviso de
      // bono de la misma socia. `coordinarColisiones` (director.ts) se encarga
      // luego de que a la propietaria le llegue una sola por socia.
      //
      // F4 antes que F5: si la tarjeta caduca, eso es un HECHO comprobable y
      // hace irrelevante cualquier estimación sobre su historial.
      const deCuota = reglaF4(sus, idx, now) ?? reglaF5(sus, idx, s, now);
      if (deCuota) candidatas.push(deCuota);
    }
    return candidatas;
  },
};
