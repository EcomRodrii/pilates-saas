import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clasificarReservaPerdida, reservarCobroOffSession, type FilaReciboReserva } from './cobro-off-session-marca.ts';
import { cerrarPagoOnlineAntesDeCobrarAMano, type SesionesDeStripe } from './pago-online-al-cobrar-a-mano.ts';
import { puedeMoverDinero } from '../permisos-reglas.ts';

// Un recibo no se cobra dos veces entre la alumna y el mostrador (5-oct-2026).
//
// «Cobrar online» (y aprobar una penalización, y el ejecutor del Decision OS)
// cobran con la tarjeta guardada por la vía STAFF de `cobrarReciboOffSession`,
// que NO miraba si la clienta tenía abierto el pago online de ese mismo recibo:
// si lo terminaba después, entraban dos cobros reales. Ahora, antes de reservar el
// recibo, se cierra ese pago (el mismo dueño que «marcar cobrado»), y la reserva
// exige que la sesión guardada siga siendo la que se cerró.

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (ruta: string) => sinComentarios(readFileSync(join(raiz, ruta), 'utf8'));

type Filtro = [op: string, columna: string, valor: unknown];
function fakeAdmin() {
  const filtros: Filtro[] = [];
  const b = {
    update() { return b; },
    eq(c: string, v: unknown) { filtros.push(['eq', c, v]); return b; },
    in(c: string, v: unknown) { filtros.push(['in', c, v]); return b; },
    is(c: string, v: unknown) { filtros.push(['is', c, v]); return b; },
    not(c: string, op: string, v: unknown) { filtros.push([`not.${op}`, c, v]); return b; },
    or(expr: string) { filtros.push(['or', '', expr]); return b; },
    select() { return Promise.resolve({ data: [{ id: 'rec-1', cobro_off_session_desde: 'd' }], error: null }); },
  };
  return { admin: { from: () => b } as never, filtros };
}
const RESERVA = { studioId: 'st-1', reciboId: 'rec-1', clave: 'offsession-cobro-rec-1-i0', intentos: null, ahoraISO: '2026-10-05T10:00:00.000Z', via: 'STAFF' } as const;

test('reservar a mano exige que la sesión guardada siga siendo la que se cerró', async () => {
  const conSesion = fakeAdmin();
  await reservarCobroOffSession(conSesion.admin, { ...RESERVA, checkoutLeido: 'cs_cerrada' });
  // La que se cerró, o ninguna (el conciliador la suelta al caducar): nunca otra.
  assert.ok(conSesion.filtros.some(([o, , v]) => o === 'or' && v === 'checkout_session_id.is.null,checkout_session_id.eq.cs_cerrada'));

  const sinSesion = fakeAdmin();
  await reservarCobroOffSession(sinSesion.admin, { ...RESERVA, checkoutLeido: null });
  assert.ok(sinSesion.filtros.some(([o, c, v]) => o === 'is' && c === 'checkout_session_id' && v === null),
    'sin pago online leído, la reserva no gana si entre medias se abrió uno');
});

const fila = (extra: Partial<FilaReciboReserva> = {}): FilaReciboReserva => ({
  estado: 'PENDIENTE', intentos_reintento: null, proximo_reintento: null, tras_cancelar_cuota: null,
  cobro_off_session_clave: null, cobro_off_session_desde: null, cobro_mostrador_pi: null, checkout_session_id: null,
  reembolso_stripe_id: null, reembolso_solicitado_en: null, ...extra,
});
const ahora = new Date('2026-10-05T10:00:00.000Z');

test('si la reserva pierde porque la clienta abrió OTRO pago online, es «pago online en marcha», no un cambio cualquiera', () => {
  assert.deepEqual(
    clasificarReservaPerdida(fila({ checkout_session_id: 'cs_nueva' }), { clave: RESERVA.clave, via: 'STAFF', cuota: null, ahora, checkoutLeido: null }),
    { tipo: 'EN_MARCHA', por: 'PAGO_ONLINE' },
  );
  assert.deepEqual(
    clasificarReservaPerdida(fila({ checkout_session_id: 'cs_nueva' }), { clave: RESERVA.clave, via: 'STAFF', cuota: null, ahora, checkoutLeido: 'cs_cerrada' }),
    { tipo: 'EN_MARCHA', por: 'PAGO_ONLINE' },
  );
  // Vacía: la soltó el conciliador al caducar la que se cerró. No es un pago nuevo.
  assert.deepEqual(
    clasificarReservaPerdida(fila({ checkout_session_id: null, intentos_reintento: 1 }), { clave: RESERVA.clave, via: 'STAFF', cuota: null, ahora, checkoutLeido: 'cs_cerrada' }),
    { tipo: 'CAMBIO' },
  );
  // La misma que se cerró: no es eso.
  assert.deepEqual(
    clasificarReservaPerdida(fila({ checkout_session_id: 'cs_cerrada', intentos_reintento: 1 }), { clave: RESERVA.clave, via: 'STAFF', cuota: null, ahora, checkoutLeido: 'cs_cerrada' }),
    { tipo: 'CAMBIO' },
  );
});

// Lo que decide la guarda compartida (`soltarPagosEnMarchaAntesDeCobrar`) sobre el
// pago online, en el caso del cobro con tarjeta guardada.
function sesiones(estados: string[], { cerrarFalla = false, consultarFalla = false } = {}) {
  const llamadas: string[] = [];
  let i = 0;
  const s: SesionesDeStripe = {
    async consultar() {
      llamadas.push('consultar');
      if (consultarFalla) throw new Error('stripe caído');
      return { status: estados[Math.min(i++, estados.length - 1)] };
    },
    async cerrar() {
      llamadas.push('cerrar');
      if (cerrarFalla) throw new Error('no');
      return { status: 'expired' };
    },
  };
  return { s, llamadas };
}

test('pago online ABIERTO: se cierra en Stripe antes de cobrar con la tarjeta guardada', async () => {
  const { s, llamadas } = sesiones(['open']);
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', s), { tipo: 'SEGUIR' });
  assert.deepEqual(llamadas, ['consultar', 'cerrar']);
});

test('pago online YA PAGADO: no se cobra con la tarjeta guardada', async () => {
  const { s } = sesiones(['complete']);
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', s), { tipo: 'YA_PAGADO' });
});

test('no se puede saber (Stripe no contesta): no se cobra', async () => {
  const { s } = sesiones([], { consultarFalla: true });
  assert.deepEqual(await cerrarPagoOnlineAntesDeCobrarAMano('cs_1', s), { tipo: 'NO_SE_SABE' });
});

test('cobrarReciboOffSession (a mano): cuenta → cierra el pago online → reserva → cargo', () => {
  const s = leer('lib/billing/stripe-cobros.ts');
  const cuenta = s.indexOf('estadoCobroCuenta(');
  const soltar = s.indexOf('soltarPagosEnMarchaAntesDeCobrar(');
  const reserva = s.indexOf('reservarCobroOffSession(');
  const cargo = s.indexOf('paymentIntents.create(');
  assert.ok(cuenta > 0 && soltar > cuenta && reserva > soltar && cargo > reserva, 'el orden tiene que ser cuenta → pago online → reserva → cargo');
  const tramo = s.slice(s.lastIndexOf('if (', soltar), reserva);
  assert.match(tramo, /via === 'STAFF'/, 'solo a mano: el cobro diario ya no cobra con un pago online abierto');
  assert.match(tramo, /if \(!pagos\.ok\) return \{ ok: false, error: pagos\.mensaje, errorCode: 'COBRO_EN_MARCHA' \}/, 'ya pagado o sin saberlo: no se cobra');
  assert.match(s.slice(reserva, reserva + 300), /checkoutLeido/, 'la reserva exige la sesión que se cerró');
  const clasifica = s.indexOf('clasificarReservaPerdida(', reserva);
  assert.match(s.slice(clasifica, clasifica + 200), /clave: idempotencyKey, via, cuota, ahora: new Date\(\), checkoutLeido,/);
});

// Revisión del 5-oct (#5): un datáfono abandonado congelaba el cobro diario (y la
// remesa) de ese recibo para siempre. El cobro diario lo suelta con el MISMO dueño y
// el mismo margen que la alumna que paga online, antes de reservar.
test('cobro diario: un cobro del mostrador abandonado se suelta antes de reservar, con el margen de 30 min', () => {
  const s = leer('lib/billing/stripe-cobros.ts');
  const auto = s.indexOf("} else if (via === 'AUTOMATICO' && recibo.cobro_mostrador_pi && !recibo.cobro_off_session_clave) {");
  const reserva = s.indexOf('reservarCobroOffSession(', auto);
  assert.ok(auto > 0 && reserva > auto);
  const tramo = s.slice(auto, reserva);
  assert.match(tramo, /await soltarCobroDeMostradorDelRecibo\(/);
  assert.match(tramo, /\{ cancelarPendienteTrasMs: MINUTOS_COBRO_MOSTRADOR_ABANDONADO \* 60_000 \}/);
  assert.match(tramo, /if \(mostrador\.tipo !== 'SEGUIR'\) return \{ ok: false, error: MENSAJE_COBRO_EN_MARCHA\.MOSTRADOR, errorCode: 'COBRO_EN_MARCHA' \};/);
});

// ⚠️ Un SumUp «caducado» (a los dos minutos sin transacción) no lo dice SumUp: puede ser un
// retraso de su API. Sin nadie delante del Solo (con margen: el cobro diario, el pago online
// de la alumna), no cuenta como terminado hasta que lo soltaría su barrido; si no, la
// tarjeta guardada se cobraría encima de un cobro que sí entró. Sin margen, sin cambios.
test('⚠️ SumUp «caducado»: sin nadie delante no se suelta antes que su barrido', () => {
  const s = leer('lib/cobros/antes-de-cobrar-a-mano-servidor.ts');
  const fn = s.slice(s.indexOf('export async function soltarCobroDeMostradorDelRecibo('));
  const sumup = fn.slice(fn.indexOf("if (proveedorDeReferencia(ref) === 'sumup') {"), fn.indexOf('const cs = p.checkoutSessionId;'));
  assert.ok(sumup.length > 0);
  assert.match(sumup, /return estado === 'EXPIRADO' && margen > 0 && !yaNoEsDelMostrador\(ref, ahora\) \? 'PENDIENTE' : estado;/);
  assert.match(sumup, /pendienteCancelable: \(\) => margen <= 0,/, 'y ese PENDIENTE no se cancela con margen');
  // El enlace de pago online lo mira antes, sin tocarlo, con la misma regla.
  const caja = leer('lib/pos/cobro-del-estudio.ts');
  const vida = caja.slice(caja.indexOf('export async function vidaDelCobroDeLaCajaEnElRecibo('));
  const regla = vida.indexOf("if (est.estado === 'EXPIRADO' && !yaNoEsDelMostrador(referencia, new Date())) return 'no-se-sabe';");
  assert.ok(regla > 0 && regla < vida.indexOf('return vidaDelCobroDeLaCaja(est.estado);'));
});

// ── Roles: las tres puertas del mostrador que acaban en `cobrarReciboOffSession` ──

test('mover dinero: propietaria y recepción sí; gerencia e instructora no', () => {
  assert.equal(puedeMoverDinero('PROPIETARIO'), true);
  assert.equal(puedeMoverDinero('RECEPCION'), true);
  assert.equal(puedeMoverDinero('MANAGER'), false);
  assert.equal(puedeMoverDinero('INSTRUCTOR'), false);
});

for (const ruta of ['app/api/cobros/cobrar-online/route.ts', 'app/api/stripe/charge-off-session/route.ts', 'app/api/penalizaciones/aprobar/route.ts']) {
  test(`${ruta}: sesión de staff y puedeMoverDinero (403) antes de cobrar con la tarjeta guardada`, () => {
    const s = leer(ruta);
    const sesion = s.indexOf('await verificarSesionStaff(req)');
    const rol = s.indexOf('if (!puedeMoverDinero(sesion.rol)) {');
    const cobro = s.indexOf('cobrarReciboOffSession({');
    assert.ok(sesion > 0 && rol > sesion && cobro > rol, 'la comprobación de rol va antes del cobro');
    assert.match(s.slice(rol, rol + 200), /status: 403/);
    // Ningún otro `return` entre la sesión y el rol que pudiera saltárselo con éxito.
    assert.doesNotMatch(s.slice(sesion, rol), /cobrarReciboOffSession/);
  });
}
