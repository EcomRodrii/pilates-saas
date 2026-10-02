import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aplicarEfectosCobro, cerrarCobroOffSession, desdeReintentoFactura, confirmarCobro, confirmarCobroExitoso,
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
function efectos(opts: { selladoFalla?: boolean; desactivada?: boolean; renovacion?: 'fallo' | 'lanza' } = {}) {
  const orden: string[] = [];
  const creditos: Fila[] = [];
  const caja: Fila[] = [];
  const deps: DependenciasEfectos = {
    renovar: async () => {
      orden.push('renovacion');
      if (opts.renovacion === 'lanza') throw new Error('RPC caída');
      return opts.renovacion === 'fallo' ? { aplicada: false, tipo: 'BONO', antes: null, despues: null, fallo: true } : undefined;
    },
    sellar: async () => {
      orden.push('factura');
      if (opts.desactivada) return { ok: false, desactivada: true, error: 'Este estudio no emite facturas desde Tentare.' };
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
  // Dos `or` independientes (PostgREST los suma con AND): el del cargo y el del reembolso.
  const ors = cas.filtros.filter(([o]) => o === 'or').map(([, , v]) => String(v));
  assert.ok(ors.some(or => or.includes('and(estado.eq.DEVUELTO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.neq.pi_nuevo))')),
    'un DEVUELTO con este mismo cargo no puede volver a COBRADO');
  // F0: un DEVUELTO que el estudio REEMBOLSÓ (importe_devuelto > 0) no se cobra otra vez.
  assert.ok(ors.includes('estado.neq.DEVUELTO,importe_devuelto.eq.0'), 'un reembolso no se puede volver a cobrar');
  assert.ok(ors.some(or => or.includes('and(estado.eq.EN_CURSO,or(stripe_payment_intent_id.is.null,stripe_payment_intent_id.eq.pi_nuevo))')),
    'un EN_CURSO solo lo cierra su propio cargo');
});

test('sellada con éxito: se quita factura_pendiente_sellar, solo si estaba puesta', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  await confirmarCobro(admin, BASE, efectos().deps);
  const limpia = updates.find(u => u.fila.factura_pendiente_sellar === false);
  assert.ok(limpia, 'la marca de un intento fallido anterior no puede quedarse puesta');
  assert.ok(tiene(limpia.filtros, 'eq', 'factura_pendiente_sellar', true), 'solo toca la fila si la marca estaba');
});

test('la renovación no se pudo entregar: el cobro sigue y el resultado lo dice (no es un éxito limpio)', async () => {
  for (const renovacion of ['fallo', 'lanza'] as const) {
    const { admin } = fakeAdmin({ trasCas: { ...GANA, es_renovacion: true } });
    const { orden, deps } = efectos({ renovacion });
    const r = await confirmarCobro(admin, BASE, deps);
    assert.equal(r.ok && r.transicion, 'aplicada', renovacion);
    assert.equal(r.ok && r.renovacionFallida, true, renovacion);
    // Y el resto de efectos no se pierde por eso.
    assert.ok(orden.includes('factura'), renovacion);
  }
});

test('la renovación entregada no lleva `renovacionFallida`', async () => {
  const { admin } = fakeAdmin({ trasCas: GANA });
  const { deps } = efectos();
  const r = await confirmarCobro(admin, BASE, deps);
  assert.equal(r.ok && 'renovacionFallida' in r, false);
});

test('estudio sin facturas desde Tentare: el cobro sigue igual, sin marca de pendiente ni «sellado fallido»', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { orden, deps } = efectos({ desactivada: true });
  const r = await confirmarCobro(admin, BASE, deps);
  assert.deepEqual(r, { ok: true, transicion: 'aplicada', selladoOk: true });
  assert.deepEqual(orden, ['renovacion', 'factura', 'notificacion', 'email'], 'el resto de efectos no cambia');
  assert.ok(!updates.some(u => u.fila.factura_pendiente_sellar === true), 'no es un fallo: no se marca para reintentar');
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

test('a mano sobre un recibo que ya cobró un «marcar cobrado»: repara el apunte de caja', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: null, conciliado_por: 'manual' } });
  const { orden, caja, deps } = efectos();
  const r = await confirmarCobro(admin, {
    ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false,
    facturaId: 'fac-manual-rec-1', actor: { userId: 'u-1', nombre: 'Cloe' },
  }, deps);
  assert.equal(r.ok && r.transicion, 'ya_estaba');
  assert.deepEqual(orden, ['caja']);
  assert.equal(caja.length, 1);
});

test('a mano sobre un recibo que la socia ya pagó online: NO se escribe en la caja', async () => {
  for (const conciliadoPor of ['webhook', 'conciliador', null]) {
    const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_online', conciliado_por: conciliadoPor } });
    const { orden, caja, deps } = efectos();
    const r = await confirmarCobro(admin, {
      ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false,
      facturaId: 'fac-manual-rec-1', actor: { userId: 'u-1', nombre: 'Cloe' },
    }, deps);
    assert.equal(r.ok && r.transicion, 'ya_estaba', String(conciliadoPor));
    assert.deepEqual(orden, [], `cerrado por ${conciliadoPor}: el dinero no pasó por el cajón`);
    assert.deepEqual(caja, []);
  }
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

test('a mano «sin especificar»: no pisa el método del recibo y factura según el que tenía', async () => {
  // El panel antes decidía la factura con `metodo ?? recibo.metodoCobro`. Si el
  // recibo ya decía EFECTIVO, no se emitía; con null tampoco puede emitirse aquí.
  for (const [metodoGuardado, factura] of [['EFECTIVO', false], ['BIZUM', true], [null, true]] as const) {
    const { admin, updates } = fakeAdmin({ trasCas: { ...GANA, metodo_cobro: metodoGuardado } });
    const { orden, deps } = efectos();
    const r = await confirmarCobro(admin, {
      ...BASE, origen: 'manual', metodo: null, paymentIntentId: null, avisarSocia: false, facturaId: 'fac-manual-rec-1',
    }, deps);
    assert.equal(r.ok && r.transicion, 'aplicada');
    assert.equal('metodo_cobro' in updates[0].fila, false, 'sin método no se escribe la columna');
    assert.equal(orden.includes('factura'), factura, `metodo guardado ${metodoGuardado}`);
    assert.deepEqual(orden.filter(p => p === 'email' || p === 'notificacion'), [], 'a mano ni email ni aviso');
  }
});

test('a mano con método: lo escribe en el mismo UPDATE y apunta la caja', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: { ...GANA, metodo_cobro: 'EFECTIVO' } });
  const { orden, deps, caja } = efectos();
  await confirmarCobro(admin, {
    ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false,
    facturaId: 'fac-manual-rec-1', actor: { userId: 'u-1', nombre: 'Cloe' },
  }, deps);
  assert.equal(updates[0].fila.metodo_cobro, 'EFECTIVO');
  assert.deepEqual(orden, ['renovacion', 'caja']);
  assert.deepEqual(caja, [{ studioId: 'studio-1', reciboId: 'rec-1', actor: { userId: 'u-1', nombre: 'Cloe' } }]);
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

test('confirmarCobroExitoso: un cobro sobre un recibo ANULADO no renueva ni sella, y no pide reintento', async () => {
  // El dinero entró: `confirmarCobro` avisa para devolverlo. Devolver error haría
  // que Stripe reintentara para siempre un evento que no se puede aplicar.
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'ANULADO', stripe_payment_intent_id: null } });
  const { orden, deps } = efectos();
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, metodo: 'TARJETA' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(orden, []);
});

test('confirmarCobroExitoso: un SEGUNDO cargo sobre un recibo ya cobrado se avisa y no se reintenta', async () => {
  const { admin } = fakeAdmin({ trasCas: null, actual: { estado: 'COBRADO', stripe_payment_intent_id: 'pi_viejo' } });
  const { orden, deps } = efectos();
  const r = await confirmarCobroExitoso({ admin, ...EXITOSO, paymentIntentId: 'pi_otro', metodo: 'TARJETA' }, deps);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(orden, [], 'ni renovación ni factura sobre un cobro que no es el que cerró el recibo');
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

test('el panel ya no concede créditos de renovación por su cuenta: los da el servidor con el ref_id del recibo', () => {
  const ctx = readFileSync(join(import.meta.dirname, '..', 'studio-context.tsx'), 'utf8');
  assert.doesNotMatch(ctx, /otorgarCreditos\(recibo\.socioId, 'RENOVACION_PLAN'/,
    'si el panel volviera a conceder por su cuenta, marcar cobrado en mostrador y confirmarlo Stripe podrían dar créditos dos veces');
  const srv = readFileSync(join(import.meta.dirname, 'confirmar-cobro.ts'), 'utf8');
  assert.match(srv, /p_ref_id: refIdCreditoRenovacion\(p\.reciboId\)/, 'el servidor concede con el ref_id compartido');
});

// ── «El banco lo ha cobrado» (origen `banco`) ────────────────────────────────
// Lo que salió en una remesa se quedaba EN_CURSO para siempre: nadie podía
// cerrarlo, y una cuota que iba por el banco no se renovaba.

test('«El banco lo ha cobrado»: solo cierra un EN_CURSO sin ningún cobro de Stripe en marcha, en el propio UPDATE', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: { ...GANA, metodo_cobro: 'SEPA', es_renovacion: true } });
  const { orden, deps } = efectos();
  const r = await confirmarCobro(admin, {
    ...BASE, origen: 'banco', metodo: 'SEPA', paymentIntentId: null, avisarSocia: false, facturaId: 'fac-manual-rec-1',
  }, deps);
  assert.equal(r.ok && r.transicion, 'aplicada');
  assert.deepEqual(estadosDelCas(updates[0]), ['EN_CURSO'], 'ni lo pendiente ni lo devuelto: eso se cobra con «Cobrar»');
  for (const col of ['proximo_reintento', 'stripe_payment_intent_id', 'checkout_session_id', 'cobro_mostrador_pi']) {
    assert.ok(tiene(updates[0].filtros, 'is', col, null), `${col} a null: un adeudo de Stripe en vuelo lo cierra su webhook`);
  }
  assert.equal(updates[0].fila.metodo_cobro, 'SEPA');
  assert.equal(updates[0].fila.sepa_estado, 'succeeded', 'el adeudo se liquidó');
  assert.equal(updates[0].fila.conciliado_por, 'manual', 'el CHECK no cambia: lo marca una persona');
  // Se entrega lo pagado (por fin se renueva la cuota), sin caja (no pasó por el cajón) ni aviso.
  assert.equal(orden[0], 'renovacion');
  assert.equal(orden.includes('caja'), false);
  assert.equal(orden.includes('notificacion'), false);
});

test('el cobro a mano sigue sin poder cerrar un EN_CURSO (no lleva las guardas del banco)', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: null, actual: { estado: 'EN_CURSO', stripe_payment_intent_id: null } });
  const { deps } = efectos();
  await confirmarCobro(admin, { ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false }, deps);
  assert.equal(estadosDelCas(updates[0]).includes('EN_CURSO'), false);
});

// ── «Cobrar varias» (`sinCobroEnMarcha`) ─────────────────────────────────────
// En un cobro de varios, lo que tiene un cobro en marcha (pago online abierto,
// datáfono, reintento programado) no se cobra a mano: serían dos cobros. La ruta
// lo lee antes y el propio UPDATE lo vuelve a exigir, por si cambia entre medias.

test('«Cobrar varias»: el UPDATE exige que no haya pago online, datáfono ni reintento en marcha', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { deps } = efectos();
  await confirmarCobro(admin, { ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false, sinCobroEnMarcha: true }, deps);
  for (const col of ['proximo_reintento', 'checkout_session_id', 'cobro_mostrador_pi']) {
    assert.ok(tiene(updates[0].filtros, 'is', col, null), `${col} a null en el propio UPDATE`);
  }
  // El cargo guardado no: un DEVUELTO o FALLIDO por el banco conserva el de su
  // adeudo y es justo lo que se cobra en el mostrador.
  assert.equal(tiene(updates[0].filtros, 'is', 'stripe_payment_intent_id', null), false);
});

test('el cobro de uno, sin `sinCobroEnMarcha`, no añade esas guardas (quien cobra lo ve en la fila)', async () => {
  const { admin, updates } = fakeAdmin({ trasCas: GANA });
  const { deps } = efectos();
  await confirmarCobro(admin, { ...BASE, origen: 'manual', metodo: 'EFECTIVO', paymentIntentId: null, avisarSocia: false }, deps);
  for (const col of ['proximo_reintento', 'checkout_session_id', 'cobro_mostrador_pi']) {
    assert.equal(tiene(updates[0].filtros, 'is', col, null), false, col);
  }
});

test('reintento de facturas: todo el trimestre en curso (hora de Madrid), o las últimas horas si llegan antes', () => {
  // 20-nov: el trimestre empezó el 1-oct, antes que hace 72 h.
  assert.equal(desdeReintentoFactura(new Date('2026-11-20T10:00:00Z'), 72), '2026-10-01');
  // 2-ene: hace 72 h es 30-dic, antes que el 1-ene; no se pierde el final del trimestre anterior.
  assert.equal(desdeReintentoFactura(new Date('2027-01-02T10:00:00Z'), 72), '2026-12-30');
  // 31-dic a las 23:30 UTC ya es 1-ene en Madrid: el trimestre es el nuevo, pero manda la ventana de horas.
  assert.equal(desdeReintentoFactura(new Date('2026-12-31T23:30:00Z'), 72), '2026-12-28');
});
