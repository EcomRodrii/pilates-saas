#!/usr/bin/env node
/**
 * Construye e2e/.duration-profile.json a partir de los tiempos REALES que la CI
 * mide en cada shard.
 *
 * El perfil anterior era un stub inventado —lo decía su propio campo `note`— con
 * 30 duraciones a ojo, y 28 de esos nombres ya no existían en el repo. Un perfil
 * falso reparte peor que no tener perfil, así que este script existe para que
 * los números salgan siempre de una ejecución real.
 *
 * De dónde vienen los ficheros de entrada: cada shard de CI corre Playwright con
 * el reporter `json` además de `blob`, y sube ese JSON como artefacto SIEMPRE
 * (no solo cuando falla, que es lo que hacía el blob). Se bajan con:
 *
 *   gh run download <run-id> --pattern 'timings-*' --dir /tmp/timings
 *   node scripts/perfil-duraciones-e2e.js /tmp/timings
 *
 * Suma la duración de TODOS los tests de un mismo fichero (todos los proyectos y
 * reintentos incluidos): lo que se reparte son ficheros, así que lo que importa
 * es lo que cuesta el fichero entero, no un test suelto.
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const entrada = process.argv[2];

if (!entrada) {
  console.error('uso: node scripts/perfil-duraciones-e2e.js <carpeta-con-timings-*.json>');
  process.exit(1);
}

/** Recorre la estructura del reporter json y suma duraciones por fichero. */
function acumular(nodo, porFichero, ficheroActual = null) {
  if (!nodo || typeof nodo !== 'object') return;
  const fichero = typeof nodo.file === 'string' ? basename(nodo.file) : ficheroActual;

  for (const test of nodo.tests ?? []) {
    for (const res of test.results ?? []) {
      if (fichero && Number.isFinite(res.duration)) {
        porFichero[fichero] = (porFichero[fichero] ?? 0) + res.duration;
      }
    }
  }
  for (const hijo of nodo.suites ?? []) acumular(hijo, porFichero, fichero);
  for (const spec of nodo.specs ?? []) acumular(spec, porFichero, fichero);
}

const ficheros = readdirSync(entrada)
  .flatMap(n => {
    const p = join(entrada, n);
    return statSync(p).isDirectory()
      ? readdirSync(p).filter(x => x.endsWith('.json')).map(x => join(p, x))
      : n.endsWith('.json') ? [p] : [];
  });

if (ficheros.length === 0) {
  console.error(`no hay JSON de timings en ${entrada}`);
  process.exit(1);
}

const porFichero = {};
for (const f of ficheros) {
  try {
    acumular(JSON.parse(readFileSync(f, 'utf8')), porFichero);
  } catch (e) {
    console.error(`⚠️  ${f} ilegible, se ignora: ${e.message}`);
  }
}

const profiles = Object.entries(porFichero)
  .map(([file, duration]) => ({ file, duration: Math.round(duration), seconds: Math.round(duration / 1000) }))
  .sort((a, b) => b.duration - a.duration);

if (profiles.length === 0) {
  console.error('los JSON no traían ninguna duración: ¿corrió Playwright con --reporter=json?');
  process.exit(1);
}

const salida = {
  profiles,
  totalTime: profiles.reduce((s, p) => s + p.duration, 0),
  timestamp: new Date().toISOString(),
  origen: `medido en CI, ${ficheros.length} shards`,
};

writeFileSync(join(RAIZ, 'e2e/.duration-profile.json'), JSON.stringify(salida, null, 2) + '\n');
console.log(`✅ ${profiles.length} specs medidos · total ${(salida.totalTime / 1000 / 60).toFixed(1)} min`);
console.log(`   más lento: ${profiles[0].file} (${profiles[0].seconds}s)`);
