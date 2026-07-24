import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesarEvento, canalesExtraDe, type Preferencia } from './process.ts';
import { EVENTOS, REGLAS, plantillaDe, render } from './catalog.ts';
import type { NotificationEvent } from './types.ts';

test('automatizaciones: cada evento nuevo tiene regla + plantilla que renderiza', () => {
  const casos: [string, 'SOCIA' | 'PROPIETARIO', Record<string, unknown>, RegExp][] = [
    [EVENTOS.RECORDATORIO_24H, 'SOCIA', { clase: 'Reformer', hora: '09:00' }, /Reformer.*09:00/],
    [EVENTOS.RECORDATORIO_1H, 'SOCIA', { clase: 'Mat', hora: '18:00' }, /Mat.*18:00/],
    [EVENTOS.BONO_POR_CADUCAR, 'SOCIA', { sesiones: 3, fecha: '30 de julio' }, /3 sesiones.*30 de julio/],
    [EVENTOS.CLASE_CASI_LLENA, 'PROPIETARIO', { clase: 'Barre', cuando: 'hoy', porcentaje: 90, ocupadas: 9, aforo: 10 }, /Barre.*90%.*9\/10/],
    [EVENTOS.SOCIA_INACTIVA, 'PROPIETARIO', { socia: 'María', dias: 45 }, /María.*45 días/],
  ];
  for (const [evento, rol, data, re] of casos) {
    assert.ok(REGLAS[evento], `falta regla para ${evento}`);
    const pl = plantillaDe(evento, rol);
    assert.ok(pl, `falta plantilla ${evento}#${rol}`);
    assert.match(render(pl.body, data), re);
  }
});

const PREF = (p: Partial<Preferencia> = {}): Preferencia =>
  ({ inapp: true, push: true, email: false, whatsapp: false, sms: false, ...p });

test('canales: por defecto solo PUSH cuando la regla lo trae (opt-in email/wa/sms)', () => {
  const r = REGLAS[EVENTOS.RESERVA_CONFIRMADA]; // canales: [PUSH]
  assert.deepEqual(canalesExtraDe(r, PREF(), false), ['PUSH']);
});

test('canales: email/WhatsApp/SMS solo si el usuario los activa', () => {
  const r = REGLAS[EVENTOS.PAGO_FALLIDO];
  assert.deepEqual(canalesExtraDe(r, PREF({ email: true, whatsapp: true }), false).sort(), ['EMAIL', 'PUSH', 'WHATSAPP']);
});

test('canales: un evento sin PUSH por defecto no hace push aunque la pref esté ON', () => {
  const r = REGLAS[EVENTOS.RESERVA_CREADA]; // canales: []
  assert.deepEqual(canalesExtraDe(r, PREF({ push: true }), false), []);
});

test('canales: una CRÍTICA fuerza todos los canales', () => {
  const r = REGLAS[EVENTOS.SISTEMA_ERROR]; // priority CRITICA
  assert.deepEqual(canalesExtraDe(r, PREF({ email: false }), true).sort(), ['EMAIL', 'PUSH', 'SMS', 'WHATSAPP']);
});

// Fake del cliente Supabase admin: registra inserts en memoria y simula el choque
// de dedup (23505). Sin preferencias (→ valores por defecto). Suficiente para
// verificar el enrutado + plantillas + deliveries + idempotencia del motor.
function fakeAdmin() {
  const notifs: Record<string, unknown>[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const dedup = new Set<string>();
  const chain = {
    select() { return chain; }, eq() { return chain; }, is() { return chain; }, limit() { return chain; },
    maybeSingle: async () => ({ data: null }),
    async insert(row: Record<string, unknown>) {
      // Detecta la tabla por una columna característica de la fila.
      if ('recipient_role' in row) {
        const k = row.dedup_key as string | null;
        if (k && dedup.has(k)) return { error: { code: '23505' } };
        if (k) dedup.add(k);
        notifs.push(row); return { error: null };
      }
      if ('channel' in row) { deliveries.push(row); return { error: null }; }
      return { error: null };
    },
  };
  const admin = { from: () => chain } as unknown as Parameters<typeof procesarEvento>[0];
  return { admin, notifs, deliveries };
}

test('reserva confirmada: crea in-app para la socia con la plantilla renderizada', async () => {
  const { admin, notifs, deliveries } = fakeAdmin();
  const event: NotificationEvent = {
    type: EVENTOS.RESERVA_CONFIRMADA, studioId: 'st1',
    data: { clase: 'Reformer', cuando: 'sábado 25 de julio a las 15:00', slug: 'mar', sesionId: 'ses1' },
    recipients: [{ role: 'SOCIA', userId: 'u-socia', socioId: 's1' }],
    dedupKey: 'reserva:ses1:s1:CONFIRMADA',
  };
  const r = await procesarEvento(admin, event);
  assert.equal(r.creadas, 1);
  assert.equal(notifs[0].title, 'Reserva confirmada');
  assert.match(notifs[0].body as string, /Reformer/);
  assert.match(notifs[0].body as string, /sábado 25 de julio/);
  assert.equal(notifs[0].deep_link, '/portal/mar/clases/ses1');
  assert.equal(notifs[0].priority, 'MEDIA');
  assert.equal(notifs[0].category, 'reservas');
  // Deliveries: INAPP enviado + PUSH omitido (sin VAPID en test).
  const canales = deliveries.map(d => `${d.channel}:${d.status}`);
  assert.deepEqual(canales.sort(), ['INAPP:SENT', 'PUSH:SKIPPED']);
});

test('idempotencia: reprocesar el mismo hecho (dedupKey) no duplica', async () => {
  const { admin, notifs } = fakeAdmin();
  const event: NotificationEvent = {
    type: EVENTOS.RESERVA_CONFIRMADA, studioId: 'st1',
    data: { clase: 'Reformer', cuando: 'hoy', slug: 'mar', sesionId: 'ses1' },
    recipients: [{ role: 'SOCIA', userId: 'u-socia', socioId: 's1' }],
    dedupKey: 'reserva:ses1:s1:CONFIRMADA',
  };
  await procesarEvento(admin, event);
  const segunda = await procesarEvento(admin, event);
  assert.equal(segunda.creadas, 0);
  assert.equal(notifs.length, 1);
});

test('un evento → varios roles con plantilla distinta (pago fallido)', async () => {
  const { admin, notifs } = fakeAdmin();
  const event: NotificationEvent = {
    type: EVENTOS.PAGO_FALLIDO, studioId: 'st1',
    data: { concepto: 'Cuota mensual', importe: 45, socia: 'María Soler', slug: 'mar' },
    recipients: [
      { role: 'PROPIETARIO', userId: 'u-owner' },
      { role: 'SOCIA', userId: 'u-socia', socioId: 's1' },
    ],
    dedupKey: 'pago-fallido:rec1',
  };
  const r = await procesarEvento(admin, event);
  assert.equal(r.creadas, 2);
  const owner = notifs.find(n => n.recipient_role === 'PROPIETARIO')!;
  const socia = notifs.find(n => n.recipient_role === 'SOCIA')!;
  assert.equal(owner.title, 'Pago fallido');
  assert.match(owner.body as string, /María Soler/);
  assert.equal(socia.title, 'Problema con tu pago');
  assert.equal(owner.priority, 'ALTA');
});

test('destinatario sin cuenta: in-app se omite (no puede iniciar sesión)', async () => {
  const { admin, deliveries } = fakeAdmin();
  const event: NotificationEvent = {
    type: EVENTOS.RESERVA_CONFIRMADA, studioId: 'st1',
    data: { clase: 'Mat', cuando: 'hoy', slug: 'mar', sesionId: 'ses9' },
    recipients: [{ role: 'SOCIA', userId: null, socioId: 's-unclaimed' }],
  };
  await procesarEvento(admin, event);
  const inapp = deliveries.find(d => d.channel === 'INAPP')!;
  assert.equal(inapp.status, 'SKIPPED');
});
