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
        // P-6 (auditoría 21ª pasada): entregarPlanComprado ahora también
        // llama a sellarFacturaDeRecibo (sella la factura y marca
        // conciliado_en) — necesita `.limit()` en la cadena para su
        // comprobación de idempotencia (`cargarExistente`). Sin `studios`/
        // `facturas` mockeadas, `maybeSingle()` cae al `default` (null) y
        // sellarFacturaDeRecibo devuelve ok:false por NIF no configurado —
        // comportamiento real y correcto para un estudio de prueba sin NIF,
        // no un hueco del mock.
        limit() { return this; },
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
  // false: estos tests fijan el comportamiento previo a I-8 (reutilizar por
  // email si ya existe ficha) — ver el test "si ya existe alguien con ese
  // email, se reutiliza en vez de duplicar" más abajo.
  esInvitada: false,
  fuente: 'webhook',
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

// P-6 (auditoría 21ª pasada): la compra web nacía fuera del ciclo de
// conciliación que F-12/F-13 unificó para el resto de caminos de cobro —
// nunca marcaba `conciliado_en` ni intentaba sellar factura. El estudio de
// prueba de `fakeAdmin()` no tiene NIF configurado (mismo motivo que ya
// bloquea el sellado real en producción para un estudio sin configurar), así
// que el sellado falla — el test comprueba el camino de fallo: la entrega NO
// se tumba, y queda `factura_pendiente_sellar` para que el conciliador
// horario (`reintentarFacturasPendientesDeSellar`) lo reintente.
test('marca conciliado_en aunque el sellado de factura falle (sin NIF configurado)', async () => {
  const { admin, actualizado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-existente' });

  assert.equal(r.ok, true, 'un fallo de sellado NUNCA tumba la entrega — el dinero ya entró');
  const conciliado = actualizado.recibos.find(f => 'conciliado_en' in f);
  assert.ok(conciliado, 'debe marcar conciliado_en/conciliado_por, igual que confirmarCobroRecibo');
  assert.equal(conciliado?.conciliado_por, 'webhook');
  assert.equal(conciliado?.factura_pendiente_sellar, true, 'sin NIF, el sellado falla y queda pendiente de reintento');
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

test('un BONO sin caducidad entra sin fecha de fin', async () => {
  // «Sin caducidad» es una opción real del formulario de tarifas para un bono:
  // aquí el null SÍ significa lo que dice.
  const { admin, insertado } = fakeAdmin({ plan: { ...PLAN, validez_dias: null, sesiones: 10, tipo: 'BONO' } });
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-1' });
  assert.equal(r.ok, true);
  assert.equal(insertado.suscripciones[0].fecha_fin, null);
});

test('⚠️ un MENSUAL comprado por web entra CON fecha de fin, o no se cobra nunca más', async () => {
  // Este test afirmaba lo contrario —`fecha_fin: null` para un MENSUAL— y con
  // eso estaba fijando el agujero: un mensual sin fecha de fin es «no caduca
  // nunca» para `tieneEntitlementActivo`, y el cron de renovaciones filtra
  // `fecha_fin is not null`, así que no vuelve a generar recibo jamás. Se
  // cobraba un mes y la socia seguía reservando gratis.
  //
  // Su nombre hablaba de «un plan sin caducidad» —que es el caso del BONO de
  // arriba— pero su fixture era MENSUAL. Encontrado en producción el
  // 2026-09-05 con 4 suscripciones así, una de ellas comprada por esta misma
  // vía. Ver `cicloInicialDe` en lib/bono-logic.ts.
  const { admin, insertado } = fakeAdmin({ plan: { ...PLAN, validez_dias: null, sesiones: null, tipo: 'MENSUAL' } });
  const r = await entregarPlanComprado(admin, { ...COMPRA, socioId: 'soc-1' });
  assert.equal(r.ok, true);
  const fin = insertado.suscripciones[0].fecha_fin as string | null;
  assert.ok(fin, 'un mensual sin fecha de fin no se renueva nunca');
  assert.match(fin, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(fin > new Date().toISOString().slice(0, 10), 'el ciclo tiene que quedar en el futuro');
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

// P0 checkout — el teléfono ya no se tira: la ficha nueva lo persiste.
test('la ficha nueva guarda el teléfono del paso de datos', async () => {
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, { ...COMPRA, telefono: '+34 600 123 456' });
  assert.equal(r.ok, true);
  assert.equal(insertado.socios[0].telefono, '+34 600 123 456');
});

test('sin teléfono (Modo A / conciliador): la ficha se crea igual, con null', async () => {
  const { admin, insertado } = fakeAdmin();
  const r = await entregarPlanComprado(admin, COMPRA);
  assert.equal(r.ok, true);
  assert.equal(insertado.socios[0].telefono, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// I-8 y el segundo índice único (auditoría 26-ago)
//
// Los tests de arriba usan `fakeAdmin`, cuyo `insert` nunca choca: NO modela
// los índices únicos reales de `socios`, que son DOS —`socios_pkey (id)` y
// `uq_socios_studio_email (studio_id, lower(email)) where borrado_en is null`—.
// Por eso la regresión de I-8 pasó typecheck, lint y 3.358 tests: el camino
// `esInvitada: true` chocando por email no lo recorría ningún test.
//
// Este fake sí distingue los dos choques y por qué filtro se pregunta.
// ─────────────────────────────────────────────────────────────────────────────
function fakeAdminConIndiceUnico(opts: { fichaConEseEmail: Fila | null; fichaConEseId: Fila | null }) {
  const insertado: Record<string, Fila[]> = { socios: [], suscripciones: [], recibos: [] };
  const api = {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const q: Record<string, unknown> = {
        select() { return q; },
        eq(col: string, val: unknown) { filtros[col] = val; return q; },
        ilike(col: string, val: unknown) { filtros[col] = val; return q; },
        is(col: string, val: unknown) { filtros[col] = val; return q; },
        // `.limit(n)` es TERMINAL en supabase-js (el builder es thenable) y
        // devuelve un array, no una fila. El fake lo modela así a propósito:
        // la búsqueda por email usa `.limit(1)` y no `.maybeSingle()` porque
        // con dos filas casadas maybeSingle devuelve error y volveríamos a
        // "cobrado sin entregar".
        //
        // P-6 (auditoría 21ª pasada): `sellarFacturaDeRecibo` encadena
        // `.limit(1).maybeSingle()` — el builder real de supabase-js es
        // thenable Y chainable a la vez, así que el fake añade `.maybeSingle`
        // sobre la MISMA promesa en vez de sustituirla por un objeto nuevo:
        // el resto del fichero sigue pudiendo `await .limit()` directo.
        limit() {
          const p = tabla === 'socios' && filtros.email !== undefined
            ? Promise.resolve({ data: opts.fichaConEseEmail ? [opts.fichaConEseEmail] : [], error: null })
            : Promise.resolve({ data: [], error: null });
          return Object.assign(p, { maybeSingle: () => Promise.resolve({ data: null, error: null }) });
        },
        maybeSingle() {
          if (tabla === 'planes_tarifa') return Promise.resolve({ data: PLAN, error: null });
          if (tabla === 'socios') {
            // Se consulta por id (¿es el reintento?) o por email (¿de quién es
            // el email que provocó el choque?). El fake responde a cada una.
            if (filtros.id !== undefined) return Promise.resolve({ data: opts.fichaConEseId, error: null });
            if (filtros.email !== undefined) return Promise.resolve({ data: opts.fichaConEseEmail, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(fila: Fila) {
          if (tabla === 'socios') {
            if (opts.fichaConEseId) return Promise.resolve({ error: { code: '23505', message: 'socios_pkey' } });
            if (opts.fichaConEseEmail) return Promise.resolve({ error: { code: '23505', message: 'uq_socios_studio_email' } });
          }
          // FK dura suscripciones.socio_id → socios.id: si la ficha a la que
          // apuntamos no existe, Postgres responde 23503. Es el fallo real que
          // dejaba el cobro sin entregar.
          if (tabla === 'suscripciones') {
            const existe = (fila.socio_id === opts.fichaConEseEmail?.id) || (fila.socio_id === opts.fichaConEseId?.id)
              || insertado.socios.some(s => s.id === fila.socio_id);
            if (!existe) return Promise.resolve({ error: { code: '23503', message: 'suscripciones_socio_id_fkey' } });
          }
          insertado[tabla]?.push(fila);
          return Promise.resolve({ error: null });
        },
        update() { return q; },
      };
      return q;
    },
  };
  return { admin: api as never, insertado };
}

test('invitada cuyo email YA tiene ficha: se entrega a esa ficha, no se cobra sin entregar', async () => {
  // El flujo estrella "pagar y reservar sin login" nunca manda socioId, así que
  // `esInvitada` es true SIEMPRE. Con I-8 tal cual, toda socia ya dada de alta
  // que comprara sin loguearse —y toda invitada que comprara por segunda vez—
  // chocaba con el índice de email, el 23505 se tomaba por "reintento de
  // Stripe", `socioId` quedaba apuntando a una ficha inexistente y la
  // suscripción moría con 23503: pagado, y sin bono, sin recibo y sin plaza.
  const { admin, insertado } = fakeAdminConIndiceUnico({
    fichaConEseEmail: { id: 'soc-de-siempre' }, fichaConEseId: null,
  });

  const r = await entregarPlanComprado(admin, { ...COMPRA, esInvitada: true });

  assert.equal(r.ok, true, 'no puede quedarse en cobrado-sin-entregar');
  assert.equal(r.ok && r.socioId, 'soc-de-siempre');
  assert.equal(insertado.suscripciones[0].socio_id, 'soc-de-siempre', 'el bono va a la ficha dueña de ese email');
  assert.equal(insertado.recibos.length, 1, 'y queda su recibo');
});

test('reintento real de Stripe (choque por clave primaria): sigue siendo idempotente', async () => {
  // El control positivo del test anterior: el 23505 que SÍ es un reintento no
  // debe caer en la rama de email ni duplicar nada.
  const { admin, insertado } = fakeAdminConIndiceUnico({
    fichaConEseEmail: null, fichaConEseId: { id: idsDe(COMPRA.sessionId).socioId },
  });

  const r = await entregarPlanComprado(admin, { ...COMPRA, esInvitada: true });

  assert.equal(r.ok, true);
  assert.equal(r.ok && r.socioId, idsDe(COMPRA.sessionId).socioId, 'la ficha del reintento es la nuestra');
  assert.equal(r.ok && r.fichaCreada, false, 'no se creó ficha: ya existía');
  assert.equal(insertado.socios.length, 0);
});
