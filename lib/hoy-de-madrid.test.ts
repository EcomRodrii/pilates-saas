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
// Y del reloj que llega por parámetro (13-oct-2026, revisión de lo mergeado): `now`, `hoy`,
// `ahora` o `x.hoy`. Sin eso se le escapaban cinco, en Veri*Factu y en el Decision OS.
const DIA_UTC = /\.toISOString\(\)\.slice\(0,\s*10\)/;
const RELOJ = /new Date\(\)|Date\.now\(\)|\b(now|hoy|ahora)\.toISOString\(\)|\.hoy\.toISOString\(\)/;
const esComentario = (linea: string) => /^\s*(\/\/|\/\*|\*)/.test(linea);

// Los únicos que pueden seguir con el día de UTC, y por qué. Añadir uno aquí es una
// decisión: lleva su motivo, y solo vale si ese día no decide nada.
const CON_DIA_UTC_A_PROPOSITO: Record<string, string> = {
  'app/(dashboard)/clientas/respuestas/page.tsx':
    'el nombre del CSV que se descarga («respuestas-<estudio>-<fecha>.csv»): un nombre de fichero no decide nada',
  'app/api/interno/changelog/imagen/route.ts':
    'la carpeta del bucket donde se guarda una captura del changelog: la ruta es un nombre, nadie la lee como fecha',
  'lib/socios/exportar-datos-socia.ts':
    'el nombre del fichero JSON que se descarga con los datos de la socia: un nombre de fichero no decide nada',
  'lib/db/rls-test-helpers.ts':
    'fixture de los tests contra Postgres local: la fecha_inicio de una suscripción de prueba sin fecha de fin, que solo sirve de fila (quién la ve, de quién cuelga un recibo)',
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

// La otra forma del mismo error (15-oct-2026): la MEDIANOCHE DEL PROCESO. En una ruta de
// `app/api` el proceso corre en UTC (Vercel), y `d.setHours(0, 0, 0, 0)` es la medianoche
// de UTC: 01:00 o 02:00 de Madrid. El test de arriba no la veía porque no pasa por
// `.toISOString().slice(0, 10)`. Así se quedó el «Hoy» de la Caja enseñando las ventas de
// ayer entre las 00:00 y las 02:00 (app/api/pos/catalogo, #2735). En el navegador
// (components/, la mayor parte de lib/) la zona es la de quien mira, y ahí no se vigila.
// Para el inicio del día en el servidor: `inicioDelDiaEstudio(hoyEnEstudio())`.
const MEDIANOCHE_DEL_PROCESO = /\.setHours\(0,\s*0,\s*0,\s*0\)/;

// Las que quedan, cada una con lo que le pasa. Es un trinquete: solo puede bajar, y un
// fichero que deja de usarla tiene que salir de aquí.
const MEDIANOCHE_PENDIENTE: Record<string, string> = {
  'app/api/equipo/tarjetas/route.ts':
    'toda la ruta piensa en UTC, no solo esta línea: la semana (lunes), el mes, el día de la semana de cada clase (`getDay()`, las barras L–D) y «clase de hoy» (`toDateString()`). Una clase antes de las 02:00 de Madrid cae en el día, la semana o el mes anterior. No es de la Caja ni de una línea: pendiente de su propio PR',
};

test('ninguna ruta de servidor saca el inicio del día de la medianoche del proceso (UTC)', () => {
  const rutas = ficheros(join(RAIZ, 'app', 'api'));
  const nuevos: string[] = [];
  const conMedianoche = new Set<string>();
  for (const f of rutas) {
    const ruta = relative(RAIZ, f);
    readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      if (esComentario(linea) || !MEDIANOCHE_DEL_PROCESO.test(linea)) return;
      conMedianoche.add(ruta);
      if (!(ruta in MEDIANOCHE_PENDIENTE)) nuevos.push(`${ruta}:${i + 1}`);
    });
  }
  assert.deepEqual(
    nuevos, [],
    `Sacan el inicio del día de la medianoche del proceso (UTC en el servidor): ${nuevos.join(', ')}. `
    + 'Usa inicioDelDiaEstudio(hoyEnEstudio()) (lib/utils.ts).',
  );
  // La forma exacta que tenía el «Hoy» de la Caja, y que este test no veía.
  assert.ok(MEDIANOCHE_DEL_PROCESO.test('  desdeHoy.setHours(0, 0, 0, 0);'));
  const sobran = Object.keys(MEDIANOCHE_PENDIENTE).filter((r) => !conMedianoche.has(r));
  assert.deepEqual(sobran, [], `Ya no la usan: quítalos de MEDIANOCHE_PENDIENTE (${sobran.join(', ')}).`);
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

test('la guardia ve también el reloj que llega por parámetro', () => {
  for (const l of ['const h = now.toISOString().slice(0, 10);', 'const h = s.hoy.toISOString().slice(0, 10);', 'x(hoy.toISOString().slice(0,10))']) {
    assert.ok(DIA_UTC.test(l) && RELOJ.test(l), l);
  }
  // Una fecha cualquiera (el fin de un bono, una sesión) no es «hoy»: no cuenta.
  assert.equal(RELOJ.test('const d = fin.toISOString().slice(0, 10);'), false);
});

test('un poder de Veri*Factu vale todo su último día, también pasadas las 02:00', async () => {
  const { revisionCaducidad } = await import('./verifactu/apoderamiento.ts');
  // 31-oct a las 23:30 de Madrid (22:30 UTC: desde el 25-oct, Madrid es UTC+1).
  assert.equal(revisionCaducidad({ vigenteHasta: '2026-10-31', avisoCaducidadEn: 'x' }, new Date('2026-10-31T22:30:00Z')), null);
  // 1-nov a las 00:30 de Madrid (23:30 UTC del 31): ya caducado, aunque en UTC aún sea 31.
  assert.equal(revisionCaducidad({ vigenteHasta: '2026-10-31', avisoCaducidadEn: 'x' }, new Date('2026-10-31T23:30:00Z')), 'CADUCADA');
});
