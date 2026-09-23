// ─────────────────────────────────────────────────────────────────────────────
// Qué se mide en la landing y cómo se nombra — lógica pura, sin DOM ni SDK,
// para que `medicion.test.ts` pruebe el mismo código que corre en producción.
//
// Por qué existe: hasta aquí la landing no medía ni un clic. PostHog ya se
// cargaba en `/` (lo arrastra `resetear()` desde auth-context para quien no
// tiene sesión) y contaba la vista, pero nadie sabía qué botón llevaba al alta
// ni si alguien llegaba a ver el precio — y el rediseño por fases necesita un
// ANTES con el que comparar el después.
//
// Un solo oyente delegado (`MedicionLanding`) en vez de un `onClick` por botón:
// así no se toca el marcado de la cabecera ni del pie (decisión del fundador:
// no cambian) y un CTA nuevo queda medido sin acordarse de nada. La ubicación
// sale de dónde está el enlace en la página, nunca del texto que se pulsó —
// mismo criterio que `EVENTOS_DESCARTADOS` en lib/posthog-privacidad.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Nombres de evento. Mismo estilo que `network_click_crear_perfil`. */
export const EVENTOS_LANDING = {
  clickAlta: 'landing_click_alta',
  clickWhatsapp: 'landing_click_whatsapp',
  precioVisto: 'landing_precio_visto',
  videoReproducido: 'landing_video_reproducido',
} as const;

export type DestinoEnlace = 'alta' | 'whatsapp';

/**
 * ¿A dónde lleva este enlace, de lo que nos importa medir? `href` es el
 * atributo tal cual (relativo o absoluto); `origen` es el de la página.
 */
export function destinoDeEnlace(href: string | null | undefined, origen: string): DestinoEnlace | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, origen);
  } catch {
    return null;
  }
  if (url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com') return 'whatsapp';
  if (url.origin === new URL(origen).origin && url.pathname.replace(/\/+$/, '') === '/crear-estudio') return 'alta';
  return null;
}

/** Lo que `MedicionLanding` lee de cada antepasado del enlace pulsado. */
export interface MarcaAncestro {
  tag: string;               // en minúsculas: 'nav', 'header', 'section'…
  id?: string;
  clases?: string;
  rol?: string | null;       // atributo `role`
  ctaFinal?: boolean;        // lleva `data-cta-final`
}

/**
 * Dónde estaba el enlace, del más cercano al más lejano. Primero lo que tiene
 * nombre propio (el popup, la barra, el pie, el cierre, el hero); si no, el id
 * de la sección que lo contiene (`precio`, `sustituciones`…). Un id nuevo en
 * la landing queda medido con su propio nombre sin tocar esto.
 */
export function ubicacionDe(ancestros: readonly MarcaAncestro[]): string {
  for (const a of ancestros) {
    // El menú móvil también es un `role="dialog"`: va antes que el popup.
    if (/(^|\s)v5-menu(\s|$)/.test(a.clases ?? '')) return 'menu_movil';
    if (a.rol === 'dialog') return 'popup';
    if (a.tag === 'nav') return 'nav';
    if (a.tag === 'footer') return 'pie';
    if (a.ctaFinal) return 'cta_final';
    if (a.tag === 'header' && a.id === 'top') return 'hero';
    if (/(^|\s)v5-wa-fab(\s|$)/.test(a.clases ?? '')) return 'flotante';
    if (a.tag === 'section' && a.id) return a.id;
  }
  return 'otro';
}
