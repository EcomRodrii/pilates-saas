// ─────────────────────────────────────────────────────────────────────────────
// Qué eventos puede mandar el NAVEGADOR a PostHog, y con qué propiedades — la
// lista cerrada. Lógica pura, sin SDK ni `@/`, para probarla con `node --test`
// (mismo criterio que `lib/posthog-privacidad.ts`). La mitad del servidor vive
// en `lib/analytics-eventos.ts`, que ya era una unión cerrada por tipo.
//
// Hasta aquí `capturarEvento(nombre: string, props)` aceptaba cualquier texto:
// un evento con una errata, o un `{ email }` puesto de buena fe, salía tal cual.
// Ahora hay tres cerrojos, y hacen falta los tres:
//   1. TIPOS: `capturarEvento` solo acepta un nombre de aquí y solo sus props.
//   2. EJECUCIÓN: `filtrarEventoNavegador` tira el evento que no esté y las
//      props que no le tocan, por si alguien llega con un `as`.
//   3. GUARDIA: `lib/analytics-catalogo.test.ts` recorre el código y falla si
//      se emite un nombre que no está, o si una prop se llama como un dato
//      personal.
//
// Un nombre de evento es un CONTRATO con el histórico de PostHog: no se
// renombra (se rompen los embudos guardados). Uno nuevo se añade aquí a
// propósito, con sus props, y nunca con datos de una persona: dónde está y qué
// hizo, no quién es.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTOS_NAVEGADOR = {
  // ── Alta del estudio (/crear-estudio; /login la recupera) ─────────────────
  // `version`: el alta nueva ('v2'/'v2_prueba', app/crear-estudio/alta-nueva.tsx);
  // sin ella, la de siempre. La misma marca que `altas_estudio.version`.
  alta_estudio_iniciada: ['desde', 'version'],
  alta_estudio_paso: ['paso'],
  alta_estudio_con_sesion: [],
  alta_estudio_continuar: ['paso', 'valido'],
  alta_estudio_creada: ['plan', 'version'],
  alta_estudio_cuenta_creada: [],
  alta_estudio_email_confirmado: [],
  alta_estudio_escribe: ['paso'],

  // ── Web comercial y páginas públicas ─────────────────────────────────────
  landing_click_alta: ['ubicacion', 'pagina'],
  landing_click_whatsapp: ['ubicacion', 'pagina'],
  landing_precio_visto: [],
  // ── Demo personalizada (/demo) ───────────────────────────────────────────
  // Solo qué hizo y en qué escenario: nunca lo que escribió ni sus datos.
  demo_abierta: [],
  demo_datos_enviados: ['centro'],
  demo_propuesta: ['tipo'],
  demo_paso: ['escenario', 'n'],
  demo_evaluada: ['respuesta'],
  demo_ir_al_alta: [],
  landing_video_reproducido: [],
  herramienta_usada: ['herramienta'],
  recurso_descarga_pedida: ['recurso', 'novedades'],

  // ── Network (congelado, pero sus pantallas públicas siguen midiendo) ──────
  network_contacto_enviado: [],
  network_busqueda_realizada: ['especialidad', 'con_ciudad'],
  network_estudio_interes_enviado: ['variante'],
  network_click_crear_perfil: [],

  // ── Review Boost ──────────────────────────────────────────────────────────
  review_boost_shown: [],
  review_boost_platform_clicked: ['plataforma'],

  // ── Bienvenida y asistente rápido ─────────────────────────────────────────
  bienvenida_iniciada: [],
  bienvenida_paso: ['paso', 'n', 'total', 'retomado'],
  bienvenida_resumen: [],
  bienvenida_completada: ['destino'],
  bienvenida_saltada: ['destino'],
  enlace_compartido: ['via'],

  // ── Visita guiada por capítulos ───────────────────────────────────────────
  tour_opcional_iniciado: [],
  tour_iniciado: ['obligatoria'],
  tour_paso_completado: ['paso'],
  tour_paso_aplazado: ['paso'],
  tour_capitulo_completado: ['capitulo'],
  tour_terminado: ['obligatoria'],

  // ── Embudo de activación (hitos que se ven en el panel) ───────────────────
  // Los emite `components/analitica/hitos-activacion.tsx` cuando el dato pasa
  // de no existir a existir, ya confirmado por el servidor (lib/analitica/hitos.ts).
  // Sin props: el panel ve que el dato llegó, no por qué camino. Lo que monta el
  // asistente lo cuenta el servidor, con `origen` (lib/analytics-eventos.ts).
  primer_tipo_clase: [],
  primera_clase_programada: [],
  primera_tarifa_activa: [],

  // ── Tutorial de cada pantalla (P1.1) ──────────────────────────────────────
  // `pantalla` es la clave del catálogo (`lib/ayuda/pantallas.ts`): una ruta o
  // la URL canónica de una vista de Configuración, nunca nada de una persona.
  // `origen`: se abrió solo ('auto') o con el «?» ('boton'). `paso`: en cuál se saltó.
  tutorial_completado: ['pantalla', 'origen'],
  tutorial_saltado: ['pantalla', 'paso', 'origen'],
} as const satisfies Record<string, readonly string[]>;

export type NombreEventoNavegador = keyof typeof EVENTOS_NAVEGADOR;

/** Valores que puede llevar una prop: un dato de negocio suelto, nunca un objeto. */
export type ValorPropAnalitica = string | number | boolean | null;

export type PropsEventoNavegador<N extends NombreEventoNavegador> =
  Partial<Record<(typeof EVENTOS_NAVEGADOR)[N][number], ValorPropAnalitica>>;

export function esEventoNavegador(nombre: unknown): nombre is NombreEventoNavegador {
  return typeof nombre === 'string' && Object.hasOwn(EVENTOS_NAVEGADOR, nombre);
}

/**
 * El cerrojo en ejecución: `null` si el evento no está en la lista; si está,
 * sus props reducidas a las permitidas y con valor primitivo. Nunca muta lo
 * que recibe.
 */
export function filtrarEventoNavegador(
  nombre: unknown,
  props?: Record<string, unknown>,
): { nombre: NombreEventoNavegador; props?: Record<string, ValorPropAnalitica> } | null {
  if (!esEventoNavegador(nombre)) return null;
  if (props === undefined) return { nombre };
  const permitidas: readonly string[] = EVENTOS_NAVEGADOR[nombre];
  const limpias: Record<string, ValorPropAnalitica> = {};
  for (const [clave, valor] of Object.entries(props)) {
    if (!permitidas.includes(clave)) continue;
    if (valor === null || ['string', 'number', 'boolean'].includes(typeof valor)) {
      limpias[clave] = valor as ValorPropAnalitica;
    }
  }
  return { nombre, props: limpias };
}
