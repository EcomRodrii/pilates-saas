// Libro de billing del SaaS (migración 20261116224610, Fase 1 de Billing & Revenue).
//
//  · las tres tablas son solo servidor: la propietaria no lee ni escribe ninguna desde el navegador;
//  · las tres funciones solo las ejecuta service_role (anon y authenticated, no);
//  · una factura no la pisa un evento más viejo, y una entrega repetida no duplica;
//  · un incidente se abre una vez por factura, se recupera al pagarse y no se reabre ni se abre tarde.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

test.after(async () => { await sql.end(); });

const iso = (min: number) => new Date(Date.UTC(2026, 10, 16, 10, min)).toISOString();
const factura = (id: string, studioId: string, extra: Record<string, unknown> = {}) => ({
  stripe_invoice_id: id, studio_id: studioId, customer_id: 'cus_test', subscription_id: 'sub_test', estado: 'open',
  motivo: 'subscription_cycle', total_cents: 7900, pagado_cents: 0, impuestos_cents: 1371, intentos: 1,
  creada_en: iso(0), ultimo_evento_en: iso(1), ...extra,
});

test('las funciones del libro solo las ejecuta service_role', async () => {
  for (const fn of ['billing_registrar_factura(jsonb)', 'billing_abrir_incidente(jsonb)', 'billing_cerrar_incidente(text, timestamptz, text)']) {
    const [r] = await sql<{ anon: boolean; auth: boolean; svc: boolean }[]>`
      select has_function_privilege('anon', ${`public.${fn}`}, 'EXECUTE') as anon,
             has_function_privilege('authenticated', ${`public.${fn}`}, 'EXECUTE') as auth,
             has_function_privilege('service_role', ${`public.${fn}`}, 'EXECUTE') as svc`;
    assert.deepEqual(r, { anon: false, auth: false, svc: true }, fn);
  }
});

test('la propietaria no ve ni escribe el libro desde el navegador', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const idFactura = `in_${randomUUID()}`;
  try {
    const { data: r } = await admin.rpc('billing_registrar_factura', { p: factura(idFactura, studio.studioId) });
    assert.equal(r, 'aplicada');
    const lee = await studio.comoPropietaria.from('billing_facturas').select('stripe_invoice_id').eq('stripe_invoice_id', idFactura);
    assert.ok(lee.error || (lee.data ?? []).length === 0, 'la propietaria no debe leer billing_facturas');
    const escribe = await studio.comoPropietaria.from('billing_eventos').insert({
      stripe_event_id: `evt_${randomUUID()}`, tipo: 'ALTA', studio_id: studio.studioId, ocurrido_en: iso(0),
    });
    assert.ok(escribe.error, 'la propietaria no debe escribir billing_eventos');
    const rpc = await studio.comoPropietaria.rpc('billing_registrar_factura', { p: factura(`in_${randomUUID()}`, studio.studioId) });
    assert.ok(rpc.error, 'la propietaria no debe ejecutar billing_registrar_factura');
  } finally {
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${idFactura}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('un evento más viejo no pisa a uno más nuevo, y el más nuevo sí actualiza', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  try {
    assert.equal((await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId, { ultimo_evento_en: iso(5) }) })).data, 'aplicada');
    // Llega tarde un evento anterior: no cambia nada.
    const tarde = await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId, { estado: 'draft', ultimo_evento_en: iso(2) }) });
    assert.equal(tarde.data, 'desordenada');
    const [f1] = await sql<{ estado: string }[]>`select estado from public.billing_facturas where stripe_invoice_id = ${id}`;
    assert.equal(f1.estado, 'open');
    // Uno posterior (pagada) sí.
    const pagada = await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId, { estado: 'paid', pagado_cents: 7900, pagada_en: iso(9), ultimo_evento_en: iso(9) }) });
    assert.equal(pagada.data, 'aplicada');
    const [f2] = await sql<{ estado: string; pagado_cents: number }[]>`select estado, pagado_cents from public.billing_facturas where stripe_invoice_id = ${id}`;
    assert.deepEqual(f2, { estado: 'paid', pagado_cents: 7900 });
  } finally {
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('un incidente por factura: se abre, suma intentos, se recupera al pagarse y no se reabre', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  const incidente = (extra: Record<string, unknown> = {}) => ({
    stripe_invoice_id: id, studio_id: studio.studioId, customer_id: 'cus_test', subscription_id: 'sub_test',
    importe_cents: 7900, intentos: 1, fallo_en: iso(0), ...extra,
  });
  try {
    await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId) });
    assert.equal((await admin.rpc('billing_abrir_incidente', { p: incidente() })).data, 'abierto');
    assert.equal((await admin.rpc('billing_abrir_incidente', { p: incidente({ intentos: 2, fallo_en: iso(30) }) })).data, 'abierto');
    const filas = await sql<{ estado: string; intentos: number }[]>`select estado, intentos from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    assert.deepEqual(filas.map((f) => ({ ...f })), [{ estado: 'ABIERTO', intentos: 2 }], 'un solo incidente, con 2 intentos');

    assert.equal((await admin.rpc('billing_cerrar_incidente', { p_stripe_invoice_id: id, p_en: iso(60) })).data, 'recuperado');
    // Cerrarlo otra vez, o un fallo entregado después, no lo reabre.
    assert.equal((await admin.rpc('billing_cerrar_incidente', { p_stripe_invoice_id: id, p_en: iso(61) })).data, 'sin_incidente');
    assert.equal((await admin.rpc('billing_abrir_incidente', { p: incidente({ intentos: 3, fallo_en: iso(90) }) })).data, 'sin_cambios');
    const [fin] = await sql<{ estado: string; recuperado_en: Date | null }[]>`select estado, recuperado_en from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    assert.equal(fin.estado, 'RECUPERADO');
    assert.ok(fin.recuperado_en);
  } finally {
    await sql`delete from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('un payment_failed que llega después de pagarse la factura no abre incidente', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  try {
    await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId, { estado: 'paid', pagado_cents: 7900, ultimo_evento_en: iso(10) }) });
    const r = await admin.rpc('billing_abrir_incidente', {
      p: { stripe_invoice_id: id, studio_id: studio.studioId, importe_cents: 7900, intentos: 1, fallo_en: iso(5) },
    });
    assert.equal(r.data, 'ya_pagada');
    const filas = await sql`select 1 from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    assert.equal(filas.length, 0);
  } finally {
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('una factura anulada cierra el incidente como CANCELADO, no como recuperado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  try {
    await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId) });
    await admin.rpc('billing_abrir_incidente', { p: { stripe_invoice_id: id, studio_id: studio.studioId, importe_cents: 7900, intentos: 1, fallo_en: iso(0) } });
    assert.equal((await admin.rpc('billing_cerrar_incidente', { p_stripe_invoice_id: id, p_en: iso(5), p_estado: 'CANCELADO' })).data, 'cancelado');
    const [fin] = await sql<{ estado: string; recuperado_en: Date | null }[]>`select estado, recuperado_en from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    assert.deepEqual([fin.estado, fin.recuperado_en], ['CANCELADO', null]);
    const mal = await admin.rpc('billing_cerrar_incidente', { p_stripe_invoice_id: id, p_en: iso(6), p_estado: 'OTRO' });
    assert.ok(mal.error, 'un estado de cierre desconocido se rechaza');
  } finally {
    await sql`delete from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('el mismo evento no duplica filas del ciclo de vida, y un evento puede dar varias', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const evt = `evt_${randomUUID()}`;
  const fila = (tipo: string) => ({ stripe_event_id: evt, tipo, studio_id: studio.studioId, ocurrido_en: iso(0) });
  try {
    for (let i = 0; i < 2; i++) {
      const r = await admin.from('billing_eventos').upsert([fila('CAMBIO_PLAN'), fila('CAMBIO_COMPLEMENTOS')], { onConflict: 'stripe_event_id,tipo', ignoreDuplicates: true });
      assert.ok(!r.error, r.error?.message);
    }
    const filas = await sql`select tipo from public.billing_eventos where stripe_event_id = ${evt} order by tipo`;
    assert.deepEqual(filas.map((x) => x.tipo), ['CAMBIO_COMPLEMENTOS', 'CAMBIO_PLAN']);
    const dos = await admin.from('billing_eventos').insert({ ...fila('ALTA'), cadena_id: 'no-importa' });
    assert.ok(dos.error, 'una fila no puede tener estudio y cadena a la vez');
  } finally {
    await sql`delete from public.billing_eventos where stripe_event_id = ${evt}`;
    await limpiarFixtures(admin, [studio]);
  }
});

// ── Recuperación de impagos (migración 20261116231548, Fase 2) ──────────────
test('las funciones de los avisos solo las ejecuta service_role', async () => {
  for (const fn of ['billing_registrar_aviso(text, integer, text)', 'billing_liberar_aviso(text, integer)', 'billing_escalar_incidente(text)', 'billing_fijar_motivo(text, text, text)']) {
    const [r] = await sql<{ anon: boolean; auth: boolean; svc: boolean }[]>`
      select has_function_privilege('anon', ${`public.${fn}`}, 'EXECUTE') as anon,
             has_function_privilege('authenticated', ${`public.${fn}`}, 'EXECUTE') as auth,
             has_function_privilege('service_role', ${`public.${fn}`}, 'EXECUTE') as svc`;
    assert.deepEqual(r, { anon: false, auth: false, svc: true }, fn);
  }
});

test('un aviso se reclama una sola vez, se puede devolver si el envío falla, y no se avisa de un incidente cerrado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  try {
    await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId) });
    await admin.rpc('billing_abrir_incidente', { p: { stripe_invoice_id: id, studio_id: studio.studioId, importe_cents: 7900, intentos: 1, fallo_en: iso(0) } });
    const reclama = async (dia: number) => (await admin.rpc('billing_registrar_aviso', { p_stripe_invoice_id: id, p_dia: dia, p_tipo: 'recordatorio' })).data;
    assert.equal(await reclama(0), true);
    assert.equal(await reclama(0), false, 'el mismo hito no se reclama dos veces (webhook y cron a la vez)');
    assert.equal(await reclama(2), true);
    assert.equal((await admin.rpc('billing_liberar_aviso', { p_stripe_invoice_id: id, p_dia: 2 })).data, true);
    assert.equal(await reclama(2), true, 'un envío que falló se puede reintentar');
    const [fila] = await sql<{ n: number }[]>`select jsonb_array_length(avisos) as n from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    assert.equal(fila.n, 2);

    await admin.rpc('billing_cerrar_incidente', { p_stripe_invoice_id: id, p_en: iso(30) });
    assert.equal(await reclama(5), false, 'un incidente recuperado no recibe más avisos');
  } finally {
    await sql`delete from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});

test('escalar solo pasa un incidente ABIERTO a ESCALADO, una vez; el motivo se guarda recortado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  try {
    await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId) });
    await admin.rpc('billing_abrir_incidente', { p: { stripe_invoice_id: id, studio_id: studio.studioId, importe_cents: 7900, intentos: 1, fallo_en: iso(0) } });
    assert.equal((await admin.rpc('billing_fijar_motivo', { p_stripe_invoice_id: id, p_codigo: 'x'.repeat(200), p_texto: 'y'.repeat(500) })).data, true);
    assert.equal((await admin.rpc('billing_escalar_incidente', { p_stripe_invoice_id: id })).data, true);
    assert.equal((await admin.rpc('billing_escalar_incidente', { p_stripe_invoice_id: id })).data, false);
    const [f] = await sql<{ estado: string; c: number; t: number }[]>`select estado, length(motivo_codigo) as c, length(motivo_texto) as t from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    assert.deepEqual(f, { estado: 'ESCALADO', c: 80, t: 300 });
  } finally {
    await sql`delete from public.billing_incidentes_pago where stripe_invoice_id = ${id}`;
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});

// ── Devoluciones (migración 20261117114350) ──────────────────────────────────
test('la función de devoluciones solo la ejecuta service_role', async () => {
  const [r] = await sql<{ anon: boolean; auth: boolean; svc: boolean }[]>`
    select has_function_privilege('anon', 'public.billing_registrar_devolucion(text, integer)', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.billing_registrar_devolucion(text, integer)', 'EXECUTE') as auth,
           has_function_privilege('service_role', 'public.billing_registrar_devolucion(text, integer)', 'EXECUTE') as svc`;
  assert.deepEqual({ ...r }, { anon: false, auth: false, svc: true });
});

test('una devolución solo sube, nunca pasa del total de la factura, y una factura desconocida da false', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `in_${randomUUID()}`;
  try {
    await admin.rpc('billing_registrar_factura', { p: factura(id, studio.studioId, { estado: 'paid', pagado_cents: 7900, total_cents: 7900 }) });
    const devolver = async (cents: number) => (await admin.rpc('billing_registrar_devolucion', { p_stripe_invoice_id: id, p_devuelto_cents: cents })).data;
    const leer = async () => (await sql<{ d: number }[]>`select devuelto_cents as d from public.billing_facturas where stripe_invoice_id = ${id}`)[0]!.d;
    assert.equal(await devolver(1000), true);
    assert.equal(await leer(), 1000);
    assert.equal(await devolver(500), true);
    assert.equal(await leer(), 1000, 'un evento viejo (menos devuelto) no baja lo ya devuelto');
    assert.equal(await devolver(99_999), true);
    assert.equal(await leer(), 7900, 'nunca más que el total de la factura');
    assert.equal((await admin.rpc('billing_registrar_devolucion', { p_stripe_invoice_id: 'in_desconocida', p_devuelto_cents: 100 })).data, false);
    assert.ok((await admin.rpc('billing_registrar_devolucion', { p_stripe_invoice_id: id, p_devuelto_cents: -1 })).error, 'una devolución negativa se rechaza');
  } finally {
    await sql`delete from public.billing_facturas where stripe_invoice_id = ${id}`;
    await limpiarFixtures(admin, [studio]);
  }
});
