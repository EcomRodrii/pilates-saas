#!/usr/bin/env node
// Compila app/widget-bundle/main.tsx a public/widget.js — el script que un
// estudio incrusta en su propia web (Modo B, sin iframe). Corre APARTE de
// `next build` (encadenado antes vía el script npm `build:widget`, ver
// package.json): esbuild, no webpack/Next, porque el bundle tiene que ser un
// único fichero autocontenido (React/react-dom/lucide-react incluidos, un
// sitio de terceros no los tiene cargados) — Next no produce ese tipo de
// salida sin un plugin adicional para algo que en realidad es un caso de uso
// pequeño y aislado.
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// El bundle corre en el navegador de un sitio de terceros: no hay proceso
// Node ahí, así que `process.env.NEXT_PUBLIC_*` (que Next normalmente inlinea
// en build) tiene que quedar como STRING LITERAL en el propio JS compilado.
// Mismas dos variables que ya lee lib/db/supabase.ts/-portal.ts — nada nuevo,
// solo hay que dárselas a esbuild explícitamente porque no pasa por Next.
function leerEnvLocal(clave) {
  const envPath = path.join(raiz, '.env.local');
  if (!fs.existsSync(envPath)) return process.env[clave] ?? '';
  const linea = fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .find(l => l.startsWith(`${clave}=`));
  return linea ? linea.slice(clave.length + 1).trim() : (process.env[clave] ?? '');
}
const SUPABASE_URL = leerEnvLocal('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = leerEnvLocal('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('✘ Faltan NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local — el widget no podría autenticar a ninguna socia.');
  process.exit(1);
}
// Opcional a propósito, igual que en el resto del repo (turnstile-widget.tsx):
// sin site key, `useCaptchaWidget` no monta nada y el login/registro del
// widget queda sin captcha propio — gotrue lo sigue exigiendo a nivel de
// proyecto si está activado, así que no es un agujero de seguridad, solo una
// UX peor (el error de Supabase en vez de un mensaje amable).
const TURNSTILE_SITE_KEY = leerEnvLocal('NEXT_PUBLIC_TURNSTILE_SITE_KEY');
// Fase 3 (checkout embebido): opcional a propósito, mismo criterio que
// Turnstile arriba — sin ella, <CheckoutEmbebido> no monta Stripe Elements y
// cae al aviso "compra no disponible ahora mismo" en vez de romper el resto
// del widget (calendario/reservas siguen funcionando).
const STRIPE_PUBLISHABLE_KEY = leerEnvLocal('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
// Guardia de FORMA, no de presencia. El 19-ago esta variable llegó a contener
// una `sk_live_` y el bundle público la sirvió a webs de terceros (Sentry
// JAVASCRIPT-NEXTJS-1P: "You should not use your secret key with Stripe.js").
// Se cerró rotando la clave; nada impedía repetirlo. `public/widget.js` es el
// destino más expuesto del repo, así que el build para aquí antes de generarlo.
if (STRIPE_PUBLISHABLE_KEY && !STRIPE_PUBLISHABLE_KEY.startsWith('pk_')) {
  console.error('✖ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY no empieza por "pk_". Se aborta el build: esa variable acaba en public/widget.js, servido a terceros.');
  process.exit(1);
}

const opcionesComunes = {
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.css': 'text' },
  alias: { '@': raiz },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(SUPABASE_URL),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
    'process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY': JSON.stringify(TURNSTILE_SITE_KEY),
    'process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY': JSON.stringify(STRIPE_PUBLISHABLE_KEY),
  },
  logLevel: 'info',
};

await esbuild.build({
  ...opcionesComunes,
  entryPoints: [path.join(raiz, 'app/widget-bundle/main.tsx')],
  outfile: path.join(raiz, 'public/widget.js'),
  format: 'iife',
});
console.log('✔ public/widget.js generado');

// ⚠️ Auditoría de rendimiento (2026-08-31, `tentare-performance`): build
// SEPARADO para `<ListaPlanes>` (Stripe incluido, ~127KB comprimidos) — ver
// el docblock de components/checkout-widget/checkout-lazy-mount.tsx. `esm`,
// no `iife`: es lo que permite a `widget.js` pedirlo con `import()` nativo
// diferido; un `<script>` clásico puede llamar `import()` sin necesitar
// `type="module"` él mismo.
await esbuild.build({
  ...opcionesComunes,
  entryPoints: [path.join(raiz, 'app/widget-bundle/checkout-entry.tsx')],
  outfile: path.join(raiz, 'public/widget-checkout.js'),
  format: 'esm',
});
console.log('✔ public/widget-checkout.js generado');

// «Popup» de Tentare Widgets (app/widget-bundle/popup.ts): el script que abre
// un widget en una ventana al pulsar un botón de la web del estudio. Aparte y
// sin React a propósito: se descarga en TODAS las páginas de esa web, se use o
// no, así que tiene que pesar lo mínimo.
await esbuild.build({
  ...opcionesComunes,
  entryPoints: [path.join(raiz, 'app/widget-bundle/popup.ts')],
  outfile: path.join(raiz, 'public/widget-popup.js'),
  format: 'iife',
});
console.log('✔ public/widget-popup.js generado');

// ⚠️ Los tres ficheros de arriba se sirven en las webs de los estudios: los
// datos del titular de LEGAL (lib/legal-info.ts) no pintan nada en ellos. Se
// colaban enteros detrás de un import de una sola función (el origen canónico),
// y eso no lo ve nadie sin abrir el minificado. Se comprueba con el NIF, LEÍDO
// de ese fichero y nunca copiado aquí; si no se encuentra, se para: una guarda
// que no sabe qué buscar no guarda nada.
const nifTitular = /\bnif:\s*(['"])([^'"]+)\1/.exec(fs.readFileSync(path.join(raiz, 'lib/legal-info.ts'), 'utf8'))?.[2];
if (!nifTitular) {
  console.error('✖ No se ha podido leer el NIF de lib/legal-info.ts para comprobar los bundles públicos.');
  process.exit(1);
}
for (const fichero of ['widget.js', 'widget-checkout.js', 'widget-popup.js']) {
  if (fs.readFileSync(path.join(raiz, 'public', fichero), 'utf8').includes(nifTitular)) {
    console.error(`✖ public/${fichero} lleva los datos del titular (LEGAL, lib/legal-info.ts). Importa solo lo que haga falta, sin arrastrar LEGAL.`);
    process.exit(1);
  }
}
console.log('✔ Ningún bundle público lleva los datos del titular');

// Las fuentes de la integración sin marco (Fase E): con una letra elegida en
// «Cómo se ve», widget.js mete en la web del estudio la hoja
// public/widget-fuentes/v1/fuentes.css (lib/widget/fuentes-nativa.ts). Son los
// MISMOS woff2 que sirve la app (app/_fuentes), copiados tal cual con su
// OFL.txt: la licencia viaja al lado de cada familia. Se sirven desde Tentare,
// no desde Google, para que elegir una letra en el panel no mande la IP de
// cada visitante de su web a un tercero.
//
// La lista va escrita aquí porque este .mjs no importa TypeScript; la ata a
// `CARPETAS_FUENTES_NATIVA` un test (lib/widget/fuentes-nativa.test.ts).
const CARPETAS_FUENTES_NATIVA = [
  'plusjakartasans', 'librecaslontext', 'figtree', 'cormorantgaramond', 'outfit', 'poppins', 'instrumentsans', 'instrumentserif',
];
const HOJA_FUENTES = path.join(raiz, 'app/widget-bundle/fuentes-nativa.css');
const DESTINO_FUENTES = path.join(raiz, 'public/widget-fuentes/v1');
// De cero en cada build: una fuente que ya no está en la lista no se queda
// servida por haber estado alguna vez.
fs.rmSync(DESTINO_FUENTES, { recursive: true, force: true });
fs.mkdirSync(DESTINO_FUENTES, { recursive: true });
fs.copyFileSync(HOJA_FUENTES, path.join(DESTINO_FUENTES, 'fuentes.css'));
for (const carpeta of CARPETAS_FUENTES_NATIVA) {
  const origen = path.join(raiz, 'app/_fuentes', carpeta);
  const destino = path.join(DESTINO_FUENTES, carpeta);
  fs.mkdirSync(destino, { recursive: true });
  for (const f of fs.readdirSync(origen)) {
    if (f.endsWith('.woff2') || f === 'OFL.txt') fs.copyFileSync(path.join(origen, f), path.join(destino, f));
  }
}
// ⚠️ Una `url(...)` de la hoja sin su fichero no da ningún error en la web del
// estudio: la letra cae a la de reserva y nadie se entera. Se para aquí.
for (const [, url] of fs.readFileSync(HOJA_FUENTES, 'utf8').matchAll(/url\(([^)]+)\)/g)) {
  if (!fs.existsSync(path.join(DESTINO_FUENTES, url))) {
    console.error(`✖ app/widget-bundle/fuentes-nativa.css pide ${url} y no está en public/widget-fuentes/v1. Revisa CARPETAS_FUENTES_NATIVA.`);
    process.exit(1);
  }
}
console.log(`✔ public/widget-fuentes/v1 generado (${CARPETAS_FUENTES_NATIVA.length} familias)`);
