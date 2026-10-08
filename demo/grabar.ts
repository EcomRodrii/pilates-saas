import { mkdirSync } from 'node:fs';
import { SALIDA, grabarCapitulo, RAPIDO, type Cronologia } from './nucleo.ts';
import { CAPITULOS } from './capitulos/indice.ts';
import { TABLAS_DEMO } from './datos.ts';

// Graba los capítulos de la demo, uno a uno (cada uno su vídeo).
//
//   npm run demo:grabar                         → todos, en tiempo real
//   npm run demo:grabar -- estudio reservas     → solo esos
//   DEMO_RAPIDO=1 npm run demo:grabar           → sin vídeo ni esperas: comprueba el guion
//   DEMO_FOTOS=1 DEMO_RAPIDO=1 …                → y una foto por cada frase en demo/salida/fotos
//
// Necesita un servidor de desarrollo con el entorno de e2e (Supabase de mentira),
// en E2E_PORT (3411 por defecto). Ver demo/LEEME.md.
const puerto = process.env.E2E_PORT ?? '3411';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${puerto}`;

const pedidos = process.argv.slice(2).filter(a => !a.startsWith('-'));
const aGrabar = pedidos.length ? CAPITULOS.filter(c => pedidos.includes(c.id)) : CAPITULOS;
if (aGrabar.length === 0) { console.error(`Ningún capítulo coincide con ${pedidos.join(', ')}`); process.exit(1); }

mkdirSync(SALIDA, { recursive: true });
// Las tablas se comparten entre capítulos: lo guardado en uno lo ve el siguiente.
const tablas = structuredClone(TABLAS_DEMO);
const inicio = Date.now();
const resultados: Cronologia[] = [];
const fallos: string[] = [];
for (const c of aGrabar) {
  const t = Date.now();
  console.log(`▶ ${c.id} (${c.titulo})${RAPIDO ? ' [rápido]' : ''}`);
  try {
    const crono = await grabarCapitulo({ id: c.id, titulo: c.titulo, tablas, numero: CAPITULOS.indexOf(c) + 1 }, g => c.guion(g, { numero: CAPITULOS.indexOf(c) + 1, total: CAPITULOS.length }), baseURL);
    resultados.push(crono);
    console.log(`  ✓ ${c.id}: ${(crono.duracionMs / 1000).toFixed(0)} s de vídeo, ${crono.voces.length} frases, ${((Date.now() - t) / 1000).toFixed(0)} s reales`);
  } catch (e) {
    // Un capítulo roto no tira los demás: se cuenta y se sigue (se regraba solo con `-- <id>`).
    fallos.push(c.id);
    console.error(`  ✗ ${c.id}: ${String((e as Error).message).split('\n')[0]}`);
  }
}
if (fallos.length) { console.error(`Fallaron: ${fallos.join(', ')}`); process.exitCode = 1; }
console.log(`Hecho en ${((Date.now() - inicio) / 60000).toFixed(1)} min. Vídeos en ${SALIDA}/video`);
