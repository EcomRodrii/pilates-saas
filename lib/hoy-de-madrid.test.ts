import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hoyEnEstudio, masDias } from './utils.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El «hoy» de un estudio es el de Madrid, nunca el de UTC (`.claude/tentare-os.md`).
// Mitad TypeScript de `supabase/tests/hoy-de-madrid.test.ts`, que vigila lo mismo en SQL.
//
// `new Date().toISOString().slice(0, 10)` da el día en UTC: entre las 00:00 y las 02:00
// de Madrid (01:00 en invierno) sigue en el día anterior. Cuando ese día decide algo —una
// vigencia, una caducidad, la ventana de un aviso, un «desde hoy» por defecto, la clave de
// «un aviso al día»—, va `hoyEnEstudio()` y, para sumar días, `masDias()`.
//
// Se corre también con TZ=UTC: nada de esto puede depender de la zona del proceso.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.ts$/.test(nombre) ? [ruta] : [];
  });
}

const CODIGO = () => ['app', 'lib', 'components'].flatMap(d => ficheros(join(RAIZ, d)));

// El mismo criterio que el `git grep` con el que se hizo la lista (PR del 12-oct-2026): una
// línea de código (no un comentario) con el día ISO de un `new Date()` o un `Date.now()`.
const DIA_UTC = /\.toISOString\(\)\.slice\(0,\s*10\)/;
const RELOJ = /new Date\(\)|Date\.now\(\)/;
const esComentario = (linea: string) => /^\s*(\/\/|\/\*|\*)/.test(linea);

// Los únicos que pueden seguir con el día de UTC, y por qué. Añadir uno aquí es una
// decisión: lleva su motivo, y solo vale si ese día no decide nada.
const CON_DIA_UTC_A_PROPOSITO: Record<string, string> = {
  'app/(dashboard)/clientas/respuestas/page.tsx':
    'el nombre del CSV que se descarga («respuestas-<estudio>-<fecha>.csv»): un nombre de fichero no decide nada',
  'app/api/interno/changelog/imagen/route.ts':
    'la carpeta del bucket donde se guarda una captura del changelog: la ruta es un nombre, nadie la lee como fecha',
  'lib/db/rls-test-helpers.ts':
    'fixture de los tests contra Postgres local: la fecha_inicio de una suscripción de prueba sin fecha de fin, que solo sirve de fila (quién la ve, de quién cuelga un recibo)',
  // Lo corrige #2640 (`saldoBonosPorSocia`, el «Quedan N» de la lista de Clientas). Fuera en cuanto entre.
  'app/(dashboard)/clientas/page.tsx': 'pendiente de #2640',
};

test('ningún «hoy» que decide algo sale del día de UTC', () => {
  const nuevos: string[] = [];
  for (const f of CODIGO()) {
    const ruta = relative(RAIZ, f);
    if (ruta in CON_DIA_UTC_A_PROPOSITO) continue;
    readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      if (!esComentario(linea) && DIA_UTC.test(linea) && RELOJ.test(linea)) nuevos.push(`${ruta}:${i + 1}`);
    });
  }
  assert.deepEqual(
    nuevos, [],
    `Usan el día de UTC: ${nuevos.join(', ')}. Entre las 00:00 y las 02:00 de Madrid sigue en el día anterior. Usa `
    + 'hoyEnEstudio() (lib/utils.ts) y, para sumar días, masDias(). Si de verdad no decide nada (un nombre, una ruta), '
    + 'añádelo a CON_DIA_UTC_A_PROPOSITO con su motivo.',
  );
});

// La ventana de los avisos «caduca pronto» (bonos, a 7 días) y «termina pronto» (clases
// fijas): `masDias(hoyEnEstudio(), N)`. Con `Date.now() + N días` en UTC, a las 00:30 de
// Madrid empezaba ayer: avisaba de un bono que ya había caducado.
test('la ventana de un aviso a N días empieza hoy en Madrid, no ayer', () => {
  const ahora = new Date('2026-11-16T23:30:00Z'); // 00:30 del 17 (invierno, +01:00)
  const desde = hoyEnEstudio(ahora);
  assert.deepEqual({ desde, hasta: masDias(desde, 7) }, { desde: '2026-11-17', hasta: '2026-11-24' });
  // Lo de antes:
  assert.equal(ahora.toISOString().slice(0, 10), '2026-11-16');
  assert.equal(new Date(ahora.getTime() + 7 * 24 * 3600_000).toISOString().slice(0, 10), '2026-11-23');
});

test('en verano, a las 23:59 aún es el mismo día y a las 00:00 ya el siguiente', () => {
  assert.equal(hoyEnEstudio(new Date('2026-07-15T21:59:00Z')), '2026-07-15');
  assert.equal(hoyEnEstudio(new Date('2026-07-15T22:00:00Z')), '2026-07-16');
  assert.equal(masDias(hoyEnEstudio(new Date('2026-07-15T22:00:00Z')), 7), '2026-07-23');
});
