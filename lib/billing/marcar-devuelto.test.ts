import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cobroEntroPorStripe, marcarReciboDevuelto, TEXTO_COBRO_POR_STRIPE } from './marcar-devuelto.ts';

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
    metodo_cobro?: string | null; sepa_estado?: string | null;
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
  return { admin: admin as never, updates, seguidos, seguir };
}

const P = { studioId: 'studio-1', reciboId: 'rec-penaliz-pen-1', ahoraISO: '2026-09-15T09:00:00.000Z' };

test('recibo COBRADO a mano (sin Stripe) de una penalización: DEVUELTO con CAS sobre el estado leído, sin reintento programado, y la penalización se pone al día', async () => {
  const m = montar({ recibo: { estado: 'COBRADO', stripe_payment_intent_id: null } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
  assert.deepEqual(r, { ok: true, fechaDevolucion: P.ahoraISO, yaEstaba: false });
  assert.equal(m.updates.length, 1);
  assert.deepEqual(m.updates[0].fila, { estado: 'DEVUELTO', fecha_devolucion: P.ahoraISO, proximo_reintento: null });
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

test('⚠️ COBRADO con id de Stripe pero sin dinero por Stripe (adeudo fallido y pagado en efectivo): SÍ se puede devolver', async () => {
  for (const recibo of [
    { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'EFECTIVO', sepa_estado: 'failed' },
    { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'TRANSFERENCIA', sepa_estado: null },
    { estado: 'COBRADO', stripe_payment_intent_id: 'pi_1', metodo_cobro: 'SEPA', sepa_estado: 'failed' },
  ]) {
    const m = montar({ recibo });
    const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
    assert.equal(r.ok, true, JSON.stringify(recibo));
    assert.equal(m.seguidos.length, 1, JSON.stringify(recibo));
  }
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

test('EN_CURSO: 409, hay un cobro saliendo', async () => {
  const m = montar({ recibo: { estado: 'EN_CURSO' } });
  const r = await marcarReciboDevuelto(m.admin, P, m.seguir);
  assert.equal(!r.ok && r.http, 409);
  assert.equal(m.updates.length, 0);
  assert.equal(m.seguidos.length, 0);
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
