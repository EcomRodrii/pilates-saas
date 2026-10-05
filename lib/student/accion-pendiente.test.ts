import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alLlegarAccionPendiente, decidirOrdenAviso, dejarAccionPendiente, hayAccionPendiente, tomarAccionPendiente } from './accion-pendiente.ts';

const accion = { tipo: 'aceptar-oferta' as const, sesionId: 'ses-1', slug: 'alma' };

test('la orden se recoge UNA vez y solo en su estudio', () => {
  dejarAccionPendiente(accion, 1000);
  assert.equal(tomarAccionPendiente('otro', 1001), null, 'otro estudio no se la lleva');
  assert.deepEqual(tomarAccionPendiente('alma', 1002), accion);
  assert.equal(tomarAccionPendiente('alma', 1003), null, 'no se ejecuta dos veces');
});

test('una orden que nadie recoge a tiempo caduca: no se ejecuta más tarde por sorpresa', () => {
  dejarAccionPendiente(accion, 0);
  assert.equal(tomarAccionPendiente('alma', 2 * 60_000 + 1), null);
});

test('avisa a la pantalla que ya estaba abierta, y deja de avisar al desmontar', () => {
  let veces = 0;
  const dejar = alLlegarAccionPendiente(() => { veces++; });
  dejarAccionPendiente(accion);
  dejar();
  dejarAccionPendiente(accion);
  assert.equal(veces, 1);
  tomarAccionPendiente('alma');
});

test('ni la URL ni el almacenamiento: el módulo no lee ni escribe ninguno', async () => {
  const { readFileSync } = await import('node:fs');
  const codigo = readFileSync(new URL('./accion-pendiente.ts', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codigo, /localStorage|sessionStorage|location|searchParams/);
});

test('mirar si hay orden NO la gasta: se recoge solo cuando ya hay datos frescos', () => {
  dejarAccionPendiente(accion, 1000);
  assert.equal(hayAccionPendiente('otro', 1001), false);
  assert.equal(hayAccionPendiente('alma', 1001), true);
  assert.equal(hayAccionPendiente('alma', 1002), true, 'mirar dos veces no la consume');
  assert.equal(hayAccionPendiente('alma', 2 * 60_000 + 1001), false, 'caducada');
  assert.deepEqual(tomarAccionPendiente('alma', 1003), accion);
  assert.equal(hayAccionPendiente('alma', 1004), false);
});

// La decisión, con las reservas RECIÉN TRAÍDAS. El caso que fallaba: la copia
// guardada no tenía la oferta (se abrió con la app en segundo plano) y se le decía
// «ya no está disponible» con la plaza esperándola.
const AHORA = Date.parse('2026-10-05T16:00:00Z');
const enEspera = (ofertaExpiraEn: string | null) => ({ id: 'res-1', claseId: 'ses-1', estado: 'en-espera', ofertaExpiraEn });

test('«Aceptar la plaza» con la oferta viva en los datos frescos: se acepta esa reserva', () => {
  assert.deepEqual(decidirOrdenAviso(accion, [enEspera('2026-10-05T16:20:00Z')], AHORA), { tipo: 'aceptar', reservaId: 'res-1' });
  assert.deepEqual(decidirOrdenAviso({ ...accion, tipo: 'salir-espera' }, [enEspera('2026-10-05T16:20:00Z')], AHORA), { tipo: 'confirmar-cancelar', reservaId: 'res-1' });
});

test('sin oferta viva: lo dice; y si ya tiene plaza en esa clase, dice eso y no «ya no está disponible»', () => {
  assert.deepEqual(decidirOrdenAviso(accion, [enEspera('2026-10-05T15:59:00Z')], AHORA), { tipo: 'aviso', texto: 'Esa plaza ya no está disponible.' });
  assert.deepEqual(decidirOrdenAviso(accion, [enEspera(null)], AHORA), { tipo: 'aviso', texto: 'Esa plaza ya no está disponible.' });
  assert.deepEqual(decidirOrdenAviso(accion, [{ id: 'res-1', claseId: 'ses-1', estado: 'confirmada' }], AHORA), { tipo: 'aviso', texto: 'Ya tienes plaza en esa clase.' });
  assert.deepEqual(decidirOrdenAviso(accion, [{ ...enEspera('2026-10-05T16:20:00Z'), claseId: 'otra' }], AHORA), { tipo: 'aviso', texto: 'Esa plaza ya no está disponible.' });
});

test('«No puedo ir» abre la confirmación de su reserva confirmada; sin ella, lo dice', () => {
  const orden = { tipo: 'no-puedo-ir' as const, sesionId: 'ses-1', slug: 'alma' };
  assert.deepEqual(decidirOrdenAviso(orden, [{ id: 'res-pf-1', claseId: 'ses-1', estado: 'confirmada' }], AHORA), { tipo: 'confirmar-cancelar', reservaId: 'res-pf-1' });
  assert.deepEqual(decidirOrdenAviso(orden, [], AHORA), { tipo: 'aviso', texto: 'Ya no tienes reserva en esa clase.' });
});

test('Mis clases decide con datos frescos y no recoge la orden antes de tenerlos', async () => {
  const { readFileSync } = await import('node:fs');
  const pagina = readFileSync(new URL('../../app/portal/[slug]/mis-reservas/page.tsx', import.meta.url), 'utf8');
  const i = pagina.indexOf('const recoger = async');
  const bloque = pagina.slice(i, pagina.indexOf('void recoger();', i));
  assert.ok(i > 0);
  const orden = ['hayAccionPendiente(', 'invalidarCatalogo(estudio.slug, { conservarVistas: true })', 'await cargar()', 'tomarAccionPendiente(', 'setOrdenAviso({ orden, reservas: frescos.reservas })'];
  let desde = 0;
  for (const paso of orden) {
    const j = bloque.indexOf(paso, desde);
    assert.ok(j >= desde, `falta o va fuera de orden: ${paso}`);
    desde = j;
  }
});
