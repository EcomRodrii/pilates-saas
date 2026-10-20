// Las insignias de la gamificación: un catálogo CERRADO de iconos 3D.
//
// Decisión del fundador (19-oct-2026): logros, retos, niveles, recompensas y
// créditos de la app de la alumna llevan iconos 3D Fluency de Icons8, con su
// licencia gratuita. Esa licencia exige un enlace visible a icons8.com: va en
// Perfil de la app (`CREDITO_ICONOS`) y, a mano, en la ficha de la App Store de
// cada app. Choca con `brand/brand-os.md` (sin 3D ni emojis) y se mantuvo a
// sabiendas.
//
// Antes cada logro, reto o recompensa guardaba en `icono` un emoji que el
// estudio tecleaba, y cada móvil lo dibujaba con su fuente. Ahora `icono` guarda
// una CLAVE de este catálogo. Lo que ya estaba guardado no se migra: los emojis
// de las plantillas que traía el panel se leen como su insignia equivalente
// (`EMOJI_A_INSIGNIA`), y cualquier otro texto se sigue pintando tal cual.
//
// Puro y sin `@/`: lo prueba el runner de Node.

export const INSIGNIAS = {
  creditos: { nombre: 'Monedas', archivo: 'coins.png' },
  racha: { nombre: 'Llama', archivo: 'fire.png' },
  medalla: { nombre: 'Medalla', archivo: 'medal.png' },
  premio: { nombre: 'Escarapela', archivo: 'prize.png' },
  trofeo: { nombre: 'Trofeo', archivo: 'trophy.png' },
  corona: { nombre: 'Corona', archivo: 'crown.png' },
  estrella: { nombre: 'Estrella', archivo: 'star.png' },
  destellos: { nombre: 'Destellos', archivo: 'sparkling.png' },
  objetivo: { nombre: 'Diana', archivo: 'goal.png' },
  'reloj-de-arena': { nombre: 'Reloj de arena', archivo: 'hourglass.png' },
  calendario: { nombre: 'Calendario', archivo: 'calendar.png' },
  hecho: { nombre: 'Hecho', archivo: 'ok.png' },
  cumpleanos: { nombre: 'Tarta', archivo: 'birthday-cake.png' },
  amigas: { nombre: 'Amigas', archivo: 'people.png' },
  regalo: { nombre: 'Regalo', archivo: 'gift.png' },
  entrada: { nombre: 'Entrada', archivo: 'ticket.png' },
  confeti: { nombre: 'Confeti', archivo: 'confetti.png' },
} as const;

export type ClaveInsignia = keyof typeof INSIGNIAS;

/** Dónde se sirven (`public/gamificacion/`). */
export const RUTA_INSIGNIAS = '/gamificacion/';

/** El crédito que pide la licencia gratuita de Icons8. */
export const CREDITO_ICONOS = { texto: 'Iconos de Icons8', url: 'https://icons8.com' } as const;

/**
 * Los emojis que traían las plantillas del panel (logros, retos, niveles,
 * recompensas sugeridas y los valores por defecto de la base). Un estudio que
 * los cargó antes de las insignias los ve ya como insignia, sin migrar nada.
 */
const EMOJI_A_INSIGNIA: Readonly<Record<string, ClaveInsignia>> = {
  '🥉': 'medalla', '🥈': 'premio', '🥇': 'trofeo', '💎': 'corona', '🏆': 'trofeo',
  '🎖': 'medalla', '🏅': 'medalla', '🔥': 'racha', '✅': 'hecho', '🎂': 'cumpleanos',
  '🌱': 'calendario', '🎯': 'objetivo', '⭐': 'estrella', '🌟': 'estrella', '✨': 'destellos',
  '🎁': 'regalo', '🎟': 'entrada', '🎫': 'entrada', '👯': 'amigas', '🪙': 'creditos',
  '💰': 'creditos', '🎉': 'confeti', '⏳': 'reloj-de-arena', '📅': 'calendario', '👑': 'corona',
};

/** Quita el selector de variación (U+FE0F) y espacios: «🎖️» y «🎖» son el mismo. */
function normalizar(icono: string): string {
  return icono.replace(/️/g, '').trim();
}

export function esClaveInsignia(valor: string | null | undefined): valor is ClaveInsignia {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(INSIGNIAS, valor);
}

export interface InsigniaResuelta {
  clave: ClaveInsignia;
  nombre: string;
  src: string;
}

/**
 * La insignia que corresponde a lo guardado en `icono`: una clave del catálogo,
 * o un emoji de las plantillas antiguas. `null` = es otro texto (un número de
 * nivel, un emoji que nadie trajo de serie) y se pinta como texto.
 */
export function resolverInsignia(icono: string | null | undefined): InsigniaResuelta | null {
  if (!icono) return null;
  const limpio = normalizar(icono);
  // `hasOwn` y no `EMOJI_A_INSIGNIA[limpio]` a pelo: «constructor» devolvería la función de Object.
  const clave = esClaveInsignia(limpio) ? limpio : Object.hasOwn(EMOJI_A_INSIGNIA, limpio) ? EMOJI_A_INSIGNIA[limpio] : undefined;
  if (!clave) return null;
  return { clave, nombre: INSIGNIAS[clave].nombre, src: RUTA_INSIGNIAS + INSIGNIAS[clave].archivo };
}

/** La insignia de cada forma de ganar créditos (la lista «Cómo ganar»). */
export const INSIGNIA_DE_FORMA: Readonly<Record<string, ClaveInsignia>> = {
  ASISTENCIA_CLASE: 'hecho',
  SEMANA_COMPLETA: 'racha',
  OBJETIVO_MENSUAL: 'objetivo',
  PRIMERA_RESERVA: 'calendario',
  REFERIDO_AMIGO: 'amigas',
  RENOVACION_PLAN: 'entrada',
  COMPRA: 'creditos',
};

/**
 * La insignia de lo guardado o, si no lo es, la de su tipo (un logro, trofeo; un
 * reto, diana…). Así un emoji tecleado a mano no rompe una lista de insignias 3D.
 */
export function insigniaOPorDefecto(icono: string | null | undefined, porDefecto: ClaveInsignia): InsigniaResuelta {
  return resolverInsignia(icono) ?? resolverInsignia(porDefecto)!;
}

/**
 * La insignia de un nivel. Los niveles nacen con un número («1», «2»…) en
 * `icono`, no con un emoji: si no hay insignia elegida, el último nivel lleva
 * corona y los demás, estrella.
 */
export function insigniaDeNivel(icono: string | null | undefined, esUltimo: boolean): InsigniaResuelta {
  return insigniaOPorDefecto(icono, esUltimo ? 'corona' : 'estrella');
}
