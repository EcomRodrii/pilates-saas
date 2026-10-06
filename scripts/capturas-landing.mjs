// Genera las capturas de producto de la landing (AVIF + WebP) desde los PNG
// crudos que deja e2e/landing-capturas.spec.ts.
//
//   1. Arranca el servidor de desarrollo con el estudio de muestra:
//        E2E_COLOR_PRIMARIO=#55603F E2E_PORTADA_URL=/landing/fotos/sala-pilates-reformers-madera-cierre-1280.webp \
//        E2E_PORT=3219 npm run dev   (con las variables de e2e de playwright.config.ts)
//   2. CAPTURAS_LANDING=<carpeta> E2E_PORT=3219 npx playwright test e2e/landing-capturas.spec.ts --project=chromium --workers=1
//   3. node scripts/capturas-landing.mjs <carpeta>
//
// Los datos son 100 % de muestra (los andamiajes de e2e: nombres inventados,
// `@example.com`, estudio ficticio). Nunca se capturan datos reales: el repo es
// público. Los PNG crudos NO se versionan, solo los derivados, sin metadatos.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ENTRADA = process.argv[2];
if (!ENTRADA) { console.error('Uso: node scripts/capturas-landing.mjs <carpeta-de-png-crudos>'); process.exit(1); }
const SALIDA = new URL('../public/landing/capturas/', import.meta.url).pathname;

const MOVIL = [390, 780];
const FRAGMENTO = [480, 960];

// Cada fragmento es un RECORTE APRETADO de una captura real (px del PNG crudo,
// que es @2x en el panel y @3x en la app): una tarjeta de reserva, un recibo,
// una fila del calendario, la confirmación del asistente… Se colocan como
// pegatinas sobre el tinte de las tarjetas (components/landing/SeccionBento.tsx).
// Las proporciones (alto/ancho) están repetidas en SeccionBento.tsx (`F`).
export const CAPTURAS = {
  'fragmento-mapa-reformers-reserva': { crudo: 'app-elegir-reformer-4', recorte: { left: 40, top: 1555, width: 1090, height: 650 }, anchos: FRAGMENTO },
  'fragmento-pago-recibo-app': { crudo: 'app-pagos', recorte: { left: 40, top: 320, width: 1090, height: 600 }, anchos: FRAGMENTO },
  'fragmento-bono-sesiones-app': { crudo: 'app-bonos', recorte: { left: 40, top: 850, width: 1090, height: 640 }, anchos: FRAGMENTO },
  'fragmento-semana-calendario': { crudo: 'panel-calendario', recorte: { left: 716, top: 556, width: 860, height: 400 }, anchos: FRAGMENTO },
  'fragmento-ocupacion-calendario': { crudo: 'panel-calendario', recorte: { left: 606, top: 470, width: 700, height: 80 }, anchos: FRAGMENTO },
  'fragmento-clase-llena-lista-espera': { crudo: 'panel-calendario', recorte: { left: 724, top: 726, width: 420, height: 104 }, anchos: FRAGMENTO },
  'fragmento-recomendacion-centro-de-control': { crudo: 'panel-centro-de-control', recorte: { left: 600, top: 316, width: 1330, height: 322 }, anchos: FRAGMENTO },
  'fragmento-botones-decision': { crudo: 'panel-centro-de-control', recorte: { left: 590, top: 640, width: 700, height: 110 }, anchos: FRAGMENTO },
  'fragmento-asistente-peticion': { crudo: 'panel-asistente', recorte: { left: 1880, top: 170, width: 830, height: 140 }, anchos: FRAGMENTO },
  'fragmento-asistente-confirmacion': { crudo: 'panel-asistente', recorte: { left: 1355, top: 440, width: 1340, height: 620 }, anchos: FRAGMENTO },
  'fragmento-acta-migracion': { crudo: 'panel-migracion', recorte: { left: 550, top: 450, width: 1560, height: 215 }, anchos: FRAGMENTO },
  'fragmento-acta-migracion-movil': { crudo: 'panel-migracion', recorte: { left: 1280, top: 450, width: 830, height: 215 }, anchos: FRAGMENTO },
  'fragmento-deshacer-migracion': { crudo: 'panel-migracion', recorte: { left: 550, top: 785, width: 780, height: 110 }, anchos: FRAGMENTO },
  'fragmento-avisar-sustituta': { crudo: 'panel-calendario-clase', recorte: { left: 2015, top: 940, width: 740, height: 360 }, anchos: FRAGMENTO },
  // El móvil entero, que asoma por el borde de la tarjeta de la app.
  'app-alumna-inicio-estudio-pilates': { crudo: 'app-inicio', anchos: MOVIL },
};

await mkdir(SALIDA, { recursive: true });
for (const [nombre, { crudo, recorte, anchos }] of Object.entries(CAPTURAS)) {
  let base = sharp(join(ENTRADA, `${crudo}.png`));
  if (recorte) base = base.extract(recorte);
  const buf = await base.png().toBuffer();
  for (const ancho of anchos) {
    const r = sharp(buf).resize({ width: ancho, withoutEnlargement: true });
    const webp = await r.clone().webp({ quality: 80, effort: 6 }).toBuffer();
    const avif = await r.clone().avif({ quality: 52, effort: 4 }).toBuffer();
    await writeFile(join(SALIDA, `${nombre}-${ancho}.webp`), webp);
    await writeFile(join(SALIDA, `${nombre}-${ancho}.avif`), avif);
    console.log(`${nombre}-${ancho}: webp ${(webp.length / 1024).toFixed(0)} KB · avif ${(avif.length / 1024).toFixed(0)} KB`);
  }
}
