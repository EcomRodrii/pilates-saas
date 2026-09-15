import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aplicarConsentimientoEnCron, cerrarSinConsentimiento, consentimientoCubrePenalizacion,
  type EntradaConsentimiento, type MotivoSinConsentimiento, type VeredictoConsentimiento,
} from './penalizacion-consentimiento.ts';
import {
  CIERRE_RECIBO_FALLIDO, VUELTA_A_DETECTADA,
  cuerpoRespuesta, escrituraAlCrearRecibo, escrituraPorEstadoDelRecibo, mensajeSinConsentimiento, planSinConsentimiento,
  queHaceLaTarjeta, resolverEscrituraSinEfecto,
} from './penalizacion-aprobar-reglas.ts';
import { terminosServicioPorDefecto, textoLegalVigenteDeFila } from '../legal-textos.ts';

// Fila de `studios` inventada, sin datos reales.
const FILA = {
  nombre: 'Estudio de prueba', razon_social: 'Estudio de prueba SL', nif: 'B00000000',
  direccion: 'Calle Falsa 1', ciudad: 'Ciudad', codigo_postal: '00000', email: 'hola@example.com',
  cancelacion_ventana_horas: 12, penalizacion_importe_eur: 10,
  politica_privacidad: null as string | null, terminos_servicio: null as string | null,
};

const INICIO = '2026-09-20T10:00:00.000Z';
/** Horas antes del inicio de la clase, en ISO. */
const antes = (horas: number) => new Date(Date.parse(INICIO) - horas * 3_600_000).toISOString();

function entrada(o: {
  fila?: Partial<typeof FILA>;
  aceptadoDe?: Partial<typeof FILA> | null;
  tipo?: string;
  importe?: number | string | null;
  detectadaEn?: string | null;
  sesion?: EntradaConsentimiento['sesion'];
} = {}): EntradaConsentimiento {
  const fila = { ...FILA, ...o.fila };
  const aceptado = o.aceptadoDe === null ? null : textoLegalVigenteDeFila({ ...fila, ...o.aceptadoDe });
  return {
    studio: {
      terminosServicio: fila.terminos_servicio,
      penalizacionImporteEur: fila.penalizacion_importe_eur,
      cancelacionVentanaHoras: fila.cancelacion_ventana_horas,
    },
    penalizacion: {
      tipo: o.tipo ?? 'NO_SHOW',
      importe: o.importe === undefined ? 10 : o.importe,
      detectadaEn: o.detectadaEn === undefined ? antes(2) : o.detectadaEn,
    },
    sesion: o.sesion === undefined ? { inicio: INICIO } : o.sesion,
    textoAceptado: aceptado,
    textoActual: textoLegalVigenteDeFila(fila),
  };
}

const motivo = (v: VeredictoConsentimiento) => (v.ok ? 'ok' : v.motivo);

// ── Lo que sí se cobra ──────────────────────────────────────────────────────

test('no-show con el importe del estudio y el contrato vigente aceptado: se cobra', () => {
  assert.deepEqual(consentimientoCubrePenalizacion(entrada()), { ok: true });
});

test('cancelación tardía también según la ventana del estudio: se cobra', () => {
  assert.deepEqual(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', detectadaEn: antes(2) })), { ok: true });
});

test('cancelar justo en el corte de la ventana cuenta como tardía (mismo >= que la detección)', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', detectadaEn: antes(12) }))), 'ok');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', detectadaEn: antes(12.001) }))), 'ventana_distinta');
});

test('un no-show no necesita la clase: la ventana solo cuenta para cancelar tarde', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ sesion: null }))), 'ok');
});

// ── Texto ───────────────────────────────────────────────────────────────────

test('texto aceptado distinto del vigente: no se cobra', () => {
  // Aceptó cuando el estudio cobraba 8 €; hoy cobra 10 €.
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ aceptadoDe: { penalizacion_importe_eur: 8 } }))), 'texto_distinto');
});

test('sin ninguna aceptación: no se cobra', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ aceptadoDe: null }))), 'texto_distinto');
});

test('el texto manda antes que el resto de motivos', () => {
  const e = entrada({ aceptadoDe: null, importe: 99, fila: { terminos_servicio: 'Mis condiciones' } });
  assert.equal(motivo(consentimientoCubrePenalizacion(e)), 'texto_distinto');
});

test('términos propios del estudio: no se cobra aunque el texto coincida', () => {
  const e = entrada({ fila: { terminos_servicio: 'Mis condiciones, con un cargo de 10 €.' } });
  assert.equal(e.textoAceptado, e.textoActual);
  assert.equal(motivo(consentimientoCubrePenalizacion(e)), 'terminos_propios');
});

// ── (a) estudio sin penalización, tipo de clase con ella ──────────────────

test('(a) el estudio no tiene importe y el tipo de clase sí: no se cobra', () => {
  for (const sin of [null, 0, -5]) {
    const e = entrada({ fila: { penalizacion_importe_eur: sin as number } });
    assert.equal(e.textoAceptado, e.textoActual, 'el texto coincide: el guardia de antes dejaba pasar esto');
    assert.equal(motivo(consentimientoCubrePenalizacion(e)), 'estudio_sin_penalizacion', `estudio con ${sin}`);
  }
});

// ── (b) importe distinto ────────────────────────────────────────────────────

test('(b) importe del tipo de clase distinto del del estudio: no se cobra', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ importe: 15 }))), 'importe_distinto');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ importe: 9.99 }))), 'importe_distinto');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ importe: null }))), 'importe_distinto');
});

test('el importe se compara en céntimos exactos, no en coma flotante ni como texto', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila: { penalizacion_importe_eur: 12.5 }, importe: '12.50' }))), 'ok');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila: { penalizacion_importe_eur: 0.3 }, importe: 0.1 + 0.2 }))), 'ok');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila: { penalizacion_importe_eur: 12.5 }, importe: 12.49 }))), 'importe_distinto');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila: { penalizacion_importe_eur: 12.5 }, importe: 12.51 }))), 'importe_distinto');
});

// ── (c) ventana más estricta en el tipo de clase ──────────────────────────

test('(c) tardía solo por la ventana del tipo de clase: no se cobra', () => {
  // Estudio 12 h, clase 24 h, cancela 18 h antes: la detección la da por tardía, el contrato no.
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', detectadaEn: antes(18) }))), 'ventana_distinta');
});

test('sin ventana en el estudio, el contrato dice 12 h y se comprueba contra 12 h', () => {
  for (const sin of [null, 0]) {
    const fila = { cancelacion_ventana_horas: sin as number };
    assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila, tipo: 'CANCELACION_TARDIA', detectadaEn: antes(11) }))), 'ok');
    assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila, tipo: 'CANCELACION_TARDIA', detectadaEn: antes(20) }))), 'ventana_distinta');
  }
});

test('una ventana de estudio de 24 h cubre una cancelación 18 h antes', () => {
  const fila = { cancelacion_ventana_horas: 24 };
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ fila, tipo: 'CANCELACION_TARDIA', detectadaEn: antes(18) }))), 'ok');
});

// ── Sin datos: cerrado ──────────────────────────────────────────────────────

test('sin datos para comprobar una cancelación tardía: no se cobra', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', sesion: null }))), 'sin_datos');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', sesion: { inicio: null } }))), 'sin_datos');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', detectadaEn: null }))), 'sin_datos');
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'CANCELACION_TARDIA', detectadaEn: 'no-es-fecha' }))), 'sin_datos');
});

test('un tipo de penalización desconocido no se cobra', () => {
  assert.equal(motivo(consentimientoCubrePenalizacion(entrada({ tipo: 'OTRA' }))), 'sin_datos');
});

// ── Términos vacíos: mismo texto que se enseña ─────────────────────────────

test('términos guardados vacíos componen el MISMO texto que los de por defecto', () => {
  const porDefecto = textoLegalVigenteDeFila(FILA);
  for (const vacio of ['', '   ', '\n']) {
    assert.equal(textoLegalVigenteDeFila({ ...FILA, terminos_servicio: vacio, politica_privacidad: vacio }), porDefecto);
    const e = entrada({ fila: { terminos_servicio: vacio } });
    assert.equal(motivo(consentimientoCubrePenalizacion(e)), 'ok', 'vacío no es «términos propios»');
  }
  assert.ok(porDefecto.includes(terminosServicioPorDefecto({ cancelacionVentanaHoras: 12, penalizacionImporteEur: 10, nombre: FILA.nombre, razonSocial: FILA.razon_social, nif: FILA.nif, direccion: FILA.direccion, ciudad: FILA.ciudad, codigoPostal: FILA.codigo_postal, email: FILA.email })));
});

// ── El cron: no hay recibo sin consentimiento ──────────────────────────────

function ioCron(marca = { error: false, tocadas: 1 }, borrado = { error: false, tocadas: 0 }) {
  const llamadas: string[] = [];
  return {
    llamadas,
    io: {
      marcarOmitida: async () => { llamadas.push('marcarOmitida'); return marca; },
      borrarRecibo: async () => { llamadas.push('borrarRecibo'); return borrado; },
      notificarBloqueo: async () => { llamadas.push('notificarBloqueo'); },
      alertar: (m: string) => { llamadas.push(`alertar:${m}`); },
    },
  };
}

test('cron: sin consentimiento, OMITIDA_SIN_CONSENTIMIENTO, borra el recibo si lo hubiera, avisa, y no sigue', async () => {
  const { io, llamadas } = ioCron();
  const sigue = await aplicarConsentimientoEnCron({ ok: false, motivo: 'importe_distinto' }, io);
  assert.equal(sigue, false);
  // Sin recibo de una pasada anterior el borrado no toca nada, y eso no es una alerta.
  assert.deepEqual(llamadas, ['marcarOmitida', 'borrarRecibo', 'notificarBloqueo']);
});

test('cron: una DETECTADA con recibo de una pasada anterior lo deja borrado', async () => {
  const { io, llamadas } = ioCron({ error: false, tocadas: 1 }, { error: false, tocadas: 1 });
  assert.equal(await aplicarConsentimientoEnCron({ ok: false, motivo: 'texto_distinto' }, io), false);
  assert.deepEqual(llamadas, ['marcarOmitida', 'borrarRecibo', 'notificarBloqueo']);
});

test('cron: si el borrado falla, alerta y avisa igual (la penalización ya no se cobra), y no sigue', async () => {
  const { io, llamadas } = ioCron({ error: false, tocadas: 1 }, { error: true, tocadas: 0 });
  assert.equal(await aplicarConsentimientoEnCron({ ok: false, motivo: 'texto_distinto' }, io), false);
  assert.deepEqual(llamadas, ['marcarOmitida', 'borrarRecibo', 'alertar:NO_SE_PUDO_BORRAR_RECIBO', 'notificarBloqueo']);
});

test('aprobar: con recibo que no se deja borrar (cobrado, programado, con Checkout) alerta; borrado, no', async () => {
  for (const [borrado, esperado] of [
    [{ error: false, tocadas: 1 }, { reciboBorrado: true, alerta: false }],
    [{ error: false, tocadas: 0 }, { reciboBorrado: false, alerta: true }],
    [{ error: true, tocadas: 0 }, { reciboBorrado: false, alerta: true }],
  ] as const) {
    const { io, llamadas } = ioCron(undefined, borrado);
    const r = await cerrarSinConsentimiento(io, { habiaRecibo: true });
    assert.equal(r.reciboBorrado, esperado.reciboBorrado);
    assert.equal(llamadas.includes('alertar:NO_SE_PUDO_BORRAR_RECIBO'), esperado.alerta, JSON.stringify(borrado));
    assert.equal(llamadas.at(-1), 'notificarBloqueo');
    assert.ok(!llamadas.includes('marcarOmitida'), 'cerrar no escribe la penalización: eso lo hizo el plan');
  }
});

test('cron: si el CAS no tocó nada (otra pasada, revertida) no avisa, y tampoco sigue', async () => {
  for (const marca of [{ error: false, tocadas: 0 }, { error: true, tocadas: 0 }]) {
    const { io, llamadas } = ioCron(marca);
    assert.equal(await aplicarConsentimientoEnCron({ ok: false, motivo: 'ventana_distinta' }, io), false);
    assert.deepEqual(llamadas, ['marcarOmitida']);
  }
});

test('cron: con consentimiento sigue sin escribir nada', async () => {
  const { io, llamadas } = ioCron();
  assert.equal(await aplicarConsentimientoEnCron({ ok: true }, io), true);
  assert.deepEqual(llamadas, []);
});

test('cron: el guardia va antes de crear el recibo, y el recibo solo se crea si sigue', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../inngest/penalizaciones.ts'), 'utf8');
  const guardia = fuente.indexOf('await aplicarConsentimientoEnCron(');
  const salida = fuente.indexOf('if (!sigue) return;');
  const recibo = fuente.indexOf('await crearReciboYCobrar(');
  assert.ok(guardia > 0 && salida > guardia && recibo > salida, 'aplicarConsentimientoEnCron → if (!sigue) return → crearReciboYCobrar');
  assert.ok(!fuente.includes('?? terminosServicioPorDefecto'), 'el texto vigente se compone con configLegalDe, no con ??');
  // La FK `penalizaciones.recibo_id` no tiene ON DELETE: sin soltarlo, el borrado falla siempre.
  const marca = fuente.slice(fuente.indexOf('marcarOmitida: async'), fuente.indexOf('borrarRecibo: () =>'));
  assert.match(marca, /estado: 'OMITIDA_SIN_CONSENTIMIENTO'[^}]*recibo_id: null/);
  assert.match(fuente, /borrarRecibo: \(\) => borrarReciboDePenalizacionSinCobro\(admin, \{ studioId: pen\.studio_id, reciboId: `rec-penaliz-\$\{pen\.id\}` \}\)/);
});

test('el borrado del recibo es compare-and-set: PENDIENTE, sin programar, sin cobro enlazado, sin Checkout', () => {
  const fuente = readFileSync(join(import.meta.dirname, 'penalizacion-recibo-server.ts'), 'utf8');
  const desde = fuente.indexOf('export async function borrarReciboDePenalizacionSinCobro(');
  const funcion = fuente.slice(desde, fuente.indexOf('\n}\n', desde));
  assert.ok(desde > 0);
  for (const filtro of [
    ".eq('studio_id', p.studioId)", ".eq('estado', 'PENDIENTE')", ".is('proximo_reintento', null)",
    ".is('stripe_payment_intent_id', null)", ".is('checkout_session_id', null)", ".select('id')",
  ]) assert.ok(funcion.includes(filtro), `falta ${filtro}`);
  assert.match(funcion, /if \(!penalizacionDelRecibo\(p\.reciboId\)\) return \{ error: false, tocadas: 0 \}/, 'solo recibos de penalización');
});

// ── La ruta de aprobar y la tarjeta ────────────────────────────────────────

const MOTIVOS: MotivoSinConsentimiento[] =
  ['texto_distinto', 'terminos_propios', 'estudio_sin_penalizacion', 'importe_distinto', 'ventana_distinta', 'sin_datos'];

test('aprobar sin consentimiento: OMITIDA_SIN_CONSENTIMIENTO solo desde PENDIENTE_APROBACION, 409, sin avisar de pago', () => {
  for (const m of MOTIVOS) {
    const plan = planSinConsentimiento(m);
    assert.deepEqual(plan.escritura, { estado: 'OMITIDA_SIN_CONSENTIMIENTO', desde: ['PENDIENTE_APROBACION'], soltarRecibo: true });
    assert.equal(plan.desenlace.tipo, 'SIN_CONSENTIMIENTO');
    assert.equal(plan.desenlace.http, 409);
    assert.equal(plan.desenlace.notificar, false);
    assert.deepEqual(cuerpoRespuesta(plan.desenlace), { error: mensajeSinConsentimiento(m), resultado: 'SIN_CONSENTIMIENTO' });
  }
});

test('la tarjeta quita la fila y dice que no se cobró porque el contrato no lo recoge', () => {
  for (const m of MOTIVOS) {
    const mensaje = mensajeSinConsentimiento(m);
    assert.match(mensaje, /^No se ha cobrado: /);
    assert.match(mensaje, /contrato|condiciones|plazo/);
    assert.match(mensaje, /La penalización queda sin cobrar\.$/);
    const tarjeta = queHaceLaTarjeta({ error: mensaje, status: 409, resultado: 'SIN_CONSENTIMIENTO' });
    assert.deepEqual(tarjeta, { quitarFila: true, mensaje });
  }
  assert.equal(new Set(MOTIVOS.map(mensajeSinConsentimiento)).size, MOTIVOS.length, 'cada motivo dice lo suyo');
});

test('aprobar sin consentimiento cuando otra petición ya la movió: no se pisa nada', () => {
  const plan = planSinConsentimiento('importe_distinto');
  assert.equal(resolverEscrituraSinEfecto(plan, 'COBRADA').tipo, 'YA_COBRADA');
  assert.equal(resolverEscrituraSinEfecto(plan, 'OMITIDA_SIN_CONSENTIMIENTO').tipo, 'NO_PENDIENTE');
  assert.equal(resolverEscrituraSinEfecto(plan, null).tipo, 'SIN_CONFIRMAR');
});

test('la ruta comprueba el contrato antes de llamar a Stripe', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../../app/api/penalizaciones/aprobar/route.ts'), 'utf8');
  const guardia = fuente.indexOf('consentimientoCubrePenalizacion({');
  const cobro = fuente.indexOf('await cobrarReciboOffSession(');
  assert.ok(guardia > 0 && cobro > guardia, 'consentimientoCubrePenalizacion antes de cobrarReciboOffSession');
});

test('la ruta suelta el recibo en la misma escritura y lo borra solo si esa escritura tocó la fila', () => {
  const fuente = readFileSync(join(import.meta.dirname, '../../app/api/penalizaciones/aprobar/route.ts'), 'utf8');
  assert.match(fuente, /\.\.\.\(plan\.escritura\.soltarRecibo \? \{ recibo_id: null \} : \{\}\)/);
  const plan = fuente.indexOf('await ejecutar(planSinConsentimiento(');
  const siToco = fuente.indexOf("if (d.tipo === 'SIN_CONSENTIMIENTO') {", plan);
  const cierre = fuente.indexOf('await cerrarSinConsentimiento({', siToco);
  const cobro = fuente.indexOf('await cobrarReciboOffSession(');
  assert.ok(plan > 0 && siToco > plan && cierre > siToco && cobro > cierre, 'plan → si tocó → cerrarSinConsentimiento, todo antes de cobrar');
  assert.match(fuente.slice(cierre, cobro), /borrarReciboDePenalizacionSinCobro\(admin, \{ studioId: sesion\.studioId, reciboId: pen\.recibo_id as string \}\)/);
  assert.match(fuente.slice(cierre, cobro), /\{ habiaRecibo: true \}/);
});

test('solo la omisión por consentimiento suelta el recibo', () => {
  assert.equal(planSinConsentimiento('texto_distinto').escritura?.soltarRecibo, true);
  for (const e of [escrituraAlCrearRecibo(true), escrituraAlCrearRecibo(false), VUELTA_A_DETECTADA, CIERRE_RECIBO_FALLIDO,
    escrituraPorEstadoDelRecibo('COBRADO'), escrituraPorEstadoDelRecibo('FALLIDO'), escrituraPorEstadoDelRecibo('PENDIENTE'), escrituraPorEstadoDelRecibo('DEVUELTO')]) {
    assert.equal(e?.soltarRecibo, undefined, JSON.stringify(e));
  }
});
