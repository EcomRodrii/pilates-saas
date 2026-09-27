import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarCompraEnEmbudo, sesionWidgetValida, idEventoCompra } from './compra-en-embudo.ts';

const SESION = '3f2b8c1e-9a4d-4e2b-8f1a-2c3d4e5f6a7b';

function falso(error: { code?: string; message: string } | null = null) {
  const llamadas: { fila: Record<string, unknown>; opciones: unknown }[] = [];
  const admin = {
    from(tabla: string) {
      assert.equal(tabla, 'widget_eventos');
      return { upsert(fila: Record<string, unknown>, opciones: unknown) { llamadas.push({ fila, opciones }); return Promise.resolve({ error }); } };
    },
  } as unknown as SupabaseClient;
  return { admin, llamadas };
}

test('una compra del widget se anota como booking_completed, con id por pago (idempotente) y su etiqueta', async () => {
  const { admin, llamadas } = falso();
  await registrarCompraEnEmbudo(admin, { studioId: 'st', idPago: 'cs_123', widgetSesion: SESION, origen: 'web-planes', sesionClaseId: 'ses-1', socioId: 'soc-1' });
  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].fila, {
    id: idEventoCompra('cs_123'), studio_id: 'st', session_id: SESION, tipo: 'booking_completed',
    sesion_clase_id: 'ses-1', origen: 'web-planes', socio_id: 'soc-1',
  });
  assert.deepEqual(llamadas[0].opciones, { onConflict: 'id', ignoreDuplicates: true });
});

test('sin sesión del widget (app de la alumna, compras antiguas) no se inventa nada', async () => {
  for (const widgetSesion of [null, undefined, '', 'no-es-uuid', `${SESION}x`]) {
    const { admin, llamadas } = falso();
    await registrarCompraEnEmbudo(admin, { studioId: 'st', idPago: 'pi_1', widgetSesion, origen: null });
    assert.equal(llamadas.length, 0, String(widgetSesion));
  }
});

test('una etiqueta con formato raro se guarda como null, sin perder la compra', async () => {
  const { admin, llamadas } = falso();
  await registrarCompraEnEmbudo(admin, { studioId: 'st', idPago: 'pi_1', widgetSesion: SESION, origen: '<b>x</b>' });
  assert.equal(llamadas[0].fila.origen, null);
});

test('⚠️ nunca lanza: la analítica no puede tumbar una entrega con el dinero cobrado', async () => {
  const { admin } = falso({ code: '57014', message: 'timeout' });
  await assert.doesNotReject(registrarCompraEnEmbudo(admin, { studioId: 'st', idPago: 'pi_1', widgetSesion: SESION, origen: null }));
  const roto = { from() { throw new Error('boom'); } } as unknown as SupabaseClient;
  await assert.doesNotReject(registrarCompraEnEmbudo(roto, { studioId: 'st', idPago: 'pi_1', widgetSesion: SESION, origen: null }));
});

test('sesionWidgetValida solo acepta el uuid del widget', () => {
  assert.equal(sesionWidgetValida(SESION), SESION);
  assert.equal(sesionWidgetValida(42), null);
  assert.equal(sesionWidgetValida('a'.repeat(36)), null);
});

// ── El cableado: los dos checkouts la meten en la metadata, las tres entregas la leen ──
const fuente = (r: string) => readFileSync(join(import.meta.dirname, '../..', r), 'utf8');

test('los dos checkouts gemelos ponen la sesión validada en la metadata', () => {
  for (const r of ['app/api/public/checkout-embebido/route.ts', 'app/api/stripe/checkout/route.ts']) {
    const f = fuente(r);
    assert.ok(f.includes('sesionWidgetValida(body.widgetSesion)'), r);
    assert.ok(f.includes('metadata.widgetSesion = widgetSesion'), r);
  }
});

test('las tres entregas (webhook ×2 y conciliador) pasan la sesión; la anota entregarPlanComprado', () => {
  assert.equal(fuente('app/api/stripe/webhook/route.ts').split('widgetSesion:').length - 1, 2);
  assert.ok(fuente('lib/inngest/conciliar-cobros.ts').includes('widgetSesion:'));
  assert.ok(fuente('lib/billing/entregar-plan-comprado.ts').includes('await registrarCompraEnEmbudo(admin, {'));
});

test('⚠️ el navegador ya no anota la compra (contaría dos veces): solo las reservas sin pago', () => {
  const f = fuente('app/reservar/[slug]/page.tsx');
  const pago = f.slice(f.indexOf('async function handlePagoExitoso()'));
  assert.ok(!pago.slice(0, pago.indexOf('\n  }\n')).includes("'booking_completed'"));
  assert.equal(f.split('widgetSesion: sessionIdWidget()').length - 1, 3, 'los tres fetch de pago mandan la sesión');
});
