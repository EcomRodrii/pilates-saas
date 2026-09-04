'use client';

// El portal de la clienta ya no tiene modo noche — retirado (2026-09):
// el diseño real de "Tentare Studio App" (las 20 capturas de
// docs/diseno-referencia-portal/) es claro único, y con la mayoría de
// pantallas ya convertidas a valores literales claros, el interruptor de
// Perfil había quedado a medias — solo Nav/Inicio/Horario/Perfil seguían
// respondiendo, el resto de la app se quedaba clara igual. Un interruptor
// que solo cambia una parte de la app es peor que no tenerlo.
//
// Este hook se queda (no se borra: hay demasiados `const { t } = useModo()`
// que solo quieren "los neutros claros de siempre" como objeto, incluidos
// varios ya convertidos a --ap-*/.ap-* que aún dependen de un componente
// compartido con esta forma — ver AvisosSocia/CheckoutEmbebido) pero ya no
// hace nada dinámico: siempre día, sin localStorage ni evento de sync.
//
// El color de marca sigue siendo --portal-brand (lo pone el tema publicado
// del estudio) — eso NO se ha tocado, es un eje aparte.
//
// La paleta vive en `lib/portal-paleta.ts` (datos puros, con test de
// contraste, incluida la variante 'noche' — se deja sin borrar por si algún
// día se retoma, pero ya no hay ningún camino que la alcance). Se reexporta
// para no romper ningún import existente.

import { MODO_TOKENS, type Modo, type ModoTokens } from './portal-paleta';

export { MODO_TOKENS };
export type { Modo, ModoTokens };

export function useModo() {
  const modo: Modo = 'dia';
  const noche = false;
  // Fondo del estudio ("Fondo" en Apariencia) — mismo criterio que
  // `/reservar` (sin interruptor de modo, ver paletaPortalCssText). Se
  // expresa como un var() en vez de resolver el valor aquí a propósito:
  // `--portal-bg-dia` ya llega inyectado en el HTML server-side
  // (ThemeStyle/themeToCssText) antes de la primera pintura — cero parpadeo.
  // Sin el campo tocado, la var no existe y el fallback deja el aspecto de
  // hoy intacto para todo estudio.
  const base = MODO_TOKENS.dia;
  const t = { ...base, bg: `var(--portal-bg-dia, ${base.bg})` };
  return { modo, noche, t };
}
