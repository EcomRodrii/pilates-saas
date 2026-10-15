import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { convertirAGratisSiToca, cerrarPlanGratis, type FilaParaGratis } from './convertir-a-gratis.ts';

interface CadenaFalsa { subscription_status: string | null; subscription_id: string | null; stripe_customer_id: string | null }

// Un cliente falso que anota cada escritura con sus filtros y contesta lo que se le diga.
// Las lecturas: la cadena (`cadena`) y la sede más antigua de la cadena (`principal`).
function adminFalso(opciones: { filasActualizadas?: number; cadena?: CadenaFalsa | null; principal?: string; otraGratis?: boolean; lecturaFalla?: boolean } = {}) {
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
  const lecturas: string[] = [];
  const lectura = (tabla: string) => {
    lecturas.push(tabla);
    const error = opciones.lecturaFalla ? { message: 'caída' } : null;
    let deGratis = false; // la lectura de «otra sede ya en el gratis» filtra por estado
    const q: Record<string, unknown> = {
      eq: () => q,
      neq: () => q,
      in: (c: string) => { deGratis = c === 'subscription_status'; return q; },
      order: () => q,
      maybeSingle: async () => ({ data: error ? null : (opciones.cadena ?? null), error }),
      limit: async () => {
        if (error) return { data: null, error };
        if (deGratis) return { data: opciones.otraGratis ? [{ id: 'st-gratis' }] : [], error: null };
        return { data: opciones.principal ? [{ id: opciones.principal }] : [], error: null };
      },
    };
    return q;
  };
  const admin = {
    from: (tabla: string) => ({
      select: () => lectura(tabla),
      update: (v: unknown) => cadena(tabla, 'update', v),
      delete: () => cadena(tabla, 'delete'),
    }),
  } as unknown as SupabaseClient;
  return { admin, escrituras, lecturas };
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

test('una prueba agotada pasa a gratis, con compare-and-set contra lo leído', async () => {
  const { admin, escrituras } = adminFalso();
  assert.equal(await convertirAGratisSiToca(admin, fila(), { entorno: encendido, stripe: null }), 'convertido');
  const upd = escrituras.find(e => e.tabla === 'studios' && e.op === 'update')!;
  assert.deepEqual(upd.valores, { subscription_status: 'gratis', plan: 'BASE' });
  assert.ok(upd.filtros.includes('subscription_status=trial_expirado'));
  assert.ok(upd.filtros.includes('subscription_id is null'));
  assert.ok(upd.filtros.includes('cadena_id is null'));
});

test('una suscripción cancelada conserva su id: se compara con él, no se exige null; y la medición empieza de cero', async () => {
  const { admin, escrituras } = adminFalso();
  const r = await convertirAGratisSiToca(admin, fila({ subscription_status: 'canceled', subscription_id: 'sub_viejo', stripe_customer_id: 'cus_1' }), { entorno: encendido, stripe: stripeCon(['canceled']) });
  assert.equal(r, 'convertido');
  const upd = escrituras.find(e => e.tabla === 'studios')!;
  assert.ok(upd.filtros.includes('subscription_id=sub_viejo'));
  assert.ok(escrituras.some(e => e.tabla === 'uso_plan_gratis' && e.op === 'delete'), 'tras un periodo pagado, de cero');
});

test('la medición solo se borra tras un periodo pagado: un pago abandonado no reabre un gratis_cerrado con 30 días más', async () => {
  for (const estado of ['incomplete_expired', 'trial_expirado', null]) {
    const { admin, escrituras } = adminFalso();
    const r = await convertirAGratisSiToca(admin, fila({ subscription_status: estado, subscription_id: estado === 'incomplete_expired' ? 'sub_abandonada' : null }), { entorno: encendido, stripe: null });
    assert.equal(r, 'convertido', String(estado));
    assert.equal(escrituras.filter(e => e.tabla === 'uso_plan_gratis').length, 0, String(estado));
  }
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

test('nunca una sede sin saber de su cadena, una impagada, lo que paga ni quien pidió borrar sus datos', async () => {
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

// ─── Una cadena que deja de pagar (decisión del fundador, 15-oct-2026) ───────
const cadenaSinPagar: CadenaFalsa = { subscription_status: 'canceled', subscription_id: 'sub_cadena', stripe_customer_id: 'cus_cadena' };
const sede = (o: Partial<FilaParaGratis> = {}) => fila({ id: 'st-1', subscription_status: 'canceled', cadena_id: 'cad-1', ...o });

test('cadena que no paga: su sede principal pasa a gratis, con compare-and-set contra su cadena', async () => {
  const { admin, escrituras } = adminFalso({ cadena: cadenaSinPagar, principal: 'st-1' });
  const r = await convertirAGratisSiToca(admin, sede(), { entorno: encendido, stripe: stripeCon(['canceled']) });
  assert.equal(r, 'convertido');
  const upd = escrituras.find(e => e.tabla === 'studios' && e.op === 'update')!;
  assert.deepEqual(upd.valores, { subscription_status: 'gratis', plan: 'BASE' });
  assert.ok(upd.filtros.includes('cadena_id=cad-1'));
  assert.ok(upd.filtros.includes('subscription_status=canceled'));
  assert.ok(!upd.filtros.includes('cadena_id is null'));
});

test('cadena que no paga: las demás sedes no pasan a gratis (siguen cerradas)', async () => {
  const { admin, escrituras } = adminFalso({ cadena: cadenaSinPagar, principal: 'st-otra' });
  assert.equal(await convertirAGratisSiToca(admin, sede(), { entorno: encendido, stripe: stripeCon([]) }), 'no-toca');
  assert.equal(escrituras.length, 0);
});

test('cadena que paga (o vuelve a pagar): ninguna sede pasa a gratis, ni la principal', async () => {
  for (const estado of ['active', 'past_due', 'unpaid', 'incomplete']) {
    // La sede con su propio estado (lo que le propagó la cadena) y con uno desfasado:
    // manda lo que diga la cadena.
    for (const estadoSede of [estado, 'canceled']) {
      const { admin, escrituras } = adminFalso({ cadena: { ...cadenaSinPagar, subscription_status: estado }, principal: 'st-1' });
      assert.equal(await convertirAGratisSiToca(admin, sede({ subscription_status: estadoSede }), { entorno: encendido, stripe: stripeCon([]) }), 'no-toca', `${estado}/${estadoSede}`);
      assert.equal(escrituras.length, 0, estado);
    }
  }
});

test('con el interruptor apagado, la principal de una cadena sin pagar tampoco: ni se lee la cadena', async () => {
  const { admin, escrituras, lecturas } = adminFalso({ cadena: cadenaSinPagar, principal: 'st-1' });
  assert.equal(await convertirAGratisSiToca(admin, sede(), { entorno: {}, stripe: null }), 'no-toca');
  assert.equal(escrituras.length + lecturas.length, 0);
});

test('si Stripe tiene viva la suscripción de la CADENA (webhook perdido), la principal no se convierte', async () => {
  const { admin, escrituras } = adminFalso({ cadena: cadenaSinPagar, principal: 'st-1' });
  const vistos: string[] = [];
  const stripe = {
    subscriptions: { list: async ({ customer }: { customer: string }) => { vistos.push(customer); return { data: customer === 'cus_cadena' ? [{ id: 'sub_c', status: 'active' }] : [] }; } },
    checkout: { sessions: { list: async () => ({ data: [] }) } },
  } as never;
  const r = await convertirAGratisSiToca(admin, sede({ stripe_customer_id: 'cus_sede' }), { entorno: encendido, stripe });
  assert.equal(r, 'paga-en-stripe');
  assert.deepEqual(vistos, ['cus_sede', 'cus_cadena']);
  assert.equal(escrituras.length, 0);
});

test('una sede cuya cadena no se puede leer ni se convierte ni se da por decidida', async () => {
  const { admin, escrituras } = adminFalso({ lecturaFalla: true });
  assert.equal(await convertirAGratisSiToca(admin, sede(), { entorno: encendido, stripe: null }), 'sin-leer-la-cadena');
  assert.equal(escrituras.length, 0);
});

test('nunca dos sedes gratis en la misma cadena: si otra ya lo está, la principal no se convierte', async () => {
  const { admin, escrituras } = adminFalso({ cadena: cadenaSinPagar, principal: 'st-1', otraGratis: true });
  assert.equal(await convertirAGratisSiToca(admin, sede(), { entorno: encendido, stripe: stripeCon([]) }), 'no-toca');
  assert.equal(escrituras.length, 0);
});
