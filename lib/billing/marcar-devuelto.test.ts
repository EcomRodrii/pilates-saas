import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cobroEntroPorStripe, marcarReciboDevuelto, reintentarPorElBanco, TEXTO_COBRO_EN_MARCHA, TEXTO_COBRO_POR_STRIPE, TEXTO_RECIBO_CAMBIADO,
} from './marcar-devuelto.ts';
import { TEXTO_NO_LO_DEVUELVE_EL_BANCO } from './devolucion-reglas.ts';

// «Marcar devuelto» de Cobros: el recibo pasa a DEVUELTO por servidor y, si era
// el de una penalización, la penalización se pone al día con su recibo
// (`seguirPenalizacionAlRecibo`: una COBRADA pasa a FALLIDA y la liquidación pide
// revisión). Antes era un UPDATE desde el cliente que no avisaba a la nómina.

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

type Fila = Record<string, unknown>;

interface Opciones {
  /** Recibo antes de la llamada; `null` = no existe en este estudio. */
  recibo: {
    estado: string; fecha_devolucion?: string | null; stripe_payment_intent_id?: string | null;
    metodo_cobro?: string | null; sepa_estado?: string | null; importe_devuelto?: number | null;
    checkout_session_id?: string | null; cobro_mostrador_pi?: string | null; proximo_reintento?: string | null;
  } | null;
  errorLectura?: boolean;
  errorUpdate?: boolean;
  /** Otro proceso cambió el recibo entre la lectura y el UPDATE. */
  cambiaEntreMedias?: boolean;
}

function montar(o: Opciones) {
  const updates: { fila: Fila; filtros: Record<string, unknown> }[] = [];
  const seguidos: { studioId: string; reciboId: string }[] = [];
  const admin = {
    from(tabla: string) {
      assert.equal(tabla, 'recibos', 'solo toca recibos: la penalización va por `seguir`');
      const filtros: Record<string, unknown> = {};
      let filaUpdate: Fila | null = null;
      const c = {
        select() { return c; },
        update(fila: Fila) { filaUpdate = fila; return c; },
        eq(campo: string, valor: unknown) { filtros[campo] = valor; return c; },
        is(campo: string, valor: unknown) { filtros[`is:${campo}`] = valor; return c; },
        maybeSingle() {
          if (filaUpdate) {
            updates.push({ fila: filaUpdate, filtros });
            if (o.errorUpdate) return Promise.resolve({ data: null, error: { message: 'boom' } });
            const casa = !o.cambiaEntreMedias && o.recibo?.estado === filtros.estado;
            return Promise.resolve({ data: casa ? { id: filtros.id } : null, error: null });
          }
          if (o.errorLectura) return Promise.resolve({ data: null, error: { message: 'boom' } });
          return Promise.resolve({ data: o.recibo, error: null });
        },
      };
      return c;
    },
  };
  const seguir = async (_admin: unknown, p: { studioId: string; reciboId: string }) => { seguidos.push(p); };
  const creditos: { studioId: string; reciboId: string }[] = [];
  const seguirCreditos = async (_admin: unknown, p: { studioId: string; reciboId: string }) => { creditos.push(p); };
  return { admin: admin as never, updates, seguidos, seguir, creditos, seguirCreditos };
}

// El actor es OBLIGATORIO en la firma: un llamador nuevo que lo olvide no compila.
const ACTOR = { userId: '00000000-0000-4000-8000-000000000001', rol: 'RECEPCION' };
const P = { studioId: 'studio-1', reciboId: 'rec-penaliz-pen-1', ahoraISO: '2026-09-15T09:00:00.000Z', actor: ACTOR };

test('recibo COBRADO a mano (sin Stripe) de una penalización: DEVUELTO con CAS sobre el estado leído, sin reintento programado, y la penalización se pone al día', async () => {
  const m = montar({ recibo: { estado: 'COBRADO', stripe_payment_intent_id: null } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
  // `fecha_devolucion` es `date`: el día en el estudio.
  assert.deepEqual(r, { ok: true, fechaDevolucion: '2026-09-15', yaEstaba: false });
  assert.equal(m.updates.length, 1);
  assert.deepEqual(m.updates[0].fila, { estado: 'DEVUELTO', fecha_devolucion: '2026-09-15', proximo_reintento: null });
  assert.equal(m.updates[0].filtros.studio_id, 'studio-1', 'acotado al estudio de la sesión');
  assert.equal(m.updates[0].filtros.estado, 'COBRADO', 'compare-and-set sobre lo leído');
  assert.deepEqual(m.seguidos, [{ studioId: 'studio-1', reciboId: P.reciboId }]);
});

test('PENDIENTE y FALLIDO también se pueden marcar devueltos', async () => {
  for (const estado of ['PENDIENTE', 'FALLIDO']) {
    const m = montar({ recibo: { estado } });
    const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
    assert.equal(r.ok, true, estado);
    assert.equal(m.updates[0].fila.proximo_reintento, null, `${estado}: sin reintento programado`);
    assert.equal(m.updates[0].filtros.estado, estado, `${estado}: compare-and-set sobre lo leído`);
    assert.equal(m.seguidos.length, 1, estado);
  }
});

test('⚠️ el efectivo, el Bizum y la transferencia no los devuelve ningún banco: 409 y remite a «Le he devuelto el dinero»', async () => {
  // Antes «Devolver» un cobro en efectivo lo dejaba DEVUELTO con 0 devuelto: deuda,
  // reservas bloqueadas por impago y «Cobrar» otra vez en la fila.
  for (const recibo of [
    { estado: 'COBRADO', metodo_cobro: 'EFECTIVO' },
    { estado: 'COBRADO', metodo_cobro: 'BIZUM' },
    { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'EFECTIVO', sepa_estado: 'failed' },
    { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'TRANSFERENCIA', sepa_estado: null },
  ]) {
    const m = montar({ recibo });
    const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
    assert.deepEqual(r, { ok: false, http: 409, error: TEXTO_NO_LO_DEVUELVE_EL_BANCO }, JSON.stringify(recibo));
    assert.equal(m.updates.length + m.seguidos.length, 0, JSON.stringify(recibo));
  }
});

test('lo que sí devuelve un banco: la tarjeta del datáfono, un adeudo que falló y se cobró luego, o sin método', async () => {
  for (const recibo of [
    { estado: 'COBRADO', metodo_cobro: 'TARJETA' },
    { estado: 'COBRADO', metodo_cobro: null },
    { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'SEPA', sepa_estado: 'failed' },
  ]) {
    const m = montar({ recibo });
    const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
    assert.equal(r.ok, true, JSON.stringify(recibo));
    assert.equal(m.seguidos.length, 1, JSON.stringify(recibo));
  }
});

test('un cobro con algo ya devuelto no se da por devuelto por el banco', async () => {
  const m = montar({ recibo: { estado: 'COBRADO', metodo_cobro: 'TARJETA', importe_devuelto: 10 } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
  assert.equal(!r.ok && r.http, 409);
  assert.equal(m.updates.length, 0);
});

test('`desde`: si el recibo ya no está como lo vio quien pulsó, no se toca', async () => {
  const m = montar({ recibo: { estado: 'COBRADO', metodo_cobro: 'TARJETA' } });
  const r = await marcarReciboDevuelto(m.admin, { ...P, desde: 'PENDIENTE' }, m.seguir);
  assert.deepEqual(r, { ok: false, http: 409, error: TEXTO_RECIBO_CAMBIADO });
  assert.equal(m.updates.length, 0);
});

test('la fecha de devolución es la del estudio: a las 00:30 de Madrid es ya el día nuevo', async () => {
  const m = montar({ recibo: { estado: 'PENDIENTE' } });
  const r = await marcarReciboDevuelto(m.admin, { ...P, ahoraISO: '2026-09-14T22:30:00.000Z' }, m.seguir);
  assert.deepEqual(r, { ok: true, fechaDevolucion: '2026-09-15', yaEstaba: false });
  assert.equal(m.updates[0].fila.fecha_devolucion, '2026-09-15');
});

test('qué cuenta como «entró por Stripe»', () => {
  assert.equal(cobroEntroPorStripe({ stripe_payment_intent_id: null, metodo_cobro: 'TARJETA' }), false, 'cobro a mano sin cargo');
  for (const metodo_cobro of ['TARJETA', 'SEPA', 'BIZUM', null]) {
    assert.equal(cobroEntroPorStripe({ stripe_payment_intent_id: 'pi_1', metodo_cobro, sepa_estado: metodo_cobro === 'SEPA' ? 'succeeded' : null }), true, String(metodo_cobro));
  }
  assert.equal(cobroEntroPorStripe({ stripe_payment_intent_id: 'pi_1', metodo_cobro: 'EFECTIVO' }), false);
  assert.equal(cobroEntroPorStripe({ stripe_payment_intent_id: 'pi_1', metodo_cobro: 'TRANSFERENCIA' }), false);
  assert.equal(cobroEntroPorStripe({ stripe_payment_intent_id: 'pi_1', metodo_cobro: 'SEPA', sepa_estado: 'failed' }), false);
});

test('ya estaba DEVUELTO: no reescribe la fecha original, y aun así pone al día la penalización que se quedó atrás', async () => {
  // El caso de los recibos marcados devueltos antes de este arreglo.
  const m = montar({ recibo: { estado: 'DEVUELTO', fecha_devolucion: '2026-09-01T08:00:00.000Z' } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
  assert.deepEqual(r, { ok: true, fechaDevolucion: '2026-09-01T08:00:00.000Z', yaEstaba: true });
  assert.equal(m.updates.length, 0);
  assert.equal(m.seguidos.length, 1);
});

test('⚠️ COBRADO por Stripe: 409 y remite al reembolso; ni recibo ni penalización tocados', async () => {
  const m = montar({ recibo: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1' } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
  assert.deepEqual(r, { ok: false, http: 409, error: TEXTO_COBRO_POR_STRIPE });
  assert.equal(m.updates.length, 0);
  assert.equal(m.seguidos.length, 0);
});

test('EN_CURSO con un cobro de Stripe en marcha: 409, lo cierra su webhook', async () => {
  for (const extra of [{ stripe_payment_intent_id: 'pi_1' }, { checkout_session_id: 'cs_1' }, { cobro_mostrador_pi: 'pi_2' }, { proximo_reintento: '2026-09-20' }]) {
    const m = montar({ recibo: { estado: 'EN_CURSO', ...extra } });
    const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
    assert.deepEqual(r, { ok: false, http: 409, error: TEXTO_COBRO_EN_MARCHA }, JSON.stringify(extra));
    assert.equal(m.updates.length + m.seguidos.length, 0);
  }
});

test('EN_CURSO de una remesa (sin cobro de Stripe): «El banco lo devolvió», sin cobro en marcha también en el UPDATE', async () => {
  const m = montar({ recibo: { estado: 'EN_CURSO' } });
  const r = await marcarReciboDevuelto(m.admin, { ...P, desde: 'EN_CURSO' }, m.seguir);
  assert.equal(r.ok, true);
  assert.equal(m.updates[0].filtros.estado, 'EN_CURSO');
  for (const col of ['proximo_reintento', 'stripe_payment_intent_id', 'checkout_session_id', 'cobro_mostrador_pi']) {
    assert.equal(m.updates[0].filtros[`is:${col}`], null, `${col} a null en el propio UPDATE`);
  }
});

test('inexistente o de otro estudio: 404; lectura con error: 500. Sin tocar nada', async () => {
  const a = montar({ recibo: null });
  assert.equal((r => !r.ok && r.http)(await marcarReciboDevuelto(a.admin, P, a.seguir)), 404);
  const b = montar({ recibo: { estado: 'PENDIENTE' }, errorLectura: true });
  assert.equal((r => !r.ok && r.http)(await marcarReciboDevuelto(b.admin, P, b.seguir)), 500);
  assert.equal(a.updates.length + b.updates.length + a.seguidos.length + b.seguidos.length, 0);
});

test('el UPDATE falla (500) o no casa porque el recibo cambió (409): la pantalla no lo da por devuelto y la penalización no se toca', async () => {
  const a = montar({ recibo: { estado: 'PENDIENTE' }, errorUpdate: true });
  assert.equal((r => !r.ok && r.http)(await marcarReciboDevuelto(a.admin, P, a.seguir)), 500);
  const b = montar({ recibo: { estado: 'PENDIENTE' }, cambiaEntreMedias: true });
  assert.equal((r => !r.ok && r.http)(await marcarReciboDevuelto(b.admin, P, b.seguir)), 409);
  assert.equal(a.seguidos.length + b.seguidos.length, 0);
});

test('recibo que no es de una penalización: se marca y no se busca penalización', async () => {
  const m = montar({ recibo: { estado: 'PENDIENTE' } });
  const r = await marcarReciboDevuelto(m.admin, { ...P, reciboId: 'rec-1' }, m.seguir);
  assert.equal(r.ok, true);
  assert.equal(m.seguidos.length, 0);
});

test('si poner al día la penalización lanza, el recibo sigue devuelto (lo recoge el barrido)', async () => {
  const m = montar({ recibo: { estado: 'PENDIENTE' } });
  const r = await marcarReciboDevuelto(m.admin, P, async () => { throw new Error('boom'); });
  assert.equal(r.ok, true);
});

// Guardianes de cableado.
test('la ruta exige sesión de staff y puedeMoverDinero, y el estudio sale de la sesión', () => {
  const ruta = leer('app/api/cobros/marcar-devuelto/route.ts');
  assert.ok(ruta.includes('verificarSesionStaff(req)'));
  assert.ok(ruta.includes('puedeMoverDinero(sesion.rol)'));
  assert.ok(ruta.includes('studioId: sesion.studioId'), 'nunca del cuerpo de la petición');
  assert.ok(ruta.includes('marcarReciboDevuelto('));
});

test('marcarDevuelto del panel pasa por la ruta, no por un UPDATE directo', () => {
  const ctx = leer('lib/studio-context.tsx');
  const cuerpo = ctx.slice(ctx.indexOf('async function marcarDevuelto('), ctx.indexOf('async function reintentar('));
  assert.ok(cuerpo.includes('marcarReciboDevueltoApi('));
  assert.ok(!cuerpo.includes('dbUpdateRecibo('), 'sin UPDATE directo: la penalización se quedaría COBRADA');
});

test('registrarFalloCobro pone al día la penalización DESPUÉS de comprobar que tocó el recibo, solo en recibos de penalización y sin poder tumbarlo', () => {
  const src = leer('lib/billing/dunning-server.ts');
  const cuerpo = src.slice(src.indexOf('export async function registrarFalloCobro('), src.indexOf('export async function confirmarCobroExitoso('));
  const guardia = cuerpo.indexOf('actualizado.length === 0');
  const soloPenalizacion = cuerpo.indexOf('if (penalizacionDelRecibo(reciboId))');
  const intento = cuerpo.indexOf('try {', soloPenalizacion);
  const llamada = cuerpo.indexOf('seguirPenalizacionAlRecibo(admin, { studioId, reciboId })');
  const captura = cuerpo.indexOf('} catch (e) {', llamada);
  assert.ok(guardia > 0 && soloPenalizacion > guardia, 'solo con el fallo ya registrado en el recibo');
  assert.ok(intento > soloPenalizacion && llamada > intento && captura > llamada, 'dentro de try/catch: el registro del fallo ya está hecho');
});

// Créditos de «Renovar plan»: un recibo devuelto no se queda los que dio.
test('créditos: marcar devuelto pide revertirlos, también si ya estaba DEVUELTO', async () => {
  for (const estado of ['COBRADO', 'DEVUELTO']) {
    const m = montar({ recibo: { estado, stripe_payment_intent_id: null } });
    const r = await marcarReciboDevuelto(m.admin, { ...P, reciboId: 'rec-renov-sus-1-2026-09' }, m.seguir, m.seguirCreditos);
    assert.equal(r.ok, true, estado);
    assert.deepEqual(m.creditos, [{ studioId: 'studio-1', reciboId: 'rec-renov-sus-1-2026-09' }], estado);
  }
});

test('créditos: si el recibo no llega a DEVUELTO (Stripe, EN_CURSO, carrera, error), no se tocan', async () => {
  const casos: Opciones[] = [
    { recibo: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'TARJETA' } },
    { recibo: { estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_1' } },
    { recibo: { estado: 'COBRADO', metodo_cobro: 'EFECTIVO' } },
    { recibo: { estado: 'COBRADO' }, cambiaEntreMedias: true },
    { recibo: { estado: 'COBRADO' }, errorUpdate: true },
    { recibo: null },
  ];
  for (const o of casos) {
    const m = montar(o);
    const r = await marcarReciboDevuelto(m.admin, P, m.seguir, m.seguirCreditos);
    assert.equal(r.ok, false, JSON.stringify(o));
    assert.equal(m.creditos.length, 0, JSON.stringify(o));
  }
});

test('créditos: un fallo al sincronizarlos no tumba «marcar devuelto»', async () => {
  const m = montar({ recibo: { estado: 'COBRADO' } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir, async () => { throw new Error('RPC caída'); });
  assert.equal(r.ok, true);
});

// ── Libro de auditoría ──────────────────────────────────────────────────────
// Antes, marcar devuelto pasaba por servidor con service-role y el trigger del
// libro (que solo ve sesiones de persona) no lo veía: nadie sabía QUIÉN lo hizo.

function registrador() {
  const entradas: Array<Record<string, unknown>> = [];
  return { entradas, registrar: async (_admin: unknown, e: Record<string, unknown>) => { entradas.push(e); } };
}

test('libro: al marcar devuelto anota quién, el estado de antes y de después, y de qué recibo', async () => {
  const m = montar({ recibo: {
    estado: 'COBRADO', stripe_payment_intent_id: null,
    socio_id: 'soc-1', concepto: 'Mensual Ilimitado — Jul 2026', importe: 85, fecha_vencimiento: '2026-07-01', proximo_reintento: null,
  } as never });
  const l = registrador();
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir, m.seguirCreditos, l.registrar as never);
  assert.equal(r.ok, true);
  assert.equal(l.entradas.length, 1);
  assert.deepEqual(l.entradas[0], {
    // Persona, sede y rol juntos, en un solo objeto.
    sesion: { userId: ACTOR.userId, rol: ACTOR.rol, studioId: 'studio-1' },
    tabla: 'recibos', filaId: P.reciboId, operacion: 'UPDATE', socioId: 'soc-1',
    antes: { estado: 'COBRADO', fecha_devolucion: null, proximo_reintento: null },
    // `fecha_devolucion` es una columna `date`: se anota el día que la base guarda, no el instante.
    despues: { estado: 'DEVUELTO', fecha_devolucion: '2026-09-15', proximo_reintento: null },
    contexto: { accion: 'RECIBO_MARCADO_DEVUELTO', concepto: 'Mensual Ilimitado — Jul 2026', fecha_vencimiento: '2026-07-01', importe: 85 },
  });
});

test('libro: no anota si ya estaba devuelto, si otro proceso lo cambió ni si el UPDATE falla', async () => {
  const casos: Array<[string, Parameters<typeof montar>[0]]> = [
    ['ya estaba DEVUELTO', { recibo: { estado: 'DEVUELTO', fecha_devolucion: '2026-09-01T00:00:00Z' } }],
    ['otro proceso lo cambió entre medias', { recibo: { estado: 'COBRADO' }, cambiaEntreMedias: true }],
    ['el UPDATE falla', { recibo: { estado: 'COBRADO' }, errorUpdate: true }],
  ];
  for (const [nombre, opciones] of casos) {
    const m = montar(opciones);
    const l = registrador();
    await marcarReciboDevuelto(m.admin, P, m.seguir, m.seguirCreditos, l.registrar as never);
    assert.equal(l.entradas.length, 0, nombre);
  }
});

test('libro: la ruta pasa como actor la SESIÓN, no lo que diga el cuerpo', () => {
  const ruta = leer('app/api/cobros/marcar-devuelto/route.ts');
  assert.match(ruta, /actor:\s*\{\s*userId:\s*sesion\.userId,\s*rol:\s*sesion\.rol\s*\}/);
  assert.doesNotMatch(ruta, /body\.(userId|actor|rol)/);
});

// ── «Reintentar por el banco» ───────────────────────────────────────────────
// Antes el panel ponía el recibo EN_CURSO («Enviado al banco») sin mandar nada a
// ningún banco, y ahí se quedaba. Ahora vuelve a PENDIENTE y lo recoge la remesa.

function montarReintento(o: {
  recibo: Fila | null;
  estudio?: Fila | null;
  mandatos?: Fila[];
  noCasa?: boolean;
}) {
  const updates: { fila: Fila; filtros: Record<string, unknown> }[] = [];
  const admin = {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      let filaUpdate: Fila | null = null;
      const c = {
        select() { return c; },
        update(fila: Fila) { filaUpdate = fila; return c; },
        eq(campo: string, valor: unknown) { filtros[campo] = valor; return c; },
        is(campo: string, valor: unknown) { filtros[`is:${campo}`] = valor; return c; },
        limit() { return Promise.resolve({ data: tabla === 'mandatos_sepa' ? (o.mandatos ?? []) : [], error: null }); },
        maybeSingle() {
          if (filaUpdate) {
            updates.push({ fila: filaUpdate, filtros });
            return Promise.resolve({ data: o.noCasa ? null : { id: 'x' }, error: null });
          }
          if (tabla === 'studios') return Promise.resolve({ data: o.estudio === undefined ? { sepa_acreedor_id: 'ES00', sepa_iban: 'ES12', sepa_titular: 'Estudio' } : o.estudio, error: null });
          return Promise.resolve({ data: o.recibo, error: null });
        },
      };
      return c;
    },
  };
  const entradas: Array<Record<string, unknown>> = [];
  const registrar = async (_a: unknown, e: Record<string, unknown>) => { entradas.push(e); };
  return { admin: admin as never, updates, entradas, registrar: registrar as never };
}

const DEVUELTO_POR_EL_BANCO = { estado: 'DEVUELTO', importe: 45, importe_devuelto: 0, reembolso_stripe_id: null, reembolso_solicitado_en: null, socio_id: 'soc-1', intentos_reintento: 1, concepto: 'Mensual' };
const PR = { studioId: 'studio-1', reciboId: 'rec-1', actor: ACTOR };

test('reintentar por el banco: vuelve a PENDIENTE para la próxima remesa, con compare-and-set y su entrada en el libro', async () => {
  const m = montarReintento({ recibo: DEVUELTO_POR_EL_BANCO, mandatos: [{ id: 'm-1' }] });
  const r = await reintentarPorElBanco(m.admin, PR, m.registrar);
  assert.deepEqual(r, { ok: true, intentosReintento: 2 });
  assert.deepEqual(m.updates[0].fila, { estado: 'PENDIENTE', intentos_reintento: 2, proximo_reintento: null }, 'PENDIENTE, nunca EN_CURSO sin nada en el banco');
  assert.equal(m.updates[0].filtros.estado, 'DEVUELTO');
  assert.equal(m.updates[0].filtros.intentos_reintento, 1);
  assert.equal(m.updates[0].filtros.importe_devuelto, 0);
  assert.equal(m.entradas.length, 1);
  assert.equal((m.entradas[0].contexto as Record<string, unknown>).accion, 'RECIBO_REINTENTADO_POR_BANCO');
});

test('reintentar por el banco: sin domiciliaciones o sin mandato vigente no entraría en la remesa, y se dice', async () => {
  const sinEstudio = montarReintento({ recibo: DEVUELTO_POR_EL_BANCO, estudio: { sepa_acreedor_id: null, sepa_iban: null, sepa_titular: null }, mandatos: [{ id: 'm-1' }] });
  assert.equal((r => !r.ok && r.http)(await reintentarPorElBanco(sinEstudio.admin, PR, sinEstudio.registrar)), 409);
  const sinMandato = montarReintento({ recibo: DEVUELTO_POR_EL_BANCO, mandatos: [] });
  assert.equal((r => !r.ok && r.http)(await reintentarPorElBanco(sinMandato.admin, PR, sinMandato.registrar)), 409);
  assert.equal(sinEstudio.updates.length + sinMandato.updates.length, 0);
});

test('reintentar por el banco: un reembolso (dinero que el estudio devolvió) nunca se reintenta', async () => {
  for (const recibo of [
    { ...DEVUELTO_POR_EL_BANCO, importe_devuelto: 45 },
    { ...DEVUELTO_POR_EL_BANCO, reembolso_stripe_id: 're_1' },
    { ...DEVUELTO_POR_EL_BANCO, estado: 'COBRADO' },
  ]) {
    const m = montarReintento({ recibo, mandatos: [{ id: 'm-1' }] });
    const r = await reintentarPorElBanco(m.admin, PR, m.registrar);
    assert.equal(!r.ok && r.http, 409, JSON.stringify(recibo));
    assert.equal(m.updates.length + m.entradas.length, 0);
  }
});

test('reintentar por el banco: si el recibo cambió entre medias, 409 y sin entrada en el libro', async () => {
  const m = montarReintento({ recibo: DEVUELTO_POR_EL_BANCO, mandatos: [{ id: 'm-1' }], noCasa: true });
  const r = await reintentarPorElBanco(m.admin, PR, m.registrar);
  assert.deepEqual(r, { ok: false, http: 409, error: TEXTO_RECIBO_CAMBIADO });
  assert.equal(m.entradas.length, 0);
});
