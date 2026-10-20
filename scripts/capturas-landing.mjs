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

// Las capturas de la app salen a 402 × 815 pt (e2e/landing-capturas.spec.ts): la pantalla
// del iPhone 17 Pro menos los 59 pt de la barra de estado. Aquí se le añade ese hueco
// arriba para que queden a 402 × 874, la pantalla entera, y el marco
// (components/ui/marco-iphone.tsx) pinte la hora y la isla sin tapar la cabecera.
// `barra`: 'fondo' rellena con el color de la app; 'foto' prolonga la foto en espejo
// (como en un iPhone, la foto de la clase sube por debajo de la barra).
const BARRA_ESTADO = 59 * 3;
const FONDO_APP = { r: 250, g: 249, b: 245 };

// Las que usan las páginas (components/web/home/piezas.tsx, CAPTURAS_APP). La de
// Inicio (app-alumna-inicio-v2-estudio-pilates) no sale de aquí: es la del fundador.
export const CAPTURAS = {
  'app-alumna-reservar-manana': { crudo: 'app-horario-manana', anchos: MOVIL, barra: 'fondo' },
  'app-alumna-mi-plan': { crudo: 'app-plan-al-dia', anchos: MOVIL, barra: 'fondo' },
  'app-alumna-elegir-reformer': { crudo: 'app-elegir-reformer-4', anchos: MOVIL, barra: 'foto' },
};

await mkdir(SALIDA, { recursive: true });
for (const [nombre, { crudo, recorte, anchos, barra }] of Object.entries(CAPTURAS)) {
  let base = sharp(join(ENTRADA, `${crudo}.png`));
  if (recorte) base = base.extract(recorte);
  if (barra) {
    base = sharp(await base.png().toBuffer()).extend(barra === 'foto'
      ? { top: BARRA_ESTADO, extendWith: 'mirror' }
      : { top: BARRA_ESTADO, background: FONDO_APP });
  }
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
