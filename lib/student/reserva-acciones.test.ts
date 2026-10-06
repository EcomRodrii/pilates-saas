import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCIONES_POR_CODIGO, accionesDeRechazo, seArreglaComprandoPorCodigo } from './reserva-acciones.ts';
import { desenlaceDeRespuesta } from './reserva-codigos.ts';

// Errores estructurados: el servidor ya decía POR QUÉ rechaza (`codigo`); ahora también qué puede
// HACER la persona (`acciones`), colgando del código y no de la frase del error.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

/** Los miembros del tipo `CodigoReserva`, leídos del fuente (los tipos no existen en ejecución). */
function codigosDelTipo(): string[] {
  const fuente = leer('lib/student/reserva-codigos.ts');
  const ini = fuente.indexOf('export type CodigoReserva =');
  // Los comentarios del tipo llevan «;», así que se corta en el siguiente bloque del fichero, no en el primer «;».
  const fin = fuente.indexOf('const CODIGOS_DE_NEGOCIO', ini);
  assert.ok(ini > 0 && fin > ini, 'no se encuentra el tipo CodigoReserva');
  return [...fuente.slice(ini, fin).matchAll(/^\s*\| '([a-z-]+)'/gm)].map(m => m[1]);
}

test('⚠️ cada código de rechazo dice qué se ofrece (la tabla y el tipo no pueden divergir)', () => {
  const delTipo = codigosDelTipo();
  assert.ok(delTipo.length >= 22, `no se leen los códigos del tipo: ${delTipo.length}`);
  assert.deepEqual(Object.keys(ACCIONES_POR_CODIGO).sort(), [...delTipo].sort(),
    'añadir un código a CodigoReserva exige decir qué se ofrece en ACCIONES_POR_CODIGO (y al revés)');
  for (const [codigo, acciones] of Object.entries(ACCIONES_POR_CODIGO)) {
    assert.ok(acciones.length > 0, `${codigo} se queda sin ninguna acción: la persona no sabría qué hacer`);
  }
});

test('lo que se arregla comprando se dice por CÓDIGO, no por la frase', () => {
  assert.equal(seArreglaComprandoPorCodigo('sin-plan'), true);
  assert.equal(seArreglaComprandoPorCodigo('bono-no-cubre'), true);
  for (const c of ['aforo-lleno', 'ya-reservada', 'limite-semanal', 'impago', 'clase-ya-empezada', 'error', 'inventado', undefined, null, 5]) {
    assert.equal(seArreglaComprandoPorCodigo(c), false, String(c));
  }
  // Un tope de la cuota NO se arregla comprando: el estudio decide si hace una excepción.
  assert.ok(accionesDeRechazo('limite-semanal').includes('contactar_estudio'));
  assert.ok(!accionesDeRechazo('limite-semanal').includes('comprar_plan'));
});

test('solo el comodín `error` y los códigos que no conocemos ofrecen reintentar', () => {
  assert.deepEqual(accionesDeRechazo('error'), ['reintentar']);
  assert.deepEqual(accionesDeRechazo('codigo-de-un-servidor-mas-nuevo'), ['reintentar']);
  assert.deepEqual(accionesDeRechazo(undefined), ['reintentar']);
  for (const [codigo, acciones] of Object.entries(ACCIONES_POR_CODIGO)) {
    if (codigo === 'error') continue;
    assert.ok(!acciones.includes('reintentar'), `${codigo} es una regla de negocio: reintentar no la arregla`);
  }
});

test('accionesDeRechazo devuelve una copia: quien la modifique no toca la tabla', () => {
  const a = accionesDeRechazo('sin-plan');
  a.push('reintentar');
  assert.deepEqual(accionesDeRechazo('sin-plan'), ['comprar_plan']);
});

test('el desenlace del rechazo lleva el código y las acciones; las del servidor mandan', () => {
  const d = desenlaceDeRespuesta({ error: 'cualquier frase', codigo: 'sin-plan' });
  assert.equal(d.state, 'error');
  assert.equal(d.codigo, 'sin-plan');
  assert.deepEqual(d.acciones, ['comprar_plan']);
  // Aunque la frase cambie o se traduzca, la acción sigue: cuelga del código.
  assert.deepEqual(desenlaceDeRespuesta({ error: 'You need a plan', codigo: 'sin-plan' }).acciones, ['comprar_plan']);
  // Lo que el servidor diga explícitamente manda sobre la deducción local.
  assert.deepEqual(
    desenlaceDeRespuesta({ error: 'x', codigo: 'sin-plan', acciones: ['contactar_estudio'] }).acciones,
    ['contactar_estudio']);
  // Sin código (error de Postgres sin traducir): reintentar, nunca «comprar».
  assert.deepEqual(desenlaceDeRespuesta({ error: 'boom' }).acciones, ['reintentar']);
});

test('los éxitos no llevan acciones', () => {
  const d = desenlaceDeRespuesta({ ok: true, estado: 'CONFIRMADA', reservaId: 'r' });
  assert.equal(d.acciones, undefined);
  assert.equal(d.codigo, undefined);
});

test('⚠️ el servidor manda las acciones en el rechazo de crear (API pública y v1)', () => {
  const publica = leer('app/api/public/reserva/route.ts');
  assert.match(publica, /accionesDeRechazo\(r\.codigo\)/);
  const v1 = leer('app/api/v1/reservas/route.ts');
  assert.match(v1, /accionesDeRechazo\(resultado\.codigo\)/);
});

test('la pantalla de la alumna decide el botón de comprar por las acciones, con la frase solo de respaldo', () => {
  const estado = leer('components/student/domain/BookingStatus.tsx');
  assert.match(estado, /acciones\?\.includes\('comprar_plan'\)/);
  assert.match(estado, /seArreglaComprando\(mensaje\)/, 'el respaldo para respuestas sin código sigue');
  // La hoja salió de la ficha para que el horario abra la misma (`desenlaceDeLaHoja` + `HojaReserva`): las acciones del
  // servidor siguen llegando, por CÓDIGO, al botón de la hoja.
  const desenlace = leer('lib/student/desenlace-hoja.ts');
  assert.match(desenlace, /acciones: r\.acciones/);
  const hoja = leer('components/student/domain/HojaReserva.tsx');
  assert.match(hoja, /acciones=\{desenlace\?\.acciones\}/);
  assert.match(leer('app/portal/[slug]/reservar/[claseId]/page.tsx'), /<HojaReserva/, 'la ficha sigue abriendo la hoja de reserva');
});
