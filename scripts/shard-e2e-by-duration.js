#!/usr/bin/env node
/**
 * Reparte los specs de E2E entre shards equilibrando TIEMPO, no número de tests.
 *
 * ⚠️ La lista de specs sale SIEMPRE de globear `e2e/`, nunca de un fichero
 * commiteado. Esa es la diferencia con la primera versión de este script, que
 * escribía `.github/e2e-shards.json` con la lista dentro: aquel fichero se
 * quedó con 30 nombres —28 de ellos ya inexistentes— mientras el repo crecía a
 * 151 specs, así que cablearlo habría dejado 149 specs sin ejecutar y la CI en
 * verde. Con el glob como fuente de verdad, un spec nuevo entra solo y no hay
 * lista que se pueda pudrir.
 *
 * Las duraciones (`e2e/.duration-profile.json`) son solo una OPTIMIZACIÓN: si
 * un spec no aparece ahí, se le asume la mediana de los conocidos. Un perfil
 * viejo o incompleto reparte peor, pero nunca deja tests sin correr.
 *
 * Uso:
 *   node scripts/shard-e2e-by-duration.js --shard=3 --de=12   → imprime los
 *       ficheros de ese shard, separados por espacios (esto es lo que consume CI)
 *   node scripts/shard-e2e-by-duration.js --de=12             → tabla de reparto
 *   node scripts/shard-e2e-by-duration.js --check --de=12     → valida y sale
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Todos los specs de e2e/, en orden estable. Fuente de verdad. */
export function specsEnDisco(dir = join(RAIZ, 'e2e')) {
  return readdirSync(dir).filter(f => f.endsWith('.spec.ts')).sort();
}

/** Duraciones conocidas, en ms. Devuelve {} si no hay perfil o está corrupto. */
export function duracionesConocidas(ruta = join(RAIZ, 'e2e/.duration-profile.json')) {
  try {
    const { profiles } = JSON.parse(readFileSync(ruta, 'utf8'));
    if (!Array.isArray(profiles)) return {};
    return Object.fromEntries(
      profiles
        .filter(p => p && typeof p.file === 'string' && Number.isFinite(p.duration) && p.duration > 0)
        .map(p => [p.file, p.duration]),
    );
  } catch {
    return {};
  }
}

function mediana(xs) {
  if (xs.length === 0) return 30_000; // 30s: suposición sensata para un spec sin medir
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Bin packing LPT (el más largo primero al shard más descargado).
 * Determinista: los 12 jobs de CI calculan esto por separado y TIENEN que
 * coincidir, así que el orden de entrada y los desempates son fijos.
 */
export function repartir({ specs, duraciones = {}, nShards = 12 }) {
  if (!Number.isInteger(nShards) || nShards < 1) throw new Error('nShards inválido');

  const porDefecto = mediana(Object.values(duraciones));
  const conPeso = specs
    .map(file => ({ file, ms: duraciones[file] ?? porDefecto, medido: file in duraciones }))
    // desempate por nombre: dos specs con el mismo peso no pueden depender del
    // orden en que los devolvió readdir
    .sort((a, b) => b.ms - a.ms || a.file.localeCompare(b.file));

  const shards = Array.from({ length: nShards }, () => ({ files: [], ms: 0 }));
  for (const { file, ms } of conPeso) {
    let iMin = 0;
    for (let i = 1; i < shards.length; i++) if (shards[i].ms < shards[iMin].ms) iMin = i;
    shards[iMin].files.push(file);
    shards[iMin].ms += ms;
  }
  for (const s of shards) s.files.sort();

  // Invariante: cada spec exactamente una vez. Si esto se rompe, la CI corre de
  // menos (o de más) y sale verde igual — por eso revienta aquí en vez de avisar.
  const asignados = shards.flatMap(s => s.files);
  if (asignados.length !== specs.length || new Set(asignados).size !== specs.length) {
    throw new Error(
      `reparto inválido: ${specs.length} specs en disco, ${asignados.length} asignados ` +
      `(${new Set(asignados).size} únicos)`,
    );
  }
  return shards;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function esMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (esMain()) {
  const arg = n => process.argv.slice(2).find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  const tiene = n => process.argv.slice(2).includes(`--${n}`);

  const nShards = Number(arg('de') ?? 12);
  const specs = specsEnDisco();
  const duraciones = duracionesConocidas();
  const shards = repartir({ specs, duraciones, nShards });

  const cual = arg('shard');
  if (cual) {
    const i = Number(cual);
    if (!Number.isInteger(i) || i < 1 || i > nShards) {
      console.error(`--shard debe ir entre 1 y ${nShards}, recibido: ${cual}`);
      process.exit(1);
    }
    // Rutas relativas a la raíz: es lo que Playwright espera como argumento.
    process.stdout.write(shards[i - 1].files.map(f => `e2e/${f}`).join(' '));
    process.exit(0);
  }

  const medidos = specs.filter(s => s in duraciones).length;
  console.log(`${specs.length} specs · ${medidos} con duración medida · ${nShards} shards\n`);
  for (const [i, s] of shards.entries()) {
    console.log(`  shard ${String(i + 1).padStart(2)}: ${String(s.files.length).padStart(3)} specs · ${(s.ms / 1000).toFixed(0).padStart(4)}s`);
  }
  const max = Math.max(...shards.map(s => s.ms));
  const min = Math.min(...shards.map(s => s.ms));
  console.log(`\n  desequilibrio: ${(((max - min) / max) * 100).toFixed(1)}%  (max ${(max / 1000).toFixed(0)}s · min ${(min / 1000).toFixed(0)}s)`);
  if (medidos === 0) {
    console.log('\n  ⚠️ Sin duraciones medidas: el reparto es por número de specs.');
    console.log('     Regenera el perfil con scripts/perfil-duraciones-e2e.js.');
  }
  if (tiene('check')) console.log('\n✅ Todos los specs de e2e/ caen en exactamente un shard.');
}
