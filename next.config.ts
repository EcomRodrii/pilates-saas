import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // El desarrollo usa un tsconfig más ligero (sin `strict`, sin
  // `skipLibCheck` de más, sin incremental): eso es lo que baja de verdad la
  // memoria que gasta tsc mientras se programa. La comprobación de tipos
  // COMPLETA sigue viva donde importa — `npm run typecheck` y el build de
  // producción, que usa `tsconfig.json` a secas.
  //
  // ⚠️ `tsconfigPath` es la ÚNICA clave que Next reconoce aquí junto a
  // `ignoreBuildErrors`. Aquí hubo un `ignoreDevErrors: true` que NO EXISTE en
  // Next: el propio Next lo cantaba en cada arranque («Unrecognized key(s) in
  // object: 'ignoreDevErrors' at "typescript"»), así que no hacía nada y su
  // comentario prometía un comportamiento que nadie estaba aplicando. Si algún
  // día se quiere de verdad «que no bloquee», la clave es `ignoreBuildErrors`
  // — pero apaga la comprobación en el BUILD DE PRODUCCIÓN, que es justo donde
  // no queremos apagarla. Por eso se retira en vez de traducirse.
  typescript: {
    tsconfigPath: process.env.NODE_ENV === 'production' ? './tsconfig.json' : './tsconfig.dev.json',
  },
  // ⚠️ Aquí vivía un bloque `experimental` con dos claves que tampoco hacían
  // nada, y se retira entero en vez de "arreglarse":
  //
  //   · `optimizePackageImports: false` — el tipo es `string[]` (una lista de
  //     paquetes con barrel files), no un booleano. Y sobra: los docs de Next
  //     dicen literalmente que «Turbopack automatically analyzes imports and
  //     optimizes them. It does not require this configuration», y Turbopack es
  //     el bundler por defecto desde Next 16.
  //   · `turbopack: false` — no es una clave de `experimental`. El bundler se
  //     elige por CLI: Turbopack va por defecto y a webpack se entra con
  //     `next dev --webpack`. Si alguna vez hace falta, va en el script `dev`
  //     de package.json, no aquí.
  //
  // El bloque estaba además envuelto en un `NODE_ENV === 'production' ? {} : …`
  // que no protegía nada: `main` no tiene ninguna otra opción `experimental`.
  //
  // Segundos que Next espera a que se genere una página estática antes de
  // rendirse. El default de Next 16 son 60 (ver `@default 60` en
  // next/dist/server/config-shared.d.ts); aquí van 120 para dar holgura al
  // build más pesado sin renunciar a que exista un techo.
  //
  // ⚠️ Estuvo en 999999 con el comentario «Disable static generation timing in
  // dev», y las dos mitades de esa frase eran falsas: la opción NO distingue
  // dev de producción, así que también aplicaba al build real, y 999999 s no
  // «desactiva un aviso» — son ~11 días. Una página que se colgara en el build
  // dejaba de fallar en un minuto y pasaba a colgar el build hasta que lo
  // matara el timeout del runner, que es el peor final posible: se lee como
  // «CI lenta», no como «hay una página rota».
  staticPageGenerationTimeout: 120,
  // Añade `crossorigin="anonymous"` a las etiquetas <script> que Next inyecta.
  // Sin él, el navegador oculta la pila de cualquier error lanzado por un
  // script servido desde otro origen (CDN, dominio de assets) y solo entrega
  // un `Script error.` vacío a `window.onerror` — sin fichero, línea ni pila.
  // Con el atributo, el próximo error cruzado llega con la pila real. Mismo
  // motivo por el que `descartarScriptErrorOpaco` filtra ese ruido en
  // lib/posthog-cliente.ts.
  crossOrigin: 'anonymous',
  // URL limpia para el origen dedicado de temas ZIP publicados
  // (`imports.tentare.app/<slug>` en vez de `/tema-publicado/<slug>`). Esto
  // es SOLO azúcar de URL — la cerradura real de seguridad vive DENTRO del
  // route handler (`app/tema-publicado/[slug]/[[...ruta]]/route.ts`,
  // `hostAutorizado()`), porque Next enruta por pathname, no por `Host`: la
  // ruta de destino sigue siendo alcanzable desde `tentare.app` con o sin
  // este rewrite. Sin `NEXT_PUBLIC_IMPORTS_HOST` configurado (local, preview
  // deploys) no se añade ninguna regla — nunca una regla que use `undefined`
  // como valor de host y acabe matcheando cualquier cosa.
  // /network/unirse era la landing de instructoras antes de que /network (la
  // pública nueva) tomase ese puesto — se queda huérfana de enlaces internos
  // pero seguía siendo alcanzable por URL directa/SEO histórico como una
  // segunda landing paralela. 301 real: nunca se llega a renderizar el JSX
  // viejo, así que un buscador o un enlace compartido antiguo aterriza en la
  // landing real, no en una copia obsoleta.
  async redirects() {
    return [
      { source: '/network/unirse', destination: '/network', permanent: true },
    ];
  },
  async rewrites() {
    const host = process.env.NEXT_PUBLIC_IMPORTS_HOST;
    if (!host) return [];
    return [
      {
        source: '/:slug/:ruta*',
        has: [{ type: 'host', value: host }],
        destination: '/tema-publicado/:slug/:ruta*',
      },
    ];
  },
  // ⚠️ Auditoría de rendimiento (2026-08-31, `tentare-performance`): sin esto,
  // `public/widget.js` (el script que un estudio incrusta en SU web, Modo B)
  // se servía con el default de Next para `public/` (`max-age=0,
  // must-revalidate`, medido con `curl -I` en producción) — cada carga en
  // CUALQUIER web que lo incrusta revalidaba contra el edge antes de poder
  // ejecutar el script, en vez de servirlo directo de la caché del
  // navegador. `stale-while-revalidate` en vez de `max-age` largo/
  // `immutable` a propósito: el fichero no lleva un hash de versión en el
  // nombre (decisión explícita, confirmada con el fundador) — un `immutable`
  // dejaría a las webs de estudios sirviendo una versión vieja del widget
  // (con bugs de checkout ya corregidos) hasta que expirase. 5 min de
  // frescura + revalidación en segundo plano durante hasta 1 día: la
  // mayoría de visitas no esperan red, y una corrección real llega a todo el
  // mundo en minutos, no en horas.
  async headers() {
    return [
      {
        source: '/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

// Sentry envuelve la config de build. La subida de source maps solo ocurre si
// hay SENTRY_AUTH_TOKEN + org/project; si no, se omite sin romper el build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
