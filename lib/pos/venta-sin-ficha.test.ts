// ─────────────────────────────────────────────────────────────────────────────
// Guardián: el TPV tiene que poder cobrar SIN FICHA, salvo cuotas.
//
// Esta regla se ha perdido dos veces por el mismo motivo: alguien hace
// `CREATE OR REPLACE` de `registrar_venta_pos` partiendo de una copia anterior
// al arreglo. La quitó `20260907170322_pos_venta_sin_ficha` por petición
// expresa del fundador, y la reinstalaron sin querer las dos migraciones de
// matrícula del 13-sep (`20260913021304`, `20260913210232`). Estuvo un día
// entero muerta en producción y ningún test lo notó.
//
// Por eso el test NO comprueba la intención ni un comentario: lee la ÚLTIMA
// migración que redefine la función —la que de verdad está en producción— y
// mira el cuerpo, con los comentarios quitados (si no, casaría con la propia
// explicación de la cabecera: lección de la 26ª pasada).
// ─────────────────────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'supabase', 'migrations');

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*--.*$/gm, '');
}

/** La última migración (por versión) que redefine `registrar_venta_pos`. */
function ultimaDefinicion(): { fichero: string; cuerpo: string } {
  const ficheros = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => /create\s+or\s+replace\s+function\s+public\.registrar_venta_pos/i
      .test(fs.readFileSync(path.join(DIR, f), 'utf8')))
    .sort();
  assert.ok(ficheros.length > 0, 'no encuentro ninguna migración que defina registrar_venta_pos');
  const fichero = ficheros[ficheros.length - 1];
  const fuente = fs.readFileSync(path.join(DIR, fichero), 'utf8');
  const ini = fuente.search(/create\s+or\s+replace\s+function\s+public\.registrar_venta_pos/i);
  return { fichero, cuerpo: sinComentarios(fuente.slice(ini)) };
}

test('la RPC del TPV no rechaza una venta sin ficha por el mero hecho de llevar un plan', () => {
  const { fichero, cuerpo } = ultimaDefinicion();
  assert.doesNotMatch(
    cuerpo,
    /IF\s+p_socio_id\s+IS\s+NULL\s+THEN\s+RAISE\s+EXCEPTION\s+'PLAN_SIN_CLIENTA/i,
    `${fichero}: el veto general por vender un plan sin ficha ha vuelto. Un bono o una ` +
      'clase de prueba se cobran sin datos a propósito (20260907170322_pos_venta_sin_ficha); ' +
      'la salida que queda si no es teclearlo como importe LIBRE, fuera del catálogo.',
  );
});

test('…pero una CUOTA sigue exigiendo clienta, y lo decide el tipo del plan', () => {
  const { fichero, cuerpo } = ultimaDefinicion();
  // La cláusula, no la palabra: nombrar `MENSUAL` no es mirarlo.
  assert.match(
    cuerpo,
    /p_socio_id\s+IS\s+NULL\s+AND\s+v_plan_tipo\s*=\s*'MENSUAL'/i,
    `${fichero}: falta el veto de cuota sin clienta (#1957). Sin él, una mensualidad se ` +
      'vende en el mostrador sin ficha y queda cobrada y sin entregar a nadie.',
  );
  // Y el tipo tiene que salir del catálogo en la misma consulta que el precio.
  assert.match(
    cuerpo,
    /INTO[\s\S]{0,200}v_plan_tipo[\s\S]{0,200}FROM\s+public\.planes_tarifa/i,
    `${fichero}: v_plan_tipo no se lee de planes_tarifa — el veto decidiría con NULL.`,
  );
});
