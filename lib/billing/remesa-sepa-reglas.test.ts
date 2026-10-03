import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COLUMNAS_COBRO_EN_MARCHA, avisoCobrosEnMarchaFueraDeRemesa, avisoXmlFallido, avisoYaNoPendientes,
  DIAS_HASTA_CARGO_REMESA, prepararRemesa, recibosSinCobroEnMarcha, tieneCobroEnMarcha, vistaPreviaRemesa,
  type FilaReciboRemesa, type IoRemesa, type ResultadoMarca, type ResultadoMarcaRemesa,
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

const DIA = '2026-10-07';
const conDia = (ids: string[], dia: string | null = DIA) => new Map(ids.map(id => [id, dia]));

function io(opts: {
  marcar?: ResultadoMarcaRemesa; xmlFalla?: boolean; desmarcar?: ResultadoMarca | Error;
} = {}) {
  const llamadas: string[] = [];
  const doble: IoRemesa = {
    async marcar(ids) {
      llamadas.push(`marcar:${ids.join(',')}`);
      return opts.marcar ?? { ok: true, idsActualizados: ids, cargoPedidoPara: conDia(ids) };
    },
    generarXml(ids, fecha) {
      llamadas.push(`xml:${ids.join(',')}@${fecha}`);
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
  assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'LISTA', xml: '<xml>a,b</xml>', ids: ['a', 'b'], caidos: 0, fechaCargo: DIA });
  assert.deepEqual(llamadas, ['marcar:a,b', `xml:a,b@${DIA}`], 'el fichero lleva el día que fijó la base de datos');
});

test('⚠️ el UPDATE toca menos filas → el fichero lleva SOLO las marcadas, y se dice cuántas cayeron', async () => {
  const { doble, llamadas } = io({ marcar: { ok: true, idsActualizados: ['c', 'a'], cargoPedidoPara: conDia(['c', 'a']) } });
  assert.deepEqual(await prepararRemesa(['a', 'b', 'c'], doble), { paso: 'LISTA', xml: '<xml>a,c</xml>', ids: ['a', 'c'], caidos: 1, fechaCargo: DIA });
  assert.deepEqual(llamadas, ['marcar:a,b,c', `xml:a,c@${DIA}`]);
});

test('ninguno seguía pendiente → sin fichero', async () => {
  const { doble, llamadas } = io({ marcar: { ok: true, idsActualizados: [], cargoPedidoPara: new Map() } });
  assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'NINGUNO_PENDIENTE', caidos: 2 });
  assert.deepEqual(llamadas, ['marcar:a,b']);
});

test('⚠️ el marcado da error → ni fichero ni nada que deshacer', async () => {
  const { doble, llamadas } = io({ marcar: { ok: false } });
  assert.deepEqual(await prepararRemesa(['a'], doble), { paso: 'SIN_MARCAR' });
  assert.deepEqual(llamadas, ['marcar:a']);
});

test('⚠️ el XML falla tras marcar → se deshace la marca de ESOS ids', async () => {
  const { doble, llamadas } = io({ marcar: { ok: true, idsActualizados: ['a'], cargoPedidoPara: conDia(['a']) }, xmlFalla: true });
  assert.deepEqual(await prepararRemesa(['a', 'b'], doble), { paso: 'XML_FALLIDO', sinDeshacer: [] });
  assert.deepEqual(llamadas, ['marcar:a,b', `xml:a@${DIA}`, 'desmarcar:a']);
});

test('⚠️ sin día de cargo, o con dos distintos (dos relojes), no hay fichero: se deshace la marca', async () => {
  const sinDia = io({ marcar: { ok: true, idsActualizados: ['a', 'b'], cargoPedidoPara: conDia(['a', 'b'], null) } });
  assert.deepEqual(await prepararRemesa(['a', 'b'], sinDia.doble), { paso: 'SIN_FECHA_DE_CARGO', sinDeshacer: [] });
  assert.deepEqual(sinDia.llamadas, ['marcar:a,b', 'desmarcar:a,b'], 'ni se genera el fichero');
  const dos = io({ marcar: { ok: true, idsActualizados: ['a', 'b'], cargoPedidoPara: new Map([['a', DIA], ['b', '2026-10-08']]) } });
  assert.equal((await prepararRemesa(['a', 'b'], dos.doble)).paso, 'SIN_FECHA_DE_CARGO');
  const sinDeshacer = io({ marcar: { ok: true, idsActualizados: ['a'], cargoPedidoPara: new Map() }, desmarcar: { ok: false } });
  assert.deepEqual(await prepararRemesa(['a'], sinDeshacer.doble), { paso: 'SIN_FECHA_DE_CARGO', sinDeshacer: ['a'] });
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
  // Las columnas salen de la constante: una nueva entra sola en la lectura.
  assert.ok(lectura.includes(".select(`id, estado, ${COLUMNAS_COBRO_EN_MARCHA.join(', ')}`)"), 'la lectura trae las columnas de «cobro en marcha»');
  assert.match(lectura, /if \(error\) return \{ ok: false \};/);
  assert.match(lectura, /catch \{\s*return \{ ok: false \};/);
});

test('las columnas de «cobro en marcha» son las mismas que impiden borrar el recibo de una penalización', () => {
  const borrar = cuerpoDe(leer('lib/billing/penalizacion-recibo-server.ts'), 'export async function borrarReciboDePenalizacionSinCobro(');
  const filtros = [...borrar.matchAll(/\.is\('([a-z_]+)', null\)/g)].map(m => m[1]).sort();
  assert.deepEqual(filtros, [...COLUMNAS_COBRO_EN_MARCHA].sort());
});

// ── Vista previa ─────────────────────────────────────────────────────────────

const pend = (id: string, socioId: string | null, importe = 89) => ({ id, socioId, importe });
const filaLibre = (id: string, extra: Partial<FilaReciboRemesa> = {}): [string, FilaReciboRemesa] =>
  [id, { id, estado: 'PENDIENTE', proximo_reintento: null, stripe_payment_intent_id: null, checkout_session_id: null, cobro_mostrador_pi: null, ...extra }];

test('vista previa: qué entra y, de lo que no, por qué; las clientas sin domiciliar, en una sola línea', () => {
  const v = vistaPreviaRemesa({
    pendientes: [
      pend('a', 'nuria'), pend('b', 'elena', 65),
      pend('c', 'cris'), pend('d', 'cris', 15), pend('v', null, 12), // sin domiciliar
      pend('r', 'raquel', 130), // reintento programado
      pend('o', 'olga'), // pago online abierto
      pend('x', 'xenia'), // ya no pendiente
      pend('rec-penaliz-p1', 'pili', 10), // penalización sin aprobar
    ],
    conMandatoVigente: id => id !== 'cris',
    penalizaciones: { ok: true, estadoPorRecibo: new Map([['rec-penaliz-p1', 'PENDIENTE_APROBACION']]) },
    cobrosEnMarcha: { ok: true, filas: new Map([
      filaLibre('a'), filaLibre('b'),
      filaLibre('r', { proximo_reintento: '2026-10-05T08:30:00Z' }),
      filaLibre('o', { checkout_session_id: 'cs_1' }),
      filaLibre('x', { estado: 'COBRADO' }),
      filaLibre('rec-penaliz-p1'),
    ]) },
  });
  assert.deepEqual(v.entran.map(r => r.id), ['a', 'b']);
  assert.equal(v.total, 154);
  assert.deepEqual(v.sinDomiciliar, { recibos: 3, clientas: 1, importe: 116 });
  assert.deepEqual(v.fuera.map(f => [f.recibo.id, f.motivo, f.detalle]), [
    ['r', 'COBRO_EN_MARCHA', 'se cobra solo con su tarjeta o domiciliación'],
    ['o', 'COBRO_EN_MARCHA', 'tiene abierto un pago online'],
    ['x', 'YA_NO_PENDIENTE', 'ya no está pendiente'],
    ['rec-penaliz-p1', 'PENALIZACION_SIN_APROBAR', 'es una penalización sin el cobro aprobado'],
  ]);
});

test('vista previa: sin poder leer, nada entra (y se dice)', () => {
  const v = vistaPreviaRemesa({
    pendientes: [pend('a', 'nuria')],
    conMandatoVigente: () => true,
    penalizaciones: { ok: true, estadoPorRecibo: new Map() },
    cobrosEnMarcha: { ok: false },
  });
  assert.deepEqual(v.entran, []);
  assert.equal(v.fuera[0].motivo, 'SIN_COMPROBAR');
});

test('el día de cargo lo fija la base de datos: el «+ 5» y la zona de la migración son los de la pantalla', async () => {
  const { readdirSync } = await import('node:fs');
  const { TZ_ESTUDIO } = await import('../utils.ts');
  const dir = join(import.meta.dirname, '../../supabase/migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_recibos_marcas_de_tiempo.sql'));
  assert.ok(nombre, 'no encuentro la migración de las marcas de tiempo de recibos');
  const sql = readFileSync(join(dir, nombre), 'utf8');
  assert.ok(sql.includes(`then v_hoy + ${DIAS_HASTA_CARGO_REMESA}`), 'la vista previa anuncia otro día que el que pide el fichero');
  assert.ok(sql.includes(`v_hoy date := (now() at time zone '${TZ_ESTUDIO}')::date;`), 'el «hoy» del trigger no es el del estudio');
});

test('el botón ya no calcula el día de cargo con el reloj del dispositivo: usa el que devuelve el marcado', () => {
  const fuente = leer('components/cobros/boton-remesa-sepa.tsx');
  assert.doesNotMatch(fuente, /5 \* 24 \* 3600_000/);
  assert.match(fuente, /cargoPedidoPara: res\.cargoPedidoPara \?\? new Map\(\)/);
  assert.match(fuente, /generarXml: \(ids, fechaCargo\) =>/);
  assert.match(fuente, /a\.download = `remesa-sepa-\$\{r\.fechaCargo\}\.xml`/);
  const datos = leer('lib/supabase-data.ts');
  assert.ok(cuerpoDe(datos, 'export async function dbUpdateRecibosBatch(').includes("q.select('id, cargo_pedido_para')"), 'el marcado devuelve el día de cargo');
});
