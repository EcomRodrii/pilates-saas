// ─────────────────────────────────────────────────────────────────────────────
// Por qué una alumna nueva todavía no puede reservar, dicho para «Pon en marcha
// tu estudio» y para el correo de la primera clase (PR-5): la MISMA frase que
// «¡Listo!» (`avisoListo`, lib/onboarding/puede-reservar.ts) y dónde se arregla.
//
// Aparte de lib/alta/estado.ts a propósito: esto trae el motor de «¿puede
// reservar?», y aquello lo lee el marco del panel en todas las pantallas.
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import { avisoListo, type RespuestaPuedeReservar } from '../onboarding/puede-reservar.ts';
import type { AvisoClase } from './estado.ts';

const STRIPE = '/configuracion?tab=conexiones#integracion-stripe';

/**
 * Dónde se arregla cada «no» del servidor. Lo que no tiene sitio propio, al
 * Calendario. Escritos a mano, como los de lib/onboarding.ts; el test los cruza
 * con `hrefDeTarjeta` (lib/configuracion/destino.ts).
 */
export const DONDE_SE_ARREGLA: Readonly<Record<string, string>> = {
  PAGINA_OCULTA: '/configuracion?tab=web#pagina-publica',
  STRIPE_SIN_CUENTA: STRIPE,
  STRIPE_NO_PUEDE: STRIPE,
  STRIPE,
  SIN_PLAN_QUE_CUBRA: '/productos',
  NECESITA_AUTORIZACION: '/configuracion?tab=clases&abrir=tipos-de-clase',
};

/** Cuando ya no queda ninguna clase por venir (`avisoListo` lo calla: en «¡Listo!» lo enseña la vista previa). */
export const AVISO_SIN_CLASE_FUTURA = 'Tus clases ya han pasado: no queda ninguna por venir que una alumna pueda reservar.';

/**
 * Por qué una alumna nueva todavía no puede reservar, con la frase de
 * «¡Listo!» y dónde se arregla. `null` con el SÍ, o si el servidor no ha podido
 * ni preguntar (no se sabe nada: mejor callar que inventar).
 */
export function avisoDeClase(v: RespuestaPuedeReservar): AvisoClase | null {
  if (v.estado === 'SI') return null;
  if (v.estado === 'SIN_COMPROBAR' && !v.motivo) return null;
  const texto = v.estado === 'NO' && v.motivo === 'SIN_CLASE_FUTURA' ? AVISO_SIN_CLASE_FUTURA : avisoListo(v, null);
  if (!texto) return null;
  return { texto, href: DONDE_SE_ARREGLA[v.motivo ?? ''] ?? '/calendario' };
}
