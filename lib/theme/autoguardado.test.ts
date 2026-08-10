import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pantallasCambiadas, esperaReintento, textoEstado, avisarAlSalir,
  type PorPantalla, type EstadoGuardado,
} from './autoguardado.ts';
import type { BloqueHome } from '../portal-home-bloques.ts';

const b = (id: string): BloqueHome => ({ id, kind: 'texto', config: { titulo: '', texto: id } });

function base(): PorPantalla {
  return { home: [b('h')], clases: [b('c')], bonos: [b('n')] };
}

test('sin cambios, no hay nada que guardar', () => {
  const p = base();
  assert.deepEqual(pantallasCambiadas(p, p), []);
});

test('detecta SOLO las pantallas que cambiaron', () => {
  // Guardar las tres cada vez que se toca una triplicaría las escrituras y
  // pisaría dos pantallas con lo mismo que ya tenían.
  const antes = base();
  const despues = { ...antes, clases: [b('c'), b('c2')] };
  assert.deepEqual(pantallasCambiadas(antes, despues), ['clases']);
});

test('varias a la vez, en el orden de siempre', () => {
  const antes = base();
  const despues = { home: [b('otro')], clases: antes.clases, bonos: [] };
  assert.deepEqual(pantallasCambiadas(antes, despues), ['home', 'bonos']);
});

test('compara por identidad, no por contenido', () => {
  // Un array nuevo con el mismo contenido SÍ cuenta como cambio. Es
  // deliberado: todas las mutaciones del editor construyen arrays nuevos, así
  // que una referencia distinta significa que alguien tocó algo. Comparar
  // contenido costaría un JSON.stringify de las tres pantallas por pulsación
  // para responder lo mismo casi siempre.
  const antes = base();
  const despues = { ...antes, home: [...antes.home] };
  assert.deepEqual(pantallasCambiadas(antes, despues), ['home']);
});

test('el reintento sube y se queda en un minuto', () => {
  assert.equal(esperaReintento(0), 2_000);
  assert.equal(esperaReintento(1), 5_000);
  assert.equal(esperaReintento(4), 60_000);
  // Nunca deja de reintentar ni se dispara a horas: quien tiene media
  // pantalla sin guardar prefiere que siga intentándolo en segundo plano.
  assert.equal(esperaReintento(50), 60_000);
});

test('el texto nunca miente por optimismo', () => {
  const t0 = 1_000_000;
  assert.equal(textoEstado({ tipo: 'limpio' }, t0), '');
  assert.equal(textoEstado({ tipo: 'pendiente' }, t0), 'Sin guardar…');
  assert.equal(textoEstado({ tipo: 'guardando' }, t0), 'Guardando…');
  // El error dice ADEMÁS que se sigue intentando: "no se ha podido guardar" a
  // secas haría cerrar la pestaña pensando que ya no hay nada que hacer.
  assert.match(textoEstado({ tipo: 'error', intentos: 3 }, t0), /se sigue intentando/);
});

test('"guardado hace X" envejece con el tiempo', () => {
  const t0 = 1_000_000;
  assert.equal(textoEstado({ tipo: 'guardado', en: t0 }, t0), 'Guardado');
  assert.equal(textoEstado({ tipo: 'guardado', en: t0 }, t0 + 20_000), 'Guardado hace 20 s');
  assert.equal(textoEstado({ tipo: 'guardado', en: t0 }, t0 + 180_000), 'Guardado hace 3 min');
});

test('solo se avisa al salir si de verdad hay algo que perder', () => {
  // Un `beforeunload` que salta siempre se convierte en un diálogo que la
  // gente aprende a ignorar, y entonces no protege de nada.
  assert.equal(avisarAlSalir({ tipo: 'limpio' }), false);
  assert.equal(avisarAlSalir({ tipo: 'guardado', en: 0 }), false);
  assert.equal(avisarAlSalir({ tipo: 'pendiente' }), true);
  assert.equal(avisarAlSalir({ tipo: 'guardando' }), true, 'una petición en vuelo puede fallar');
  assert.equal(avisarAlSalir({ tipo: 'error', intentos: 1 }), true);
});

test('todos los estados tienen texto — ninguno se queda en blanco por olvido', () => {
  const estados: EstadoGuardado[] = [
    { tipo: 'limpio' }, { tipo: 'pendiente' }, { tipo: 'guardando' },
    { tipo: 'guardado', en: 0 }, { tipo: 'error', intentos: 0 },
  ];
  for (const e of estados) {
    const t = textoEstado(e, 0);
    assert.equal(typeof t, 'string');
    if (e.tipo !== 'limpio') assert.ok(t.length > 0, `${e.tipo} sin texto`);
  }
});

// ── Sesión caducada ────────────────────────────────────────────────────────
// Estado APARTE de `error`, y no un matiz cosmético: encontrado mirando el
// editor en producción con la sesión vencida. Todas las llamadas daban 401 y
// el aviso decía «se sigue intentando» — que era mentira: el servidor iba a
// responder 401 para siempre. La propietaria podía editar media hora creyendo
// que su trabajo estaba a salvo.

test('el aviso de sesión caducada dice qué hacer, no que se siga intentando', () => {
  assert.equal(
    textoEstado({ tipo: 'sesion' }, Date.now()),
    'Tu sesión ha caducado — vuelve a entrar para guardar',
  );
  // Y NO se parece al genérico: son dos situaciones con acciones distintas.
  assert.notEqual(textoEstado({ tipo: 'sesion' }, 0), textoEstado({ tipo: 'error', intentos: 0 }, 0));
});

test('con la sesión caducada TAMBIÉN se avisa antes de cerrar la pestaña', () => {
  // Es justo cuando más hay que perder: nada de lo editado ha llegado al
  // servidor. Olvidar este caso sería tirar el trabajo sin preguntar.
  assert.equal(avisarAlSalir({ tipo: 'sesion' }), true);
});
