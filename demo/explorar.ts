import { join } from 'node:path';
import { SALIDA, grabarCapitulo } from './nucleo.ts';
import { TABLAS_DEMO } from './datos.ts';

// Herramienta de desarrollo: hace una foto de cada pantalla que se le pida.
//   DEMO_RAPIDO=1 node --experimental-strip-types demo/explorar.ts "configuracion?tab=estudio&abrir=salas" …
process.env.DEMO_RAPIDO = '1';
const rutas = process.argv.slice(2);
await grabarCapitulo({ id: 'explora', titulo: 'explora', tablas: structuredClone(TABLAS_DEMO) }, async g => {
  let n = 0;
  for (const r of rutas) {
    await g.visita(r);
    await g.page.screenshot({ path: join(SALIDA, `explora-${String(++n).padStart(2, '0')}.png`), fullPage: true });
    console.log(n, r, '→', (await g.page.locator('h2').allInnerTexts()).slice(0, 4).join(' | '));
  }
}, `http://localhost:${process.env.E2E_PORT ?? '3411'}`);
