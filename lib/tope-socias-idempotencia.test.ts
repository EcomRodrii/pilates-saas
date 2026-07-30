import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// El tope de socias del plan no puede bloquear un REINTENTO.
//
// `registrarSociaPublica` tiene una salida temprana por idempotencia: si ese
// usuario de auth ya tiene socia en el estudio, devuelve la suya sin insertar
// nada ("p. ej. reintento tras registrarse", dice su propio comentario).
//
// La comprobación del tope vivía en la ruta que la llama, ANTES de esa salida.
// Resultado: en un estudio que estuviera EN su tope, cualquier reintento de una
// socia que YA existía se llevaba el bloqueo aunque no fuera a crear ninguna
// fila. Y ese error lo lee la CLIENTA, no la dueña: «Tu plan permite hasta N
// socias activas, mejóralo para añadir más» es un mensaje de facturación que no
// tiene por qué salir del panel del estudio.
//
// Es una propiedad de ORDEN dentro de una función que habla con Supabase, así
// que no hay lógica pura que probar: se fija leyendo el fuente. Feo, pero es
// exactamente el invariante que se rompió, y una comprobación estructural que
// falla es mejor que un comentario que nadie lee.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DATOS = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');
const RUTA = readFileSync(join(RAIZ, 'app/api/public/socio/route.ts'), 'utf8');

function cuerpoDeRegistrarSociaPublica(): string {
  const ini = DATOS.indexOf('export async function registrarSociaPublica');
  assert.ok(ini > 0, 'no encuentro registrarSociaPublica: ¿se renombró?');
  // Hasta la siguiente función exportada.
  const sig = DATOS.indexOf('\nexport ', ini + 1);
  return DATOS.slice(ini, sig > 0 ? sig : undefined);
}

test('el tope se comprueba DESPUÉS de la salida por idempotencia', () => {
  const cuerpo = cuerpoDeRegistrarSociaPublica();
  const idempotencia = cuerpo.indexOf('if (yaSocia) return');
  const tope = cuerpo.indexOf('evaluarLimiteSocias');

  assert.ok(idempotencia > 0, 'desapareció la salida temprana por idempotencia');
  assert.ok(tope > 0, 'el tope de socias ya no se comprueba aquí dentro');
  assert.ok(
    idempotencia < tope,
    'El tope se comprueba ANTES de resolver si la socia ya existe: un reintento ' +
    'de alguien que ya está se llevaría el bloqueo sin ir a crear nada.',
  );
});

test('la ruta pública no vuelve a comprobar el tope por su cuenta', () => {
  // Si vuelve a hacerlo, vuelve a correr antes de la idempotencia y estamos
  // donde estábamos. La comprobación va pegada al insert, en un solo sitio.
  assert.ok(
    !RUTA.includes('bloqueoPorLimiteSocias'),
    'La ruta comprueba el tope otra vez. Va dentro de registrarSociaPublica, ' +
    'después de la salida por idempotencia — si no, se desincronizan.',
  );
});

test('el bloqueo por tope viaja con su código, para poder distinguirlo', () => {
  // La clienta no debe ver un 400 genérico ni el texto de facturación sin
  // contexto: el portal necesita el código para decidir qué enseñar.
  const cuerpo = cuerpoDeRegistrarSociaPublica();
  assert.match(cuerpo, /code:\s*denegacion\.code/, 'el código LIMITE_SOCIAS se pierde por el camino');
  assert.match(RUTA, /LIMITE_SOCIAS/, 'la ruta ya no distingue el tope del resto de errores');
});
