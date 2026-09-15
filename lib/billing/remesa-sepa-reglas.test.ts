import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLUMNAS_COBRO_EN_MARCHA, avisoCobrosEnMarchaFueraDeRemesa, avisoXmlFallido, avisoYaNoPendientes,
  prepararRemesa, recibosSinCobroEnMarcha, tieneCobroEnMarcha,
  type FilaReciboRemesa, type IoRemesa, type ResultadoMarca,
} from './remesa-sepa-reglas.ts';

// Remesa SEPA: lo que va en el fichero es lo que el banco carga. Nada que ya se
// esté cobrando por otro lado, y solo lo que se marcó EN_CURSO de verdad.

const libre = (id: string): FilaReciboRemesa => ({
  id, estado: 'PENDIENTE', proximo_reintento: null, stripe_payment_intent_id: null, checkout_session_id: null, cobro_mostrador_pi: null,
});
const leidas = (...filas: FilaReciboRemesa[]) => ({ ok: true as const, filas: new Map(filas.map(f => [f.id, f])) });

test('⚠️ cualquier cobro en marcha lo saca: reintento, PaymentIntent, Checkout o mostrador', () => {
  assert.equal(tieneCobroEnMarcha(libre('r')), false);
  for (const col of COLUMNAS_COBRO_EN_MARCHA) {
    assert.equal(tieneCobroEnMarcha({ ...libre('r'), [col]: 'x' }), true, col);
    const r = recibosSinCobroEnMarcha([{ id: 'r' }], leidas({ ...libre('r'), [col]: 'x' }));
    assert.deepEqual([r.entran.length, r.fueraCobroEnMarcha], [0, 1], col);
  }
});

test('ya no pendiente (cobrado entre cargar y pulsar) o ya no está → fuera', () => {
  const r = recibosSinCobroEnMarcha([{ id: 'a' }, { id: 'b' }, { id: 'c' }], leidas({ ...libre('a'), estado: 'COBRADO' }, libre('c')));
  assert.deepEqual(r.entran, [{ id: 'c' }]);
  assert.equal(r.fueraYaNoPendientes, 2);
});

test('⚠️ sin poder leer, ninguno entra', () => {
  const r = recibosSinCobroEnMarcha([{ id: 'a' }, { id: 'b' }], { ok: false });
  assert.deepEqual([r.entran.length, r.fueraSinComprobar], [0, 2]);
});

test('los libres entran en su orden', () => {
  const r = recibosSinCobroEnMarcha([{ id: 'b' }, { id: 'a' }], leidas(libre('a'), libre('b')));
  assert.deepEqual(r.entran, [{ id: 'b' }, { id: 'a' }]);
  assert.deepEqual([r.fueraCobroEnMarcha, r.fueraYaNoPendientes, r.fueraSinComprobar], [0, 0, 0]);
});

test('la pantalla dice cuántos quedaron fuera y por qué, y nada si ninguno', () => {
  assert.equal(avisoCobrosEnMarchaFueraDeRemesa({ fueraCobroEnMarcha: 0, fueraYaNoPendientes: 0, fueraSinComprobar: 0 }), null);
  assert.equal(avisoCobrosEnMarchaFueraDeRemesa({ fueraCobroEnMarcha: 1, fueraYaNoPendientes: 0, fueraSinComprobar: 0 }),
    '1 recibo no entra: ya tiene un cobro en marcha (reintento programado, tarjeta, Bizum o datáfono).');
  assert.equal(avisoYaNoPendientes(1), '1 ya no estaba pendiente y no va en la remesa.');
  assert.equal(avisoYaNoPendientes(3), '3 ya no estaban pendientes y no van en la remesa.');
  const todo = avisoCobrosEnMarchaFueraDeRemesa({ fueraCobroEnMarcha: 2, fueraYaNoPendientes: 1, fueraSinComprobar: 4 }) ?? '';
  assert.match(todo, /^2 recibos no entran: ya tienen .* 1 ya no estaba pendiente .* 4 recibos no entran: no hemos podido comprobar/);
  assert.doesNotMatch(todo, /proximo_reintento|payment_intent|EN_CURSO/, 'sin columnas ni estados internos');
});

// ── Marcar → generar → deshacer ──────────────────────────────────────────────

function io(opts: {
  marcar?: ResultadoMarca; xmlFalla?: boolean; desmarcar?: ResultadoMarca | Error;
} = {}) {
  const llamadas: string[] = [];
  const doble: IoRemesa = {
    async marcar(ids) {
      llamadas.push(`marcar:${ids.join(',')}`);
      return opts.marcar ?? { ok: true, idsActualizados: ids };
    },
    generarXml(ids) {
      llamadas.push(`xml:${ids.join(',')}`);
      if (opts.xmlFalla) throw new Error('xml');
      return `<xml>${ids.join(',')}</xml>`;
    },
    async desmarcar(ids) {
      llamadas.push(`desmarcar:${ids.join(',')}`);
      if (opts.desmarcar instanceof Error) throw opts.desmarcar;
      return opts.desmarcar ?? { ok: true, idsActualizados: ids };
    },
  };
  return { doble, llamadas };
}

test('todo marcado → fichero con todos, marcar antes de generar', async () => {
  const { doble, llamadas } = io();
  assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'LISTA', xml: '<xml>a,b</xml>', ids: ['a', 'b'], caidos: 0 });
  assert.deepEqual(llamadas, ['marcar:a,b', 'xml:a,b']);
});

test('⚠️ el UPDATE toca menos filas → el fichero lleva SOLO las marcadas, y se dice cuántas cayeron', async () => {
  const { doble, llamadas } = io({ marcar: { ok: true, idsActualizados: ['c', 'a'] } });
  assert.deepEqual(await prepararRemesa(['a', 'b', 'c'], doble), { paso: 'LISTA', xml: '<xml>a,c</xml>', ids: ['a', 'c'], caidos: 1 });
  assert.deepEqual(llamadas, ['marcar:a,b,c', 'xml:a,c']);
});

test('ninguno seguía pendiente → sin fichero', async () => {
  const { doble, llamadas } = io({ marcar: { ok: true, idsActualizados: [] } });
  assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'NINGUNO_PENDIENTE', caidos: 2 });
  assert.deepEqual(llamadas, ['marcar:a,b']);
});

test('⚠️ el marcado da error → ni fichero ni nada que deshacer', async () => {
  const { doble, llamadas } = io({ marcar: { ok: false } });
  assert.deepEqual(await prepararRemesa(['a'], doble), { paso: 'SIN_MARCAR' });
  assert.deepEqual(llamadas, ['marcar:a']);
});

test('⚠️ el XML falla tras marcar → se deshace la marca de ESOS ids', async () => {
  const { doble, llamadas } = io({ marcar: { ok: true, idsActualizados: ['a'] }, xmlFalla: true });
  assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'XML_FALLIDO', sinDeshacer: [] });
  assert.deepEqual(llamadas, ['marcar:a,b', 'xml:a', 'desmarcar:a']);
});

test('⚠️ deshacer toca menos, da error o revienta → se dice cuáles se quedaron EN_CURSO', async () => {
  const parcial = io({ xmlFalla: true, desmarcar: { ok: true, idsActualizados: ['b'] } });
  assert.deepEqual(await prepararRemesa(['a', 'b'], parcial.doble), { paso: 'XML_FALLIDO', sinDeshacer: ['a'] });
  for (const desmarcar of [{ ok: false } as const, new Error('red')]) {
    const { doble } = io({ xmlFalla: true, desmarcar });
    assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'XML_FALLIDO', sinDeshacer: ['a', 'b'] });
  }
});

test('aviso del XML fallido: sin prometer lo que no se deshizo', () => {
  assert.match(avisoXmlFallido(0), /Los recibos siguen pendientes/);
  const quedan = avisoXmlFallido(2);
  assert.match(quedan, /2 recibos se han quedado como enviados al banco sin fichero/);
  assert.doesNotMatch(quedan, /siguen pendientes/);
  assert.match(avisoXmlFallido(1), /1 recibo se ha quedado/);
});

// ── Cableado ─────────────────────────────────────────────────────────────────

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const leer = (ruta: string) => sinComentarios(readFileSync(join(import.meta.dirname, '../..', ruta), 'utf8'));
const cuerpoDe = (fuente: string, firma: string) => {
  const desde = fuente.slice(fuente.indexOf(firma));
  return desde.slice(0, desde.indexOf('\n}\n'));
};

test('⚠️ el botón lee los cobros en marcha, marca con prepararRemesa y descarga SOLO el fichero de lo marcado', () => {
  const fuente = leer('components/cobros/boton-remesa-sepa.tsx');
  const libres = fuente.indexOf('recibosSinCobroEnMarcha(remesa.entran, await dbLeerRecibosParaRemesa(remesa.entran.map(r => r.id)))');
  const preparar = fuente.indexOf('await prepararRemesa(previa.idsIncluidos, {', libres);
  const blob = fuente.indexOf('new Blob([r.xml]', preparar);
  assert.ok(libres > 0 && preparar > libres && blob > preparar, 'leer → marcar y generar → descargar');
  assert.doesNotMatch(fuente, /marcarRecibosEnviadosAlBanco\(idsIncluidos\)|new Blob\(\[xml\]/, 'ni marcar ni descargar el fichero previo');
  assert.ok(fuente.includes('if (final.nAdeudos !== ids.length) throw'), 'el fichero lleva todos los marcados o falla (y se deshace)');
  assert.ok(fuente.includes('avisoCobrosEnMarchaFueraDeRemesa(libres)'));
});

test('⚠️ marcar exige PENDIENTE y sin cobro en marcha en el UPDATE; deshacer exige EN_CURSO', () => {
  const contexto = leer('lib/studio-context.tsx');
  assert.ok(contexto.includes("dbUpdateRecibosBatch(ids, { estado: 'EN_CURSO' }, 'PENDIENTE', { sinCobroEnMarcha: true })"));
  assert.ok(contexto.includes("dbUpdateRecibosBatch(ids, { estado: 'PENDIENTE' }, 'EN_CURSO', { sinCobroEnMarcha: true })"));

  const datos = leer('lib/supabase-data.ts');
  assert.ok(cuerpoDe(datos, 'export async function dbUpdateRecibosBatch(')
    .includes('if (opciones.sinCobroEnMarcha) for (const col of COLUMNAS_COBRO_EN_MARCHA) q = q.is(col, null);'));
  const lectura = cuerpoDe(datos, 'export async function dbLeerRecibosParaRemesa(');
  for (const col of COLUMNAS_COBRO_EN_MARCHA) assert.ok(lectura.includes(col), `la lectura trae ${col}`);
  assert.match(lectura, /if \(error\) return \{ ok: false \};/);
  assert.match(lectura, /catch \{\s*return \{ ok: false \};/);
});

test('las columnas de «cobro en marcha» son las mismas que impiden borrar el recibo de una penalización', () => {
  const borrar = cuerpoDe(leer('lib/billing/penalizacion-recibo-server.ts'), 'export async function borrarReciboDePenalizacionSinCobro(');
  const filtros = [...borrar.matchAll(/\.is\('([a-z_]+)', null\)/g)].map(m => m[1]).sort();
  assert.deepEqual(filtros, [...COLUMNAS_COBRO_EN_MARCHA].sort());
});
