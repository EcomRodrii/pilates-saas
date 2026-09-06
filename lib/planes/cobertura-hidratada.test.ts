import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { planCubreTipoClase } from '../bono-logic.ts';
import type { PlanTarifa } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Quien decide en SERVIDOR con planes de tarifa tiene que hidratar su cobertura.
//
// `mapPlanTarifa` NO trae `tiposClaseIds`: no es columna de `planes_tarifa`,
// vive en la tabla puente `plan_tipos_clase` y se cuelga aparte con
// `hidratarTiposDePlanes`. Y `planCubreTipoClase` lee la lista vacía como
// «cubre TODAS las clases» — que es la semántica correcta para un plan sin
// acotar, pero indistinguible de «no me molesté en cargarla».
//
// Ese olvido no da error ni deja rastro: simplemente el filtro por tipo de
// clase deja de filtrar. Pasó en `/api/marketing/hueco/avisar`, el único de los
// cinco llamadores de servidor que no hidrataba: a una socia con «Bono 10 Mat»
// se le mandaba un WhatsApp ofreciéndole un hueco de Reformer y, al ir a
// reservarlo, `crearReservaPublica` la rechazaba.
//
// No se puede importar `lib/supabase-data.ts` aquí (arrastra el cliente de
// navegador por alias `@/`), así que se comprueba sobre el código fuente —
// mismo patrón que `persistencia.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = new URL('../../', import.meta.url).pathname;

/** Todos los .ts/.tsx bajo estas carpetas de servidor. */
function ficherosDeServidor(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    let entradas: string[];
    try { entradas = readdirSync(dir); } catch { return; }
    for (const e of entradas) {
      if (e === 'node_modules' || e === '.next') continue;
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) salida.push(ruta);
    }
  };
  for (const sub of ['app', 'lib/db', 'lib/inngest']) recorrer(join(RAIZ, sub));
  return salida;
}

test('⚠️ todo el código de servidor que mapea planes hidrata su cobertura', () => {
  const culpables: string[] = [];
  for (const ruta of ficherosDeServidor()) {
    const fuente = readFileSync(ruta, 'utf8');
    if (!fuente.includes('mapPlanTarifa')) continue;
    if (!fuente.includes('hidratarTiposDePlanes')) {
      culpables.push(ruta.replace(RAIZ, ''));
    }
  }
  assert.deepEqual(
    culpables, [],
    'estos ficheros mapean planes en servidor sin hidratar `tiposClaseIds`, '
    + 'así que `planCubreTipoClase` les dirá que TODO plan cubre TODA clase',
  );
});

test('el test anterior vigila algo: hay llamadores de servidor que cubrir', () => {
  // Si un refactor renombra `mapPlanTarifa`, el test de arriba pasaría en vacío
  // sin comprobar nada. Esto lo impide.
  const conMapa = ficherosDeServidor().filter(r => readFileSync(r, 'utf8').includes('mapPlanTarifa'));
  assert.ok(conMapa.length > 0, 'ningún fichero de servidor usa `mapPlanTarifa`: ¿se renombró?');
});

test('por qué importa: sin cobertura, un bono de Mat "cubre" Reformer', () => {
  // La regla que hace peligroso el olvido. Vacío = todas, a propósito — por eso
  // no hay forma de distinguir "sin acotar" de "sin cargar" mirando el plan.
  const soloMat = { tiposClaseIds: ['tc-mat'] } as PlanTarifa;
  const sinCargar = {} as PlanTarifa;
  assert.equal(planCubreTipoClase(soloMat, 'tc-reformer'), false);
  assert.equal(planCubreTipoClase(sinCargar, 'tc-reformer'), true);
});
