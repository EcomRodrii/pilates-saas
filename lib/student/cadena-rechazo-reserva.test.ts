import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Estos tests son ESTRUCTURALES (leen el fuente) y hay que decirlo: ni las
// rutas de Next ni `lib/student/reservar.ts` se pueden importar desde el
// runner, porque resuelven el alias `@/` que `node --test
// --experimental-strip-types` no conoce. Es el mismo idioma que ya usan
// `crons-paginacion.test.ts` y `tope-socias-idempotencia.test.ts`.
//
// Por qué existen: el bug que arreglaron NO era una función equivocada, era una
// CADENA rota en tres saltos distintos, y cada salto vivía en un fichero que los
// tests de su vecino no miran. La revisión independiente de la auditoría del
// 4-sep lo dijo con todas las letras: revertir cualquiera de los tres saltos
// dejaba la suite entera en verde. Esto lo cierra.
//
// El síntoma: la alumna sin bono leía «Algo no ha salido como esperábamos ·
// Inténtalo de nuevo» —con un botón que iba a fallar igual— en vez de
// «Necesitas un plan o bono activo para reservar».

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');

test('salto 1: los rechazos de negocio de crearReservaPublica llevan `codigo`', () => {
  const fuente = leer('lib/db/supabase-data-admin.ts');
  for (const codigo of ['sin-plan', 'bono-no-cubre', 'max-simultaneas']) {
    assert.match(
      fuente, new RegExp(`codigo: '${codigo}'`),
      `El rechazo '${codigo}' tiene que viajar con su codigo. Sin el, el switch de `
      + `reserva-codigos.ts cae en el default y la pantalla pinta una averia generica.`,
    );
  }
});

test('salto 2: /api/public/reserva NO se come el `codigo` al serializar', () => {
  const fuente = leer('app/api/public/reserva/route.ts');
  const respuestasDeError = fuente.match(/NextResponse\.json\(\{ error: r\.error[^)]*\}/g) ?? [];
  assert.ok(respuestasDeError.length >= 3, 'esperaba las 3 respuestas de rechazo (crear/cancelar/valorar)');
  for (const r of respuestasDeError) {
    assert.match(
      r, /codigo/,
      'Esta respuesta devuelve solo `error` y tira el `codigo`. Ese fue el fallo original: '
      + 'el codigo no llego NUNCA a ningun cliente, asi que los estados full/duplicate/conflict '
      + 'de la maquina de reserva estaban muertos en produccion.',
    );
  }
});

test('salto 3: BookingStatus pinta el mensaje del servidor cuando lo hay', () => {
  const fuente = leer('components/student/domain/BookingStatus.tsx');
  assert.match(
    fuente, /mensaje \?\? c\.cuerpo/,
    'Sin esto el componente ignora el mensaje concreto y siempre pinta el copy generico.',
  );
});

test('el mensaje crudo del servidor NO se le ensena a la alumna', () => {
  const fuente = leer('lib/student/reservar.ts');
  assert.match(
    fuente, /esRechazoConocido\(codigo\)\s*\?\s*\{ \.\.\.desenlace, mensaje: undefined \}/,
    'Un rechazo SIN codigo conocido llega como `{ error: error.message }`: el texto crudo de '
    + 'Postgres. Hay que recortarlo antes de la pantalla, o BookingStatus lo pinta tal cual.',
  );
  assert.match(fuente, /return desenlaceParaPantalla;/, 'y hay que devolver el recortado, no el original');
});
