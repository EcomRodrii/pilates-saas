import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { entregarExternos, resumenFallos } from './process.ts';

// ─────────────────────────────────────────────────────────────────────────────
// `entregarExternos` no tenía NINGÚN test, y manda emails y push de verdad.
// Estos fijan lo que no puede cambiar al agrupar las consultas:
//   · una notificación que ya tiene delivery externo NO se reenvía;
//   · un id repetido en la lista se entrega UNA vez (antes lo frenaba el
//     re-query dentro del bucle; al leer por lotes hay que deduplicar);
//   · cada persona se pide UNA sola vez aunque tenga varias notificaciones.
//
// El doble de Supabase registra qué tablas se consultan y cuántas veces, que es
// justo lo que este cambio pretende reducir.
// ─────────────────────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;

function fakeAdmin(datos: Record<string, Fila[]>) {
  const consultas: string[] = [];
  const insertados: Fila[] = [];

  function query(tabla: string) {
    let filas = [...(datos[tabla] ?? [])];
    const api: Record<string, unknown> = {
      select() { consultas.push(tabla); return api; },
      eq(col: string, val: unknown) { filas = filas.filter(r => r[col] === val); return api; },
      neq(col: string, val: unknown) { filas = filas.filter(r => r[col] !== val); return api; },
      in(col: string, vals: unknown[]) { filas = filas.filter(r => vals.includes(r[col])); return api; },
      maybeSingle: async () => ({ data: filas[0] ?? null }),
      insert: async (row: Fila) => { insertados.push(row); return { data: null, error: null }; },
      then: (res: (v: { data: Fila[] }) => unknown) => res({ data: filas }),
    };
    return api;
  }

  const admin = { from: (t: string) => query(t) } as unknown as SupabaseClient;
  return { admin, consultas, insertados };
}

// Regla real del catálogo con canal externo. Si el catálogo cambiara y este
// evento dejara de existir, los tests fallarían en vez de pasar en vacío.
const EVENTO = 'pago.fallido';

const noti = (id: string, over: Fila = {}): Fila => ({
  id, studio_id: 'st-1', event_type: EVENTO,
  recipient_role: 'PROPIETARIO', recipient_user_id: 'u-1',
  recipient_socio_id: null, recipient_instructor_id: null,
  category: 'cobros', priority: 'ALTA', title: 't', body: 'b',
  resource_type: null, resource_id: null, deep_link: null,
  dedup_key: null, read_at: null, archived_at: null, created_at: '2026-08-06T10:00:00Z',
  ...over,
});

test('no reenvía una notificación que YA tiene un delivery externo', async () => {
  const { admin, insertados } = fakeAdmin({
    notification: [noti('n-1')],
    notification_delivery: [{ notification_id: 'n-1', channel: 'EMAIL' }],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r = await entregarExternos(admin, ['n-1']);

  assert.equal(r.entregadas, 0, 'la guarda de duplicados es lo que evita el push repetido');
  assert.equal(insertados.length, 0);
});

test('un delivery INAPP previo NO cuenta como entregado: el externo sigue pendiente', async () => {
  const { admin } = fakeAdmin({
    notification: [noti('n-1')],
    // INAPP lo escribe crearInApp SIEMPRE; si contara, no saldría nunca nada.
    notification_delivery: [{ notification_id: 'n-1', channel: 'INAPP' }],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r = await entregarExternos(admin, ['n-1']);
  assert.ok(r.deliveries > 0, 'con solo INAPP previo, los canales externos deben entregarse');
});

test('un id repetido en la lista se entrega UNA vez', async () => {
  // Antes lo frenaba el re-query dentro del bucle. Al leer los deliveries por
  // lotes esa protección desaparece si no se deduplica la entrada.
  const { admin } = fakeAdmin({
    notification: [noti('n-1')],
    notification_delivery: [],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r = await entregarExternos(admin, ['n-1', 'n-1', 'n-1']);
  assert.equal(r.entregadas, 1, 'tres veces el mismo id no puede ser tres envíos');
});

test('no consulta una tabla por notificación: la misma persona se pide una vez', async () => {
  const { admin, consultas } = fakeAdmin({
    notification: [noti('n-1'), noti('n-2'), noti('n-3')],
    notification_delivery: [],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  await entregarExternos(admin, ['n-1', 'n-2', 'n-3']);

  // Con el N+1 original esto era 3 lecturas de `notification`, 3 de
  // `notification_delivery` y 3 de `studios`.
  const veces = (t: string) => consultas.filter(x => x === t).length;
  assert.equal(veces('notification'), 1);
  assert.equal(veces('notification_delivery'), 1);
  assert.equal(veces('studios'), 1);
});

test('sin ids no toca la base de datos', async () => {
  const { admin, consultas } = fakeAdmin({ notification: [] });
  const r = await entregarExternos(admin, []);
  assert.deepEqual(r, { entregadas: 0, deliveries: 0 });
  assert.equal(consultas.length, 0);
});

test('un evento que no está en el catálogo se ignora sin romper', async () => {
  const { admin, insertados } = fakeAdmin({
    notification: [noti('n-1', { event_type: 'evento.inventado' })],
    notification_delivery: [],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r = await entregarExternos(admin, ['n-1']);
  assert.equal(r.entregadas, 0);
  assert.equal(insertados.length, 0);
});

// ── Aviso de entregas fallidas ──────────────────────────────────────────────
// Un `FAILED` se guardaba en `notification_delivery` y ahí moría: nadie mira esa
// tabla, así que si Resend cae o VAPID caduca, las socias dejan de recibir sus
// avisos y el sistema sigue diciendo que todo va bien. Mismo hueco que #1006
// cerró para WhatsApp.

test('el resumen agrupa por canal, que es lo que dice DÓNDE está el problema', () => {
  const r = resumenFallos([
    { canal: 'EMAIL', error: 'domain not verified' },
    { canal: 'EMAIL', error: 'domain not verified' },
    { canal: 'PUSH', error: 'subscription expired' },
  ]);
  assert.equal(r.total, 3);
  assert.deepEqual(r.porCanal, { EMAIL: 2, PUSH: 1 });
});

test('⚠️ la muestra se corta en 5: un aviso a todo un estudio son cientos', () => {
  // Sin el tope, el payload se vuelve ilegible justo el día que hay problema —
  // y Sentry lo recorta igualmente, pero por donde le da la gana.
  const muchos = Array.from({ length: 300 }, (_, i) => ({ canal: 'EMAIL', error: `fallo ${i}` }));
  const r = resumenFallos(muchos);
  assert.equal(r.total, 300);
  assert.equal(r.ejemplos.length, 5);
  assert.equal(r.ejemplos[0], 'EMAIL: fallo 0');
});

test('sin fallos el resumen queda vacío (y avisarFallos no manda nada)', () => {
  const r = resumenFallos([]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.porCanal, {});
  assert.deepEqual(r.ejemplos, []);
});
