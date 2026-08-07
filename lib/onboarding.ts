// Lógica pura del checklist de "Primeros pasos" — separada del componente
// para poder testearla sin montar React ni useStudio(). Cada "done" se
// calcula a partir de datos reales del estudio, nunca se marca a mano.
//
// Rediseño por categorías (antes: lista plana de 7 pasos). Dos reglas se
// mantienen del original: (1) "done" siempre se deriva de estado real, nunca
// de un flag que alguien pueda olvidar desmarcar; (2) si un dato ya viene con
// un valor por defecto sensato para TODO estudio nuevo (p. ej.
// cancelacionVentanaHoras=12h, permiteListaEspera=true), no es un paso de
// onboarding — está "hecho" desde el minuto cero y no representa ningún
// trabajo real de la propietaria, así que no se incluye.
export interface DatosOnboarding {
  nif: string | null | undefined;
  stripeAccountId: string | null | undefined;
  slug: string | null | undefined;
  colorPrimario: string | null | undefined;
  temaPortal: string | null | undefined;
  logoUrl: string | null | undefined;
  numInstructores: number;
  numInstructoresConCuenta: number;
  numTiposClase: number;
  numSesiones: number;
  numSocios: number;
  numSalas: number;
  numPlanesTarifa: number;
  numSuscripcionesActivas: number;
  contenidoPortalPersonalizado: boolean;
  /** Solo los triggers relevantes para "Funciones inteligentes", con si están activos. */
  automatizacionesActivas: Set<string>;
}

export interface PasoOnboarding {
  id: string;
  label: string;
  /** Por qué importa, una línea — se lee ANTES de decidir si merece la pena. */
  descripcion: string;
  minutos: number;
  done: boolean;
  href: string;
  /** Solo el paso final de cada estudio: abre la página pública en pestaña nueva. */
  externo?: boolean;
  /** Enlace secundario opcional junto al principal — hoy solo lo usa
   * «clientes» para ofrecer /migracion como alternativa al alta manual. El
   * wizard de bienvenida ya ofrece importar si contestas que sí, pero quien
   * dijo que no (o llega directo al checklist sin pasar por el wizard) no
   * tenía ningún camino de vuelta a la importación desde aquí. */
  labelSecundario?: string;
  hrefSecundario?: string;
}

export interface CategoriaOnboarding {
  id: string;
  label: string;
  pasos: PasoOnboarding[];
}

/** Tarjetas de enlace directo a lo que ya existe — no son "pasos" con un
 * done/pendiente (no tiene sentido marcar como "sin hacer" mirar un informe),
 * así que viven fuera del conteo de progreso. */
export interface EnlaceOnboarding {
  id: string;
  label: string;
  descripcion: string;
  href: string;
}

export interface RecomendacionOnboarding {
  id: string;
  texto: string;
  href: string;
}

const AUTOMATIZACIONES_ONBOARDING: { id: string; trigger: string; label: string; descripcion: string }[] = [
  { id: 'recordatorios', trigger: 'CLASE_MANANA', label: 'Recordatorios de clase', descripcion: 'Avisa a cada clienta el día antes de su clase, por WhatsApp si tiene teléfono o por email si no — te ahorra escribir uno a uno cada tarde.' },
  { id: 'ausencias', trigger: 'AUSENCIA_DIAS', label: 'Recupera clientas ausentes', descripcion: 'Pregunta cómo están las que llevan días sin venir y ofrece una vuelta con descuento si la ausencia se alarga — te ahorra llevar la cuenta a mano.' },
  { id: 'nuevas', trigger: 'NUEVA_SOCIA', label: 'Acompaña a las clientas nuevas', descripcion: 'Anima a reservar a quien se acaba de dar de alta y no lo ha hecho, y te avisa si sigue sin venir — te ahorra el seguimiento manual de cada alta.' },
];

/**
 * Fase 1 del rediseño: mismos pasos que ya existían más los que faltaban por
 * enseñar (salas, bonos, renovación automática, funciones inteligentes,
 * equipo, portal), organizados por categoría. La categoría "Haz crecer tu
 * estudio" (marketing) se queda fuera a propósito — el módulo existe pero
 * está detrás de un feature flag desactivado, no del onboarding. "Centro de
 * Control" no es una categoría de pasos: son enlaces directos a los informes
 * que YA existen (/informes, /equipo/rendimiento) — Centro de Control en sí
 * es un motor de recomendaciones, no un panel de KPIs, y este onboarding no
 * lo reconstruye ahí.
 */
export function calcularOnboarding(d: DatosOnboarding): {
  categorias: CategoriaOnboarding[];
  enlaces: EnlaceOnboarding[];
  recomendaciones: RecomendacionOnboarding[];
  totalPasos: number;
  totalCompletados: number;
} {
  const marcaPersonalizada = !!d.logoUrl || (!!d.colorPrimario && d.colorPrimario !== '#4F46E5') || (!!d.temaPortal && d.temaPortal !== 'original');

  const configuracionInicial: PasoOnboarding[] = [
    { id: 'estudio', label: 'Configura los datos de tu estudio', descripcion: 'Nombre, NIF y contacto — aparecen en tus recibos y en tu página de reservas.', minutos: 3, done: !!d.nif, href: '/configuracion?tab=estudio' },
    { id: 'marca', label: 'Personaliza tu marca', descripcion: 'Logo y color de tu estudio, en tu página de reservas y en la app de tus alumnas.', minutos: 3, done: marcaPersonalizada, href: '/configuracion?tab=estudio&sub=enlaces' },
    { id: 'salas', label: 'Configura tus salas', descripcion: 'El aforo de cada sala limita cuántas clientas caben en cada clase.', minutos: 2, done: d.numSalas > 0, href: '/configuracion?tab=clases-salas&sub=salas' },
    // Mismo criterio que «clientas»: el panel usa una sola palabra para la
    // clientela porque el equipo de un estudio de Pilates lo es casi siempre.
    { id: 'instructor', label: 'Añade tu primera instructora', descripcion: 'Gestiona horarios, sustituciones, disponibilidad y estadísticas de tus instructoras.', minutos: 2, done: d.numInstructores > 0, href: '/equipo' },
    { id: 'clase', label: 'Crea tu primera clase', descripcion: 'El tipo de clase (Reformer, Mat...) es la base de tu horario.', minutos: 2, done: d.numTiposClase > 0, href: '/configuracion?tab=clases-salas' },
    { id: 'horario', label: 'Programa tus horarios', descripcion: 'Las sesiones concretas que tus clientas van a poder reservar.', minutos: 5, done: d.numSesiones > 0, href: '/calendario' },
    { id: 'clientes', label: 'Añade tus primeras clientas', descripcion: 'Empieza con las que ya tienes — el resto se apuntará sola desde tu página de reservas.', minutos: 3, done: d.numSocios > 0, href: '/clientas?nuevo=1', labelSecundario: '¿Vienes de otro software? Importa tus datos', hrefSecundario: '/migracion' },
    { id: 'bonos', label: 'Configura tus bonos y membresías', descripcion: 'Planes de pago recurrente o por sesiones — sin esto, cada clienta paga clase a clase.', minutos: 4, done: d.numPlanesTarifa > 0, href: '/configuracion?tab=planes' },
  ];
  const reservasHecho = configuracionInicial.every(p => p.done) && !!d.stripeAccountId;
  configuracionInicial.push({
    id: 'reservas', label: 'Abre las reservas', descripcion: 'Tu página pública de reservas, lista para compartir con tus clientas.',
    minutos: 1, done: reservasHecho, href: d.slug ? `/reservar/${d.slug}` : '/configuracion?tab=estudio', externo: reservasHecho,
  });

  const pagos: PasoOnboarding[] = [
    { id: 'stripe', label: 'Conecta Stripe', descripcion: 'Cobra online con tarjeta o SEPA — sin esto, todos los cobros son manuales.', minutos: 5, done: !!d.stripeAccountId, href: '/configuracion?tab=integraciones' },
    { id: 'renovacion', label: 'Activa una membresía con renovación automática', descripcion: 'Cobra la cuota sola cada mes, sin que tengas que perseguir a nadie.', minutos: 2, done: d.numSuscripcionesActivas > 0, href: '/configuracion?tab=planes' },
  ];

  const automatizaciones: PasoOnboarding[] = AUTOMATIZACIONES_ONBOARDING.map(a => ({
    id: a.id, label: a.label, descripcion: a.descripcion, minutos: 1,
    done: d.automatizacionesActivas.has(a.trigger), href: '/automatizaciones',
  }));

  const equipo: PasoOnboarding[] = [
    { id: 'invitar-equipo', label: 'Invita al resto de tu equipo', descripcion: 'Recepción o más instructoras, cada una con acceso solo a lo que le corresponde.', minutos: 2, done: d.numInstructoresConCuenta > 1, href: '/equipo' },
  ];

  const portal: PasoOnboarding[] = [
    { id: 'portal-contenido', label: 'Personaliza el contenido de tu portal', descripcion: 'El mensaje destacado y los banners que ven tus clientas al entrar en su app.', minutos: 3, done: d.contenidoPortalPersonalizado, href: '/configuracion?tab=estudio&sub=enlaces' },
  ];

  const categorias: CategoriaOnboarding[] = [
    { id: 'configuracion-inicial', label: 'Configuración inicial', pasos: configuracionInicial },
    { id: 'pagos', label: 'Pagos', pasos: pagos },
    { id: 'automatizaciones', label: 'Funciones inteligentes', pasos: automatizaciones },
    { id: 'equipo', label: 'Equipo', pasos: equipo },
    { id: 'portal', label: 'Portal de alumnas', pasos: portal },
  ];

  const enlaces: EnlaceOnboarding[] = [
    { id: 'informes', label: 'Ingresos, ocupación y margen por clase', descripcion: 'Qué clases dan dinero de verdad y cuáles no.', href: '/informes' },
    { id: 'rendimiento', label: 'Rendimiento de tus instructoras', descripcion: 'Retención y conversión de cada una, para decidir turnos con datos.', href: '/equipo/rendimiento' },
    { id: 'sustituciones', label: 'Sustituciones sin llamadas', descripcion: 'Cuando una instructora avisa de que no puede, Tentare busca sustituta sola.', href: '/sustituciones' },
    { id: 'centro-control', label: 'Recomendaciones para tu estudio', descripcion: 'Qué merece la pena atender esta semana, calculado a partir de tus propios datos.', href: '/centro-de-control' },
  ];

  const totalPasos = categorias.reduce((n, c) => n + c.pasos.length, 0);
  const totalCompletados = categorias.reduce((n, c) => n + c.pasos.filter(p => p.done).length, 0);

  return { categorias, enlaces, recomendaciones: calcularRecomendaciones(d), totalPasos, totalCompletados };
}

/**
 * Avisos que solo aparecen cuando de verdad falta algo importante — mismas
 * señales que ya calculan "done" arriba, para que nunca puedan divergir
 * (nunca "recomienda" algo que la lista de pasos ya marca como hecho).
 * Priorizadas: cobrar > vender > no perder lo que ya se vende > automatizar.
 */
function calcularRecomendaciones(d: DatosOnboarding): RecomendacionOnboarding[] {
  const candidatas: (RecomendacionOnboarding | null)[] = [
    !d.stripeAccountId ? { id: 'stripe', texto: 'Vemos que todavía no has conectado Stripe.', href: '/configuracion?tab=integraciones' } : null,
    !d.slug ? { id: 'slug', texto: 'Las reservas online aún están desactivadas: falta la dirección pública de tu estudio.', href: '/configuracion?tab=estudio' } : null,
    d.numPlanesTarifa === 0 ? { id: 'bonos', texto: 'Todavía no has creado ningún bono ni membresía.', href: '/configuracion?tab=planes' } : null,
    d.automatizacionesActivas.size === 0 ? { id: 'automatizaciones', texto: 'No hay ninguna función inteligente activa todavía.', href: '/automatizaciones' } : null,
    d.numSesiones === 0 ? { id: 'sesiones', texto: 'Las alumnas todavía no pueden reservar: no hay ninguna clase programada.', href: '/calendario' } : null,
  ];
  return candidatas.filter((r): r is RecomendacionOnboarding => r !== null).slice(0, 3);
}

// ─── Legacy: embudo interno ───────────────────────────────────────────────
//
// `app/api/interno/kpis/route.ts` (backoffice de Tentare-empresa, no del
// panel de un estudio) usa esta versión plana de los 7 pasos originales para
// medir dónde se atasca la activación de TODOS los estudios de la
// plataforma a la vez. Esa ruta no consulta salas/planes/automatizaciones
// por estudio (una query más por cada tabla nueva, sobre TODA la
// plataforma), así que no tiene los datos para calcular el onboarding
// nuevo — se deja intacta a propósito en vez de forzarla a pedir más datos
// que no necesita para su propio propósito (ver el "no inventar números" de
// esa ruta).
export interface DatosOnboardingLegacy {
  nif: string | null | undefined;
  stripeAccountId: string | null | undefined;
  slug: string | null | undefined;
  numInstructores: number;
  numTiposClase: number;
  numSesiones: number;
  numSocios: number;
}

export function calcularPasosOnboarding(d: DatosOnboardingLegacy): PasoOnboarding[] {
  const base: PasoOnboarding[] = [
    { id: 'estudio', label: 'Configura tu estudio', descripcion: '', minutos: 3, done: !!d.nif, href: '/configuracion?tab=estudio' },
    { id: 'instructor', label: 'Añade tu primera instructora', descripcion: '', minutos: 2, done: d.numInstructores > 0, href: '/equipo' },
    { id: 'clase', label: 'Crea tu primera clase', descripcion: '', minutos: 2, done: d.numTiposClase > 0, href: '/configuracion?tab=clases' },
    { id: 'horario', label: 'Configura tus horarios', descripcion: '', minutos: 5, done: d.numSesiones > 0, href: '/calendario' },
    { id: 'clientes', label: 'Añade tus primeras clientas', descripcion: '', minutos: 3, done: d.numSocios > 0, href: '/clientas?nuevo=1' },
    { id: 'pago', label: 'Activa los métodos de pago', descripcion: '', minutos: 5, done: !!d.stripeAccountId, href: '/configuracion?tab=integraciones' },
  ];
  const listo = base.every(p => p.done);
  const reservas: PasoOnboarding = {
    id: 'reservas', label: 'Abre las reservas', descripcion: '', minutos: 1,
    done: listo, href: d.slug ? `/reservar/${d.slug}` : '/configuracion?tab=estudio', externo: listo,
  };
  return [...base, reservas];
}
