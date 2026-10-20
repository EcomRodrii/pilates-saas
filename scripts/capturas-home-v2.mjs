// Capturas REALES del panel para la home nueva (fase 2.2, 19-oct-2026), en
// AVIF + WebP y sin metadatos, en public/producto/v2/.
//
//   node scripts/capturas-home-v2.mjs <carpeta-de-png-crudos>
//
// Los PNG crudos NO se versionan (el repo es público): salen de las pasadas de
// Playwright sobre el panel sembrado de los e2e (datos 100 % de muestra:
// «Bea Ortega», «Carmen Del Río Sánchez», `cloe@example.com`…). Cada entrada
// dice de qué crudo sale y qué recorte se queda: el momento decisivo, nunca la
// pantalla entera, y nunca una línea de error ni una barra con datos de cuenta.
//
// Antes de añadir una captura aquí se revisa a mano, UNA A UNA, que no sale
// ningún nombre, correo o teléfono de una persona real.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ENTRADA = process.argv[2];
if (!ENTRADA) { console.error('Uso: node scripts/capturas-home-v2.mjs <carpeta-de-png-crudos>'); process.exit(1); }
const SALIDA = new URL('../public/producto/v2/', import.meta.url).pathname;

export const CAPTURAS = {
  // Clientas del panel nuevo (PANEL_NUEVO), 1440×900: filtros por estado y la
  // tabla con plan, saldo, última clase y avisos. Se queda fuera la cabecera
  // (el aviso de «¿Primera vez aquí?» y una línea de error del entorno de
  // pruebas) y el menú lateral (lleva el correo de la cuenta de muestra).
  'panel-clientas': {
    crudo: 'clientas-sin-filtro-escritorio.png',
    recorte: { left: 270, top: 288, width: 1110, height: 489 },
    anchos: [555, 1110],
  },
};

await mkdir(SALIDA, { recursive: true });
for (const [nombre, { crudo, recorte, anchos }] of Object.entries(CAPTURAS)) {
  const buf = await sharp(join(ENTRADA, crudo)).extract(recorte).png().toBuffer();
  for (const ancho of anchos) {
    const r = sharp(buf).resize({ width: ancho, withoutEnlargement: true });
    const webp = await r.clone().webp({ quality: 82, effort: 6 }).toBuffer();
    const avif = await r.clone().avif({ quality: 55, effort: 4 }).toBuffer();
    await writeFile(join(SALIDA, `${nombre}-${ancho}.webp`), webp);
    await writeFile(join(SALIDA, `${nombre}-${ancho}.avif`), avif);
    console.log(`${nombre}-${ancho}: webp ${(webp.length / 1024).toFixed(0)} KB · avif ${(avif.length / 1024).toFixed(0)} KB`);
  }
}
