import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decidirReciboPrevioDeCita, idReciboDeCita, PREFIJO_RECIBO_DE_CITA, type ReciboPrevioDeCita } from './recibo-de-cita.ts';
import { LONGITUD_MAXIMA_ID_RECIBO, parsearPeticionMarcarCobrado } from './marcar-cobrado.ts';

// El recibo de una cita lleva el id de la cita: `rec-cita-<cita>`. Cobrar una cita dos veces (un intento
// sin confirmar + recargar la página + otro clic) ya no crea otro recibo: el segundo intento encuentra el
// primero y sigue con él. Antes el id era `rec-<uid>`, uno por clic.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('el id es determinista y cabe donde se usa (la ruta de cobro lo acepta)', () => {
  // Las dos formas reales de id de cita: la de `uid()` (21 caracteres) y la de la semilla.
  for (const citaId of ['cita-msaytlyp-7-shwaq', 'cita-1']) {
    const id = idReciboDeCita(citaId);
    assert.equal(id, `${PREFIJO_RECIBO_DE_CITA}${citaId}`);
    assert.equal(idReciboDeCita(citaId), id, 'el mismo id de cita da el mismo id de recibo');
    const r = parsearPeticionMarcarCobrado({ reciboIds: [id], metodo: null });
    assert.ok(r.ok, `la ruta de cobro rechaza ${id}`);
  }
  assert.notEqual(idReciboDeCita('cita-a'), idReciboDeCita('cita-b'));
});

test('un id de cita que no cabe da null (nunca un id inventado, que sería volver al doble recibo)', () => {
  assert.equal(idReciboDeCita('cita con espacios'), null);
  assert.equal(idReciboDeCita('cita/../x'), null);
  assert.equal(idReciboDeCita(''), null);
  const largo = 'c'.repeat(LONGITUD_MAXIMA_ID_RECIBO);
  assert.equal(idReciboDeCita(largo), null);
  // Justo en el límite: cabe.
  const justo = 'c'.repeat(LONGITUD_MAXIMA_ID_RECIBO - PREFIJO_RECIBO_DE_CITA.length);
  assert.equal(idReciboDeCita(justo)?.length, LONGITUD_MAXIMA_ID_RECIBO);
});

test('qué se hace con el recibo que YA existía: se sigue con el mismo, o se manda a revisar', () => {
  const esperado = { socioId: 'soc-1', importe: 45 };
  const previo = (extra: Partial<ReciboPrevioDeCita> = {}): ReciboPrevioDeCita => ({
    estado: 'PENDIENTE', importe: 45, socioId: 'soc-1', importeDevuelto: 0, reembolsoStripeId: null, reembolsoSolicitadoEn: null, ...extra,
  });
  // Se sigue con él: el servidor arbitra (cobra, o «ya estaba cobrado» si el primer intento sí entró).
  for (const estado of ['PENDIENTE', 'FALLIDO', 'COBRADO']) {
    assert.deepEqual(decidirReciboPrevioDeCita(previo({ estado }), esperado), { tipo: 'seguir' }, estado);
  }
  // Un devuelto POR EL BANCO es deuda y se puede cobrar (es lo que hace «Reintentar»/«Cobrar» en Cobros).
  assert.deepEqual(decidirReciboPrevioDeCita(previo({ estado: 'DEVUELTO' }), esperado), { tipo: 'seguir' });
  // Céntimos: la coma flotante no inventa diferencias.
  assert.deepEqual(decidirReciboPrevioDeCita(previo({ importe: 44.999999999 }), esperado), { tipo: 'seguir' });

  // A revisar, cada uno con SU texto: en curso (el servidor no deja marcarlo a mano), anulado y reembolsado.
  const enCurso = decidirReciboPrevioDeCita(previo({ estado: 'EN_CURSO' }), esperado);
  assert.equal(enCurso.tipo, 'revisar');
  assert.match((enCurso as { error: string }).error, /cobro en curso/);
  const anulado = decidirReciboPrevioDeCita(previo({ estado: 'ANULADO' }), esperado);
  assert.equal(anulado.tipo, 'revisar');
  assert.match((anulado as { error: string }).error, /anulado/);
  // Reembolsado de verdad: un cobrado con todo el dinero ya devuelto (aún sin pasar a DEVUELTO) NO es un cobro
  // de esta cita — marcarla pagada sería falso —, y un devuelto con reembolso pedido o hecho, tampoco.
  for (const extra of [
    { estado: 'COBRADO', importeDevuelto: 45 },
    { estado: 'DEVUELTO', reembolsoStripeId: 're_x' },
    { estado: 'DEVUELTO', reembolsoSolicitadoEn: '2026-10-01T10:00:00Z' },
    { estado: 'DEVUELTO', importeDevuelto: 45 },
  ]) {
    const d = decidirReciboPrevioDeCita(previo(extra), esperado);
    assert.equal(d.tipo, 'revisar', JSON.stringify(extra));
    assert.match((d as { error: string }).error, /devolvió el dinero/, JSON.stringify(extra));
  }
  // Un cobrado con una devolución PARCIAL sigue siendo un cobro.
  assert.deepEqual(decidirReciboPrevioDeCita(previo({ estado: 'COBRADO', importeDevuelto: 10 }), esperado), { tipo: 'seguir' });

  // A revisar: la cita cambió de precio o de clienta entre un intento y otro. Cobrar el recibo viejo (o
  // marcar la cita pagada con él) sería cobrar un importe que la cita ya no dice.
  assert.equal(decidirReciboPrevioDeCita(previo({ importe: 50 }), esperado).tipo, 'revisar');
  assert.equal(decidirReciboPrevioDeCita(previo({ estado: 'COBRADO', importe: 50 }), esperado).tipo, 'revisar');
  assert.equal(decidirReciboPrevioDeCita(previo({ socioId: 'soc-2' }), esperado).tipo, 'revisar');
  assert.equal(decidirReciboPrevioDeCita(previo({ socioId: null }), esperado).tipo, 'revisar');
});

test('el cobro de una cita usa el id de la cita, mira antes de crear y no se inventa otro', () => {
  const pagina = sinComentarios(leer('app/(dashboard)/citas/page.tsx'));
  assert.match(pagina, /const reciboId = idReciboDeCita\(cita\.id\);\s+if \(!reciboId\) \{[\s\S]{0,200}return;\s+\}/, 'sin id válido, la cita no se cobra: no se inventa otro');
  assert.match(pagina, /crearFacturaDirecta\(\{[\s\S]{0,260}\}, \{ reciboId \}\)/, 'la página no pasa el id de la cita');
  // Y el aviso se pinta antes de marcar nada: la comprobación del id va antes que el cobro.
  assert.ok(pagina.indexOf('idReciboDeCita(cita.id)') < pagina.indexOf('crearFacturaDirecta({'));

  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  const i = ctx.indexOf('async function crearFacturaDirecta(');
  assert.ok(i >= 0);
  const directa = ctx.slice(i, ctx.indexOf('async function', i + 20));
  assert.match(directa, /id: opciones\.reciboId \?\? `rec-\$\{uid\(\)\}`/, 'sin id propio, un id nuevo por intento (Nueva factura)');
  // Se mira ANTES del INSERT y, si el INSERT falla, otra vez (otra pestaña lo creó en medio).
  const lecturas = [...directa.matchAll(/dbLeerReciboDeCita\(rec\.id\)/g)].map(m => m.index!);
  const insert = directa.indexOf('dbInsertRecibo(rec)');
  assert.equal(lecturas.length, 2, 'hay que leer antes del INSERT y tras un INSERT fallido');
  assert.ok(lecturas[0] < insert && insert < lecturas[1]);
  // Sin poder mirar, no se escribe nada.
  assert.match(directa, /if \(!lectura\.ok\) \{\s+return \{ ok: false, error:/);
  // Un recibo previo que no cuadra no se cobra: «el recibo existe y no consta cobrado» (no reenviar).
  assert.match(directa, /decision\.tipo === 'revisar'\) return \{ ok: false, cobroSinConfirmar: true/);
  // El apunte de actividad no se repite: ni el de «ya estaba cobrado», ni cuando el recibo ya estaba en
  // pantalla (`reflejarCobrosConfirmados` apunta el suyo).
  assert.match(directa, /if \(d\.resultado !== 'ya_estaba' && !recibos\.some\(r => r\.id === rec\.id\)\) \{[\s\S]{0,1200}addActividadReciente/);
});

test('«Nueva factura» sigue sin id propio: un id nuevo por intento y su cerrojo de doble clic', () => {
  const panel = sinComentarios(leer('components/cobros/panel-pendientes.tsx'));
  const i = panel.indexOf('await crearFacturaDirecta(');
  assert.ok(i >= 0);
  // No hay nada que identifique una «factura nueva»: no se le pasa `reciboId` (si se le pasara uno fijo,
  // la segunda factura del mismo importe a la misma clienta se confundiría con la primera).
  assert.doesNotMatch(panel.slice(i, i + 300), /reciboId/);
});
