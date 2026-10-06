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

// Solo las pantallas de móvil que «asoman» por el borde de las tarjetas de
// components/landing/SeccionBento.tsx; todo lo demás de esas tarjetas son
// tarjetitas en HTML/CSS con el estilo del producto y datos de muestra.
export const CAPTURAS = {
  'app-alumna-inicio-estudio-pilates': { crudo: 'app-inicio', anchos: MOVIL },
  'app-alumna-recibos-pagar': { crudo: 'app-pagos', anchos: MOVIL },
  'app-asistente-confirmar-clase': { crudo: 'app-asistente-movil', anchos: MOVIL },
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
