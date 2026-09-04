// ─────────────────────────────────────────────────────────────────────────────
// Qué incluye cada plan, por categorías.
//
// Una sola fuente para las TRES pantallas que enseñan planes: /precios (pública),
// /suscripcion (dentro del panel) y el paso «elige tu plan» del alta. Antes cada
// una tenía su propia lista escrita a mano —/precios con 11 filas, /suscripcion
// con 4 bullets por plan— y ya divergían entre sí.
//
// ⚠️ Regla dura: el valor de cada fila se DERIVA de `PLAN_ENTITLEMENTS`, no se
// escribe a mano. Es lo mismo que gobierna lo que el servidor deja hacer de
// verdad, así que una página de precios que prometa un límite distinto del que
// aplica el producto deja de ser posible por construcción.
//
// ⚠️ Segunda regla: aquí solo se listan funcionalidades que un estudio puede
// USAR HOY. Lo congelado en `lib/frozen-features.ts` (Kiosko, Caja/POS, Oferta
// digital, Comunidad, Chat de equipo) NO aparece, aunque el código exista: son
// pantallas a las que nadie puede llegar. Marketing e IA sí están, porque
// `MARKETING_MODULE_ENABLED` volvió a `true` el 2026-08-13 — el comentario de
// /precios que las excluía se quedó desfasado desde entonces.
// ─────────────────────────────────────────────────────────────────────────────

import { PLAN_ENTITLEMENTS, type Plan } from './entitlements.ts';

/** Cómo se pinta una fila para un plan concreto. */
export type ValorPlan =
  | { tipo: 'si' }
  | { tipo: 'no' }
  | { tipo: 'texto'; texto: string };

const SI: ValorPlan = { tipo: 'si' };
const NO: ValorPlan = { tipo: 'no' };
const txt = (texto: string): ValorPlan => ({ tipo: 'texto', texto });

/** El tope de alumnas: la única fila que el resumen corto trata aparte. */
export const FILA_TOPE_ALUMNAS = 'tope-alumnas';

/** Todo el mundo lo tiene: el núcleo no se trocea por plan. */
const TODOS = (): ValorPlan => SI;

/** Derivado del entitlement real, nunca escrito a mano. */
const porFeature =
  (feature: keyof (typeof PLAN_ENTITLEMENTS)['BASE']['features']) =>
  (p: Plan): ValorPlan =>
    PLAN_ENTITLEMENTS[p].features[feature] ? SI : NO;

export interface FilaPlan {
  /** Identificador estable para las filas a las que hay que referirse desde
   *  código (hoy solo el tope de alumnas). El resto no lo necesita. */
  id?: string;
  /** Qué hace, en la lengua de quien lleva el estudio. */
  nombre: string;
  /** Una línea de contexto. Se enseña en la comparativa ampliada, no en la corta. */
  detalle?: string;
  valor: (p: Plan) => ValorPlan;
}

export interface CategoriaPlan {
  id: string;
  titulo: string;
  filas: FilaPlan[];
}

export const CATEGORIAS: CategoriaPlan[] = [
  {
    id: 'reservas',
    titulo: 'Reservas',
    filas: [
      { nombre: 'Reservas online para tus alumnas', detalle: 'Desde el móvil, sin llamarte ni escribirte.', valor: TODOS },
      { nombre: 'Widget de reservas en tu web', detalle: 'Se incrusta en tu página actual; no hace falta cambiarla.', valor: TODOS },
      { nombre: 'Lista de espera automática', detalle: 'Cuando alguien cancela, la plaza se ofrece sola a la siguiente.', valor: TODOS },
      { nombre: 'Reglas de reserva por tipo de clase', detalle: 'Antelación, plan obligatorio, aprobación manual y mínimo de asistentes.', valor: TODOS },
      { nombre: 'Políticas de cancelación y no-show', detalle: 'Ventana de cancelación, devolución de bono y penalización opcional.', valor: TODOS },
      { nombre: 'Plazas fijas y recuperaciones', valor: TODOS },
    ],
  },
  {
    id: 'agenda',
    titulo: 'Agenda y salas',
    filas: [
      { nombre: 'Calendario por semana, día y sala', valor: TODOS },
      { nombre: 'Series recurrentes y duplicado de clases', valor: TODOS },
      { nombre: 'Salas con aforo propio', detalle: 'El aforo de la clase lo hereda de la sala.', valor: TODOS },
      { nombre: 'Citas individuales', detalle: 'Valoraciones y sesiones uno a uno, con su propio cobro.', valor: TODOS },
      { nombre: 'Control de asistencia y check-in', valor: TODOS },
    ],
  },
  {
    id: 'alumnas',
    titulo: 'Alumnas',
    filas: [
      {
        id: FILA_TOPE_ALUMNAS,
        nombre: 'Alumnas activas',
        detalle: 'El tope se aplica sobre las activas; nadie se borra al llegar al límite.',
        valor: (p) => {
          const max = PLAN_ENTITLEMENTS[p].maxSocios;
          return txt(max === Infinity ? 'Sin límite' : `Hasta ${max}`);
        },
      },
      { nombre: 'Ficha de alumna e historial', valor: TODOS },
      { nombre: 'Ficha de salud y notas de progreso', detalle: 'Con permisos aparte: recepción no ve el detalle clínico.', valor: TODOS },
      { nombre: 'Campos personalizados y etiquetas', valor: TODOS },
      { nombre: 'Cuestionario de salud y consentimientos', valor: TODOS },
      { nombre: 'Importar tus alumnas desde otra plataforma', valor: TODOS },
    ],
  },
  {
    id: 'equipo',
    titulo: 'Equipo',
    filas: [
      { nombre: 'Instructoras, recepción y gerencia', detalle: 'Cada rol ve lo suyo: recepción no entra en la caja ni en la ficha clínica.', valor: TODOS },
      { nombre: 'Autoservicio de la instructora', detalle: 'Crea sus clases, marca su disponibilidad y confirma sus ausencias.', valor: TODOS },
      { nombre: 'Tarifa por hora y liquidación', valor: TODOS },
      { nombre: 'Una instructora en varias sedes', detalle: 'Con horario, tarifa y permisos distintos en cada una.', valor: porFeature('multiCentro') },
    ],
  },
  {
    id: 'sustituciones',
    titulo: 'Sustituciones',
    filas: [
      { nombre: 'Aviso de baja y búsqueda de sustituta', valor: TODOS },
      { nombre: 'Ranking de candidatas por encaje', detalle: 'Ordenadas por disponibilidad y costumbre horaria, no al azar.', valor: TODOS },
      { nombre: 'Modo asistido', detalle: 'Tentare propone y tú das el visto bueno.', valor: TODOS },
      { nombre: 'Modo autónomo y modo Vacaciones', detalle: 'Contacta a las candidatas y cierra la sustitución sin ti.', valor: porFeature('sustitucionesAutonomas') },
    ],
  },
  {
    id: 'pagos',
    titulo: 'Cobros y pagos',
    filas: [
      { nombre: 'Cobro con tarjeta (Stripe)', detalle: 'El dinero va directo a tu cuenta. Tentare no se lleva comisión.', valor: TODOS },
      { nombre: 'Domiciliación SEPA', valor: TODOS },
      { nombre: 'Cobro guardado para renovaciones', valor: TODOS },
      { nombre: 'Recobro automático de impagos', valor: TODOS },
      { nombre: 'Devoluciones desde el panel', valor: TODOS },
    ],
  },
  {
    id: 'bonos',
    titulo: 'Bonos y cuotas',
    filas: [
      { nombre: 'Bonos de sesiones con caducidad', valor: TODOS },
      { nombre: 'Cuotas mensuales y renovación automática', valor: TODOS },
      { nombre: 'Planes por tipo de clase', detalle: 'Un bono que solo sirve para Reformer, por ejemplo.', valor: TODOS },
      { nombre: 'Varios bonos activos a la vez', valor: TODOS },
    ],
  },
  {
    id: 'facturacion',
    titulo: 'Facturación',
    filas: [
      { nombre: 'Facturas con numeración legal', valor: TODOS },
      { nombre: 'Veri*Factu (AEAT)', detalle: 'Firma y envío a Hacienda desde el propio panel.', valor: TODOS },
      { nombre: 'Cierre de año para la gestoría', valor: TODOS },
      { nombre: 'Exportación de tus datos cuando quieras', valor: TODOS },
    ],
  },
  {
    id: 'automatizaciones',
    titulo: 'Automatizaciones y avisos',
    filas: [
      { nombre: 'Recordatorios de clase', detalle: 'Por email, WhatsApp o push, según lo que tengas conectado.', valor: TODOS },
      { nombre: 'Avisos de bono a punto de acabarse', valor: TODOS },
      { nombre: 'Aviso de alumna que lleva tiempo sin venir', valor: TODOS },
      { nombre: 'Automatizaciones a tu medida', detalle: 'Tú eliges el disparador, la espera y el mensaje.', valor: TODOS },
      { nombre: 'Redacción de mensajes automática', valor: porFeature('ia') },
    ],
  },
  {
    id: 'inteligencia',
    titulo: 'Decisiones',
    filas: [
      { nombre: 'Informes de ocupación e ingresos', valor: TODOS },
      { nombre: 'Centro de Control', detalle: 'Un solo aviso al día, y solo cuando de verdad merece interrumpirte.', valor: porFeature('decisiones') },
      { nombre: 'Piloto automático', detalle: 'Ejecuta solo lo que ya has aprobado muchas veces.', valor: porFeature('decisiones') },
      { nombre: 'Riesgo de fuga y de impago', valor: porFeature('decisiones') },
    ],
  },
  {
    id: 'marketing',
    titulo: 'Marketing',
    filas: [
      { nombre: 'Campañas por email y WhatsApp', valor: porFeature('marketing') },
      { nombre: 'Segmentación de alumnas', valor: porFeature('marketing') },
      { nombre: 'Retos, logros y rachas', detalle: 'Para que la alumna vuelva sin que se lo tengas que recordar.', valor: porFeature('gamificacion') },
    ],
  },
  {
    id: 'app',
    titulo: 'App de tus alumnas',
    filas: [
      { nombre: 'Portal de la alumna', detalle: 'Reserva, bonos, facturas y pase de acceso, desde el móvil.', valor: TODOS },
      { nombre: 'Se instala en la pantalla de inicio', valor: TODOS },
      { nombre: 'Tu dirección propia', detalle: 'tentare.app/tu-estudio', valor: TODOS },
      { nombre: 'App con tu marca', detalle: 'Tus colores, tu logo y tus pantallas: la alumna no ve Tentare.', valor: porFeature('marca') },
    ],
  },
  {
    id: 'multisede',
    titulo: 'Varias sedes',
    filas: [
      { nombre: 'Varias sedes en un mismo panel', valor: porFeature('multiCentro') },
      { nombre: 'Una sola suscripción para toda la cadena', valor: porFeature('multiCentro') },
      { nombre: 'Menú y configuración por cadena', valor: porFeature('multiCentro') },
    ],
  },
  {
    id: 'soporte',
    titulo: 'Puesta en marcha y soporte',
    filas: [
      { nombre: 'Soporte en español', valor: TODOS },
      { nombre: 'Traemos tus datos de tu plataforma actual', detalle: 'Sin coste aparte. Tu sistema actual puede seguir funcionando mientras tanto.', valor: TODOS },
      { nombre: 'Actualizaciones y funciones nuevas', valor: TODOS },
      { nombre: 'Sin permanencia', valor: TODOS },
    ],
  },
];

/** Para quién es cada plan, en una frase. Lo que no se puede derivar del código. */
export const PARA_QUIEN: Record<Plan, { gancho: string; para: string }> = {
  BASE: {
    gancho: 'Para empezar',
    para: 'Un estudio con una sala y una o dos instructoras.',
  },
  ESTUDIO: {
    gancho: 'El más elegido',
    para: 'Un estudio en marcha, con equipo y el horario lleno.',
  },
  CADENA: {
    gancho: 'Varias sedes',
    para: 'Dos o más centros bajo la misma marca.',
  },
};

/**
 * Lo que gana este plan respecto al anterior. Se calcula comparando
 * entitlements, así que añadir una feature al catálogo la hace aparecer aquí
 * sola. `null` en el primer plan: no hay nada anterior con lo que compararlo.
 */
export function novedadesFrenteAlAnterior(
  plan: Plan,
  anterior: Plan | null,
  /** Filas que el llamador ya ha enseñado por su cuenta y no quiere repetidas. */
  omitir: readonly string[] = [],
): string[] {
  if (!anterior) return [];
  const nuevas: string[] = [];
  for (const cat of CATEGORIAS) {
    for (const fila of cat.filas) {
      if (fila.id && omitir.includes(fila.id)) continue;
      const antes = fila.valor(anterior);
      const ahora = fila.valor(plan);
      if (antes.tipo === 'no' && ahora.tipo === 'si') nuevas.push(fila.nombre);
      if (antes.tipo === 'texto' && ahora.tipo === 'texto' && antes.texto !== ahora.texto) {
        nuevas.push(`${fila.nombre}: ${ahora.texto.toLowerCase()}`);
      }
    }
  }
  return nuevas;
}

/**
 * Los 4 puntos que resumen un plan en una tarjeta estrecha (el alta en móvil,
 * donde no cabe la comparativa entera). El primero siempre es el tope de
 * alumnas —la pregunta que todo el mundo hace primero— y los tres siguientes,
 * lo que este plan estrena frente al anterior.
 */
export function resumenCorto(plan: Plan, anterior: Plan | null): string[] {
  const max = PLAN_ENTITLEMENTS[plan].maxSocios;
  const tope = max === Infinity ? 'Alumnas ilimitadas' : `Hasta ${max} alumnas activas`;
  if (!anterior) {
    return [tope, 'Reservas, agenda y salas', 'Cobros, bonos y facturación', 'App para tus alumnas'];
  }
  // Se omite el tope: ya es el primer punto. Sin esto, el plan Estudio decía
  // «Alumnas ilimitadas» y justo debajo «Alumnas activas: sin límite» — la
  // misma frase dos veces, que en una tarjeta de 4 puntos se come el 50 %.
  return [tope, ...novedadesFrenteAlAnterior(plan, anterior, [FILA_TOPE_ALUMNAS]).slice(0, 3)];
}
