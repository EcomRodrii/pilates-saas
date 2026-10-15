import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TOPE_REGISTRO, cifrasRegistro, coincideBusqueda, cumpleEstado, filtrarRegistro, type AvisoRegistro,
} from './registro.ts';

// Las cifras de arriba del registro (panel nuevo) prometen una cosa: el número
// de la tarjeta es el de las filas que enseña al pulsarla. Estos tests atan las
// dos mitades (contar y filtrar) a la misma regla.

const aviso = (...entregas: [string, string][]): AvisoRegistro => ({
  deliveries: entregas.map(([channel, status]) => ({ channel, status })),
});

const AVISOS: AvisoRegistro[] = [
  aviso(['INAPP', 'SENT'], ['PUSH', 'DELIVERED']),          // salió y se vio
  aviso(['INAPP', 'SENT'], ['EMAIL', 'FAILED']),            // salió por la app, falló el correo
  aviso(['INAPP', 'SKIPPED'], ['PUSH', 'SKIPPED']),         // no salió por ninguno
  aviso(),                                                  // sin ninguna entrega
  aviso(['INAPP', 'SENT'], ['PUSH', 'PENDING']),            // el push aún puede salir
];

test('cada cifra es el número de filas que enseña su filtro', () => {
  for (const canal of ['todos', 'INAPP', 'PUSH', 'EMAIL'] as const) {
    const c = cifrasRegistro(AVISOS, canal);
    assert.equal(c.avisos, filtrarRegistro(AVISOS, canal, 'todos').length, `avisos (${canal})`);
    assert.equal(c.enviados, filtrarRegistro(AVISOS, canal, 'enviados').length, `enviados (${canal})`);
    assert.equal(c.conFallo, filtrarRegistro(AVISOS, canal, 'fallo').length, `con fallo (${canal})`);
    assert.equal(c.sinEnviar, filtrarRegistro(AVISOS, canal, 'sin_enviar').length, `sin enviar (${canal})`);
  }
});

test('todos los canales: un aviso puede estar enviado y con fallo a la vez', () => {
  assert.deepEqual(cifrasRegistro(AVISOS, 'todos'), { avisos: 5, enviados: 3, mostrados: 1, conFallo: 1, sinEnviar: 2 });
});

test('un canal solo cuenta los avisos que salieron (o lo intentaron) por él', () => {
  assert.deepEqual(cifrasRegistro(AVISOS, 'EMAIL'), { avisos: 1, enviados: 0, mostrados: 0, conFallo: 1, sinEnviar: 0 });
  assert.deepEqual(cifrasRegistro(AVISOS, 'PUSH'), { avisos: 3, enviados: 1, mostrados: 1, conFallo: 0, sinEnviar: 1 });
});

test('«sin enviar»: lo pendiente aún puede salir; sin ninguna entrega, no salió', () => {
  assert.equal(cumpleEstado([{ channel: 'PUSH', status: 'PENDING' }], 'sin_enviar'), false);
  assert.equal(cumpleEstado([{ channel: 'PUSH', status: 'SKIPPED' }, { channel: 'EMAIL', status: 'FAILED' }], 'sin_enviar'), false);
  assert.equal(cumpleEstado([], 'sin_enviar'), true);
});

test('«enviado» es aceptado o mostrado, nunca pendiente ni omitido', () => {
  assert.equal(cumpleEstado([{ channel: 'EMAIL', status: 'SENT' }], 'enviados'), true);
  assert.equal(cumpleEstado([{ channel: 'PUSH', status: 'DELIVERED' }], 'enviados'), true);
  assert.equal(cumpleEstado([{ channel: 'PUSH', status: 'PENDING' }, { channel: 'INAPP', status: 'SKIPPED' }], 'enviados'), false);
});

test('el buscador mira destinatario, aviso y errores, sin distinguir mayúsculas', () => {
  const a = {
    recipientName: 'Ana Ejemplo', recipientRole: 'SOCIA', title: 'Reserva confirmada', body: 'Mañana a las 9',
    eventType: 'reserva.confirmada', deliveries: [{ error: 'sin suscripción push', detalle: null }],
  };
  assert.equal(coincideBusqueda(a, ''), true);
  assert.equal(coincideBusqueda(a, '  ana '), true);
  assert.equal(coincideBusqueda(a, 'SUSCRIPCIÓN'), true);
  assert.equal(coincideBusqueda(a, 'reserva.conf'), true);
  assert.equal(coincideBusqueda(a, 'cobro'), false);
});

test('el tope que enseña la cifra es el `.limit` de la ruta', () => {
  // «los 150 más recientes» solo es verdad si la ruta corta en 150.
  const ruta = readFileSync(new URL('../../app/api/notifications/admin/route.ts', import.meta.url), 'utf8');
  const limite = ruta.match(/\.from\('notification'\)[\s\S]*?\.limit\((\d+)\)/);
  assert.ok(limite, 'no encuentro el .limit de la lista en /api/notifications/admin');
  assert.equal(Number(limite[1]), TOPE_REGISTRO);
});
