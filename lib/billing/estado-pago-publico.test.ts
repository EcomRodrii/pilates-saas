import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  piDeClientSecret,
  emailsCoinciden,
  resolverEstadoPago,
  RETARDOS_POLL_MS,
} from './estado-pago-publico.ts';

test('piDeClientSecret extrae el id del PaymentIntent', () => {
  assert.equal(
    piDeClientSecret('pi_3QeXaMPLe000000000000_secret_ExAmPle0000000000000000'),
    'pi_3QeXaMPLe000000000000',
  );
});

test('piDeClientSecret rechaza formas que no son un clientSecret', () => {
  assert.equal(piDeClientSecret(null), null);
  assert.equal(piDeClientSecret(''), null);
  assert.equal(piDeClientSecret('pi_sin_secreto'), null);
  assert.equal(piDeClientSecret('cs_test_abc_secret_x'), null);
  // El id entero sin la parte _secret_ tampoco vale: el cliente NUNCA debe
  // acabar mandando el clientSecret completo por la URL.
  assert.equal(piDeClientSecret('seti_1abc_secret_x'), null);
});

test('emailsCoinciden: insensible a mayúsculas y espacios', () => {
  assert.equal(emailsCoinciden('Marta.Ruiz@Example.com ', 'marta.ruiz@example.com'), true);
  assert.equal(emailsCoinciden('otra@example.com', 'marta.ruiz@example.com'), false);
});

test('emailsCoinciden: dos vacíos NUNCA coinciden', () => {
  assert.equal(emailsCoinciden('', ''), false);
  assert.equal(emailsCoinciden(null, undefined), false);
  assert.equal(emailsCoinciden('  ', ''), false);
});

test('resolverEstadoPago mapea los estados de reserva del webhook', () => {
  assert.equal(resolverEstadoPago('CONFIRMADA', false), 'confirmada');
  assert.equal(resolverEstadoPago('LISTA_ESPERA', false), 'lista_espera');
  assert.equal(resolverEstadoPago('PENDIENTE_APROBACION', false), 'pendiente_aprobacion');
});

test('resolverEstadoPago: sin reserva y con aviso al mostrador → fallida', () => {
  assert.equal(resolverEstadoPago(null, true), 'fallida');
  assert.equal(resolverEstadoPago(undefined, true), 'fallida');
});

// ⚠️ Desde que el webhook avisa al mostrador TAMBIÉN cuando la reserva cae en
// lista de espera, esa notificación deja de significar «no hay plaza» a secas.
// Si el orden de resolución cambiara y `avisoSinPlaza` ganase a la reserva, la
// pantalla de éxito le diría «no hemos podido asignarte la plaza» a quien SÍ
// tiene sitio en la cola — y el copy honesto de que su bono queda en su cuenta
// se perdería. La fila de `reservas` manda siempre que exista.
test('resolverEstadoPago: en lista de espera manda la reserva, no el aviso al mostrador', () => {
  assert.equal(resolverEstadoPago('LISTA_ESPERA', true), 'lista_espera');
  assert.equal(resolverEstadoPago('CONFIRMADA', true), 'confirmada');
  assert.equal(resolverEstadoPago('PENDIENTE_APROBACION', true), 'pendiente_aprobacion');
});

test('resolverEstadoPago: sin reserva y sin aviso → en_proceso (el webhook puede no haber llegado)', () => {
  assert.equal(resolverEstadoPago(null, false), 'en_proceso');
});

test('resolverEstadoPago: un estado no contemplado nunca inventa confirmación ni fallo', () => {
  // Una reserva EXISTE: el aviso de sin-plaza (de otra sesión, otro momento)
  // no puede convertirla en 'fallida'.
  assert.equal(resolverEstadoPago('CANCELADA', true), 'en_proceso');
  assert.equal(resolverEstadoPago('CANCELADA', false), 'en_proceso');
});

test('la cadencia del polling es creciente y suma ~35s', () => {
  const total = RETARDOS_POLL_MS.reduce((a, b) => a + b, 0);
  assert.ok(total >= 30_000 && total <= 45_000);
  for (let i = 1; i < RETARDOS_POLL_MS.length; i++) {
    assert.ok(RETARDOS_POLL_MS[i] >= RETARDOS_POLL_MS[i - 1]);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// «Ya tenía plaza» (5-oct-2026): quien paga una clase en la que YA tenía una
// reserva viva veía «no hemos podido asignarte la plaza», teniéndola. Ahora el
// aviso del servidor dice qué pasó con SU pago, y la pantalla dice lo que tiene.
// ─────────────────────────────────────────────────────────────────────────────

import { avisoDeYaTenia, elegirAvisoDelPago, reservaPreviaDe, type AvisoSinPlaza } from './estado-pago-publico.ts';
import { readFileSync as leerFuente } from 'node:fs';
import { join as unir } from 'node:path';

const avisoDe = (data: Record<string, unknown> | null, resource_id: string | null = 'ses-1'): AvisoSinPlaza => ({ data, resource_id });

test('el aviso que vale es el de ESTE pago; el de otro pago de la misma clase, nunca', () => {
  const otro = avisoDe({ socioId: 'soc-1', paymentIntentId: 'pi_OTRO', situacionCodigo: 'sin-reserva' });
  const este = avisoDe({ socioId: 'soc-1', paymentIntentId: 'pi_ESTE', situacionCodigo: 'ya-tenia-reserva' });
  assert.equal(elegirAvisoDelPago([otro, este], 'pi_ESTE'), este);
  assert.equal(elegirAvisoDelPago([otro], 'pi_ESTE'), null, 'el de otro pago no dice nada de este');
  // Uno de antes de este cambio (sin pago anotado) sigue valiendo, como antes.
  const viejo = avisoDe({ socioId: 'soc-1' });
  assert.equal(elegirAvisoDelPago([otro, viejo], 'pi_ESTE'), viejo);
  assert.equal(elegirAvisoDelPago(null, 'pi_ESTE'), null);
});

// Revisión del 5-oct (#0): un aviso NUEVO sin pago anotado (no se supo cuál era) no
// vale para ninguno. Un «en-espera» de la clase X le decía «sin plaza» al pago de la
// clase Y, que sí la tenía.
test('un aviso nuevo sin pago no vale para otro pago; solo el legado (sin situación) sigue valiendo', () => {
  const enEsperaSinPago = avisoDe({ socioId: 'soc-1', paymentIntentId: null, situacionCodigo: 'en-espera' });
  assert.equal(elegirAvisoDelPago([enEsperaSinPago], 'pi_Y'), null);
  const cerradaSinPago = avisoDe({ socioId: 'soc-1', situacionCodigo: 'cerrada' });
  assert.equal(elegirAvisoDelPago([cerradaSinPago], 'pi_Y'), null);
  const delPago = avisoDe({ socioId: 'soc-1', paymentIntentId: 'pi_Y', situacionCodigo: 'en-espera' });
  assert.equal(elegirAvisoDelPago([enEsperaSinPago, delPago], 'pi_Y'), delPago);
});

test('los avisos «en-espera» y «cerrada» nacen con su pago', () => {
  const pagada = leerFuente(unir(import.meta.dirname, 'reservar-clase-pagada.ts'), 'utf8');
  const enEspera = pagada.slice(pagada.indexOf("situacion: 'en-espera'"), pagada.indexOf("situacion: 'en-espera'") + 120);
  assert.match(enEspera, /paymentIntentId: p\.paymentIntentId/);
  const admin = leerFuente(unir(import.meta.dirname, '..', 'db', 'supabase-data-admin.ts'), 'utf8');
  const cerrada = admin.slice(admin.indexOf("situacion: 'cerrada'"), admin.indexOf("situacion: 'cerrada'") + 200);
  assert.match(cerrada, /paymentIntentId: \(reciboDelPago\?\.stripe_payment_intent_id/);
  assert.match(admin, /fila\.id\.replace\(\/\^res-web-\/, 'rec-web-'\)/);
});

test('las tres situaciones de «ya tenía una reserva» se reconocen; las demás no', () => {
  for (const c of ['ya-tenia-reserva', 'ya-en-espera', 'ya-pendiente-aprobacion']) assert.equal(avisoDeYaTenia(avisoDe({ situacionCodigo: c })), true, c);
  for (const c of ['sin-reserva', 'en-espera', 'cerrada', undefined]) assert.equal(avisoDeYaTenia(avisoDe({ situacionCodigo: c })), false, String(c));
  assert.equal(avisoDeYaTenia(null), false);
});

test('lo que tiene ahora en la clase: plaza antes que pendiente, y pendiente antes que cola', () => {
  assert.equal(reservaPreviaDe(['LISTA_ESPERA', 'CONFIRMADA']), 'confirmada');
  assert.equal(reservaPreviaDe(['ASISTIDA']), 'confirmada');
  assert.equal(reservaPreviaDe(['LISTA_ESPERA', 'PENDIENTE_APROBACION']), 'pendiente_aprobacion');
  assert.equal(reservaPreviaDe(['LISTA_ESPERA']), 'lista_espera');
  // La canceló entre medias: ya no hay nada que decir de ella (sale «fallida», que es verdad).
  assert.equal(reservaPreviaDe([]), null);
  assert.equal(reservaPreviaDe(['CANCELADA']), null);
});

test('la ruta elige el aviso por pago y, si ya tenía reserva, contesta lo que TIENE', () => {
  const s = leerFuente(unir(import.meta.dirname, '..', '..', 'app/api/public/estado-pago/route.ts'), 'utf8');
  assert.match(s, /aviso = elegirAvisoDelPago\(avisos as AvisoSinPlaza\[\] \| null, pi\);/);
  assert.match(s, /\.select\('data, resource_id'\)/);
  const ya = s.indexOf('avisoDeYaTenia(aviso)');
  const lee = s.indexOf(".eq('sesion_id', aviso.resource_id)", ya);
  const estado = s.indexOf("const estado = previa ? 'ya_tenia_plaza'", lee);
  assert.ok(ya > 0 && lee > ya && estado > lee, 'aviso del pago → su reserva viva en esa clase → estado');
  // El cuerpo lo arma `estadoDeLaReserva`, compartida por los dos modos de identidad.
  assert.match(s, /return \{ estado, clase, \.\.\.\(previa \? \{ previa \} : \{\}\) \};/);
});

// ── P01 (6-oct-2026): lo que el pago ha entregado, con la sesión de la socia ──
import { compraDeSuscripcion, modoDeIdentidad } from './estado-pago-publico.ts';

test('compraDeSuscripcion: sin suscripción todavía, nada que anunciar', () => {
  assert.equal(compraDeSuscripcion(null, 'Bono 8'), null);
  assert.equal(compraDeSuscripcion(undefined, 'Bono 8'), null);
});

test('compraDeSuscripcion: un bono entregado dice qué es, cuántas quedan y hasta cuándo', () => {
  assert.deepEqual(
    compraDeSuscripcion({ estado: 'ACTIVA', sesiones_restantes: 8, fecha_fin: '2026-12-31' }, 'Bono 8 sesiones'),
    { entregada: true, plan: 'Bono 8 sesiones', sesionesRestantes: 8, fechaFin: '2026-12-31' },
  );
});

test('compraDeSuscripcion: una cuota (ilimitada) no inventa un número de sesiones', () => {
  const c = compraDeSuscripcion({ estado: 'ACTIVA', sesiones_restantes: null, fecha_fin: null }, 'Mensual');
  assert.equal(c?.sesionesRestantes, null);
  assert.equal(c?.fechaFin, null);
});

test('compraDeSuscripcion: una suscripción que ya no está viva (reembolsada) no se anuncia como activa', () => {
  assert.equal(compraDeSuscripcion({ estado: 'CANCELADA', sesiones_restantes: 0, fecha_fin: null }, 'Bono'), null);
});

test('compraDeSuscripcion: sin nombre de plan, uno neutro', () => {
  assert.equal(compraDeSuscripcion({ estado: 'ACTIVA', sesiones_restantes: 1, fecha_fin: null }, null)?.plan, 'Tu bono');
});

test('modoDeIdentidad: con cabecera Authorization, la sesión y nada más', () => {
  assert.equal(modoDeIdentidad('Bearer abc'), 'sesion');
  // Una cabecera basura sigue siendo «modo sesión»: el token se valida y, si no
  // vale, 401 — nunca se cae al modo email.
  assert.equal(modoDeIdentidad('basura'), 'sesion');
  assert.equal(modoDeIdentidad(null), 'email');
  assert.equal(modoDeIdentidad('   '), 'email');
});

// Contrato de la ruta con sesión (leyendo el fuente):
//   · el límite va ANTES de nada;
//   · con sesión, la identidad sale del token y nunca del email;
//   · la socia se resuelve con el studioId de la petición, y el recibo se acota
//     a esa socia y ese estudio.
const fuenteRuta = leerFuente(unir(import.meta.dirname, '..', '..', 'app/api/public/estado-pago/route.ts'), 'utf8');
const get = fuenteRuta.slice(fuenteRuta.indexOf('export async function GET('));
function pos(trozo: string, en = get): number {
  const i = en.indexOf(trozo);
  assert.ok(i >= 0, `falta «${trozo}» en la ruta`);
  return i;
}

test('estado-pago: el límite por IP va antes de leer nada', () => {
  const lim = pos('enforceRateLimit(');
  assert.ok(lim < pos('getSupabaseAdmin()'));
  assert.ok(lim < pos('usuarioSupabaseConPaso('));
});

test('estado-pago con sesión: token → socia del estudio pedido → límite por socia → recibo SUYO', () => {
  const rama = get.slice(pos("if (modo === 'sesion') {"), pos('// ── Sin sesión'));
  let ultimo = -1;
  for (const t of ['usuarioSupabaseConPaso(req)', 'socioAutenticado(r.usuario.userId, studioIdParam)', 'rateLimit(`estado-pago-socia:', ".eq('socio_id', socioId)"]) {
    const i = rama.indexOf(t);
    assert.ok(i > ultimo, `«${t}» fuera de orden o ausente en la rama con sesión`);
    ultimo = i;
  }
  assert.ok(rama.includes(".eq('studio_id', studioIdParam)"), 'el recibo se acota al estudio pedido');
  assert.ok(!rama.includes("searchParams.get('email')"), 'con sesión nunca se mira el email');
  assert.ok(rama.includes('CODIGO_SEGUNDO_PASO'), 'segundo paso pendiente: su código, no un 401 a secas');
  assert.ok(rama.includes('return respuesta(req, compra ? { ...cuerpo, compra } : cuerpo);'), 'la rama con sesión contesta ella misma');
});

test('estado-pago: `compra` solo sale con sesión', () => {
  const sinSesion = get.slice(pos('// ── Sin sesión'), pos('async function compraDelPago(', fuenteRuta) - fuenteRuta.indexOf('export async function GET('));
  assert.ok(!sinSesion.includes('compraDelPago('), 'sin sesión no se dice qué se compró');
});
