import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesarEvento, canalesExtraDe, type Preferencia } from './process.ts';
import { crearInApp } from './inapp.ts';
import { EVENTOS, REGLAS, plantillaDe, render, canalesDisponibles, ROLES_POR_AUDIENCIA } from './catalog.ts';
import type { NotificationEvent } from './types.ts';

test('equipo y sistema: reglas + plantillas que renderizan', () => {
  const casos: [string, Record<string, unknown>, RegExp][] = [
    [EVENTOS.INSTRUCTORA_BAJA, { instructora: 'Marta', clase: 'Reformer', cuando: 'martes 9:00', motivo: ' (gripe)' }, /Marta.*Reformer.*gripe/],
    [EVENTOS.SISTEMA_STRIPE_DESCONECTADO, {}, /Stripe/],
    [EVENTOS.SISTEMA_EMAIL_FALLIDO, { error: 'domain not verified' }, /domain not verified/],
    [EVENTOS.SUSTITUCION_RECHAZADA, { instructora: 'Lucía', clase: 'Mat', cuando: 'hoy', siguiente: 'Ya se lo hemos preguntado a Berta.' }, /Lucía.*Mat.*Berta/],
    [EVENTOS.INSTRUCTORA_AUSENCIA, { instructora: 'Ana', desde: '1 de agosto', hasta: '15 de agosto', clases: ' · 6 clases suyas en esas fechas por cubrir' }, /Ana.*1 de agosto.*15 de agosto.*6 clases/],
  ];
  for (const [evento, data, re] of casos) {
    assert.ok(REGLAS[evento], `falta regla para ${evento}`);
    const pl = plantillaDe(evento, 'PROPIETARIO');
    assert.ok(pl, `falta plantilla ${evento}#PROPIETARIO`);
    assert.match(render(pl.body, data), re);
  }
});

test('email fallido NO usa el canal email (evitar realimentación)', () => {
  const r = REGLAS[EVENTOS.SISTEMA_EMAIL_FALLIDO];
  assert.equal(r.canales.includes('EMAIL'), false, 'no debe declarar EMAIL');
  // Ni activándolo a mano, ni siquiera si algún día pasara a CRÍTICA.
  assert.deepEqual(canalesExtraDe(r, PREF({ email: true }), false), []);
  assert.deepEqual(canalesExtraDe(r, PREF({ email: true }), true), []);
});

test('stripe desconectado es CRÍTICA: llega por todos los canales que declara', () => {
  const r = REGLAS[EVENTOS.SISTEMA_STRIPE_DESCONECTADO];
  assert.equal(r.priority, 'CRITICA');
  assert.deepEqual(canalesExtraDe(r, PREF({ push: false, email: false }), true).sort(), ['EMAIL', 'PUSH', 'SMS', 'WHATSAPP']);
});

test('automatizaciones: cada evento nuevo tiene regla + plantilla que renderiza', () => {
  const casos: [string, 'SOCIA' | 'PROPIETARIO', Record<string, unknown>, RegExp][] = [
    [EVENTOS.RECORDATORIO_24H, 'SOCIA', { clase: 'Reformer', hora: '09:00' }, /Reformer.*09:00/],
    [EVENTOS.RECORDATORIO_1H, 'SOCIA', { clase: 'Mat', hora: '18:00' }, /Mat.*18:00/],
    [EVENTOS.BONO_POR_CADUCAR, 'SOCIA', { sesiones: 3, fecha: '30 de julio' }, /3 sesiones.*30 de julio/],
    [EVENTOS.CLASE_CASI_LLENA, 'PROPIETARIO', { clase: 'Barre', cuando: 'hoy', porcentaje: 90, ocupadas: 9, aforo: 10 }, /Barre.*90%.*9\/10/],
    [EVENTOS.SOCIA_INACTIVA, 'PROPIETARIO', { socia: 'María', dias: 45 }, /María.*45 días/],
    [EVENTOS.RESERVA_OFERTA_LISTA_ESPERA, 'SOCIA', { clase: 'Reformer', cuando: 'hoy', hora: '19:30' }, /19:30.*Reformer.*hoy/],
    [EVENTOS.RESERVA_ABANDONADA, 'SOCIA', { claseTexto: ' una plaza en Reformer (hoy)' }, /Reformer/],
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

test('canales: se usan los que declara la regla y el usuario no ha apagado', () => {
  const r = REGLAS[EVENTOS.RESERVA_CONFIRMADA]; // canales: [PUSH]
  assert.deepEqual(canalesExtraDe(r, PREF(), false), ['PUSH']);
  assert.deepEqual(canalesExtraDe(r, PREF({ push: false }), false), []);
});

test('canales: la preferencia NO puede añadir un canal que la regla no declara', () => {
  const r = REGLAS[EVENTOS.PAGO_FALLIDO]; // canales: [PUSH] — el dunning ya manda su email
  assert.deepEqual(canalesExtraDe(r, PREF({ email: true, whatsapp: true, sms: true }), false), ['PUSH']);
});

test('canales: un evento sin PUSH declarado no hace push aunque la pref esté ON', () => {
  const r = REGLAS[EVENTOS.RESERVA_CREADA]; // canales: []
  assert.deepEqual(canalesExtraDe(r, PREF({ push: true }), false), []);
});

test('canales: una CRÍTICA ignora la preferencia pero NO se inventa canales', () => {
  const r = REGLAS[EVENTOS.SISTEMA_ERROR];
  assert.equal(r.priority, 'CRITICA');
  assert.deepEqual(canalesExtraDe(r, PREF({ push: false, email: false }), true).sort(), ['EMAIL', 'PUSH', 'SMS', 'WHATSAPP']);
  // Una CRÍTICA hipotética que solo declarase PUSH no mandaría email.
  assert.deepEqual(canalesExtraDe({ ...r, canales: ['PUSH'] }, PREF({ push: false }), true), ['PUSH']);
});

test('clase.* no declara EMAIL: el panel ya manda su propio correo a las alumnas', () => {
  for (const evento of [EVENTOS.CLASE_CANCELADA, EVENTOS.CLASE_MODIFICADA, EVENTOS.CLASE_SUSTITUTA]) {
    assert.equal(REGLAS[evento].canales.includes('EMAIL'), false, `${evento} duplicaría el email`);
  }
});

test('canalesDisponibles: refleja lo que cada rol puede recibir por categoría', () => {
  // La socia recibe push de sus reservas; la recepción, desde Fase 2a, también
  // — una reserva PENDIENTE_APROBACION necesita acción antes de que empiece
  // la clase, así que sí se avisa por push al mostrador (RESERVA_PENDIENTE_APROBACION).
  assert.equal(canalesDisponibles('SOCIA', 'reservas').includes('PUSH'), true);
  assert.equal(canalesDisponibles('RECEPCION', 'reservas').includes('PUSH'), true);
  // La instructora sí recibe push de "clases" (su clase cancelada/movida).
  assert.equal(canalesDisponibles('INSTRUCTOR', 'clases').includes('PUSH'), true);
  // Y nadie recibe canales que ninguna regla de su categoría declare.
  assert.deepEqual(canalesDisponibles('SOCIA', 'marketing'), []);
});

test('cambios de clase: avisan a las alumnas Y a quien la imparte', () => {
  for (const evento of [EVENTOS.CLASE_CANCELADA, EVENTOS.CLASE_MODIFICADA]) {
    assert.equal(REGLAS[evento].audiencia, 'socias-e-instructora-de-la-sesion');
    // Sin plantilla para el rol, el motor lo descarta EN SILENCIO: los dos roles
    // que devuelve la audiencia tienen que tener la suya.
    for (const rol of ROLES_POR_AUDIENCIA[REGLAS[evento].audiencia]) {
      assert.ok(plantillaDe(evento, rol), `falta plantilla ${evento}#${rol}`);
    }
  }
  const pl = plantillaDe(EVENTOS.CLASE_CANCELADA, 'INSTRUCTOR')!;
  assert.match(render(pl.body, { clase: 'Reformer', cuando: 'lunes a las 9:00' }), /Reformer.*lunes a las 9:00/);
});

test('red.candidatura_recibida: plantilla para PROPIETARIO y MANAGER (gerencia), sin recepción', () => {
  assert.deepEqual(ROLES_POR_AUDIENCIA[REGLAS[EVENTOS.RED_CANDIDATURA_RECIBIDA].audiencia], ['PROPIETARIO', 'MANAGER']);
  for (const rol of ROLES_POR_AUDIENCIA[REGLAS[EVENTOS.RED_CANDIDATURA_RECIBIDA].audiencia]) {
    assert.ok(plantillaDe(EVENTOS.RED_CANDIDATURA_RECIBIDA, rol), `falta plantilla red.candidatura_recibida#${rol}`);
  }
  const pl = plantillaDe(EVENTOS.RED_CANDIDATURA_RECIBIDA, 'PROPIETARIO')!;
  assert.match(render(pl.body, { profesional: 'Laura', vacanteTitulo: 'Reformer' }), /Laura.*Reformer/);
  assert.equal(pl.deepLink!({ vacanteId: 'redvac-1' }), '/network/vacantes/redvac-1');
});

test('red.vacante_encaja: solo PUSH (único push no solicitado de Network), plantilla INSTRUCTOR', () => {
  const regla = REGLAS[EVENTOS.RED_VACANTE_ENCAJA];
  assert.deepEqual(regla.canales, ['PUSH']);
  assert.deepEqual(ROLES_POR_AUDIENCIA[regla.audiencia], ['INSTRUCTOR']);
  const pl = plantillaDe(EVENTOS.RED_VACANTE_ENCAJA, 'INSTRUCTOR')!;
  assert.match(render(pl.body, { titulo: 'Instructora de Reformer' }), /Instructora de Reformer/);
});

test('clase cubierta: dice que la clase SIGUE, y con nombre y apellidos', () => {
  // Solo las alumnas: a quien entra a cubrir ya le llega sustitucion.aceptada.
  assert.equal(REGLAS[EVENTOS.CLASE_SUSTITUTA].audiencia, 'socias-de-la-sesion');
  for (const rol of ROLES_POR_AUDIENCIA[REGLAS[EVENTOS.CLASE_SUSTITUTA].audiencia]) {
    assert.ok(plantillaDe(EVENTOS.CLASE_SUSTITUTA, rol), `falta plantilla ${EVENTOS.CLASE_SUSTITUTA}#${rol}`);
  }
  const pl = plantillaDe(EVENTOS.CLASE_SUSTITUTA, 'SOCIA')!;
  // Lo que NO puede pasar: que se lea como un cambio de horario y la alumna
  // cancele una clase que sigue exactamente donde estaba.
  assert.match(pl.title, /sigue en pie/i);
  const body = render(pl.body, { clase: 'Reformer', cuando: 'lunes a las 9:00', sustituta: 'Aina' });
  assert.match(body, /Reformer.*lunes a las 9:00.*Aina/);
  assert.doesNotMatch(body, /pasa a/i);
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

// ── El desempate por bandeja, cableado de verdad ─────────────────────────────
// `dedup.test.ts` prueba `claveDedup` en aislamiento, pero quien calcula el set
// de identidades dobles y se lo pasa es `crearInApp`. Ese cable no lo cubre
// ningún test unitario: si un refactor dejara de pasar `dobles` (o lo pasara
// vacío), toda la batería de dedup.test.ts seguiría en verde y el bug volvería
// entero. Estos dos van por el camino completo, con el fake que simula el 23505.

test('misma cuenta staff+socia: pago fallido crea las DOS filas, no una', async () => {
  const { admin, notifs } = fakeAdmin();
  const r = await procesarEvento(admin, {
    type: EVENTOS.PAGO_FALLIDO, studioId: 'st1',
    data: { concepto: 'Cuota mensual', importe: 45, socia: 'María Soler', slug: 'mar' },
    // El mismo userId en los dos: quien es propietaria Y socia del mismo
    // estudio. El test de arriba usa dos userId DISTINTOS, y por eso pasaba en
    // verde mientras el bug vivía debajo.
    recipients: [
      { role: 'PROPIETARIO', userId: 'u-dual' },
      { role: 'SOCIA', userId: 'u-dual', socioId: 's1' },
    ],
    dedupKey: 'pago-fallido:rec1',
  });
  assert.equal(r.creadas, 2, 'una de las dos bandejas se ha vuelto a quedar sin su fila');
  assert.equal(r.omitidas, 0);
  assert.equal(notifs.find(n => n.recipient_role === 'SOCIA')!.title, 'Problema con tu pago');
});

test('misma cuenta instructora+socia: la clase cancelada llega a sus dos bandejas', async () => {
  // El otro cruce: `socias-e-instructora-de-la-sesion`. Orden igual que
  // `recipients.ts` (`[...socias, ...instructora]`), que es lo que hacía que la
  // fila perdida fuese la de INSTRUCTOR.
  const { admin, notifs } = fakeAdmin();
  const r = await procesarEvento(admin, {
    type: EVENTOS.CLASE_CANCELADA, studioId: 'st1',
    data: { clase: 'Reformer', cuando: 'lunes a las 9:00', slug: 'mar', sesionId: 'ses1' },
    recipients: [
      { role: 'SOCIA', userId: 'u-dual', socioId: 's1' },
      { role: 'INSTRUCTOR', userId: 'u-dual', instructorId: 'i1' },
    ],
    dedupKey: 'clase-cancelada:ses1',
  });
  assert.equal(r.creadas, 2);
  const instructora = notifs.find(n => n.recipient_role === 'INSTRUCTOR');
  assert.ok(instructora, 'sin esta fila, quien imparte no se entera de que su clase se cae');
  assert.equal(instructora.title, 'Se ha cancelado tu clase');
});

test('mostrador con dos roles de la misma cuenta: UNA sola fila, no dos', async () => {
  // El reverso: `mostrador` resuelve por dos vías (propietaria + recepcionistas),
  // así que la dueña con ficha de RECEPCION llega dos veces. Las dos se leen en
  // la MISMA campana → deduplicar es lo correcto. Esto es lo que se habría roto
  // desempatando por el rol crudo en vez de por bandeja.
  const { admin, notifs } = fakeAdmin();
  const r = await procesarEvento(admin, {
    type: EVENTOS.RESERVA_PENDIENTE_APROBACION, studioId: 'st1',
    data: { socia: 'María', clase: 'Mat', cuando: 'hoy', sesionId: 'ses1' },
    recipients: [
      { role: 'PROPIETARIO', userId: 'u-dual' },
      { role: 'RECEPCION', userId: 'u-dual', instructorId: 'i1' },
    ],
    dedupKey: 'reserva-pendiente:ses1:s1',
  });
  assert.equal(r.creadas, 1, 'la misma persona no debe recibir dos veces el mismo aviso');
  assert.equal(notifs.length, 1);
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

// ── La in-app NO depende de la cola ──────────────────────────────────────────
// crearInApp es lo que publish() ejecuta de forma SÍNCRONA: escribe la fila y su
// entrega in-app sin tocar canales externos ni Inngest. Si esto funciona, la
// campana funciona aunque la cola esté caída.
test('crearInApp escribe la notificación y su entrega in-app, sin canales externos', async () => {
  const { admin, notifs, deliveries } = fakeAdmin();
  const r = await crearInApp(admin, {
    type: EVENTOS.RESERVA_CONFIRMADA, studioId: 'st1',
    data: { clase: 'Reformer', cuando: 'hoy', slug: 'mar', sesionId: 'ses1' },
    recipients: [{ role: 'SOCIA', userId: 'u-socia', socioId: 's1' }],
    dedupKey: 'reserva:ses1:s1:CONFIRMADA',
  });
  assert.equal(r.creadas.length, 1);
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].title, 'Reserva confirmada');
  // Solo la entrega in-app; el push queda pendiente para la cola.
  assert.deepEqual(deliveries.map(d => `${d.channel}:${d.status}`), ['INAPP:SENT']);
  assert.deepEqual(r.creadas[0].canalesExtra, ['PUSH']);
  // Devuelve la fila lista para entregar, sin volver a leer de BD.
  assert.equal(r.creadas[0].fila.id, r.creadas[0].id);
});

test('crearInApp: sin cuenta reclamada la entrega in-app queda SKIPPED', async () => {
  const { admin, deliveries } = fakeAdmin();
  await crearInApp(admin, {
    type: EVENTOS.RESERVA_CONFIRMADA, studioId: 'st1',
    data: { clase: 'Mat', cuando: 'hoy', slug: 'mar', sesionId: 'ses9' },
    recipients: [{ role: 'SOCIA', userId: null, socioId: 's-sin-cuenta' }],
  });
  assert.equal(deliveries.find(d => d.channel === 'INAPP')!.status, 'SKIPPED');
});
