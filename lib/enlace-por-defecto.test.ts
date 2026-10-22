// ─────────────────────────────────────────────────────────────────────────────
// Guardia: el enlace que se le da —y se le manda— a un estudio para que lo pase a
// sus alumnas es el de LA APP (`/portal/<slug>`), no el de la página de reservas
// (`/reservar/<slug>`) (decisión del fundador, 22-oct-2026).
//
// «Para todo a los estudios nuevos les mando correos automáticos o la misma
// pantalla de la web de reservas. Que quede claro que la web de reservas es para
// que lo integren a su web. No debe ser la predeterminada.» Las dos direcciones
// existen y las dos se quedan; lo que esta guardia fija es CUÁL se reparte por
// defecto:
//
//   · los correos del alta (cuenta activa, ya puedes recibir reservas) y su QR;
//   · «Comparte el enlace de tu app», «¡Listo!» y «Tu estudio está listo»;
//   · la guía de primeros pasos, la visita guiada y el checklist;
//   · «Dirección y enlaces» de Configuración (la app va PRIMERO);
//   · los borradores de la apertura y el aviso de las 72 h sin reservas.
//
// Qué NO mira, a propósito (cada uno con su motivo):
//   · Las líneas de comentario, que tienen que poder contar por qué.
//   · Las pantallas de la web del estudio (Mi web, los widgets): ahí `/reservar`
//     ES lo que se pega en su web.
//   · `RESERVA_ABANDONADA#SOCIA` y los avisos a alumnas que ya estaban reservando
//     en la página de reservas: vuelven a donde estaban.
//   · La web comercial (components/landing, app/funcionalidades…): sus frases las
//     decide el fundador y se proponen en el PR (.claude/tentare-os.md).
//
// Si algo de aquí es verdad en un sitio concreto, va en EXCEPCIONES con su motivo.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import jsQR from 'jsqr';
import { rutaApp, rutaPaginaReservas, rutaQrApp, SLUG_PARA_QR, urlAbsoluta } from './enlaces-estudio.ts';
import { pngQr } from './qr/png.ts';
import { correoCuentaActiva, correoPrimeraClase, correoRecibirReservas } from './emails/tentare/alta.ts';
import { resumenDireccion } from './configuracion/resumenes.ts';
import { enlaceApp } from './opening/comunicaciones.ts';
import { calcularPasosOnboarding } from './onboarding.ts';

const raiz = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

/** Sin comentarios de línea ni de bloque: se miran los textos y el código, no la memoria. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

// ── Las funciones que fijan las dos direcciones ──────────────────────────────

test('la app y la página de reservas son dos rutas distintas, y la del QR de la app es la suya', () => {
  assert.equal(rutaApp('estudio-alba'), '/portal/estudio-alba');
  assert.equal(rutaPaginaReservas('estudio-alba'), '/reservar/estudio-alba');
  assert.equal(rutaQrApp('estudio-alba'), '/api/public/qr-app/estudio-alba');
  assert.equal(urlAbsoluta('https://www.example.com/', rutaApp('estudio-alba')), 'https://www.example.com/portal/estudio-alba');
  assert.equal(urlAbsoluta('https://www.example.com', rutaApp('a b')), 'https://www.example.com/portal/a%20b');
  assert.ok(SLUG_PARA_QR.test('estudio-alba') && !SLUG_PARA_QR.test('../x') && !SLUG_PARA_QR.test('A'));
});

// ── El QR de la app: lee de vuelta `…/portal/<slug>` ─────────────────────────

function leerPng(png: Buffer): { ancho: number; alto: number; rgba: Uint8ClampedArray } {
  let i = 8;
  let ancho = 0, alto = 0;
  const idat: Buffer[] = [];
  while (i < png.length) {
    const largo = png.readUInt32BE(i);
    const tipo = png.toString('ascii', i + 4, i + 8);
    const datos = png.subarray(i + 8, i + 8 + largo);
    if (tipo === 'IHDR') { ancho = datos.readUInt32BE(0); alto = datos.readUInt32BE(4); }
    if (tipo === 'IDAT') idat.push(datos);
    i += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const bytesFila = Math.ceil(ancho / 8);
  const rgba = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    const base = y * (bytesFila + 1);
    for (let x = 0; x < ancho; x++) {
      const v = ((crudo[base + 1 + (x >> 3)] >> (7 - (x & 7))) & 1) ? 255 : 0;
      rgba.set([v, v, v, 255], (y * ancho + x) * 4);
    }
  }
  return { ancho, alto, rgba };
}

test('el PNG de /api/public/qr-app/<slug> es un QR que se lee y abre la APP, no la página de reservas', () => {
  const slug = 'estudio-alba-pilates';
  const base = 'https://www.example.com';
  // La ruta hace exactamente esto: `pngQr(urlAbsoluta(base, rutaApp(slug)))`.
  const png = pngQr(urlAbsoluta(base, rutaApp(slug)));
  const { ancho, alto, rgba } = leerPng(png);
  const leido = jsQR(rgba, ancho, alto);
  assert.equal(leido?.data, `${base}/portal/${slug}`);
  assert.doesNotMatch(leido?.data ?? '', /\/reservar\//);
});

test('la ruta nueva del QR codifica la app, y la vieja se queda como estaba (hay correos enviados con esa imagen)', () => {
  const nueva = sinComentarios(leer('app/api/public/qr-app/[slug]/route.ts'));
  assert.match(nueva, /pngQr\(urlAbsoluta\(base, rutaApp\(slug\)\)\)/);
  assert.doesNotMatch(nueva, /\/reservar\//);
  assert.match(nueva, /Cache-Control': 'public, max-age=31536000, immutable'/);
  // La vieja sigue codificando la página de reservas: su imagen está en correos ya enviados y en el CDN.
  const vieja = sinComentarios(leer('app/api/public/qr-reservas/[slug]/route.ts'));
  assert.match(vieja, /pngQr\(`\$\{base\}\/reservar\/\$\{slug\}`\)/);
});

// ── Los correos: ni un enlace a /reservar ni su QR ───────────────────────────

const BASE_URL = 'https://www.example.com';

test('los tres correos del alta no reparten la página de reservas', () => {
  const urlApp = urlAbsoluta(BASE_URL, rutaApp('estudio-alba'));
  const urlQr = urlAbsoluta(BASE_URL, rutaQrApp('estudio-alba'));
  const htmls = [
    correoCuentaActiva({ estudioNombre: 'Estudio Alba', urlApp, urlPrimeraClase: `${BASE_URL}/calendario`, foundingGratis: true }).html,
    correoRecibirReservas({ estudioNombre: 'Estudio Alba', claseNombre: 'Reformer', cuando: 'lunes a las 18:30', urlApp, urlQr }).html,
    correoPrimeraClase({
      estudioNombre: 'Estudio Alba', nombre: null, urlBoton: `${BASE_URL}/calendario?primera=1`,
      variante: { tipo: 'sin_clase', ejemplo: { clase: 'Reformer', minutos: 55, plazas: 8 } },
    }).html,
  ];
  for (const html of htmls) {
    assert.doesNotMatch(html, /\/reservar\/|qr-reservas|página de reservas|enlace de reservas/i);
  }
  assert.match(htmls[0], /\/portal\/estudio-alba/);
  assert.match(htmls[1], /\/portal\/estudio-alba/);
  assert.match(htmls[1], /\/api\/public\/qr-app\/estudio-alba/);
});

test('los dos sitios que mandan esos correos construyen la dirección de la app', () => {
  const creado = sinComentarios(leer('app/api/alta/estudio-creado/route.ts'));
  assert.match(creado, /urlApp: urlAbsoluta\(base, rutaApp\(slug\)\)/);
  assert.doesNotMatch(creado, /\/reservar\//);
  const primera = sinComentarios(leer('app/api/alta/primera-clase/route.ts'));
  assert.match(primera, /urlApp: urlAbsoluta\(base, rutaApp\(slug\)\)/);
  assert.match(primera, /urlQr: urlAbsoluta\(base, rutaQrApp\(slug\)\)/);
  assert.doesNotMatch(primera, /\/reservar\/|qr-reservas/);
});

test('la plantilla del correo del código dice la app, no «enlace de reservas»', () => {
  const html = leer('supabase/templates/confirmation.html');
  assert.doesNotMatch(html, /enlace de reservas/i);
  assert.match(html, /El enlace de la app de tus alumnas, listo para mandar/);
});

// ── El aviso de las 72 h sin reservas ────────────────────────────────────────

test('el aviso de las 72 h sin reservas manda a compartir la app', () => {
  const catalogo = leer('lib/notifications/catalog.ts');
  const i = catalogo.indexOf('EMBUDO_SIN_PRIMERA_RESERVA}#PROPIETARIO');
  assert.ok(i > 0);
  const entrada = catalogo.slice(i, i + 900);
  assert.match(entrada, /Comparte el enlace de la app de tus alumnas/);
  assert.doesNotMatch(entrada, /página de reservas/);
});

// ── Las pantallas del panel que dan el enlace ───────────────────────────────

/** Ficheros del panel que dan el enlace (o el QR) para pasar a las alumnas. */
const PANTALLAS_CON_ENLACE_PARA_ALUMNAS = [
  'components/guia/compartir-enlace.tsx',
  'components/guia/compartir-desde-enlace.tsx',
  'components/guia/primeros-pasos-tarjeta.tsx',
  'components/onboarding/listo-para-reservar.tsx',
  'components/onboarding/estudio-listo.tsx',
  'components/dashboard/resumen-nuevo.tsx',
  'components/dashboard/onboarding-checklist.tsx',
  'components/dashboard/apertura-suave.tsx',
  'components/dashboard/etapas-lanzamiento.tsx',
  'app/crear-estudio/alta-nueva.tsx',
  'app/crear-estudio/alta-estudio.tsx',
  'components/alta-nueva/paso-marca.tsx',
  'components/alta-nueva/paso-tu-estudio.tsx',
  'components/alta-nueva/paso-importar.tsx',
  'lib/guia/primeros-pasos.ts',
  'lib/alta/bienvenida-nueva.ts',
  'lib/onboarding.ts',
  'lib/opening/comunicaciones.ts',
];

/** `/reservar/…` como enlace, el QR de la página o el cartel «reservas». */
const REPARTE_LA_PAGINA = /\/reservar\/|\/reservar\b[`'"]|qr-reservas|destino="reservas"|destino: 'reservas'|rutaPaginaReservas/;

/** Excepciones con su motivo. Vacía: ninguna pantalla de esta lista debe repartir la página de reservas. */
const EXCEPCIONES: Record<string, string> = {};

test('ninguna pantalla que da el enlace para las alumnas da la página de reservas', () => {
  for (const f of PANTALLAS_CON_ENLACE_PARA_ALUMNAS) {
    if (EXCEPCIONES[f]) continue;
    const codigo = sinComentarios(leer(f));
    assert.doesNotMatch(codigo, REPARTE_LA_PAGINA, `${f} vuelve a repartir /reservar: el enlace por defecto es la app (/portal)`);
  }
});

test('«Comparte el enlace de tu app» y «¡Listo!» comparten la app y su QR', () => {
  for (const f of ['components/guia/compartir-enlace.tsx', 'components/onboarding/listo-para-reservar.tsx', 'components/onboarding/estudio-listo.tsx']) {
    const codigo = sinComentarios(leer(f));
    assert.match(codigo, /rutaApp\(/, f);
    assert.match(codigo, /destino="app"/, `${f}: el QR es el de la app`);
  }
});

test('«¡Listo!» enseña la app REAL en el móvil (el marco de solo mirar), no la página de reservas en un iframe', () => {
  const codigo = sinComentarios(leer('components/onboarding/listo-para-reservar.tsx'));
  assert.match(codigo, /<AppEnVivo/);
  assert.doesNotMatch(codigo, /<iframe/);
});

test('Configuración › Dirección y enlaces: la app va primero y la página de reservas se dice «para tu web»', () => {
  const codigo = sinComentarios(leer('components/configuracion/tab-estudio-enlaces.tsx'));
  // La fila que se ve sin abrir el cajón copia la app.
  const fila = codigo.slice(codigo.indexOf('export function FilaDireccionYEnlaces'), codigo.indexOf('function EnlacePublico'));
  assert.match(fila, /rutaApp\(slug\)/);
  assert.doesNotMatch(fila, /rutaPaginaReservas|\/reservar\//);
  // En el cajón, la app antes que la página de reservas.
  const cajon = codigo.slice(codigo.indexOf('export function DetalleDireccionYEnlaces'));
  const iApp = cajon.indexOf('titulo="App de tus alumnas"');
  const iPagina = cajon.indexOf('titulo="Página de reservas"');
  assert.ok(iApp > 0 && iPagina > iApp, 'la app de tus alumnas va ANTES que la página de reservas');
  assert.match(cajon.slice(iPagina, iPagina + 400), /Para tu web/);
  // Y la dirección corta de la fila es la de la app.
  assert.equal(resumenDireccion({ slug: 'estudio-alba', origen: 'https://www.example.com' }), 'example.com/portal/estudio-alba');
});

// ── Lo que se calcula: el paso «Abre las reservas», los borradores ───────────

test('el paso «Abre las reservas» del checklist lleva a la app', () => {
  const pasos = calcularPasosOnboarding({
    nif: 'B12345678', stripeAccountId: null, slug: 'estudio-alba', numInstructores: 1, numTiposClase: 1, numSesiones: 1, numSocios: 1,
  } as Parameters<typeof calcularPasosOnboarding>[0]);
  const reservas = pasos.find(p => p.id === 'reservas');
  assert.equal(reservas?.href, '/portal/estudio-alba');
});

test('los borradores de la apertura y «Dirección» llevan a la app', () => {
  assert.equal(enlaceApp('estudio-alba'), 'https://www.tentare.app/portal/estudio-alba');
});

// ── Guía y visita: lo que dicen del enlace ──────────────────────────────────

test('la guía y la visita guiada hablan de «la app de tus alumnas» como enlace, no de «tu enlace de reservas»', () => {
  for (const f of ['lib/guia/primeros-pasos.ts', 'lib/guia/curriculo.ts', 'lib/tour/capitulos.ts', 'lib/alta/bienvenida-nueva.ts', 'lib/onboarding.ts']) {
    const codigo = sinComentarios(leer(f));
    assert.doesNotMatch(codigo, /(?:tu|el) enlace de reservas|Comparte tu enlace de reservas|Ver mi página de reservas/i, `${f}: «enlace de reservas» como el enlace a repartir`);
  }
});
