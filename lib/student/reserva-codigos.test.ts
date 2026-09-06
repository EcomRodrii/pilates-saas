import test from 'node:test';
import assert from 'node:assert/strict';
import { desenlaceDeRespuesta, esRechazoConocido } from './reserva-codigos.ts';

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

test('un rechazo por falta de plan llega a la UI con SU mensaje, no como avería', () => {
  // El 🔴: a la alumna sin bono se le enseñaba «algo no ha salido como
  // esperábamos… inténtalo de nuevo» más un botón de reintentar que iba a
  // fallar igual, porque el rechazo del gate de derechos viajaba sin `codigo` y
  // el mensaje se tiraba por el camino.
  const ERROR_SIN_PLAN = 'Necesitas un plan o bono activo para reservar';
  const d = desenlaceDeRespuesta({ error: ERROR_SIN_PLAN, codigo: 'sin-plan' });
  assert.equal(d.state, 'error');
  // `mensaje` es lo que BookingStatus pinta (`mensaje ?? c.cuerpo`): si se
  // pierde aquí, la pantalla vuelve al copy genérico de avería.
  assert.equal(d.mensaje, ERROR_SIN_PLAN);
  // Y no es una avería: no puede acabar en Sentry con nivel `error`.
  assert.equal(esRechazoConocido('sin-plan'), true);
});

test('los otros dos rechazos del gate de derechos se comportan igual', () => {
  for (const [codigo, msg] of [
    ['bono-no-cubre', 'Tu bono no incluye este tipo de clase'],
    ['max-simultaneas', 'Has alcanzado el máximo de 3 reservas activas'],
  ] as Array<[string, string]>) {
    const d = desenlaceDeRespuesta({ error: msg, codigo });
    assert.equal(d.state, 'error', codigo);
    assert.equal(d.mensaje, msg, codigo);
    assert.equal(esRechazoConocido(codigo), true, codigo);
  }
});

test('las cuatro guardias de la sesión enseñan su motivo y no son avería', () => {
  // JAVASCRIPT-NEXTJS-26 (4-sep-2026): una socia real intentó reservar una
  // clase ya empezada. El servidor lo rechazó bien y con su frase, pero SIN
  // `codigo` — así que la pantalla le pintó «algo no ha salido como
  // esperábamos · inténtalo de nuevo» (con un botón que no podía funcionar) y
  // Sentry registró una regla de negocio como avería de producción.
  for (const [codigo, msg] of [
    ['clase-ya-empezada', 'Esta clase ya ha empezado'],
    ['clase-cancelada', 'Esta clase está cancelada'],
    ['fuera-ventana-minima', 'Ya no se puede reservar esta clase: hace falta reservar con más antelación'],
    ['fuera-ventana-maxima', 'Todavía no se puede reservar esta clase'],
    // #1664 y #1665: el servidor ya emitía estos dos códigos y esta tabla no
    // los conocía. Van con assert propio —y no solo en el tipo— porque quitar
    // la entrada de CODIGOS_DE_NEGOCIO es lo que rompe el comportamiento, y
    // los tests estructurales no lo verían.
    ['impago', 'Tienes un pago pendiente con el estudio. Escríbeles y lo resolvéis.'],
    ['estudio-cerrado', 'El estudio está cerrado ese día'],
  ] as Array<[string, string]>) {
    const d = desenlaceDeRespuesta({ error: msg, codigo });
    assert.equal(d.state, 'error', codigo);
    assert.equal(d.mensaje, msg, `${codigo}: el motivo es justo lo que le falta a la alumna para saber que no hay nada que reintentar`);
    assert.equal(esRechazoConocido(codigo), true, `${codigo}: es producto, no producción rota`);
  }
});

test('solo lo que NO sabemos nombrar se reporta como avería', () => {
  // `'error'` es el comodín con el que el servidor dice «me ha pasado algo que
  // no sé nombrar»: ese sí hay que reportarlo, y la ausencia de código también.
  assert.equal(esRechazoConocido('error'), false);
  assert.equal(esRechazoConocido(undefined), false);
  assert.equal(esRechazoConocido(null), false);
  assert.equal(esRechazoConocido('codigo-que-nadie-ha-escrito'), false);
  // Los de negocio que ya existían siguen sin reportarse.
  for (const c of ['aforo-lleno', 'ya-reservada', 'limite-semanal']) {
    assert.equal(esRechazoConocido(c), true, c);
  }
});
