import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accionCobroDatafono, enVuelo, liberacionDatafono, MINUTOS_ANTES_DE_RESOLVER_DATAFONO } from './barrido-datafono-reglas.ts';

const AHORA = 1_800_000_000;
const VIEJO = AHORA - (MINUTOS_ANTES_DE_RESOLVER_DATAFONO + 1) * 60;
const pi = (o: Record<string, unknown> = {}, md: Record<string, string> = {}) => ({
  status: 'requires_payment_method', created: VIEJO,
  metadata: { origen: 'pos_terminal', studioId: 'st-1', ventaId: 'v-1', ...md }, ...o,
}) as unknown as Parameters<typeof accionCobroDatafono>[0];

test('qué hace el conciliador con cada cobro del datáfono', () => {
  assert.equal(accionCobroDatafono(pi({ status: 'succeeded' }), 'st-1', AHORA), 'cerrar');
  assert.equal(accionCobroDatafono(pi({ status: 'canceled' }), 'st-1', AHORA), 'liberar');
  assert.equal(accionCobroDatafono(pi(), 'st-1', AHORA), 'mirar');
  assert.equal(accionCobroDatafono(pi({}, { ventaId: '', reciboId: 'r-1' }), 'st-1', AHORA), 'mirar');
  // En vuelo de verdad: no se toca.
  for (const status of ['processing', 'requires_capture', 'requires_confirmation', 'requires_action']) {
    assert.equal(accionCobroDatafono(pi({ status }), 'st-1', AHORA), null, status);
  }
});

test('⚠️ el conciliador no toca un cobro reciente (la Caja y el lector siguen con él), ni uno ajeno', () => {
  assert.equal(accionCobroDatafono(pi({ created: AHORA - 60 }), 'st-1', AHORA), null, 'reciente');
  assert.equal(accionCobroDatafono(pi({}, { origen: 'pos_bizum' }), 'st-1', AHORA), null, 'Bizum va por su lado');
  assert.equal(accionCobroDatafono(pi({}, { studioId: 'st-otro' }), 'st-1', AHORA), null, 'otro estudio');
  assert.equal(accionCobroDatafono(pi({}, { ventaId: '' }), 'st-1', AHORA), null, 'sin venta ni recibo');
});

test('lo que anula el conciliador lleva motivo en español y el estado del cobro ya cerrado', () => {
  assert.deepEqual(liberacionDatafono('rechazado', { code: 'card_declined', decline_code: 'insufficient_funds' }).pagoEstado, 'RECHAZADO');
  assert.match(liberacionDatafono('rechazado', { code: 'card_declined', decline_code: 'insufficient_funds' }).motivo, /saldo suficiente/);
  // Sin afirmar lo que no se sabe (pudo haber un rechazo entre medias): solo que no se cobró.
  assert.deepEqual(liberacionDatafono('abandonado'), { motivo: 'El cobro no llegó a completarse en el datáfono. No se ha cobrado nada.', pagoEstado: 'CANCELADO' });
  assert.equal(liberacionDatafono('cancelado').pagoEstado, 'CANCELADO');
});

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('⚠️ el aviso payment_failed del datáfono solo anula con el cobro cerrado en Stripe, y nunca cae al camino de Bizum', () => {
  const f = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/stripe/webhook/route.ts'), 'utf8'));
  const rama = f.indexOf("if (pi.metadata?.origen === 'pos_terminal') {");
  const sinCuenta = f.indexOf("return NextResponse.json({ error: 'Cuenta Connect no autorizada para este estudio' }, { status: 403 });", rama);
  const sinLector = f.indexOf('if (errLector || !readerId) return NextResponse.json({ received: true });', sinCuenta);
  const cierre = f.indexOf('await cerrarSiRechazadoDatafono(stripe, pi.id, event.account, readerId)', sinLector);
  const corte = f.indexOf("if (!cierre || cierre.veredicto !== 'rechazado') return NextResponse.json({ received: true });", cierre);
  const anula = f.indexOf("pagoEstado: 'RECHAZADO',", corte);
  const fin = f.indexOf('return NextResponse.json({ received: true });', anula);
  const bizum = f.indexOf('await liberarCobroPosFallidoDelWebhook(', rama);
  assert.ok(rama > 0 && sinCuenta > rama && sinLector > sinCuenta && cierre > sinLector && corte > cierre && anula > corte,
    'cuenta autorizada → lector conocido → cerrar → solo con rechazado se anula');
  assert.ok(fin > anula && bizum > fin, 'la rama del datáfono termina antes del camino de Bizum');
});

test('⚠️ el barrido solo toca lo que la base sigue teniendo en vuelo con ESE cobro', () => {
  const c = (piId: string, md: Record<string, string>) => ({ pi: { id: piId, metadata: md } });
  const candidatos = [
    c('pi_venta_viva', { ventaId: 'v-1' }),
    c('pi_venta_vieja', { ventaId: 'v-2' }), // la venta lleva ya otro cobro
    c('pi_venta_cerrada', { ventaId: 'v-3' }), // ya no está en PENDIENTE_PAGO (no vuelve en la consulta)
    c('pi_recibo_vivo', { reciboId: 'r-1' }),
    c('pi_recibo_viejo', { reciboId: 'r-2' }), // el recibo ya va por otro intento
    c('pi_recibo_suelto', { reciboId: 'r-3' }), // sin cobro en vuelo
  ];
  const vivos = enVuelo(candidatos,
    [{ id: 'v-1', stripe_payment_intent_id: 'pi_venta_viva' }, { id: 'v-2', stripe_payment_intent_id: 'pi_otro' }],
    [{ id: 'r-1', cobro_mostrador_pi: 'pi_recibo_vivo' }, { id: 'r-2', cobro_mostrador_pi: 'pi_nuevo' }, { id: 'r-3', cobro_mostrador_pi: null }]);
  assert.deepEqual(vivos.map(v => v.pi.id), ['pi_venta_viva', 'pi_recibo_vivo']);
  // Un id de venta y de recibo iguales no se confunden.
  assert.deepEqual(enVuelo([c('pi_x', { reciboId: 'id-1' })], [{ id: 'id-1', stripe_payment_intent_id: 'pi_x' }], []), []);
});

test('el conciliador horario resuelve los cobros del datáfono colgados', () => {
  const f = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'lib/inngest/conciliar-cobros.ts'), 'utf8'));
  assert.match(f, /await resolverCobrosDatafonoColgados\(admin, stripe, studio, \[\.\.\.piPorId\.values\(\)\]\)/);
});
