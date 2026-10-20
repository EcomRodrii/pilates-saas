// Mapa de enlaces de la landing v5 — la capa que el diseño NO traía resuelta.
//
// El HTML de origen (Landing Tentare v5.dc.html) tiene tres problemas de
// enlazado, y los tres se corrigen aquí en vez de arrastrarlos:
//
//  1. **No enlaza las páginas que existen.** El menú lleva "Funcionalidades" a
//     `#funcionalidades` y "Precios" a `#precio` — anclas dentro de la propia
//     página. Las 17 URLs de /funcionalidades y /precios no aparecen ni una
//     vez, que es justamente el árbol que da profundidad al sitio.
//  2. **Un enlace roto**: el pie apunta a `/aviso-legal`. Esa ruta no existe;
//     la real es `/legal`.
//  3. **URLs absolutas al dominio sin www**, que devuelve un 308 hacia el host
//     real. Aquí van RELATIVAS: no dependen del host y no arrastran un salto.
//     (El origen canónico vive en `LEGAL.url` y no se escribe a mano en ningún
//     otro sitio — hay un test que lo comprueba, y cazó este fichero cuando el
//     comentario traía el dominio literal.)
//
// El criterio con las anclas cambió en la fase 2.1 (19-oct-2026): el menú es el
// de toda la web y lleva a páginas (components/web/IslaWeb.tsx). Solo «Precios»
// sigue yendo a `#precio` desde la home, porque esa sección es la misma tabla y
// su vista se mide. Las secciones siguen enlazando hacia fuera con un «ver más».

export interface EnlaceNav {
  href: string;
  label: string;
}

/**
 * El alta: crear el estudio y empezar la prueba. Usa esto en vez de escribir la
 * ruta: el popup, los planes y el CTA final aún la llevan literal.
 */
export const ALTA = '/crear-estudio';

/**
 * WhatsApp Business de soporte. Mismo número que WhatsAppFab.tsx y
 * SeccionCtaFinal.tsx, que lo llevan literal; los bloques nuevos lo importan
 * de aquí.
 */
export const WHATSAPP_SOPORTE = '+34603556580';

/**
 * Único enlace del menú que NO es una ancla de esta página: Tentare Network
 * es un producto público aparte con su propia landing/marketplace
 * (rediseño 2026-08, app/network/page.tsx), así que su sitio es el menú de
 * la landing, no una sección de /funcionalidades. Sustituye al hueco que
 * /instructora/alta dejó en PIE_V5 (ver comentario ahí) — mismo criterio,
 * destino nuevo. Antes apuntaba a /network/unirse (alta directa); ahora a
 * /network, la landing de descubrimiento — /network/unirse se queda viva
 * sin enlazar desde aquí (decisión explícita, no borrar sin pedirlo).
 *
 * ⚠️ CONGELADO (2-oct-2026): ningún menú lo usa. Se queda la constante para
 * volver a enlazarlo en un sitio cuando se descongele.
 */
export const NAV_NETWORK: EnlaceNav = { href: '/network', label: 'Tentare Network' };

/**
 * Salidas de cada sección hacia el árbol real. Esto es lo que el diseño no
 * tenía: sin estos enlaces, /funcionalidades y /precios quedan huérfanas desde
 * la página que más tráfico recibe.
 */
export const SALIDAS = {
  funcionalidades: { href: '/funcionalidades', label: 'Ver las 17 funcionalidades' },
  sustituciones: { href: '/funcionalidades/sustituciones', label: 'Cómo funcionan las sustituciones' },
  precio: { href: '/precios', label: 'Ver los planes en detalle' },
  comparativa: { href: '/comparativa', label: 'Comparar con otras plataformas' },
  // Antes apuntaba a /comparativa como paso intermedio — /soluciones/cambiar-de-software
  // se publicó el 2026-08-13 y es el destino real de "quien ya usa otro software".
  cambiarse: { href: '/soluciones/cambiar-de-software', label: 'Cómo es cambiarte a Tentare' },
  app: { href: '/funcionalidades/app-para-alumnas', label: 'La app de tus alumnas' },
  widget: { href: '/funcionalidades/reservas-online', label: 'Reservas en tu web' },
  clientas: { href: '/funcionalidades/ficha-de-clienta', label: 'La ficha de cada alumna' },
} as const satisfies Record<string, EnlaceNav>;

/**
 * «Cambiarme a Tentare» (ronda 2 de la landing, 19-oct-2026, con autorización
 * expresa del fundador para tocar la cabecera): la puerta de quien ya paga otro
 * programa, que es la mayoría de estudios. Va en la isla, en el menú móvil y,
 * como «Traer mis datos de otro programa», en el héroe; los tres a la misma
 * página, que existe desde el 13-ago y cuenta lo que el importador hace de verdad.
 *
 * ⚠️ El texto promete lo que esa página promete y nada más: traer datos
 * (clientas, bonos, clases, reservas, citas y pagos históricos), con vista previa
 * y botón de deshacer, tú misma o con ayuda. NO promete plazos, ni «sin coste»,
 * ni que las tarjetas guardadas viajen (la propia página dice que no).
 */
export const NAV_CAMBIARSE: EnlaceNav = { href: SALIDAS.cambiarse.href, label: 'Cambiarme a Tentare' };
export const HEROE_CAMBIARSE: EnlaceNav = { href: SALIDAS.cambiarse.href, label: 'Traer mis datos de otro programa' };

// El menú y el pie de la home (NAV_V5, PIE_V5) se retiraron en la fase 2.1
// (19-oct-2026): la isla y el pie son los de toda la web pública y sus enlaces
// viven en lib/seo/navegacion-publica.ts. Lo que decía este fichero de `/legal`
// (y no `/aviso-legal`, que estaba roto en el diseño) sigue valiendo allí.
