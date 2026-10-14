import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { convertirAGratisSiToca, cerrarPlanGratis, type FilaParaGratis } from './convertir-a-gratis.ts';

// Un cliente falso que anota cada escritura con sus filtros y contesta lo que se le diga.
function adminFalso(opciones: { filasActualizadas?: number } = {}) {
  const escrituras: { tabla: string; op: string; valores?: unknown; filtros: string[] }[] = [];
  const cadena = (tabla: string, op: string, valores?: unknown) => {
    const filtros: string[] = [];
    const e = { tabla, op, valores, filtros };
    escrituras.push(e);
    const q: Record<string, unknown> = {
      eq: (c: string, v: unknown) => { filtros.push(`${c}=${v}`); return q; },
      is: (c: string, v: unknown) => { filtros.push(`${c} is ${v}`); return q; },
      select: async () => ({ data: Array.from({ length: opciones.filasActualizadas ?? 1 }, () => ({ id: 'x' })), error: null }),
      then: (r: (v: unknown) => void) => r({ data: null, error: null }),
    };
    return q;
  };
  const admin = {
    from: (tabla: string) => ({
      update: (v: unknown) => cadena(tabla, 'update', v),
      delete: () => cadena(tabla, 'delete'),
    }),
  } as unknown as SupabaseClient;
  return { admin, escrituras };
}

const stripeCon = (estados: string[]) => ({
  subscriptions: { list: async () => ({ data: estados.map((status, i) => ({ id: `sub_${i}`, status })) }) },
  checkout: { sessions: { list: async () => ({ data: [] }) } },
}) as never;

const fila = (o: Partial<FilaParaGratis> = {}): FilaParaGratis => ({
  id: 'st-1', subscription_status: 'trial_expirado', subscription_id: null, cadena_id: null, stripe_customer_id: null, supresion_pedida_en: null, ...o,
});
const encendido = { FOUNDING_GRATIS: 'estudios:st-1' };

test('con el interruptor apagado no toca nada', async () => {
  const { admin, escrituras } = adminFalso();
  assert.equal(await convertirAGratisSiToca(admin, fila(), { entorno: {}, stripe: null }), 'no-toca');
  assert.equal(escrituras.length, 0);
});

test('una prueba agotada pasa a gratis, con compare-and-set contra lo leído, y se borra la medición vieja', async () => {
  const { admin, escrituras } = adminFalso();
  assert.equal(await convertirAGratisSiToca(admin, fila(), { entorno: encendido, stripe: null }), 'convertido');
  const upd = escrituras.find(e => e.tabla === 'studios' && e.op === 'update')!;
  assert.deepEqual(upd.valores, { subscription_status: 'gratis', plan: 'BASE' });
  assert.ok(upd.filtros.includes('subscription_status=trial_expirado'));
  assert.ok(upd.filtros.includes('subscription_id is null'));
  assert.ok(upd.filtros.includes('cadena_id is null'));
  assert.ok(escrituras.some(e => e.tabla === 'uso_plan_gratis' && e.op === 'delete'));
});

test('una suscripción cancelada conserva su id: se compara con él, no se exige null', async () => {
  const { admin, escrituras } = adminFalso();
  const r = await convertirAGratisSiToca(admin, fila({ subscription_status: 'canceled', subscription_id: 'sub_viejo', stripe_customer_id: 'cus_1' }), { entorno: encendido, stripe: stripeCon(['canceled']) });
  assert.equal(r, 'convertido');
  const upd = escrituras.find(e => e.tabla === 'studios')!;
  assert.ok(upd.filtros.includes('subscription_id=sub_viejo'));
});

test('si Stripe tiene una suscripción viva (webhook perdido), no se convierte', async () => {
  const { admin, escrituras } = adminFalso();
  const r = await convertirAGratisSiToca(admin, fila({ subscription_status: 'trialing', stripe_customer_id: 'cus_1' }), { entorno: encendido, stripe: stripeCon(['active']) });
  assert.equal(r, 'paga-en-stripe');
  assert.equal(escrituras.length, 0);
});

test('si Stripe no contesta, tampoco: mejor un día más sin gratis que quitarle a alguien lo que paga', async () => {
  const { admin, escrituras } = adminFalso();
  const caido = { subscriptions: { list: async () => { throw new Error('caído'); } }, checkout: { sessions: { list: async () => ({ data: [] }) } } } as never;
  assert.equal(await convertirAGratisSiToca(admin, fila({ stripe_customer_id: 'cus_1' }), { entorno: encendido, stripe: caido }), 'sin-respuesta-de-stripe');
  assert.equal(await convertirAGratisSiToca(admin, fila({ stripe_customer_id: 'cus_1' }), { entorno: encendido, stripe: null }), 'sin-respuesta-de-stripe');
  assert.equal(escrituras.length, 0);
});

test('nunca una sede, una impagada, lo que paga ni quien pidió borrar sus datos', async () => {
  const { admin, escrituras } = adminFalso();
  for (const f of [
    fila({ cadena_id: 'cad-1' }),
    fila({ subscription_status: 'unpaid', subscription_id: 'sub_1' }),
    fila({ subscription_status: 'active', subscription_id: 'sub_1' }),
    fila({ supresion_pedida_en: '2026-10-01T00:00:00Z' }),
  ]) assert.equal(await convertirAGratisSiToca(admin, f, { entorno: encendido, stripe: null }), 'no-toca');
  assert.equal(escrituras.length, 0);
});

test('si el webhook escribió algo en medio, no se pisa ni se borra nada', async () => {
  const { admin, escrituras } = adminFalso({ filasActualizadas: 0 });
  assert.equal(await convertirAGratisSiToca(admin, fila(), { entorno: encendido, stripe: null }), 'cambio-en-medio');
  assert.equal(escrituras.filter(e => e.op === 'delete').length, 0);
});

test('cerrar solo pasa de gratis a gratis_cerrado', async () => {
  const { admin, escrituras } = adminFalso();
  assert.equal(await cerrarPlanGratis(admin, 'st-1'), true);
  const upd = escrituras[0];
  assert.deepEqual(upd.valores, { subscription_status: 'gratis_cerrado' });
  assert.ok(upd.filtros.includes('subscription_status=gratis'));
});
