// ─────────────────────────────────────────────────────────────────────────────
// Qué pasa al ocultar un módulo (pantalla Módulos del panel nuevo, 15-oct-2026),
// para decirlo ANTES de confirmar. Puro, sin `@/` (al-ocultar.test.ts).
//
// Ocultar un módulo es lo que guarda su interruptor: lo saca de `ocultos`, el
// menú del estudio (lib/tu-tentare/catalogo.ts). Eso quiere decir, y es lo que
// se cuenta aquí módulo a módulo:
//   · deja de verse su entrada en el menú de TODO el equipo (y, en una cadena,
//     en todas las sedes, porque el menú es de la cadena: lib/layout-data.ts),
//     también en la barra de abajo del móvil si estaba;
//   · en la app de la alumna no cambia nada: ni reservas, ni compras, ni pagos,
//     ni mensajes. Lo que la alumna ve no depende del menú del panel;
//   · lo que funciona solo sigue funcionando (automatizaciones, cobros
//     automáticos, sustituciones, el análisis del Centro de Control);
//   · no se borra nada, y el buscador (⌘K) lo sigue encontrando.
// Donde algo SÍ toca a las alumnas o hay algo pendiente que se deja de tener a
// mano (reservas por delante, automatizaciones que les escriben, mensajes sin
// leer, recibos sin cobrar), va un aviso con su cifra. Sin la cifra (los datos
// no han llegado), no se afirma ninguna: mejor callar que decir «no hay nada».
// ─────────────────────────────────────────────────────────────────────────────

import { bottomNavItems } from '../nav-config.ts';

export interface DatosAlOcultar {
  /** `null` = todavía no se sabe: entonces no se dice ninguna cifra. */
  reservasProximas: number | null;
  citasProximas: number | null;
  /** Servicios de cita que la alumna puede pedir sola desde su app. */
  serviciosCitaOnline: number | null;
  automatizacionesEncendidas: number | null;
  paquetesActivos: number | null;
  recibosSinCobrar: number | null;
  mensajesSinLeer: number | null;
  /** El menú es el de la cadena: ocultarlo lo oculta en todas sus sedes. */
  enCadena: boolean;
}

export interface AlOcultar {
  /** Lo que deja de verse en el panel. */
  dejaDeVerse: string[];
  /** Una frase: qué notan las alumnas en su app. */
  enLaApp: string;
  /** Lo que sigue funcionando igual. */
  sigueIgual: string[];
  /** Algo que toca a las alumnas o que se deja de tener a mano, con su cifra. */
  aviso: string | null;
}

const NO_CAMBIA = 'No cambia nada.';

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const hay = (n: number | null): n is number => n !== null && n > 0;

type Propio = { enLaApp: string; sigue?: string[]; deja?: string[]; aviso?: string | null };

/**
 * Lo propio de cada módulo del menú. Un módulo nuevo en el menú sin su entrada
 * aquí lo detecta `al-ocultar.test.ts`: explicar qué pasa al ocultarlo es parte
 * de añadirlo, no un extra.
 */
export const LO_PROPIO: Record<string, (d: DatosAlOcultar) => Propio> = {
  '/centro-de-control': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Tentare sigue analizando tu estudio cada día.'],
  }),
  '/automatizaciones': (d) => ({
    enLaApp: 'Les siguen llegando los mensajes de las automatizaciones que tengas encendidas.',
    sigue: ['Las automatizaciones encendidas siguen funcionando.'],
    aviso: hay(d.automatizacionesEncendidas)
      ? `Tienes ${plural(d.automatizacionesEncendidas, 'automatización encendida', 'automatizaciones encendidas')}: ${d.automatizacionesEncendidas === 1 ? 'seguirá' : 'seguirán'} escribiendo a tus alumnas. Si quieres que paren, apágalas antes en Automatizaciones.`
      : null,
  }),
  '/calendario': (d) => ({
    enLaApp: 'No cambia nada: siguen viendo tus clases y reservando desde su app y tu web.',
    sigue: ['Tus clases y sus reservas siguen en pie.'],
    aviso: hay(d.reservasProximas)
      ? `Hay ${plural(d.reservasProximas, 'reserva', 'reservas')} en tus próximas clases. ${d.reservasProximas === 1 ? 'Sigue' : 'Siguen'} en pie, pero sin el Calendario en el menú no las tendrás a mano.`
      : null,
  }),
  '/citas': (d) => ({
    enLaApp: hay(d.serviciosCitaOnline) ? 'No cambia nada: pueden seguir pidiendo citas desde su app.' : NO_CAMBIA,
    aviso: hay(d.citasProximas)
      ? `Tienes ${plural(d.citasProximas, 'cita', 'citas')} por delante: ${d.citasProximas === 1 ? 'sigue' : 'siguen'} en pie.${hay(d.serviciosCitaOnline) ? ' Y tus alumnas pueden pedir más sin que lo veas en el menú.' : ''}`
      : hay(d.serviciosCitaOnline)
        ? 'Tus alumnas pueden seguir pidiendo citas desde su app, y sin Citas en el menú no lo verás a mano.'
        : null,
  }),
  '/clientas': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Las fichas de tus alumnas siguen ahí, con todo lo que tienen.'],
  }),
  '/mensajeria': (d) => ({
    enLaApp: 'No cambia nada: pueden seguir escribiéndote, y sus mensajes te siguen llegando.',
    deja: ['El contador de mensajes sin leer, que va en esa entrada.'],
    aviso: hay(d.mensajesSinLeer)
      ? `Tienes ${plural(d.mensajesSinLeer, 'conversación sin leer', 'conversaciones sin leer')}, y sin Mensajería en el menú no verás cuándo te escriben.`
      : null,
  }),
  '/equipo': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Tu equipo sigue entrando a la app del estudio con su agenda.'],
  }),
  '/sustituciones': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Las bajas se siguen cubriendo con el modo que tengas elegido.'],
  }),
  '/cobros': (d) => ({
    enLaApp: 'No cambia nada: pueden seguir pagando lo pendiente desde su app.',
    sigue: ['Los cobros automáticos siguen su curso.'],
    aviso: hay(d.recibosSinCobrar)
      ? `Tienes ${plural(d.recibosSinCobrar, 'recibo sin cobrar', 'recibos sin cobrar')}: ${d.recibosSinCobrar === 1 ? 'sigue pendiente' : 'siguen pendientes'}, y sin Cobros en el menú no los tendrás a mano.`
      : null,
  }),
  '/pos': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Las ventas que ya hiciste siguen apuntadas.'],
  }),
  '/productos': (d) => ({
    enLaApp: hay(d.paquetesActivos) ? 'No cambia nada: pueden seguir comprando tus paquetes desde su app.' : NO_CAMBIA,
    sigue: ['Tus paquetes y lo que ya vendiste se quedan como están.'],
  }),
  '/informes': () => ({ enLaApp: NO_CAMBIA }),
  '/cierre': () => ({ enLaApp: NO_CAMBIA }),
  '/marketing': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Las campañas que ya estén en marcha siguen su curso.'],
  }),
  '/festivos': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Lo que ya decidiste para tus festivos se queda como está.'],
  }),
  '/migracion': () => ({
    enLaApp: NO_CAMBIA,
    sigue: ['Lo que ya trajiste se queda donde está.'],
  }),
  '/libreta': () => ({ enLaApp: NO_CAMBIA }),
  '/actualizaciones': () => ({ enLaApp: NO_CAMBIA }),
};

const EN_LA_BARRA_DEL_MOVIL = new Set(bottomNavItems.map((i) => i.href));

/** Qué pasa al ocultar este módulo, para decirlo antes de confirmar. */
export function alOcultar(m: { href: string; label: string }, d: DatosAlOcultar): AlOcultar {
  const propio = LO_PROPIO[m.href]?.(d) ?? { enLaApp: NO_CAMBIA };
  return {
    dejaDeVerse: [
      `«${m.label}» en el menú, para ti y para tu equipo${d.enCadena ? ', en todas tus sedes' : ''}.`,
      ...(EN_LA_BARRA_DEL_MOVIL.has(m.href) ? ['Su botón en la barra de abajo del móvil.'] : []),
      ...(propio.deja ?? []),
    ],
    enLaApp: propio.enLaApp,
    sigueIgual: [
      ...(propio.sigue ?? []),
      'No se borra nada: al volver a activarlo, está todo como lo dejaste.',
      'Lo sigues encontrando con el buscador (⌘K).',
    ],
    aviso: propio.aviso ?? null,
  };
}
