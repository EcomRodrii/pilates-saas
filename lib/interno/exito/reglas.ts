// Customer Success ligado a billing (Fase 5 de Billing & Revenue, 17-nov-2026). PURO: recibe lo ya
// leído y devuelve alertas; la lectura vive en `servidor.ts`.
//
// Reglas que no se negocian (brief del fundador):
//   · Solo INTERNO: aquí nada contacta a ningún estudio. Cada alerta dice qué pasa, con qué datos y qué
//     haría una persona; quien decide y escribe es el equipo.
//   · Nada de upgrades ni cobros automáticos: una oportunidad es una propuesta con su dato.
//   · Ninguna alerta sin dato que la sostenga. Si la fuente no se pudo leer, no se inventa nada.
import { PLAN_INFO, type Plan } from '../../billing/entitlements.ts';

export type FamiliaAlerta = 'billing' | 'retencion' | 'oportunidad';
export type Severidad = 'alta' | 'media' | 'baja';

export type TipoAlerta =
  | 'contratacion-sin-terminar' | 'primer-pago-fallido' | 'impago-persistente' | 'baja-programada' | 'renovacion-en-riesgo'
  | 'visitas-sin-contratar' | 'sin-uso'
  | 'limite-superado' | 'varias-sedes' | 'asistente-sin-saldo' | 'complementos-por-estudio';

export interface Alerta {
  /** Estable: `tipo:objetivo`. Sirve de clave en la pantalla. */
  id: string;
  tipo: TipoAlerta;
  familia: FamiliaAlerta;
  severidad: Severidad;
  estudioId: string | null;
  nombre: string;
  titulo: string;
  /** Los datos que la sostienen, uno por línea. */
  contexto: string[];
  /** Lo que haría una persona. Una sugerencia, no una orden ni una acción automática. */
  accion: string;
  /** Dónde mirar (ficha del estudio, cobros…). */
  href: string | null;
  /** Dinero mensual en juego (o a ganar), si se sabe. */
  eurosMes: number | null;
}

// Umbrales: propuestas, con su motivo. Se ajustan aquí, en un solo sitio.
export const DIAS_CONTRATACION_SIN_TERMINAR = 3; // el brief: «tres días sin completar su contratación»
export const DIAS_IMPAGO_PERSISTENTE = 3; //        con los avisos 0 y 2 ya mandados, sin resolverse
export const VISITAS_DIAS_MINIMAS = 3; //           días distintos viendo planes en 14 días
export const DIAS_SIN_USO = 14; //                  un cliente de pago que no entra
export const DIAS_RENOVACION_CERCA = 7;
export const VECES_SIN_SALDO_ASISTENTE = 3; //       en 30 días

const eur = (n: number) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`;
const eurCents = (c: number) => eur(c / 100);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const fichaDe = (id: string | null) => (id ? `/interno/estudios/${id}` : null);
const nombrePlan = (p: string | null) => (p && p in PLAN_INFO ? PLAN_INFO[p as Plan].nombre : p ?? 'su plan');

// ── Entradas ────────────────────────────────────────────────────────────────

export interface ContratacionSinTerminar { estudioId: string; nombre: string; clienteCreadoEn: string; visitasDias14d: number }
export interface ImpagoFila {
  estudioId: string | null; nombre: string; plan: string | null; importeCents: number; diasAbierto: number; intentos: number;
  motivo: string | null; avisosDias: number[]; esPrimerPago: boolean; estado: string;
}
export interface BajaProgramada { estudioId: string | null; nombre: string; plan: string | null; eurosMes: number; hasta: string }
export interface RenovacionCerca {
  estudioId: string | null; nombre: string; plan: string | null; eurosMes: number; fecha: string;
  /** Días desde que alguien del equipo usó el panel; `null` = no hay dato. */
  diasSinEntrar: number | null; tarjetaCaducaAntes: boolean;
}
export interface VisitasSinContratar { estudioId: string; nombre: string; diasConVisita14d: number }
export interface SinUso { estudioId: string | null; nombre: string; plan: string | null; eurosMes: number; diasSinEntrar: number }
export interface LimiteSuperado { estudioId: string; nombre: string; fase: 'MARGEN' | 'CERRADO'; diasRestantes: number | null; reservas30d: number | null; limiteReservas: number }
export interface VariasSedes { duenaId: string; estudios: Array<{ id: string; nombre: string }> }
export interface AsistenteSinSaldo { estudioId: string; nombre: string; veces30d: number; plan: string | null }
export interface ComplementosPorEstudio { estudioId: string; nombre: string; addons: string[]; costeMensualEuros: number }

export interface EntradaExito {
  contrataciones: readonly ContratacionSinTerminar[];
  impagos: readonly ImpagoFila[];
  bajas: readonly BajaProgramada[];
  renovaciones: readonly RenovacionCerca[];
  visitas: readonly VisitasSinContratar[];
  sinUso: readonly SinUso[];
  limites: readonly LimiteSuperado[];
  sedes: readonly VariasSedes[];
  asistente: readonly AsistenteSinSaldo[];
  complementos: readonly ComplementosPorEstudio[];
}

const diasEntre = (iso: string, ahora: Date) => Math.floor((ahora.getTime() - new Date(iso).getTime()) / 86_400_000);
const dia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });

export function construirAlertas(e: EntradaExito, ahora: Date): Alerta[] {
  const out: Alerta[] = [];

  // ── Billing: lo que pasa con el dinero de un cliente ──────────────────────
  for (const c of e.contrataciones) {
    const dias = diasEntre(c.clienteCreadoEn, ahora);
    if (dias < DIAS_CONTRATACION_SIN_TERMINAR) continue;
    out.push({
      id: `contratacion-sin-terminar:${c.estudioId}`, tipo: 'contratacion-sin-terminar', familia: 'billing', severidad: dias >= 7 ? 'alta' : 'media',
      estudioId: c.estudioId, nombre: c.nombre, titulo: `${c.nombre} empezó a contratar hace ${dias} días y no terminó`,
      contexto: [
        `Abrió el pago y no llegó a tener suscripción (hace ${dias} ${plural(dias, 'día', 'días')}).`,
        c.visitasDias14d > 0 ? `Ha visto sus planes ${c.visitasDias14d} ${plural(c.visitasDias14d, 'día', 'días distintos')} en las últimas dos semanas.` : 'No ha vuelto a ver sus planes en las últimas dos semanas.',
      ],
      accion: 'Escríbele o llámale para preguntar si algo le frenó (precio, tarjeta, dudas). No le mandes nada automático.',
      href: fichaDe(c.estudioId), eurosMes: null,
    });
  }

  for (const i of e.impagos) {
    if (i.esPrimerPago) {
      out.push({
        id: `primer-pago-fallido:${i.estudioId ?? i.nombre}`, tipo: 'primer-pago-fallido', familia: 'billing', severidad: 'alta',
        estudioId: i.estudioId, nombre: i.nombre, titulo: `${i.nombre} intentó pagar su suscripción y falló`,
        contexto: [
          `Importe: ${eurCents(i.importeCents)} (${nombrePlan(i.plan)}).`,
          i.motivo ?? 'El banco no ha dicho el motivo.',
          i.avisosDias.length > 0 ? `Ya se le avisó por correo (días ${i.avisosDias.join(', ')}).` : 'Todavía no se le ha avisado por correo.',
        ],
        accion: 'Es un cliente que quería pagar: ofrécele ayuda para probar otra tarjeta. Es la alerta con más probabilidad de recuperarse.',
        href: '/interno/facturacion', eurosMes: null,
      });
    } else if (i.diasAbierto >= DIAS_IMPAGO_PERSISTENTE) {
      out.push({
        id: `impago-persistente:${i.estudioId ?? i.nombre}`, tipo: 'impago-persistente', familia: 'billing', severidad: i.estado === 'ESCALADO' || i.diasAbierto >= 7 ? 'alta' : 'media',
        estudioId: i.estudioId, nombre: i.nombre, titulo: `${i.nombre} lleva ${i.diasAbierto} días sin pagar su plan`,
        contexto: [
          `Importe: ${eurCents(i.importeCents)} (${nombrePlan(i.plan)}) · ${i.intentos} ${plural(i.intentos, 'intento', 'intentos')} de Stripe.`,
          i.motivo ?? 'El banco no ha dicho el motivo.',
          i.avisosDias.length > 0 ? `Avisada por correo los días ${i.avisosDias.join(', ')}.` : 'Sin avisos por correo todavía.',
        ],
        accion: 'Llámale antes de que Stripe agote los reintentos y cancele la suscripción. Suspender el estudio es una decisión tuya, desde su ficha: aquí no se hace nada solo.',
        href: '/interno/facturacion', eurosMes: null,
      });
    }
  }

  for (const b of e.bajas) {
    out.push({
      id: `baja-programada:${b.estudioId ?? b.nombre}`, tipo: 'baja-programada', familia: 'retencion', severidad: 'alta',
      estudioId: b.estudioId, nombre: b.nombre, titulo: `${b.nombre} ha programado su baja para el ${dia(b.hasta)}`,
      contexto: [`Plan ${nombrePlan(b.plan)} · ${eur(b.eurosMes)} al mes en juego.`, 'Sigue teniendo acceso hasta esa fecha y puede reactivarla sin coste.'],
      accion: 'Pregúntale por qué se va mientras aún está a tiempo. Si es por precio o por algo que falta, es información valiosa aunque no se quede.',
      href: fichaDe(b.estudioId), eurosMes: b.eurosMes,
    });
  }

  for (const r of e.renovaciones) {
    const motivos: string[] = [];
    if (r.tarjetaCaducaAntes) motivos.push('su tarjeta caduca antes de la renovación');
    if (r.diasSinEntrar !== null && r.diasSinEntrar >= DIAS_SIN_USO) motivos.push(`no entra al panel desde hace ${r.diasSinEntrar} días`);
    if (motivos.length === 0) continue;
    out.push({
      id: `renovacion-en-riesgo:${r.estudioId ?? r.nombre}`, tipo: 'renovacion-en-riesgo', familia: 'billing', severidad: r.tarjetaCaducaAntes ? 'alta' : 'media',
      estudioId: r.estudioId, nombre: r.nombre, titulo: `La renovación de ${r.nombre} (${dia(r.fecha)}) está en riesgo`,
      contexto: [`Plan ${nombrePlan(r.plan)} · ${eur(r.eurosMes)} al mes.`, `Motivo: ${motivos.join(' y ')}.`],
      accion: r.tarjetaCaducaAntes
        ? 'Avísale de que actualice la tarjeta antes de esa fecha: es un impago que se puede evitar.'
        : 'Mira cómo va su uso y escríbele para ver si le está sirviendo antes de que renueve.',
      href: fichaDe(r.estudioId), eurosMes: r.eurosMes,
    });
  }

  for (const v of e.visitas) {
    if (v.diasConVisita14d < VISITAS_DIAS_MINIMAS) continue;
    out.push({
      id: `visitas-sin-contratar:${v.estudioId}`, tipo: 'visitas-sin-contratar', familia: 'billing', severidad: 'media',
      estudioId: v.estudioId, nombre: v.nombre, titulo: `${v.nombre} ha mirado sus planes ${v.diasConVisita14d} días y no contrata`,
      contexto: [
        `Ha visto la pantalla de planes en ${v.diasConVisita14d} días distintos de las últimas dos semanas.`,
        'Cuenta solo la pantalla de planes dentro de su panel: la web pública de precios no se puede atribuir a un estudio.',
      ],
      accion: 'Está interesado pero algo le frena. Ofrécele resolver dudas o una demo del plan que miraba.',
      href: fichaDe(v.estudioId), eurosMes: null,
    });
  }

  for (const s of e.sinUso) {
    out.push({
      id: `sin-uso:${s.estudioId ?? s.nombre}`, tipo: 'sin-uso', familia: 'retencion', severidad: s.diasSinEntrar >= 30 ? 'alta' : 'media',
      estudioId: s.estudioId, nombre: s.nombre, titulo: `${s.nombre}, cliente de pago, no entra desde hace ${s.diasSinEntrar} días`,
      contexto: [`Plan ${nombrePlan(s.plan)} · ${eur(s.eurosMes)} al mes.`, 'Un cliente que paga y no usa el producto es quien cancela después.'],
      accion: 'Escríbele para ver si necesita ayuda con algo; si dejó de usarlo, pregunta por qué.',
      href: fichaDe(s.estudioId), eurosMes: s.eurosMes,
    });
  }

  // ── Oportunidades: propuestas con su dato, nunca acciones automáticas ─────
  for (const l of e.limites) {
    const cerrado = l.fase === 'CERRADO';
    out.push({
      id: `limite-superado:${l.estudioId}`, tipo: 'limite-superado', familia: 'oportunidad', severidad: cerrado ? 'alta' : 'media',
      estudioId: l.estudioId, nombre: l.nombre,
      titulo: cerrado ? `${l.nombre} ha agotado su margen del plan gratis` : `${l.nombre} ha superado el límite del plan gratis`,
      contexto: [
        l.reservas30d !== null ? `${l.reservas30d} reservas en 30 días (el plan gratis llega a ${l.limiteReservas}).` : 'Pasó el límite de reservas del plan gratis.',
        cerrado ? 'Su panel está cerrado hasta que elija un plan de pago.' : `Le quedan ${l.diasRestantes ?? '—'} ${plural(l.diasRestantes ?? 0, 'día', 'días')} de margen antes de que se cierre el panel.`,
      ],
      accion: `Es un estudio que usa el producto de verdad. Propónle ${PLAN_INFO.BASE.nombre} (${PLAN_INFO.BASE.precioMes} €/mes, sin límite de reservas) antes de que se cierre su panel.`,
      href: fichaDe(l.estudioId), eurosMes: PLAN_INFO.BASE.precioMes,
    });
  }

  for (const s of e.sedes) {
    if (s.estudios.length < 2) continue;
    out.push({
      id: `varias-sedes:${s.duenaId}`, tipo: 'varias-sedes', familia: 'oportunidad', severidad: 'media',
      estudioId: s.estudios[0]!.id, nombre: s.estudios.map((x) => x.nombre).join(' + '),
      titulo: `Una misma propietaria lleva ${s.estudios.length} estudios por separado`,
      contexto: [`Estudios: ${s.estudios.map((x) => x.nombre).join(', ')}.`, `Ninguno está en una cadena; ${PLAN_INFO.CADENA.nombre} es ${PLAN_INFO.CADENA.precioMes} €/mes para varias sedes.`],
      accion: `Pregúntale si son sedes de un mismo negocio: ${PLAN_INFO.CADENA.nombre} las junta con un solo plan y un solo cobro. Si son negocios distintos, no hagas nada.`,
      href: fichaDe(s.estudios[0]!.id), eurosMes: null,
    });
  }

  for (const a of e.asistente) {
    if (a.veces30d < VECES_SIN_SALDO_ASISTENTE) continue;
    out.push({
      id: `asistente-sin-saldo:${a.estudioId}`, tipo: 'asistente-sin-saldo', familia: 'oportunidad', severidad: 'baja',
      estudioId: a.estudioId, nombre: a.nombre, titulo: `${a.nombre} se ha quedado sin consultas del asistente ${a.veces30d} veces`,
      contexto: [`${a.veces30d} consultas rechazadas por falta de saldo en 30 días (${nombrePlan(a.plan)}).`, 'Lo usa lo bastante como para chocar con su cuota.'],
      accion: `Cuéntale que ${PLAN_INFO.ESTUDIO.nombre} incluye más consultas, o que puede comprar un pack. Que elija ella.`,
      href: fichaDe(a.estudioId), eurosMes: null,
    });
  }

  for (const c of e.complementos) {
    if (c.addons.length < 2) continue;
    const estudio = PLAN_INFO.ESTUDIO.precioMes;
    out.push({
      id: `complementos-por-estudio:${c.estudioId}`, tipo: 'complementos-por-estudio', familia: 'oportunidad', severidad: 'baja',
      estudioId: c.estudioId, nombre: c.nombre, titulo: `${c.nombre} paga ${c.addons.length} complementos: mira si le compensa ${PLAN_INFO.ESTUDIO.nombre}`,
      contexto: [
        `Paga ${eur(c.costeMensualEuros)} al mes (${PLAN_INFO.BASE.nombre} + ${c.addons.join(', ')}).`,
        `${PLAN_INFO.ESTUDIO.nombre} cuesta ${eur(estudio)} al mes con los tres complementos incluidos y más consultas del asistente.`,
      ],
      accion: c.costeMensualEuros >= estudio
        ? `Ya paga lo mismo o más que ${PLAN_INFO.ESTUDIO.nombre}: ofrécele el cambio, sale ganando.`
        : `Pagaría ${eur(estudio - c.costeMensualEuros)} más al mes y tendría todo incluido: ofrécelo solo si le falta alguno de los complementos.`,
      href: fichaDe(c.estudioId), eurosMes: c.costeMensualEuros >= estudio ? null : estudio - c.costeMensualEuros,
    });
  }

  return ordenarAlertas(out);
}

const PESO: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
const PESO_FAMILIA: Record<FamiliaAlerta, number> = { billing: 0, retencion: 1, oportunidad: 2 };

/** Primero lo que cuesta dejar (severidad), luego el dinero en juego y la familia. Estable. */
export function ordenarAlertas(alertas: readonly Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) =>
    PESO[a.severidad] - PESO[b.severidad]
    || PESO_FAMILIA[a.familia] - PESO_FAMILIA[b.familia]
    || (b.eurosMes ?? 0) - (a.eurosMes ?? 0)
    || a.id.localeCompare(b.id));
}

/** ¿La tarjeta (mes/año de caducidad) caduca antes de esa fecha? Una tarjeta vale hasta el ÚLTIMO día de su mes. */
export function tarjetaCaducaAntes(expMes: number, expAno: number, fechaIso: string): boolean {
  const finDeMes = Date.UTC(expAno, expMes, 1); // 1 del mes siguiente, 00:00 UTC
  return finDeMes <= new Date(fechaIso).getTime();
}
