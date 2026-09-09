/**
 * Cabeceras para TODO lo que se sirve desde un ZIP subido por un estudio.
 *
 * El contenido de un tema importado es código ajeno: HTML y CSS que ha escrito
 * un tercero (la diseñadora del estudio, una plantilla comprada) y que nosotros
 * servimos desde un dominio nuestro. `manifest.ts` afirma que «no se ejecuta JS
 * del propio ZIP», pero eso no es cierto: `incompatibilidadesDe` solo rechaza
 * `.tsx/.jsx`, next/vite y dependencias de npm — un `.js` suelto pasa, y los
 * `<script>` inline del HTML ni se miran.
 *
 * El comentario del route decía que el aislamiento lo daba el iframe sin
 * `allow-same-origin`. Ese atributo lo pone el CLIENTE: la URL del fichero es
 * navegable directamente, y entonces el JS del ZIP corre con el origen de
 * confianza y puede leer el JWT de staff que `api-client` guarda en
 * localStorage. Peor, es cruzado entre estudios: quien importa el ZIP acuña un
 * token válido para SU tema y manda el enlace a staff de otro estudio.
 *
 * `Content-Security-Policy: sandbox` resuelve las dos mitades a la vez porque
 * lo aplica el SERVIDOR: el documento recibe un origen opaco tanto dentro de un
 * iframe como en navegación directa, así que no alcanza localStorage, cookies
 * ni `document.domain` de tentare.app. Se deja `allow-scripts` y `allow-forms`
 * para que el tema siga viéndose y funcionando como su autora lo escribió.
 *
 * DÓNDE HACEN TRABAJO DE VERDAD. Solo en `servirFicheroTema`, que es lo que se
 * sirve por URL: sus tres ramas (HTML, CSS y assets) las llevan. La rama de
 * assets importa tanto como la de HTML porque un `.svg` sale por ahí y, abierto
 * como documento, ejecuta sus `<script>`.
 *
 * En `preview-en-vivo.ts` son deliberadamente redundantes: el editor consume esa
 * respuesta con `await res.text()` y la pinta en un `<iframe srcDoc>`
 * (`components/theme/editor-zip.tsx:117` y `:349`), y las cabeceras de respuesta
 * no llegan a un documento `srcdoc` — ahí la protección real es el `sandbox` del
 * propio iframe. Se ponen igualmente para que el día que alguien sirva esa
 * respuesta por URL no herede un agujero, pero no se debe contar como defensa.
 */
export const CABECERAS_CONTENIDO_AJENO: Record<string, string> = {
  // sandbox = origen opaco impuesto por el servidor (no depende del iframe).
  'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'",
  // Un .css que en realidad contiene HTML no debe reinterpretarse como tal.
  'X-Content-Type-Options': 'nosniff',
  // Nada de esto debe acabar en una caché compartida ni en un buscador.
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};
