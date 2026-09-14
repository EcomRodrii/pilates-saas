import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aplicarEfectosCobro, cerrarCobroOffSession, confirmarCobro, confirmarCobroExitoso,
  type DependenciasEfectos, type ParamsConfirmarCobro,
} from './confirmar-cobro.ts';

// El dueño único de «este recibo está cobrado», contra un Supabase de mentira
// y con los efectos sustituidos por un registro. Lo que se fija aquí:
//  · solo quien GANA el compare-and-set aplica efectos;
//  · 0 filas nunca es un éxito a ciegas (reentrega / devuelto / otro cargo);
//  · el orden renovación → factura → notificación → email;
//  · los envoltorios de SEPA/tarjeta guardada y del cobro síncrono;
//  · los créditos de renovación, una vez por recibo y solo en renovaciones.

// Fuera del modo de enforcement, el gate de plan no consulta nada.
delete process.env.BILLING_ENFORCED;

type Fila = Record<string, unknown>;
type Filtro = [op: string, columna: string, valor: unknown];

/** `reward_actions` UNIQUE (studio_id, trigger, ref_id), compartible entre llamadas. */
function recompensas() {
  return { claves: new Set<string>(), concedidas: 0, llamadas: [] as Fila[] };
}

/**
 * `trasCas`: lo que devuelve el UPDATE a COBRADO (null = 0 filas).
 * `actual`: el recibo releído tras 0 filas.
 * `paraEfectos`: el recibo que lee `aplicarEfectosCobro` si no se le da.
 */
function fakeAdmin(opts: {
  trasCas?: Fila | null; actual?: Fila | null; paraEfectos?: Fila | null; errorCas?: string;
  reward?: ReturnType<typeof recompensas>;
} = {}) {
  const updates: Array<{ fila: Fila; filtros: Filtro[] }> = [];
  const rpcs: Array<{ nombre: string; args: Fila }> = [];
  const api = {
    rpc(nombre: string, args: Fila) {
      rpcs.push({ nombre, args });
      if (nombre === 'otorgar_credito_disparador' && opts.reward) {
        opts.reward.llamadas.push(args);
        const clave = `${args.p_studio_id}|${args.p_trigger}|${args.p_ref_id}`;
        // Como la RPC: el insert en reward_actions choca por UNIQUE y devuelve
        // otorgado = false, sin sumar créditos.
        if (opts.reward.claves.has(clave)) return Promise.resolve({ data: [{ otorgado: false }], error: null });
        opts.reward.claves.add(clave);
        opts.reward.concedidas++;
        return Promise.resolve({ data: [{ otorgado: true }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from(tabla: string) {
      const filtros: Filtro[] = [];
      let fila: Fila | null = null;
      let columnas = '';
      const b = {
        update(f: Fila) { fila = f; return b; },
        select(c = '') { columnas = c; return b; },
        eq(c: string, v: unknown) { filtros.push(['eq', c, v]); return b; },
        in(c: string, v: unknown) { filtros.push(['in', c, v]); return b; },
        is(c: string, v: unknown) { filtros.push(['is', c, v]); return b; },
        or(expr: string) { filtros.push(['or', '', expr]); return b; },
        maybeSingle() {
          if (tabla !== 'recibos') return Promise.resolve({ data: null, error: null });
          if (fila) {
            updates.push({ fila, filtros });
            if (opts.errorCas) return Promise.resolve({ data: null, error: { message: opts.errorCas } });
            return Promise.resolve({ data: opts.trasCas ?? null, error: null });
          }
          if (columnas.includes('stripe_payment_intent_id')) return Promise.resolve({ data: opts.actual ?? null, error: null });
          return Promise.resolve({ data: opts.paraEfectos ?? null, error: null });
        },
        // `await admin.from(..).update(..).eq(..)` sin `.maybeSingle()`.
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
          if (fila) updates.push({ fila, filtros });
          return Promise.resolve({ data: null, error: null }).then(ok, ko);
        },
      };
      return b;
    },
  };
  return { admin: api as never, updates, rpcs };
}

/** Efectos de mentira: apuntan en qué orden se llamaron. */
function efectos(opts: { selladoFalla?: boolean } = {}) {
  const orden: string[] = [];
  const creditos: Fila[] = [];
  const caja: Fila[] = [];
  const deps: DependenciasEfectos = {
    renovar: async () => { orden.push('renovacion'); },
    sellar: async () => {
      orden.push('factura');
      return opts.selladoFalla
        ? { ok: false, error: 'Configura un NIF fiscal válido' }
        : { ok: true, sellada: true, factura: { numeroCompleto: 'F2026-0007' } };
    },
    apuntarCaja: async (_a, p) => { orden.push('caja'); caja.push(p as unknown as Fila); },
    otorgarCreditos: async (_a, p) => { orden.push('creditos'); creditos.push(p as unknown as Fila); },
    notificar: async () => { orden.push('notificacion'); },
    enviarEmail: async () => { orden.push('email'); },
  };
  return { orden, creditos, caja, deps };
}

const BASE: ParamsConfirmarCobro = {
  studioId: 'studio-1', reciboId: 'rec-1', metodo: 'TARJETA', origen: 'webhook',
  paymentIntentId: 'pi_nuevo', avisarSocia: true, facturaId: 'fac-checkout-rec-1',
};
const GANA = { id: 'rec-1', socio_id: 'soc-1', es_renovacion: false };
const YA_COBRADO = { estado: 'COBRADO', stripe_payment_intent_id: 'pi_nuevo' };

const tiene = (filtros: Filtro[], op: string, col: string, val?: unknown) =>
  filtros.some(([o, c, v]) => o === op && c === col && (val === undefined || JSON.stringify(v) === JSON.stringify(val)));
const estadosDelCas = (u: { filtros: Filtro[] }) => u.filtros.find(([o, c]) => o === 'in' && c === 'estado')?.[2] as string[];
const huboCobrado = (updates: Array<{ fila: Fila }>) => updates.filter(u => u.fila.estado === 'COBRADO').length;

// ── Gana la transición ───────────────────────────────────────────────────────

test('gana: renovación → factura → notificación → email, en un UPDATE con sus guardas', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);

  assert.deepEqual(r, { ok: true, transicion: 'aplicada', selladoOk: true, numeroFactura: 'F2026-0007' });
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion', 'email']);

  const cas = updates[0];
  assert.equal(cas.fila.estado, 'COBRADO');
  assert.equal(cas.fila.stripe_payment_intent_id, 'pi_nuevo');
  // conciliado_por en el MISMO UPDATE que marca COBRADO, no en otro aparte.
  assert.equal(cas.fila.conciliado_por, 'webhook');
  assert.ok(tiene(cas.filtros, 'eq', 'studio_id', 'studio-1'), 'acotado al estudio');
  assert.deepEqual(estadosDelCas(cas), ['PENDIENTE', 'FALLIDO', 'DEVUELTO', 'EN_CURSO']);
  assert.ok(tiene(cas.filtros, 'is', 'reembolso_stripe_id', null));
  assert.ok(tiene(cas.filtros, 'is', 'reembolso_solicitado_en', null));
  const or = String(cas.filtros.find(([o]) => o === 'or')?.[2]);
  assert.ok(or.includes('and(estado.eq.DEVUELTO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.neq.pi_nuevo))'),
    'un DEVUELTO con este mismo cargo no puede volver a COBRADO');
  assert.ok(or.includes('and(estado.eq.EN_CURSO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.eq.pi_nuevo))'),
    'un EN_CURSO solo lo cierra su propio cargo');
});

test('sellada con éxito: se quita factura_pendiente_sellar, solo si estaba puesta', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  await confirmarCobro(admin, BASE, efectos().deps);
  const limpia = updates.find(u => u.fila.factura_pendiente_sellar === false);
  assert.ok(limpia, 'la marca de un intento fallido anterior no puede quedarse puesta');
  assert.ok(tiene(limpia.filtros, 'eq', 'factura_pendiente_sellar', true), 'solo toca la fila si la marca estaba');
});

// ── 0 filas ──────────────────────────────────────────────────────────────────

test('0 filas y ya COBRADO con el mismo cargo: reentrega, ningún efecto', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: YA_COBRADO });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.deepEqual(r, { ok: true, transicion: 'ya_estaba', selladoOk: true });
  assert.deepEqual(orden, [], 'una reentrega no repite renovación, factura, aviso ni email');
});

test('TPV que llega segundo: repite solo el apunte de caja (idempotente), nada más', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: YA_COBRADO });
  const { orden, caja, deps } = efectos();
  const r = await confirmarCobro(admin, { ...BASE, origen: 'tpv', actor: { userId: 'u-1', nombre: 'Recepción' } }, deps);
  assert.equal(r.ok && r.transicion, 'ya_estaba');
  assert.deepEqual(orden, ['caja']);
  assert.deepEqual(caja[0], { studioId: 'studio-1', reciboId: 'rec-1', actor: { userId: 'u-1', nombre: 'Recepción' } });
});

test('DEVUELTO con el mismo cargo: no se resucita ni se repiten efectos', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: null, actual: { estado: 'DEVUELTO', stripe_payment_intent_id: 'pi_nuevo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.deepEqual(r, { ok: true, transicion: 'devuelto', selladoOk: true });
  assert.deepEqual(orden, []);
  assert.equal(updates.length, 1, 'solo el intento de CAS, ninguna escritura más');
});

test('COBRADO con OTRO cargo: se reporta como no cobrable, nunca un éxito silencioso', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_viejo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, 'NO_COBRABLE');
  assert.deepEqual(orden, []);
});

test('EN_CURSO con otro cargo en vuelo: no lo cierra, se reporta', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_en_vuelo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.equal(!r.ok && r.codigo, 'NO_COBRABLE');
  assert.deepEqual(orden, []);
});

test('a mano no se cierra un EN_CURSO', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: null, actual: { estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_en_vuelo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, { ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false }, deps);

  assert.equal(estadosDelCas(updates[0]).includes('EN_CURSO'), false, 'el UPDATE a mano ni siquiera casa un EN_CURSO');
  assert.equal(updates[0].fila.conciliado_por, 'manual');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, 'NO_COBRABLE');
  assert.deepEqual(orden, []);
});

test('no existe (u otro estudio): NO_ENCONTRADO y ningún efecto', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: null });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.equal(!r.ok && r.codigo, 'NO_ENCONTRADO');
  assert.deepEqual(orden, []);
});

test('error al escribir: PERSISTENCIA y ningún efecto', async () => {
  const { admin } = fakeAdmin({ errorCas: 'timeout' });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.deepEqual(r, { ok: false, codigo: 'PERSISTENCIA', error: 'timeout' });
  assert.deepEqual(orden, []);
});

// ── Factura ──────────────────────────────────────────────────────────────────

test('el sellado falla: queda factura_pendiente_sellar y el email sale igual, después', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { orden, deps } = efectos({ selladoFalla: true });
  const r = await confirmarCobro(admin, BASE, deps);

  assert.equal(r.ok && r.transicion, 'aplicada', 'un fallo de factura nunca deshace el cobro');
  assert.equal(r.ok && r.selladoOk, false);
  assert.ok(updates.some(u => u.fila.factura_pendiente_sellar === true), 'el conciliador tiene que poder reintentarlo');
  assert.equal(updates.some(u => u.fila.factura_pendiente_sellar === false), false);
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion', 'email']);
});

// ── Caja ─────────────────────────────────────────────────────────────────────

test('TPV que gana: apunta en caja con quién cobraba; el checkout online no toca la caja', async () => {
  const tpv = efectos();
  await confirmarCobro(fakeAdmin({ trasCas: GANA }).admin,
    { ...BASE, origen: 'tpv', actor: { userId: 'u-1', nombre: 'Recepción' } }, tpv.deps);
  assert.deepEqual(tpv.orden, ['renovacion', 'factura', 'caja', 'notificacion', 'email']);

  const online = efectos();
  await confirmarCobro(fakeAdmin({ trasCas: GANA }).admin, BASE, online.deps);
  assert.equal(online.orden.includes('caja'), false);
});

// ── SEPA / tarjeta guardada: confirmarCobroExitoso ───────────────────────────

const EXITOSO = { reciboId: 'rec-1', studioId: 'studio-1', paymentIntentId: 'pi_nuevo', fuente: 'webhook' as const };

test('confirmarCobroExitoso nunca casa un DEVUELTO: solo PENDIENTE, FALLIDO y EN_CURSO', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { orden, deps } = efectos();
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'SEPA' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(estadosDelCas(updates[0]), ['PENDIENTE', 'FALLIDO', 'EN_CURSO']);
  assert.equal(updates[0].fila.sepa_estado, 'succeeded');
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion', 'email'], 'la factura, antes del email');
});

test('confirmarCobroExitoso: DEVUELTO sin cargo guardado no se resucita (y no pide reintento)', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: null, actual: { estado: 'DEVUELTO', stripe_payment_intent_id: null } });
  const { orden, deps } = efectos();
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'SEPA' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(estadosDelCas(updates[0]).includes('DEVUELTO'), false);
  assert.equal(updates.length, 1, 'ninguna escritura aparte del intento de CAS');
  assert.deepEqual(orden, []);
});

test('confirmarCobroExitoso: DEVUELTO con el mismo cargo, sin efectos', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'DEVUELTO', stripe_payment_intent_id: 'pi_nuevo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'SEPA' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(orden, []);
});

test('confirmarCobroExitoso: un recibo que no existe se sigue llamando «Recibo no encontrado»', async () => {
  // El webhook usa ese texto para detectar un cobro que apunta a otro estudio.
  const { admin } = fakeAdmin({ trasCas: null, actual: null });
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'TARJETA' }, efectos().deps);
  assert.deepEqual(r, { ok: false, error: 'Recibo no encontrado' });
});

test('confirmarCobroExitoso, tarjeta ya cerrada por el camino síncrono: repara sin email ni aviso', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: YA_COBRADO, paraEfectos: { socio_id: 'soc-1', es_renovacion: false } });
  const { orden, deps } = efectos();
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'TARJETA' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(orden, ['renovacion', 'factura'], 'lo idempotente se repara; email y aviso, como antes, no');
});

test('confirmarCobroExitoso, reentrega SEPA: repara con el aviso de siempre, sin email', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: YA_COBRADO, paraEfectos: { socio_id: 'soc-1', es_renovacion: false } });
  const { orden, deps } = efectos();
  await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'SEPA' }, deps);
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion']);
});

// ── Tarjeta guardada síncrona: cerrarCobroOffSession ─────────────────────────

const OFF = { studioId: 'studio-1', reciboId: 'rec-1', socioId: 'soc-1', metodo: 'TARJETA', paymentIntentId: 'pi_nuevo' };

test('cobro síncrono que gana: renovación y factura, sin aviso al estudio ni email', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { orden, deps } = efectos();
  const r = await cerrarCobroOffSession(admin, OFF, deps);
  assert.deepEqual(r, {});
  assert.deepEqual(estadosDelCas(updates[0]), ['PENDIENTE', 'FALLIDO']);
  assert.equal('conciliado_por' in updates[0].fila, false, 'el CHECK de conciliado_por no admite off_session');
  assert.deepEqual(orden, ['renovacion', 'factura']);
});

test('cobro síncrono que pierde contra su propio webhook: cerrado, sin efectos dobles', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: YA_COBRADO });
  const { orden, deps } = efectos();
  const r = await cerrarCobroOffSession(admin, OFF, deps);
  assert.deepEqual(r, {});
  assert.deepEqual(orden, []);
});

test('cobro síncrono que pierde contra OTRO camino: COBRADO_SIN_PERSISTIR y ningún efecto', async () => {
  // Mientras Stripe cobraba, el mostrador lo marcó cobrado a mano: el cargo ya
  // entró, pero este recibo no puede darse por cerrado con él.
  const { admin, updates } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: null } });
  const { orden, deps } = efectos();
  const r = await cerrarCobroOffSession(admin, OFF, deps);
  assert.equal(r.aviso, 'COBRADO_SIN_PERSISTIR');
  assert.ok(r.error);
  assert.deepEqual(orden, []);
  assert.equal(huboCobrado(updates), 1, 'solo el intento de CAS');
});

// ── Créditos RENOVACION_PLAN ─────────────────────────────────────────────────

test('créditos de renovación: una sola concesión aunque la reparación repita los efectos', async () => {
  // Repetición REAL: el adeudo SEPA se confirma (gana y concede) y la
  // reentrega del mismo evento repara los efectos, que vuelven a pedir los
  // créditos a la RPC con el mismo ref_id. El UNIQUE de reward_actions lo para.
  const reward = recompensas();
  const { otorgarCreditos: _usarLaReal, ...resto } = efectos().deps;
  const RENOV = { studioId: 'studio-1', reciboId: 'rec-renov-sus-1-2026-09', paymentIntentId: 'pi_sepa', fuente: 'webhook' as const, metodo: 'SEPA' as const };

  await confirmarCobroExitoso(
    { admin: fakeAdmin({ trasCas: { id: RENOV.reciboId, socio_id: 'soc-1', es_renovacion: true }, reward }).admin, ...RENOV },
    resto,
  );
  await confirmarCobroExitoso(
    {
      admin: fakeAdmin({
        trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_sepa' },
        paraEfectos: { socio_id: 'soc-1', es_renovacion: true }, reward,
      }).admin,
      ...RENOV,
    },
    resto,
  );

  assert.equal(reward.llamadas.length, 2, 'la reparación sí vuelve a pedirlos');
  assert.equal(reward.concedidas, 1, 'pero solo se conceden una vez');
  for (const l of reward.llamadas) {
    assert.equal(l.p_trigger, 'RENOVACION_PLAN');
    assert.equal(l.p_ref_id, RENOV.reciboId);
    assert.equal(l.p_socio_id, 'soc-1');
  }
});

test('nunca créditos de renovación para un recibo que no lo es', async () => {
  for (const es_renovacion of [false, null]) {
    const e = efectos();
    await confirmarCobro(fakeAdmin({ trasCas: { ...GANA, es_renovacion } }).admin, BASE, e.deps);
    assert.deepEqual(e.creditos, []);
  }
});

test('aplicarEfectosCobro lee el recibo si no se le da, para decidir los créditos', async () => {
  const { admin } = fakeAdmin({ paraEfectos: { socio_id: 'soc-1', es_renovacion: true } });
  const e = efectos();
  await aplicarEfectosCobro(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', metodo: 'TARJETA', origen: 'off_session', facturaId: 'fac-off-rec-1', avisarSocia: false,
  }, e.deps);
  assert.deepEqual(e.creditos, [{ studioId: 'studio-1', reciboId: 'rec-1', socioId: 'soc-1' }]);
  assert.ok(e.orden.indexOf('creditos') > e.orden.indexOf('factura'));
});

test('el panel concede los créditos de renovación con el MISMO ref_id que el servidor', () => {
  const ctx = readFileSync(join(import.meta.dirname, '..', 'studio-context.tsx'), 'utf8');
  assert.match(ctx, /otorgarCreditos\(recibo\.socioId, 'RENOVACION_PLAN', refIdCreditoRenovacion\(reciboId\)\)/,
    'si el panel usara otro ref_id, marcar cobrado en mostrador y confirmarlo Stripe darían créditos dos veces');
});
