import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENTOS_DE_ALUMNA, tipoDeAviso } from './tipo-aviso.ts';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ El guardia importante de este fichero es el ÚLTIMO, y no prueba una
// función: cruza la tabla contra `lib/notifications/catalog.ts`.
//
// Sin él, escribir mal un `event_type` —«pago.fallido» donde el catálogo dice
// otra cosa— no rompe nada visible: el aviso cae en la red de seguridad y sale
// con el 📣 neutro. Es un fallo MUDO, del mismo tipo que el que trajo aquí a
// arreglar esto. Y el día que alguien añada un evento nuevo para la alumna, el
// test le dirá que le falta darle cara antes de que salga a producción.
// ─────────────────────────────────────────────────────────────────────────────

test('el evento manda sobre la categoría', () => {
  assert.equal(tipoDeAviso('clase.valorar', 'reservas'), 'valorar');
  assert.equal(tipoDeAviso('reserva.recordatorio_24h', 'reservas'), 'recordatorio');
  assert.equal(tipoDeAviso('reserva.plaza_liberada', 'reservas'), 'plaza-liberada');
});

test('las malas noticias no se celebran ni meten prisa', () => {
  // En producción, entregados a alumnas: 26 cancelaciones de reserva y 12
  // abandonos, todos con el 🎉 de «se ha liberado una plaza».
  assert.equal(tipoDeAviso('reserva.cancelada', 'reservas'), 'atencion');
  assert.equal(tipoDeAviso('reserva.abandonada', 'reservas'), 'atencion');
  assert.equal(tipoDeAviso('reserva.plaza_fija_no_materializada', 'reservas'), 'atencion');
  // Un despertador para avisar de que no hay clase a la que despertarse.
  assert.equal(tipoDeAviso('clase.cancelada', 'clases'), 'atencion');
  // Un ticket de bono para decirle que no se le ha podido cobrar.
  assert.equal(tipoDeAviso('pago.fallido', 'pagos'), 'atencion');
  assert.equal(tipoDeAviso('pago.penalizacion', 'pagos'), 'atencion');
});

test('la categoría ya NO elige cara: es solo red de seguridad', () => {
  // Esto es el cambio de fondo. Antes, `reservas` sin evento conocido daba
  // 'plaza-liberada' y `clases` daba 'recordatorio' — una cara concreta para un
  // mensaje que nadie había mirado.
  assert.equal(tipoDeAviso(null, 'reservas'), 'estudio');
  assert.equal(tipoDeAviso(null, 'clases'), 'estudio');
  assert.equal(tipoDeAviso(null, 'pagos'), 'estudio');
  assert.equal(tipoDeAviso('evento.que.no.existe', 'reservas'), 'estudio');
  assert.equal(tipoDeAviso(null, null), 'estudio');
});

test('todo evento que le llega a una alumna tiene cara propia en el catálogo', () => {
  const fuente = readFileSync(new URL('../notifications/catalog.ts', import.meta.url), 'utf8');

  // 1) EVENTOS.CLAVE → 'valor.del.event_type'
  const valor = new Map<string, string>();
  for (const m of fuente.matchAll(/^\s{2}([A-Z_0-9]+):\s*'([a-z_]+\.[a-z0-9_]+)',/gm)) {
    valor.set(m[1], m[2]);
  }
  assert.ok(valor.size > 20, `el catálogo se ha leído a medias (${valor.size} eventos)`);

  // 2) De la tabla de configuración, los que van dirigidos a una alumna.
  const deAlumna: string[] = [];
  for (const m of fuente.matchAll(/\[EVENTOS\.([A-Z_0-9]+)\]:\s*\{([^}]*)\}/g)) {
    if (!/audiencia:\s*'socia[^']*'/.test(m[2])) continue;
    const ev = valor.get(m[1]);
    assert.ok(ev, `EVENTOS.${m[1]} está configurado pero no declarado`);
    deAlumna.push(ev);
  }
  assert.ok(deAlumna.length >= 20, `audiencias de alumna leídas a medias (${deAlumna.length})`);

  const huerfanos = deAlumna.filter((ev) => !EVENTOS_DE_ALUMNA.has(ev));
  assert.deepEqual(
    huerfanos, [],
    `estos eventos le llegan a la alumna y saldrían con el 📣 neutro por no tener cara: ${huerfanos.join(', ')}`,
  );

  // Y al revés: una entrada de la tabla que ya no exista en el catálogo es
  // código muerto que aparenta cubrir algo.
  const inventados = [...EVENTOS_DE_ALUMNA].filter((ev) => !valor.has(ev.toUpperCase().replace(/\./g, '_')) && ![...valor.values()].includes(ev));
  assert.deepEqual(inventados, [], `en la tabla pero no en el catálogo: ${inventados.join(', ')}`);
});
