// ─────────────────────────────────────────────────────────────────────────────
// Ahrefs Web Analytics — analítica de SEO, y SOLO donde hay SEO que medir.
//
// APAGADO por defecto: sin `NEXT_PUBLIC_AHREFS_KEY` es un no-op total, mismo
// patrón que lib/posthog-cliente.ts y lib/analytics.ts. Así una preview o un
// `npm run dev` no ensucian los datos de producción con visitas que no existen.
//
// ⚠️ **DÓNDE se carga no es un detalle de configuración, es la decisión entera.**
// Esta app tiene UN solo root layout (`app/layout.tsx`): debajo cuelgan la
// landing, el panel de la propietaria, el portal de las alumnas, el widget de
// reservas y `/interno`. Pegar el `<script>` en ese `<head>`, que es lo que dice
// la guía de instalación de Ahrefs, lo habría metido en las cinco cosas:
// tracker de terceros sobre personal autenticado, sobre socias de un producto
// del sector salud, y dentro de la web de cada estudio.
//
// El límite es `esNoIndexable()` (lib/seo/paginas.ts), el MISMO registro del
// que ya salen `robots.ts` y el sitemap. No una lista nueva a mano: una
// herramienta de SEO tiene que medir exactamente lo que Google puede ver, y si
// mañana alguien abre o cierra una ruta a indexación, esto la sigue sin que
// nadie se acuerde de tocarlo.
//
// ⚠️ **El script se sigue solo entre páginas.** Su fuente parchea
// `history.pushState` y escucha `popstate`, así que una vez cargado cuenta cada
// navegación blanda de la SPA por su cuenta — comprobado leyendo analytics.js,
// no supuesto. Consecuencia: la puerta de abajo decide dónde ARRANCA, no dónde
// sigue. Lo que lo hace seguro es que entrar al panel es navegación DURA
// (`window.location.href` en app/login/page.tsx, con su propio comentario del
// porqué), así que el script muere ahí y nunca llega a ver `/clientas` ni
// `/socios/<id>`. Si algún día el login pasara a `router.push`, esto se
// convertiría en una fuga de URLs con id de socia: ese comentario y este van
// juntos aunque estén en ficheros distintos.
//
// PRIVACIDAD: Ahrefs Web Analytics no pone cookies ni recoge datos personales
// (verificado en su propia página de producto: "Zero cookies · No personal data
// collected"), así que no necesita banner de consentimiento. Aun así conviene
// nombrarlo en la política de privacidad como encargado de tratamiento.
// ─────────────────────────────────────────────────────────────────────────────

import { esNoIndexable } from './seo/paginas.ts';

const SRC = 'https://analytics.ahrefs.com/analytics.js';
const enNavegador = typeof window !== 'undefined';

let pedido = false;

/**
 * ¿Esta vista es la web pública del ESTUDIO incrustada en su propio sitio?
 *
 * `/reservar/<slug>` es indexable a propósito (decisión del fundador, 2026-08-17),
 * pero la MISMA página se sirve dentro de un iframe en la web del estudio con
 * `?embed=1`. Ahí sus visitantes no son tráfico de Tentare: son de la web de la
 * clienta, y meterles nuestro tracker sería colocar un tercero en una propiedad
 * ajena. Se miran las dos señales porque cualquiera de las dos puede faltar: el
 * parámetro se puede perder al navegar dentro del widget, y el modo B
 * (`app/widget-bundle/main.tsx`) no usa iframe — aunque ese ni siquiera carga
 * esta app, así que nunca llega aquí.
 */
function esVistaIncrustada(): boolean {
  if (!enNavegador) return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    // Un SecurityError al leer `window.top` solo puede pasar dentro de un
    // iframe de otro origen — o sea, la respuesta es que sí.
    return true;
  }
  return new URLSearchParams(window.location.search).get('embed') === '1';
}

/** ¿Toca medir esta ruta? Público para poder probarlo sin navegador. */
export function debeMedirse(path: string, incrustada: boolean): boolean {
  if (incrustada) return false;
  return !esNoIndexable(path);
}

function inyectar(key: string): void {
  if (document.querySelector(`script[src="${SRC}"]`)) return;
  const s = document.createElement('script');
  s.src = SRC;
  s.async = true;
  s.dataset.key = key;
  document.head.appendChild(s);
}

/**
 * Carga el script si la ruta lo merece. Idempotente: a partir de la primera
 * vez no hace nada, porque el propio script ya sigue las navegaciones.
 */
export function medirSiCorresponde(path: string): void {
  if (!enNavegador || pedido) return;
  const key = process.env.NEXT_PUBLIC_AHREFS_KEY;
  if (!key) return;
  if (!debeMedirse(path, esVistaIncrustada())) return;
  pedido = true;
  // Al idle, como PostHog y Sentry: una etiqueta de analítica no puede competir
  // por red con el contenido que la visitante ha venido a leer.
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  if (w.requestIdleCallback) w.requestIdleCallback(() => inyectar(key), { timeout: 5000 });
  else window.setTimeout(() => inyectar(key), 2000); // Safari
}
