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
const PANEL = [960, 1600];

// nombre de salida ← { crudo, recorte (px del PNG crudo), anchos }
export const CAPTURAS = {
  'calendario-sustitucion-visto-bueno-estudio-pilates': { crudo: 'panel-calendario-clase', recorte: { left: 560, top: 262, width: 2280, height: 1478 }, anchos: PANEL },
  'centro-de-control-recomendacion-del-dia': { crudo: 'panel-centro-de-control', recorte: { left: 556, top: 140, width: 2290, height: 900 }, anchos: PANEL },
  'cobros-quien-me-debe-estudio-pilates': { crudo: 'panel-cobros', recorte: { left: 556, top: 240, width: 2290, height: 780 }, anchos: PANEL },
  'asistente-confirmar-clase-pregunta-a-tentare': { crudo: 'panel-asistente', recorte: { left: 1330, top: 200, width: 1500, height: 940 }, anchos: PANEL },
  'migracion-acta-deshacer-importacion': { crudo: 'panel-migracion', recorte: { left: 550, top: 250, width: 1560, height: 720 }, anchos: PANEL },
  'app-alumna-elegir-reformer-estudio-pilates': { crudo: 'app-elegir-reformer-4', anchos: MOVIL },
  'app-alumna-inicio-estudio-pilates': { crudo: 'app-inicio', anchos: MOVIL },
  'app-alumna-mi-plan-bono-pagar-recibo': { crudo: 'app-bonos', anchos: MOVIL },
  'app-alumna-recibos-pagar': { crudo: 'app-pagos', anchos: MOVIL },
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
