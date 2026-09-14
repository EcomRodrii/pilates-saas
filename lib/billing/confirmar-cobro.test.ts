import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aplicarEfectosCobro, confirmarCobro, type DependenciasEfectos, type ParamsConfirmarCobro } from './confirmar-cobro.ts';

// El dueño único de «este recibo está cobrado», contra un Supabase de mentira
// y con los efectos sustituidos por un registro. Lo que se fija aquí:
//  · solo quien GANA el compare-and-set aplica efectos;
//  · 0 filas nunca es un éxito a ciegas (reentrega / devuelto / otro cargo);
//  · el orden renovación → factura → notificación → email;
//  · los créditos de renovación, una vez por recibo y solo en renovaciones.

// Fuera del modo de enforcement, el gate de plan no consulta nada.
delete process.env.BILLING_ENFORCED;

type Fila = Record<string, unknown>;
type Filtro = [op: string, columna: string, valor: unknown];

/**
 * `trasCas`: lo que devuelve el UPDATE a COBRADO (null = 0 filas).
 * `actual`: el recibo releído tras 0 filas.
 * `paraEfectos`: el recibo que lee `aplicarEfectosCobro` si no se le da.
 */
function fakeAdmin(opts: { trasCas?: Fila | null; actual?: Fila | null; paraEfectos?: Fila | null; errorCas?: string } = {}) {
  const updates: Array<{ fila: Fila; filtros: Filtro[] }> = [];
  const rpcs: Array<{ nombre: string; args: Fila }> = [];
  const api = {
    rpc(nombre: string, args: Fila) {
      rpcs.push({ nombre, args });
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

const tiene = (filtros: Filtro[], op: string, col: string, val?: unknown) =>
  filtros.some(([o, c, v]) => o === op && c === col && (val === undefined || JSON.stringify(v) === JSON.stringify(val)));

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
  assert.ok(tiene(cas.filtros, 'in', 'estado', ['PENDIENTE', 'FALLIDO', 'DEVUELTO', 'EN_CURSO']));
  assert.ok(tiene(cas.filtros, 'is', 'reembolso_stripe_id', null));
  assert.ok(tiene(cas.filtros, 'is', 'reembolso_solicitado_en', null));
  assert.ok(cas.filtros.some(([o, , v]) => o === 'or' && String(v).includes('stripe_payment_intent_id.neq.pi_nuevo')),
    'un DEVUELTO con este mismo cargo no puede volver a COBRADO');
});

// ── 0 filas ──────────────────────────────────────────────────────────────────

test('0 filas y ya COBRADO con el mismo cargo: reentrega, ningún efecto', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_nuevo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.deepEqual(r, { ok: true, transicion: 'ya_estaba', selladoOk: true });
  assert.deepEqual(orden, [], 'una reentrega no repite renovación, factura, aviso ni email');
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

test('a mano no se cierra un EN_CURSO', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: null, actual: { estado: 'EN_CURSO', stripe_payment_intent_id: 'pi_en_vuelo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, { ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false }, deps);

  const filtroEstados = updates[0].filtros.find(([o, c]) => o === 'in' && c === 'estado')?.[2] as string[];
  assert.equal(filtroEstados.includes('EN_CURSO'), false, 'el UPDATE a mano ni siquiera casa un EN_CURSO');
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
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion', 'email']);
});

// ── Tarjeta guardada ─────────────────────────────────────────────────────────

test('tarjeta guardada ya COBRADA por su webhook: sin email ni efectos', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_nuevo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, { ...BASE, origen: 'off_session', avisarSocia: false, facturaId: 'fac-off-rec-1' }, deps);
  assert.equal(r.ok && r.transicion, 'ya_estaba');
  assert.equal(orden.includes('email'), false);
  assert.deepEqual(orden, []);
});

test('tarjeta guardada que gana: solo PENDIENTE/FALLIDO, sin conciliado_por y sin email', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { orden, deps } = efectos();
  await confirmarCobro(admin, { ...BASE, origen: 'off_session', avisarSocia: false, facturaId: 'fac-off-rec-1' }, deps);
  assert.ok(tiene(updates[0].filtros, 'in', 'estado', ['PENDIENTE', 'FALLIDO']));
  assert.equal('conciliado_por' in updates[0].fila, false, 'el CHECK de conciliado_por no admite off_session');
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion']);
});

// ── Caja ─────────────────────────────────────────────────────────────────────

test('TPV: apunta en caja con quién cobraba; el checkout online no toca la caja', async () => {
  const tpv = efectos();
  await confirmarCobro(fakeAdmin({ trasCas: GANA }).admin,
    { ...BASE, origen: 'tpv', actor: { userId: 'u-1', nombre: 'Recepción' } }, tpv.deps);
  assert.deepEqual(tpv.orden, ['renovacion', 'factura', 'caja', 'notificacion', 'email']);
  assert.deepEqual(tpv.caja[0], { studioId: 'studio-1', reciboId: 'rec-1', actor: { userId: 'u-1', nombre: 'Recepción' } });

  const online = efectos();
  await confirmarCobro(fakeAdmin({ trasCas: GANA }).admin, BASE, online.deps);
  assert.equal(online.orden.includes('caja'), false);
});

// ── Créditos RENOVACION_PLAN ─────────────────────────────────────────────────

test('renovación cobrada: créditos una vez por recibo; la reentrega no los repite', async () => {
  const e = efectos();
  await confirmarCobro(fakeAdmin({ trasCas: { ...GANA, es_renovacion: true } }).admin,
    { ...BASE, origen: 'off_session', avisarSocia: false }, e.deps);
  await confirmarCobro(fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_nuevo' } }).admin,
    { ...BASE, origen: 'webhook' }, e.deps);

  assert.deepEqual(e.creditos, [{ studioId: 'studio-1', reciboId: 'rec-1', socioId: 'soc-1' }]);
  assert.ok(e.orden.indexOf('creditos') < e.orden.indexOf('notificacion'));
});

test('nunca créditos de renovación para un recibo que no lo es', async () => {
  for (const es_renovacion of [false, null]) {
    const e = efectos();
    await confirmarCobro(fakeAdmin({ trasCas: { ...GANA, es_renovacion } }).admin, BASE, e.deps);
    assert.deepEqual(e.creditos, []);
  }
});

test('la concesión real va a la RPC con el id del recibo como ref_id, igual en cada llamada', async () => {
  // Sin sustituir `otorgarCreditos`: la unicidad la pone `reward_actions`
  // UNIQUE (studio_id, trigger, ref_id), así que lo que importa es que una
  // reparación y la transición pidan el MISMO ref_id.
  const { admin, rpcs } = fakeAdmin({ paraEfectos: { socio_id: 'soc-1', es_renovacion: true } });
  const { deps } = efectos();
  const { otorgarCreditos: _usarLaReal, ...resto } = deps;
  const params = { studioId: 'studio-1', reciboId: 'rec-renov-sus-1-2026-09', metodo: 'SEPA', origen: 'webhook' as const, facturaId: 'fac-sepa-x', avisarSocia: false };
  await aplicarEfectosCobro(admin, params, resto);
  await aplicarEfectosCobro(admin, { ...params, reparacion: true }, resto);

  const llamadas = rpcs.filter(r => r.nombre === 'otorgar_credito_disparador');
  assert.equal(llamadas.length, 2);
  for (const l of llamadas) {
    assert.equal(l.args.p_trigger, 'RENOVACION_PLAN');
    assert.equal(l.args.p_ref_id, 'rec-renov-sus-1-2026-09');
    assert.equal(l.args.p_socio_id, 'soc-1');
  }
});

test('el panel concede los créditos de renovación con el MISMO ref_id que el servidor', () => {
  const ctx = readFileSync(join(import.meta.dirname, '..', 'studio-context.tsx'), 'utf8');
  assert.match(ctx, /otorgarCreditos\(recibo\.socioId, 'RENOVACION_PLAN', refIdCreditoRenovacion\(reciboId\)\)/,
    'si el panel usara otro ref_id, marcar cobrado en mostrador y confirmarlo Stripe darían créditos dos veces');
});
