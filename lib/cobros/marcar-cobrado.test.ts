import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { facturaIdManual } from '../billing/cobro-confirmado-reglas.ts';
import {
  LONGITUD_MAXIMA_ID_RECIBO, MAX_RECIBOS_POR_PETICION, METODOS_COBRO_MANUAL, desenlaceTrasReleer, esCobroConfirmado, estadoHttpDeLote,
  leerRespuestaMarcarCobrado, parsearPeticionMarcarCobrado, penalizacionesDeLosRecibos, recibosDePenalizacionAnulada,
  resultadoDeConfirmacion, resultadoDeExcepcion, resultadoPenalizacionAnulada, resumenDeLote,
  textoLoteCobrado, trocear, type DesenlaceCobroManual, type ResultadoReciboMarcado,
} from './marcar-cobrado.ts';

// «Marcar cobrado» del panel ya no escribe desde el navegador: lo decide
// `POST /api/cobros/marcar-cobrado` con el dueño único. Lo que se fija aquí:
//  · qué acepta la ruta (lista blanca de métodos, ids, tope);
//  · que ningún desenlace se convierte en un éxito que no fue;
//  · que la pantalla nunca lee «cobrado» sin un detalle por recibo que lo diga.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── Petición ─────────────────────────────────────────────────────────────────

test('acepta los métodos del diálogo y «sin especificar»', () => {
  for (const metodo of METODOS_COBRO_MANUAL) {
    const r = parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], metodo });
    assert.deepEqual(r, { ok: true, peticion: { reciboIds: ['rec-1'], metodo, canal: 'mostrador', lote: false, conFactura: false } });
  }
  assert.deepEqual(parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'] }), { ok: true, peticion: { reciboIds: ['rec-1'], metodo: null, canal: 'mostrador', lote: false, conFactura: false } });
  assert.deepEqual(parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], metodo: null }), { ok: true, peticion: { reciboIds: ['rec-1'], metodo: null, canal: 'mostrador', lote: false, conFactura: false } });
});

test('«El banco lo ha cobrado» (canal banco) no lleva método: lo pone el servidor', () => {
  assert.deepEqual(parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], canal: 'banco' }), { ok: true, peticion: { reciboIds: ['rec-1'], metodo: null, canal: 'banco', lote: false, conFactura: false } });
  assert.equal(parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], canal: 'banco', metodo: 'EFECTIVO' }).ok, false, 'lo cobrado por el banco no es efectivo');
  assert.equal(parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], canal: 'datafono' }).ok, false, 'canal inventado');
});

test('«lote»: solo un `true` de verdad lo es (cobrar varias); cualquier otra cosa, uno a uno', () => {
  const lote = (v: unknown) => { const r = parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], metodo: 'EFECTIVO', lote: v }); return r.ok && r.peticion.lote; };
  assert.equal(lote(true), true);
  for (const v of [undefined, false, 'true', 1, null]) assert.equal(lote(v), false, JSON.stringify(v));
});

test('la ruta: «El banco lo ha cobrado» solo para lo que pudo salir en una remesa, y en un lote nada con un cobro en marcha', () => {
  const ruta = sinComentarios(leer('app/api/cobros/marcar-cobrado/route.ts'));
  assert.match(ruta, /porElBanco \? await motivosParaNoSerRemesa\(admin, sesion\.studioId, peticion\.reciboIds\)/,
    'el canal banco consulta la remesa con el estudio de la SESIÓN');
  assert.match(ruta, /if \(remesa && !remesa\.ok\)/, 'sin poder comprobarlo, no se cobra');
  assert.match(ruta, /resultadoNoCobrable\(reciboId, MENSAJE_COBRO_EN_MARCHA_LOTE\)/);
  assert.match(ruta, /if \(sinLeerCobrosEnMarcha\)/, 'sin poder leer los cobros en marcha, el lote no cobra');
  assert.match(ruta, /sinCobroEnMarcha: peticion\.lote && !porElBanco/, 'y el propio UPDATE lo vuelve a exigir');
  // La lectura del lote va acotada al estudio de la sesión.
  assert.match(ruta, /select\(`id, \$\{COLUMNAS_COBRO_EN_MARCHA\.join\(', '\)\}`\)\s*\.eq\('studio_id', sesion\.studioId\)/);
});

test('el panel: solo «Cobrar varias» y «Cobrar todos» mandan el lote; el cobro de uno no', () => {
  const ctx = leer('lib/studio-context.tsx');
  assert.match(ctx, /cobrarEnServidor\(ids, metodo, onProgreso, false, true\)/, '«Cobrar varias» manda el lote');
  const api = leer('lib/api-client.ts');
  assert.match(api, /\.\.\.\(lote \? \{ lote: true \} : \{\}\)/, 'el cuerpo solo lleva `lote` cuando lo es');
});

test('la lista blanca es la del diálogo «¿Cómo lo has cobrado?», ni más ni menos', () => {
  const dialogo = leer('components/cobros/dialogo-metodo-cobro.tsx');
  const delDialogo = [...dialogo.matchAll(/metodo: '([A-Z_]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual([...METODOS_COBRO_MANUAL].sort(), delDialogo,
    'si el diálogo ofrece un método que la ruta rechaza, el botón dice que sí y el servidor que no');
});

test('rechaza SEPA, métodos inventados y minúsculas', () => {
  for (const metodo of ['SEPA', 'CRIPTO', 'efectivo', '', 7, {}]) {
    const r = parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], metodo });
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(metodo)}`);
  }
});

test('rechaza cuerpos e ids que no son lo que parecen', () => {
  for (const cuerpo of [null, undefined, 'rec-1', [], {}, { reciboIds: [] }, { reciboIds: 'rec-1' },
    { reciboIds: [1] }, { reciboIds: [''] }, { reciboIds: ['rec-1,rec-2'] }, { reciboIds: ['rec-1)'] },
    { reciboIds: ['a'.repeat(LONGITUD_MAXIMA_ID_RECIBO + 1)] }]) {
    assert.equal(parsearPeticionMarcarCobrado(cuerpo).ok, false, `debería rechazar ${JSON.stringify(cuerpo)}`);
  }
});

test('el id de recibo más largo que se acepta cabe en el id de su factura (64 caracteres al sellar)', () => {
  assert.equal(LONGITUD_MAXIMA_ID_RECIBO, 64 - 'fac-manual-'.length);
  const justo = 'r'.repeat(LONGITUD_MAXIMA_ID_RECIBO);
  assert.equal(parsearPeticionMarcarCobrado({ reciboIds: [justo] }).ok, true);
  assert.ok(facturaIdManual(justo).length <= 64, 'un recibo aceptado no puede dejar sin sellar su factura');
});

test('tope de 50 recibos por petición; los repetidos cuentan una vez', () => {
  const ids = Array.from({ length: MAX_RECIBOS_POR_PETICION }, (_, i) => `rec-${i}`);
  assert.equal(parsearPeticionMarcarCobrado({ reciboIds: ids }).ok, true);
  assert.equal(parsearPeticionMarcarCobrado({ reciboIds: [...ids, 'rec-extra'] }).ok, false);
  const r = parsearPeticionMarcarCobrado({ reciboIds: [...ids, 'rec-0', 'rec-1'] });
  assert.ok(r.ok);
  assert.equal(r.peticion.reciboIds.length, MAX_RECIBOS_POR_PETICION);
});

// ── Desenlace por recibo ─────────────────────────────────────────────────────

test('cada desenlace de confirmarCobro tiene su resultado, y solo dos son cobro', () => {
  assert.deepEqual(resultadoDeConfirmacion('r', { ok: true, transicion: 'aplicada', selladoOk: true, numeroFactura: 'A-1' }),
    { reciboId: 'r', resultado: 'aplicada', selladoOk: true, numeroFactura: 'A-1' });
  assert.deepEqual(resultadoDeConfirmacion('r', { ok: true, transicion: 'aplicada', selladoOk: false }),
    { reciboId: 'r', resultado: 'aplicada', selladoOk: false });
  assert.deepEqual(resultadoDeConfirmacion('r', { ok: true, transicion: 'ya_estaba', selladoOk: true }),
    { reciboId: 'r', resultado: 'ya_estaba', selladoOk: true });

  const devuelto = resultadoDeConfirmacion('r', { ok: true, transicion: 'devuelto', selladoOk: true });
  assert.equal(devuelto.resultado, 'no_cobrable', 'un devuelto nunca se lee como cobrado');

  assert.equal(resultadoDeConfirmacion('r', { ok: false, codigo: 'NO_ENCONTRADO', error: 'x' }).resultado, 'no_encontrado');
  assert.equal(resultadoDeConfirmacion('r', { ok: false, codigo: 'NO_COBRABLE', error: 'x', estado: 'ANULADO' }).resultado, 'no_cobrable');
  assert.equal(resultadoDeConfirmacion('r', { ok: false, codigo: 'PERSISTENCIA', error: 'x' }).resultado, 'error');
  assert.equal(resultadoDeExcepcion('r').resultado, 'error');
});

test('un recibo con cobro en curso lo explica, no dice «ya no se puede cobrar»', () => {
  const r = resultadoDeConfirmacion('r', { ok: false, codigo: 'NO_COBRABLE', error: 'x', estado: 'EN_CURSO' });
  assert.match(r.error ?? '', /cobro en curso/);
});

test('los mensajes técnicos del servidor no llegan a la pantalla', () => {
  const r = resultadoDeConfirmacion('r', { ok: false, codigo: 'PERSISTENCIA', error: 'duplicate key value violates unique constraint' });
  assert.doesNotMatch(r.error ?? '', /constraint|duplicate/);
});

// ── Código HTTP ──────────────────────────────────────────────────────────────

const res = (resultado: ResultadoReciboMarcado['resultado']): ResultadoReciboMarcado => ({ reciboId: resultado, resultado, selladoOk: true });

test('200 solo si todos quedaron cobrados; nunca un 200 con un fallo dentro', () => {
  assert.equal(estadoHttpDeLote([res('aplicada'), res('ya_estaba')]), 200);
  assert.equal(estadoHttpDeLote([res('aplicada'), res('no_cobrable')]), 409);
  assert.equal(estadoHttpDeLote([res('no_encontrado')]), 409);
  assert.equal(estadoHttpDeLote([res('aplicada'), res('error'), res('no_cobrable')]), 500);
});

// ── Lectura en la pantalla ───────────────────────────────────────────────────

const ok = (id: string, resultado: ResultadoReciboMarcado['resultado'] = 'aplicada'): ResultadoReciboMarcado => ({ reciboId: id, resultado, selladoOk: true });

test('con detalle por recibo se usa el detalle, venga con el código que venga', () => {
  for (const status of [200, 409, 500]) {
    const l = leerRespuestaMarcarCobrado({ status, cuerpo: { resultados: [ok('a'), ok('b', 'no_cobrable')] } }, ['a', 'b']);
    assert.equal(l.tipo, 'resultados');
  }
});

test('un 200 sin detalle NO es un cobro: es «no sé»', () => {
  for (const cuerpo of [{}, null, 'OK', { ok: true }, { resultados: [] }, { resultados: [{ reciboId: 'a', resultado: 'cobrado' }] }]) {
    assert.deepEqual(leerRespuestaMarcarCobrado({ status: 200, cuerpo }, ['a']), { tipo: 'desconocida' }, JSON.stringify(cuerpo));
  }
});

test('un detalle que no cubre todos los recibos enviados no se da por bueno', () => {
  assert.deepEqual(leerRespuestaMarcarCobrado({ status: 200, cuerpo: { resultados: [ok('a')] } }, ['a', 'b']), { tipo: 'desconocida' });
});

test('4xx sin detalle = rechazada sin tocar nada; 5xx, timeout o red = no se sabe', () => {
  assert.deepEqual(leerRespuestaMarcarCobrado({ status: 403, cuerpo: { error: 'Tu rol no puede registrar cobros' } }, ['a']),
    { tipo: 'rechazada', status: 403, error: 'Tu rol no puede registrar cobros' });
  assert.deepEqual(leerRespuestaMarcarCobrado({ status: 401, cuerpo: '<html>' }, ['a']), { tipo: 'rechazada', status: 401, error: null });
  assert.deepEqual(leerRespuestaMarcarCobrado({ status: 500, cuerpo: '<html>Internal Server Error</html>' }, ['a']), { tipo: 'desconocida' });
  assert.deepEqual(leerRespuestaMarcarCobrado({ status: 504, cuerpo: {} }, ['a']), { tipo: 'desconocida' });
  assert.deepEqual(leerRespuestaMarcarCobrado({ status: 408, cuerpo: {} }, ['a']), { tipo: 'desconocida' });
  assert.deepEqual(leerRespuestaMarcarCobrado({ red: true }, ['a']), { tipo: 'desconocida' });
});

test('al releer, solo COBRADO en la BD cuenta; si la relectura falla, tampoco', () => {
  const tras = desenlaceTrasReleer(['a', 'b', 'c'], new Map([['a', 'COBRADO'], ['b', 'PENDIENTE']]));
  assert.deepEqual(tras.map(d => d.resultado), ['cobrado_al_releer', 'sin_confirmar', 'sin_confirmar']);
  assert.deepEqual(tras.map(esCobroConfirmado), [true, false, false]);
  const sinBd = desenlaceTrasReleer(['a'], null);
  assert.equal(sinBd[0].resultado, 'sin_confirmar');
  assert.match(sinBd[0].error ?? '', /antes de volver a cobrar/);
});

test('ni «no cobrable» ni «no encontrado» ni «error» se pintan como cobro', () => {
  for (const r of ['no_cobrable', 'no_encontrado', 'error', 'sin_confirmar'] as const) {
    assert.equal(esCobroConfirmado({ resultado: r }), false, r);
  }
  for (const r of ['aplicada', 'ya_estaba', 'cobrado_al_releer'] as const) {
    assert.equal(esCobroConfirmado({ resultado: r }), true, r);
  }
});

test('cobrado pero sin poder entregar el plan: el servidor lo dice y el lote lo cuenta aparte', () => {
  const base = { ok: true as const, transicion: 'aplicada' as const, selladoOk: true };
  assert.deepEqual(resultadoDeConfirmacion('rec-1', { ...base, renovacionFallida: true }),
    { reciboId: 'rec-1', resultado: 'aplicada', selladoOk: true, renovacionFallida: true });
  assert.equal('renovacionFallida' in resultadoDeConfirmacion('rec-1', base), false);

  const lote = resumenDeLote([d('aplicada', { renovacionFallida: true }), d('aplicada')]);
  assert.equal(lote.ok, true, 'el dinero entró: no es un lote fallido');
  assert.equal(lote.sinRenovar, 1);
  assert.equal(textoLoteCobrado(lote), '2 recibos cobrados · 1 sin poder renovar el plan: renuévalo a mano desde la ficha');
});

test('trocear reparte en lotes sin perder ni repetir', () => {
  assert.deepEqual(trocear([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(trocear([], 10), []);
  assert.deepEqual(trocear([1], 0), [[1]]);
});

// ── Resumen de un lote ───────────────────────────────────────────────────────

const d = (resultado: DesenlaceCobroManual['resultado'], extra: Partial<DesenlaceCobroManual> = {}): DesenlaceCobroManual =>
  ({ reciboId: `r-${Math.random()}`, resultado, selladoOk: true, ...extra });

test('un lote sale bien solo si ninguno quedó sin cobrar ni sin confirmar', () => {
  const bien = resumenDeLote([d('aplicada'), d('aplicada', { selladoOk: false }), d('ya_estaba'), d('cobrado_al_releer')]);
  assert.deepEqual(bien, { ok: true, cobrados: 2, yaEstaban: 2, sinFactura: 1, sinRenovar: 0, noCobrados: 0, anulados: 0, sinConfirmar: 0 });
  assert.equal(textoLoteCobrado(bien), '2 recibos cobrados · 2 ya estaban cobrados · 1 con la factura pendiente de sellar');
  assert.equal(textoLoteCobrado(resumenDeLote([d('aplicada')])), '1 recibo cobrado');

  const mal = resumenDeLote([d('aplicada'), d('no_cobrable', { error: 'Este recibo ya no se puede cobrar.' }), d('sin_confirmar', { error: 'Compruébalo.' })]);
  assert.equal(mal.ok, false);
  assert.equal(!mal.ok && mal.error, '1 de 3 cobrados. 1 sin cobrar: Este recibo ya no se puede cobrar. 1 sin confirmar: Compruébalo.');
  assert.equal(resumenDeLote([]).ok, true);
});

// ── Penalizaciones anuladas: la guardia del mostrador, ahora en el servidor ──
// El trigger que anula una penalización no toca su recibo; hasta que el barrido
// del cron lo suelta sigue PENDIENTE. Antes lo paraba el navegador; ahora la ruta.

test('penalizacionesDeLosRecibos: solo los recibos de penalización, sin repetir', () => {
  assert.deepEqual(penalizacionesDeLosRecibos(['rec-1', 'rec-penaliz-a', 'rec-penaliz-a', 'rec-penaliz-b']), ['a', 'b']);
  assert.deepEqual(penalizacionesDeLosRecibos(['rec-1', 'rec-2']), []);
});

test('un recibo de penalización anulada o reembolsada NO se cobra; uno normal sí', () => {
  const estados = new Map([['a', 'OMITIDA_SIN_TARJETA'], ['b', 'REEMBOLSADA'], ['c', 'RECIBO_CREADO'], ['d', 'OMITIDA_REVERTIDA']]);
  const r = recibosDePenalizacionAnulada(['rec-1', 'rec-penaliz-a', 'rec-penaliz-b', 'rec-penaliz-c', 'rec-penaliz-d'], estados);
  assert.deepEqual([...r.bloqueados].sort(), ['rec-penaliz-a', 'rec-penaliz-b', 'rec-penaliz-d']);
  assert.deepEqual(r.sinComprobar, []);
});

test('sin poder leer las penalizaciones se deja cobrar y se avisa de qué no se comprobó', () => {
  // Hay una persona delante de la alumna: parar el cobro por un fallo de lectura
  // deja sin cobrar cuotas reales por un caso raro (mismo criterio que antes).
  const r = recibosDePenalizacionAnulada(['rec-1', 'rec-penaliz-a'], null);
  assert.equal(r.bloqueados.size, 0);
  assert.deepEqual(r.sinComprobar, ['rec-penaliz-a']);
});

test('una penalización que no existe (ya barrida) deja cobrar su recibo', () => {
  const r = recibosDePenalizacionAnulada(['rec-penaliz-zzz'], new Map());
  assert.equal(r.bloqueados.size, 0);
});

test('el resultado «penalización anulada» no es un fallo del lote ni un cobro', () => {
  const anulada = resultadoPenalizacionAnulada('rec-penaliz-a');
  assert.equal(anulada.resultado, 'penalizacion_anulada');
  assert.equal(esCobroConfirmado(anulada), false, 'no se cobró');
  // Un lote solo con anuladas + cobradas es 200: lo esperado, no un 409.
  assert.equal(estadoHttpDeLote([resultadoPenalizacionAnulada('x'), { reciboId: 'y', resultado: 'aplicada', selladoOk: true }]), 200);
  // Pero un fallo de verdad sigue mandando.
  assert.equal(estadoHttpDeLote([resultadoPenalizacionAnulada('x'), { reciboId: 'y', resultado: 'no_cobrable', selladoOk: true }]), 409);
});

test('un lote con una anulada sale bien y lo dice con su importe', () => {
  const resumen = resumenDeLote([d('aplicada'), d('aplicada'), d('penalizacion_anulada')]);
  assert.equal(resumen.ok, true, 'saltar una penalización anulada no convierte el lote en un fallo');
  assert.equal(resumen.cobrados, 2);
  assert.equal(resumen.anulados, 1);
  assert.match(textoLoteCobrado(resumen, [{ importe: 12 }]), /^2 recibos cobrados\. 1 no \(12,00\s€\): es una penalización anulada y no se cobra\.$/);
  assert.equal(textoLoteCobrado(resumenDeLote([d('aplicada')]), []), '1 recibo cobrado');
});

test('el servidor lee las penalizaciones acotadas al estudio y justo antes de cobrar cada recibo', () => {
  const ruta = sinComentarios(leer('app/api/cobros/marcar-cobrado/route.ts'));
  const bucle = ruta.indexOf('for (const reciboId of peticion.reciboIds)');
  const guardia = ruta.indexOf('await bloqueadosPorPenalizacion(admin, sesion.studioId, [reciboId])');
  assert.ok(guardia > 0, 'la ruta no aplica la guardia de penalizaciones');
  assert.ok(guardia > bucle, 'la guardia se lee UNA VEZ al principio: una penalización anulada a mitad del lote se cobraría');
  assert.ok(ruta.indexOf('await confirmarCobro(') > guardia, 'la guardia va ANTES de confirmar el cobro de ese recibo');
  assert.doesNotMatch(ruta, /bloqueadosPorPenalizacion\(admin, sesion\.studioId, peticion\.reciboIds\)/, 'lectura única de todo el lote');
  assert.match(ruta, /\.eq\('studio_id', studioId\)\.in\('id', penalizacionIds\)/, 'acotada al estudio de la sesión');
  assert.match(ruta, /catch \{\s*estados = null;/, 'un fallo de lectura no tumba el cobro');
});

// ── Estructurales: la ruta y el panel ────────────────────────────────────────
// Ni la ruta ni el contexto cargan en `node --test` (alias `@/`).

test('la ruta comprueba rol y toma el estudio de la sesión, nunca del cuerpo', () => {
  const ruta = sinComentarios(leer('app/api/cobros/marcar-cobrado/route.ts'));
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /puedeMoverDinero\(sesion\.rol\)/);
  assert.match(ruta, /studioId: sesion\.studioId/);
  assert.doesNotMatch(ruta, /cuerpo\.studioId|body\.studioId/);
});

test('la ruta cobra por el dueño único, a mano, en serie y sin email extra', () => {
  const ruta = sinComentarios(leer('app/api/cobros/marcar-cobrado/route.ts'));
  assert.match(ruta, /confirmarCobro\(admin, \{/);
  // A mano, o «El banco lo ha cobrado» (origen `banco`, que solo cierra lo que está en una remesa).
  assert.match(ruta, /origen: porElBanco \? 'banco' : 'manual'/);
  assert.match(ruta, /metodo: porElBanco \? 'SEPA' : peticion\.metodo/, 'lo cobrado por el banco es un adeudo, no lo que diga el cuerpo');
  assert.match(ruta, /paymentIntentId: null/);
  // El panel manda su propio justificante (`cobrarYEmail`): un segundo email
  // desde el servidor sería un cambio de producto, no un refactor.
  assert.match(ruta, /avisarSocia: false/);
  assert.match(ruta, /facturaId: facturaIdManual\(/);
  assert.match(ruta, /for \(const reciboId of peticion\.reciboIds\)/, 'en serie: dos renovaciones de la misma suscripción no pueden cruzarse');
  // Los COBROS, nunca en paralelo. El libro de auditoría (leer antes / anotar después) sí puede ir
  // en paralelo: no toca la suscripción ni el bono.
  assert.doesNotMatch(ruta, /Promise\.all\([^;]*confirmarCobro/, 'los cobros van en serie');
  const cobros = ruta.slice(ruta.indexOf('for (const reciboId of peticion.reciboIds)'), ruta.indexOf('await Promise.all(resultados'));
  assert.doesNotMatch(cobros, /Promise\.all/, 'dentro del bucle de cobros no puede haber paralelismo');
});

test('el panel ya no escribe COBRADO en recibos desde el navegador', () => {
  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  assert.doesNotMatch(ctx, /dbUpdateRecibo(?:sBatch)?\([^;]*estado: 'COBRADO'/,
    'marcar cobrado tiene que pasar por /api/cobros/marcar-cobrado');
  assert.match(ctx, /marcarCobradoEnServidor\(/, 'y el contexto tiene que llamar a la ruta');
  assert.doesNotMatch(ctx, /dbMarcarCobrado/);
  assert.doesNotMatch(ctx, /'RENOVACION_PLAN'/, 'los créditos de renovación los da el servidor, una vez por recibo');
  assert.doesNotMatch(ctx, /aplicarRenovacionSuscripcion/, 'la renovación la aplica el servidor');
  const datos = sinComentarios(leer('lib/supabase-data.ts'));
  assert.doesNotMatch(datos, /export async function dbMarcarCobrado/);
});

test('la ruta limita el ritmo por persona y avisa a Sentry cuando el cobro no se pudo escribir', () => {
  const ruta = leer('app/api/cobros/marcar-cobrado/route.ts');
  assert.match(ruta, /enforceRateLimit\(req, 'cobros-marcar-cobrado',[^)]*sesion\.userId\)/, 'sin limitador por persona');
  // Después de saber quién es y de comprobar el rol: un anónimo no gasta cupo de nadie.
  assert.ok(ruta.indexOf('puedeMoverDinero(sesion.rol)') < ruta.indexOf('enforceRateLimit('), 'el limitador va antes de comprobar el rol');
  assert.match(ruta, /r\.codigo === 'PERSISTENCIA'[\s\S]{0,200}captureMessage/, 'un fallo de escritura no llega a Sentry');
});

test('«Hacerle factura» solo en un cobro en efectivo de un recibo, en el mostrador', () => {
  assert.deepEqual(
    parsearPeticionMarcarCobrado({ reciboIds: ['rec-1'], metodo: 'EFECTIVO', conFactura: true }),
    { ok: true, peticion: { reciboIds: ['rec-1'], metodo: 'EFECTIVO', canal: 'mostrador', lote: false, conFactura: true } },
  );
  for (const cuerpo of [
    { reciboIds: ['rec-1'], metodo: 'TARJETA', conFactura: true },
    { reciboIds: ['rec-1'], metodo: null, conFactura: true },
    { reciboIds: ['rec-1', 'rec-2'], metodo: 'EFECTIVO', conFactura: true },
    { reciboIds: ['rec-1'], metodo: 'EFECTIVO', conFactura: true, lote: true },
    { reciboIds: ['rec-1'], metodo: 'EFECTIVO', conFactura: 'si' },
    { reciboIds: ['rec-1'], canal: 'banco', conFactura: true },
  ]) {
    assert.equal(parsearPeticionMarcarCobrado(cuerpo).ok, false, JSON.stringify(cuerpo));
  }
  // La ruta se lo pasa a `confirmarCobro`.
  const ruta = readFileSync(join(import.meta.dirname, '../../app/api/cobros/marcar-cobrado/route.ts'), 'utf8');
  assert.match(ruta, /conFactura: peticion\.conFactura,/);
});
