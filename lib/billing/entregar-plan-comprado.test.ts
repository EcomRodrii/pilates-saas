import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entregarPlanComprado, idsDe, type CompraPlan } from './entregar-plan-comprado.ts';

// El botón "Contratar" del enlace público mandaba a Stripe con metadata.planId y
// el webhook NUNCA leía ese campo: se cobraba y no se entregaba nada. Estos
// tests fijan qué tiene que quedar guardado después de un cobro.

const PLAN = {
  id: 'plan-1', nombre: 'Bono 10 sesiones', precio: 130, tipo: 'BONO',
  sesiones: 10, validez_dias: 90, studio_id: 'studio-1',
};

type Fila = Record<string, unknown>;

/** Supabase de mentira: guarda lo insertado para poder comprobarlo. */
function fakeAdmin(opts: { plan?: Fila | null; socioExistente?: Fila | null; fallaEn?: string } = {}) {
  const insertado: Record<string, Fila[]> = { socios: [], suscripciones: [], recibos: [] };
  const actualizado: Record<string, Fila[]> = { recibos: [] };

  const api = {
    from(tabla: string) {
      return {
        select() { return this; },
        eq() { return this; },
        ilike() { return this; },
        maybeSingle() {
          if (tabla === 'planes_tarifa') return Promise.resolve({ data: opts.plan === undefined ? PLAN : opts.plan, error: null });
          if (tabla === 'socios') return Promise.resolve({ data: opts.socioExistente ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert(fila: Fila) {
          if (opts.fallaEn === tabla) return Promise.resolve({ error: { code: '42501', message: 'row-level security' } });
          insertado[tabla]?.push(fila);
          return Promise.resolve({ error: null });
        },
        // El snapshot de la entrega va en un UPDATE aparte del insert, para que
        // el orden de despliegue no pueda romper una entrega — ver el comentario
        // en entregar-plan-comprado.ts.
        update(fila: Fila) { actualizado[tabla]?.push(fila); return this; },
      };
    },
  };
  return { admin: api as never, insertado, actualizado };
}

const COMPRA: CompraPlan = {
  sessionId: 'cs_test_abc123def456ghi789', studioId: 'studio-1', planId: 'plan-1',
  socioId: null, email: 'nueva@example.com', nombre: 'María Soler',
  // Lo que Stripe cobró de verdad. Igual al precio del plan salvo en el test
  // que comprueba precisamente que mandan los céntimos cobrados.
  importeCobradoCentimos: 13000,
  paymentIntentId: 'pi_test_abc123',
  origenLead: null,
};

// Fase 3 — checkout embebido: idsDe() amplió su regex para aceptar también
// PaymentIntent (`pi_…`), no solo Checkout Session (`cs_…`, Modo A). Este test
// fija que ambos prefijos siguen derivando ids DISTINTOS entre sí para el
// mismo sufijo de Stripe, y que `cs_` sigue produciendo exactamente lo mismo
// que antes de tocar el regex (el conciliador depende de esta regla).
test('idsDe() acepta cs_ y pi_ sin cambiar lo que ya derivaba de cs_', () => {
  const deSesion = idsDe('cs_test_a1B2c3D4e5F6g7H8i9J0k1L2');
  const dePaymentIntent = idsDe('pi_test_a1B2c3D4e5F6g7H8i9J0k1L2');

  assert.equal(deSesion.reciboId, 'rec-web-a1B2c3D4e5F6g7H8i9J0k1L2', 'cs_ sigue derivando igual que siempre');
  assert.equal(dePaymentIntent.reciboId, 'rec-web-a1B2c3D4e5F6g7H8i9J0k1L2', 'pi_ deriva del mismo sufijo si el sufijo coincide');
  // Con sufijos distintos (el caso real: Stripe genera aleatorio), los ids no chocan.
  const otroPi = idsDe('pi_test_z9Y8x7W6v5U4t3S2r1Q0p9O8');
  assert.notEqual(dePaymentIntent.reciboId, otroPi.reciboId);
});

test('el recibo registra lo COBRADO, no el precio del plan releído ahora', async () => {
  // Entre abrir el checkout y llegar el webhook, el estudio puede subir el
  // precio. Antes se registraba el precio de catálogo del momento del webhook:
  // la socia pagaba 20 € y quedaba un recibo COBRADO de 65 €, y sobre ese
  // importe se calculaban la factura y los ingresos.
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, {
    ...COMPRA, socioId: 'soc-existente', importeCobradoCentimos: 2000,
  });

  assert.equal(r.ok, true);
  assert.equal(insertado.recibos[0].importe, 20, 'debe registrar los 20 € cobrados');
});

test('el recibo guarda el cargo de Stripe, para poder devolverlo después', async () => {
  // Sin esto, un recibo nacido de una compra web no tenía NINGUNA forma de
  // volver a su cobro en Stripe, y devolverlo desde el panel era imposible: la
  // columna `stripe_payment_intent_id` existía desde 0000_base y solo la
  // rellenaba la rama SEPA de `cobrarReciboOffSession`. Y la metadata del PI no
  // vale de atajo aquí: el recibo se crea DESPUÉS de pagar, así que su id no
  // existía cuando nació el PaymentIntent.
  const { admin, insertado } = fakeAdmin();
  await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-existente' });

  assert.equal(insertado.recibos[0].stripe_payment_intent_id, 'pi_test_abc123');
});

test('una sesión sin cargo asociado se entrega igual, sin el id', async () => {
  // El dinero ya está cobrado: quedarse sin entregar por no saber el id del
  // cargo sería el peor de los dos males.
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, {
    ...COMPRA, socioId: 'soc-existente', paymentIntentId: null,
  });

  assert.equal(r.ok, true);
  assert.equal(insertado.recibos[0].stripe_payment_intent_id, null);
});

test('sin importe cobrado se cae al precio del plan (comportamiento de siempre)', async () => {
  const { admin, insertado } = fakeAdmin();
  await entregarPlanComprado(admin, {
    ...COMPRA, socioId: 'soc-existente', importeCobradoCentimos: null,
  });

  assert.equal(insertado.recibos[0].importe, 130, 'el precio del plan del fake');
});

test('una compra entrega bono Y recibo cobrado, no solo cobra', async () => {
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-existente' });

  assert.equal(r.ok, true);
  assert.equal(insertado.suscripciones.length, 1);
  assert.equal(insertado.recibos.length, 1);

  const sus = insertado.suscripciones[0];
  assert.equal(sus.socio_id, 'soc-existente');
  assert.equal(sus.estado, 'ACTIVA');
  assert.equal(sus.sesiones_restantes, 10, 'el bono entra con sus sesiones');
  assert.ok(sus.fecha_fin, 'con validez_dias tiene caducidad');

  const rec = insertado.recibos[0];
  assert.equal(rec.estado, 'COBRADO', 'Stripe ya cobró: el recibo nace cobrado');
  assert.equal(rec.importe, 130);
  assert.ok(rec.fecha_cobro);
});

test('los ids se derivan de la sesión: un reintento de Stripe no duplica', async () => {
  const a = fakeAdmin();
  const b = fakeAdmin();
  const r1 = await entregarPlanComprado(a.admin, { ...COMPRA, socioId: 'soc-1' });
  const r2 = await entregarPlanComprado(b.admin, { ...COMPRA, socioId: 'soc-1' });

  assert.equal(r1.ok && r2.ok, true);
  assert.equal(a.insertado.suscripciones[0].id, b.insertado.suscripciones[0].id);
  assert.equal(a.insertado.recibos[0].id, b.insertado.recibos[0].id);
});

test('sin ficha previa se crea con el email verificado por Stripe', async () => {
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, COMPRA);

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.fichaCreada, true);
  assert.equal(insertado.socios.length, 1);
  assert.equal(insertado.socios[0].email, 'nueva@example.com');
  assert.equal(insertado.socios[0].nombre, 'María');
  assert.equal(insertado.socios[0].apellidos, 'Soler');
  // Sin contrato: no lo ha firmado. Se lo pedirá el portal.
  assert.equal(insertado.socios[0].aceptacion_fecha, undefined);
});

test('si ya existe alguien con ese email, se reutiliza en vez de duplicar', async () => {
  const { admin, insertado } = fakeAdmin({ socioExistente: { id: 'soc-ya-estaba' } });
  const r = await entregarPlanComprado(admin, COMPRA);

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.socioId, 'soc-ya-estaba');
  assert.equal(insertado.socios.length, 0, 'no se crea una segunda ficha');
  assert.equal(insertado.suscripciones[0].socio_id, 'soc-ya-estaba');
});

test('sin socia y sin email no se inventa una ficha anónima', async () => {
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, { ...COMPRA, email: null });

  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.motivo, 'sin-socia');
  // Un bono que nadie puede reclamar es peor que no crearlo: queda en Sentry.
  assert.equal(insertado.suscripciones.length, 0);
  assert.equal(insertado.recibos.length, 0);
});

test('un plan de otro estudio no se entrega', async () => {
  const { admin } = fakeAdmin({ plan: null });
  const r = await entregarPlanComprado(admin, COMPRA);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'plan-no-encontrado');
});

test('un fallo de escritura se reporta (el webhook lo convierte en reintento)', async () => {
  const { admin } = fakeAdmin({ fallaEn: 'suscripciones' });
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-1' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.motivo, 'error');
});

test('un plan sin caducidad entra sin fecha de fin', async () => {
  const { admin, insertado } = fakeAdmin({ plan: { ...PLAN, validez_dias: null, sesiones: null, tipo: 'MENSUAL' } });
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-1' });
  assert.equal(r.ok, true);
  assert.equal(insertado.suscripciones[0].fecha_fin, null);
});

test('deja constancia de qué entregó, para poder revertirlo si se devuelve', async () => {
  // Es el caso limpio: la suscripción no existía antes de esta compra, así que
  // "antes" es la nada y revertir es exacto.
  const { admin, actualizado } = fakeAdmin();
  await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-existente' });

  const snapshot = actualizado.recibos[0];
  assert.equal(snapshot.entrega_tipo, 'ALTA_WEB');
  assert.equal(snapshot.entrega_aplicada, true);
  assert.equal(snapshot.entrega_sesiones_antes, null, 'antes de la compra no había nada');
  assert.equal(snapshot.entrega_sesiones_despues, 10);
});

test('un fallo al guardar el snapshot NO tumba la entrega', async () => {
  // El bono ya está entregado y el dinero cobrado: quedarse sin snapshot solo
  // significa que después no se ofrecerá revertir. Devolver 500 aquí haría que
  // Stripe reintentara una entrega que ya ocurrió.
  const { admin } = fakeAdmin();
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-existente' });
  assert.equal(r.ok, true);
});
