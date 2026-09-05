import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { entregarExternos, resumenFallos, barrerEntregasPendientes, retry } from './process.ts';

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

// Guarda todas las filas de `notification_delivery` en una tabla COMPARTIDA
// entre invocaciones de `query()`: `reclamarODejarConstancia` hace
// select→insert / select→update sobre esa misma tabla dentro de una sola
// llamada a `entregarExternos`, así que el doble tiene que ver sus propios
// inserts/updates, no solo los fixtures iniciales.
function fakeAdmin(datos: Record<string, Fila[]>) {
  const consultas: string[] = [];
  const insertados: Fila[] = [];
  const actualizados: { tabla: string; cambios: Fila }[] = [];
  const tablas: Record<string, Fila[]> = Object.fromEntries(
    Object.entries(datos).map(([k, v]) => [k, v.map(r => ({ ...r }))]),
  );

  function query(tabla: string) {
    let filas = [...(tablas[tabla] ?? [])];
    const api: Record<string, unknown> = {
      select() { consultas.push(tabla); return api; },
      eq(col: string, val: unknown) { filas = filas.filter(r => r[col] === val); return api; },
      neq(col: string, val: unknown) { filas = filas.filter(r => r[col] !== val); return api; },
      in(col: string, vals: unknown[]) { filas = filas.filter(r => vals.includes(r[col])); return api; },
      lt() { return api; },
      limit() { return api; },
      maybeSingle: async () => ({ data: filas[0] ?? null }),
      insert: async (row: Fila | Fila[]) => {
        const filasNuevas = Array.isArray(row) ? row : [row];
        insertados.push(...filasNuevas);
        (tablas[tabla] ??= []).push(...filasNuevas.map(r => ({ ...r })));
        return { data: null, error: null };
      },
      // `.update({...}).eq(...).eq(...)[.select().maybeSingle()]` — el filtro
      // se aplica sobre la tabla compartida (no sobre `filas`, que ya se
      // resolvió antes de saber qué cambia); solo la primera fila que
      // matchea se actualiza, igual que el `UPDATE` real con PK. El código
      // real a veces encadena `.select().maybeSingle()` (para saber si ganó
      // el claim) y a veces solo hace `await ...update().eq(...)` a secas
      // (el `UPDATE` final de resultado) — `upd` tiene que ser awaitable en
      // los dos casos.
      update: (cambios: Fila) => {
        const filtros: [string, unknown][] = [];
        const aplicar = () => {
          const real = (tablas[tabla] ??= []);
          const idx = real.findIndex(r => filtros.every(([c, v]) => r[c] === v));
          if (idx === -1) return null;
          real[idx] = { ...real[idx], ...cambios };
          actualizados.push({ tabla, cambios });
          return real[idx];
        };
        const upd: Record<string, unknown> = {
          eq(col: string, val: unknown) { filtros.push([col, val]); return upd; },
          select() { return upd; },
          maybeSingle: async () => { const fila = aplicar(); return { data: fila ? { id: fila.id } : null }; },
          then: (res: (v: { data: null; error: null }) => unknown) => { aplicar(); return res({ data: null, error: null }); },
        };
        return upd;
      },
      then: (res: (v: { data: Fila[] }) => unknown) => res({ data: filas }),
    };
    return api;
  }

  const admin = { from: (t: string) => query(t) } as unknown as SupabaseClient;
  return { admin, consultas, insertados, actualizados };
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
  // 1 lectura por lotes del filtro grueso + 1 SELECT de claim por
  // notificación (cada una intenta su propio canal PUSH) — ya no es un único
  // batch porque el claim atómico (C-5) necesita ver el estado POR CANAL, no
  // solo "esta notificación ya tiene algo". Sigue sin ser N+1 de verdad: la
  // resolución de contactos/preferencias (socios/instructores/studios/prefs)
  // sigue en lotes, que es lo que este test protegía de origen.
  assert.equal(veces('notification_delivery'), 1 + 3);
  assert.equal(veces('studios'), 1);
});

// ── C-5: la fila PENDING que deja `crearInApp` se reclama, no se reinserta ──

test('con una fila PENDING ya escrita, se reclama (UPDATE) en vez de insertar otra', async () => {
  const { admin, insertados } = fakeAdmin({
    notification: [noti('n-1')],
    notification_delivery: [{ id: 'del-1', notification_id: 'n-1', channel: 'PUSH', status: 'PENDING', attempts: 0 }],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r = await entregarExternos(admin, ['n-1']);

  assert.ok(r.deliveries > 0, 'la fila PENDING debe intentarse');
  assert.equal(insertados.filter(x => x.channel === 'PUSH').length, 0, 'no se inserta una fila nueva: se reclama la que ya existía');
});

test('llamar dos veces seguidas al mismo id no manda el mensaje dos veces', async () => {
  // No es una prueba de concurrencia real (el doble es síncrono) — cubre el
  // caso realista de que el barrido del cron y el salto inmediato se solapen:
  // la segunda pasada debe ver la fila ya resuelta (SENT/FAILED/SKIPPED, no
  // PENDING) y no reintentarla.
  const { admin } = fakeAdmin({
    notification: [noti('n-1')],
    notification_delivery: [],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r1 = await entregarExternos(admin, ['n-1']);
  const r2 = await entregarExternos(admin, ['n-1']);

  assert.ok(r1.deliveries > 0, 'la primera pasada sí entrega');
  assert.equal(r2.deliveries, 0, 'la segunda ya no encuentra nada PENDIENTE que reclamar');
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

// ── C-5: barrido de entregas nunca intentadas (el cron) ─────────────────────

test('barrerEntregasPendientes encuentra una fila PENDING sin intentar y la entrega', async () => {
  const { admin } = fakeAdmin({
    notification: [noti('n-1')],
    notification_delivery: [{ id: 'del-1', notification_id: 'n-1', channel: 'PUSH', status: 'PENDING', attempts: 0 }],
    studios: [{ id: 'st-1', email: 'a@b.c', telefono: null }],
    notification_preference: [],
  });

  const r = await barrerEntregasPendientes(admin);
  assert.equal(r.intentadas, 1);
});

test('barrerEntregasPendientes sin nada pendiente no toca nada', async () => {
  const { admin, consultas } = fakeAdmin({ notification_delivery: [] });
  const r = await barrerEntregasPendientes(admin);
  assert.equal(r.intentadas, 0);
  // Sin filas que barrer, no hace falta ni leer `notification`/`studios`.
  assert.deepEqual(consultas, ['notification_delivery']);
});

// ── retry() (botón "Reintentar" del Notification Center, auditoría 23ª) ─────

test('retry: resuelve el email real de la socia antes de reintentar (antes SIEMPRE quedaba sin destinatario)', async () => {
  const { admin, actualizados } = fakeAdmin({
    notification: [noti('n-1', { recipient_role: 'SOCIA', recipient_socio_id: 'soc-1', recipient_user_id: null })],
    notification_delivery: [
      { id: 'del-1', notification_id: 'n-1', channel: 'EMAIL', status: 'FAILED', attempts: 1, error: 'boom', sent_at: null },
    ],
    socios: [{ id: 'soc-1', studio_id: 'st-1', nombre: 'María', apellidos: 'Soler', email: 'maria@x.com', telefono: null, auth_user_id: null }],
  });
  const r = await retry(admin, 'n-1');
  assert.equal(r.reintentados, 1);
  // Sin RESEND_API_KEY en el entorno de test el email sigue sin poder salir
  // — pero AHORA es porque el canal no está configurado, no porque
  // `destinatario.email` nunca llegó a resolverse (el bug real: antes el
  // `dest` de retry() no llevaba ni email ni teléfono, así que EMAIL/
  // WHATSAPP/SMS daban SIEMPRE "destinatario sin email/teléfono").
  const upd = actualizados.find(a => a.tabla === 'notification_delivery');
  assert.equal(upd?.cambios.error, 'email no configurado');
});

test('retry: un canal que ahora da SKIPPED no borra el FAILED anterior', async () => {
  const { admin, actualizados } = fakeAdmin({
    notification: [noti('n-1', { recipient_role: 'PROPIETARIO', recipient_user_id: 'u-1' })],
    notification_delivery: [
      { id: 'del-1', notification_id: 'n-1', channel: 'PUSH', status: 'FAILED', attempts: 1, error: 'timeout', sent_at: null },
    ],
    studios: [{ id: 'st-1', owner_auth_user_id: 'u-1', nombre: 'Estudio', email: null, telefono: null }],
  });
  const r = await retry(admin, 'n-1');
  assert.equal(r.reintentados, 1);
  assert.equal(r.enviados, 0);
  const upd = actualizados.find(a => a.tabla === 'notification_delivery');
  assert.equal(upd?.cambios.status, 'FAILED', 'un SKIPPED no debe sustituir un FAILED ya registrado');
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
