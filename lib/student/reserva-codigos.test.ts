import test from 'node:test';
import assert from 'node:assert/strict';
import { desenlaceDeRespuesta } from './reserva-codigos.ts';

// La regla que defienden estos tests: NINGUNA respuesta que no sea un éxito
// explícito del servidor puede acabar en `confirmed`. El paquete de diseño lo
// dice con todas las letras («ninguna pantalla muestra éxito hasta que el
// adaptador devuelve confirmación») y es la diferencia entre que una alumna se
// presente a una clase que tiene y a una que no.

test('CONFIRMADA es el único camino a confirmed', () => {
  const d = desenlaceDeRespuesta({ ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' });
  assert.equal(d.state, 'confirmed');
  assert.equal(d.reservaId, 'res-1');
});

test('LISTA_ESPERA lleva la posición, que es lo que la pantalla enseña', () => {
  const d = desenlaceDeRespuesta({ ok: true, estado: 'LISTA_ESPERA', reservaId: 'res-2', posicionEspera: 3 });
  assert.equal(d.state, 'waitlisted');
  assert.equal(d.posicionEspera, 3);
});

test('PENDIENTE_APROBACION cae en waitlisted, no en confirmed', () => {
  // El estudio todavía tiene que aprobarla: pintarla como confirmada sería
  // decirle a la alumna que tiene plaza cuando aún no la tiene.
  assert.equal(desenlaceDeRespuesta({ ok: true, estado: 'PENDIENTE_APROBACION' }).state, 'waitlisted');
});

test('un estado desconocido NO se pinta como éxito', () => {
  // Si el backend añade un estado y esta tabla no se actualiza, el fallo tiene
  // que ser visible, no optimista.
  const d = desenlaceDeRespuesta({ ok: true, estado: 'ALGO_NUEVO' });
  assert.equal(d.state, 'error');
  assert.match(d.mensaje ?? '', /inesperada/i);
});

test('cada código del servidor cae en su estado del diseño', () => {
  const casos: Array<[string, string]> = [
    ['ya-reservada', 'duplicate'],
    ['conflicto-horario', 'conflict'],
    ['aforo-lleno', 'full'],
    ['spot-ocupado', 'full'],
    ['no-autorizado', 'session-expired'],
    ['limite-semanal', 'error'],
    ['spot-no-disponible', 'error'],
    ['sesion-no-encontrada', 'error'],
    ['error', 'error'],
  ];
  for (const [codigo, esperado] of casos) {
    assert.equal(
      desenlaceDeRespuesta({ error: 'da igual', codigo }).state, esperado,
      `${codigo} debería dar ${esperado}`,
    );
  }
});

test('sin código, un error es error y arrastra el mensaje del servidor', () => {
  const d = desenlaceDeRespuesta({ error: 'Se ha caído todo' });
  assert.equal(d.state, 'error');
  assert.equal(d.mensaje, 'Se ha caído todo');
});

test('sin red gana sobre cualquier respuesta', () => {
  // «Sin conexión» no es una respuesta del servidor: es que no ha habido
  // petición. Su copy dice que no se ha hecho ningún cargo, así que no puede
  // confundirse con un error del servidor.
  assert.equal(desenlaceDeRespuesta(null, true).state, 'offline');
  assert.equal(desenlaceDeRespuesta({ ok: true, estado: 'CONFIRMADA' }, true).state, 'offline');
});

test('una respuesta vacía es error, nunca confirmed', () => {
  assert.equal(desenlaceDeRespuesta(null).state, 'error');
});

test('un código que no conocemos cae en error, no en confirmed', () => {
  assert.equal(desenlaceDeRespuesta({ error: 'x', codigo: 'inventado' }).state, 'error');
});
