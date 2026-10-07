import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claveCheckoutRecibo, claveTrasSesion, decidirSesionCheckout, exigirSesionLeidaOEsta, modoDeSesion, queHacerConSesionRepetida,
  type PeticionCheckout,
} from './sesion-checkout.ts';
import { readFileSync } from 'node:fs';

const IMPORTE = 5000; // 50,00€, en céntimos — el importe "actual" del recibo en todos los tests salvo los de M-3.
// La petición de siempre: el enlace de Stripe, sin sesión de usuario.
const H: PeticionCheckout = { modo: 'hospedado', pagadorVerificado: false };

const abierta = (p: Partial<Parameters<typeof decidirSesionCheckout>[0]> = {}) => ({
  status: 'open',
  url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  payment_method_types: ['card'],
  amount_total: IMPORTE,
  // Recién creada: le quedan horas.
  expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
  ...p,
});

test('sin sesión previa se crea una', () => {
  assert.equal(decidirSesionCheckout(null, ['card'], IMPORTE, H), 'crear');
});

test('la sesión abierta del mismo método y mismo importe se REUTILIZA — esto es lo que evita el doble cobro', () => {
  assert.equal(decidirSesionCheckout(abierta(), ['card'], IMPORTE, H), 'reutilizar');
});

test('el orden de los métodos no cuenta', () => {
  const s = abierta({ payment_method_types: ['bizum', 'card'] });
  assert.equal(decidirSesionCheckout(s, ['card', 'bizum'], IMPORTE, H), 'reutilizar');
});

test('cambiar de método expira la anterior antes de crear: nunca dos pagables a la vez', () => {
  assert.equal(decidirSesionCheckout(abierta(), ['card', 'bizum'], IMPORTE, H), 'expirar-y-crear');
  const conBizum = abierta({ payment_method_types: ['card', 'bizum'] });
  assert.equal(decidirSesionCheckout(conBizum, ['card'], IMPORTE, H), 'expirar-y-crear');
});

test('una sesión caducada no se toca, se crea otra', () => {
  assert.equal(decidirSesionCheckout(abierta({ status: 'expired' }), ['card'], IMPORTE, H), 'crear');
});

test('una sesión YA PAGADA no deja abrir otra: el dinero ya entró aunque el recibo aún no conste cobrado', () => {
  // Antes era 'crear': con el webhook tarde (o rechazado), volver a pulsar «Pagar»
  // abría una segunda sesión pagable del mismo recibo.
  for (const p of [H, { modo: 'incrustado', pagadorVerificado: true } as PeticionCheckout]) {
    assert.equal(decidirSesionCheckout(abierta({ status: 'complete' }), ['card'], IMPORTE, p), 'ya-pagada');
  }
});

test('abierta y sin URL se expira: no sirve para pagar, pero otro sí podría pagarla', () => {
  assert.equal(decidirSesionCheckout(abierta({ url: null }), ['card'], IMPORTE, H), 'expirar-y-crear');
});

test('sin payment_method_types no se da por equivalente a lo pedido', () => {
  const s = abierta({ payment_method_types: null });
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE, H), 'expirar-y-crear');
});

// M-3 (auditoría 22-sep): el importe del recibo se puede editar desde el panel
// sin ninguna condición de estado, y la sesión de Stripe ya creada seguía
// cobrando el importe VIEJO porque la decisión de reutilizar nunca miraba
// `amount_total`. Sin esto: bajar el importe producía un sobrecobro que el
// webhook daba por bueno (marcaba COBRADO por menos de lo cobrado de verdad);
// subirlo hacía que Stripe cobrara de más mientras el webhook lo rechazaba con
// 'Importe insuficiente' — dinero cobrado de verdad, sin recibo ni factura.
test('M-3: el importe del recibo SUBIÓ desde que se abrió la sesión — se expira, nunca se reutiliza', () => {
  const s = abierta({ amount_total: IMPORTE }); // sesión vieja, 50,00€
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE + 3000, H), 'expirar-y-crear'); // recibo ahora en 80,00€
});

test('M-3: el importe del recibo BAJÓ desde que se abrió la sesión — se expira, nunca se reutiliza', () => {
  const s = abierta({ amount_total: IMPORTE }); // sesión vieja, 50,00€
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE - 2000, H), 'expirar-y-crear'); // recibo ahora en 30,00€
});

test('M-3: mismos métodos pero `amount_total` desconocido (null) — no se da por bueno, se expira', () => {
  const s = abierta({ amount_total: null });
  assert.equal(decidirSesionCheckout(s, ['card'], IMPORTE, H), 'expirar-y-crear');
});

test('M-3: mismo importe pero método distinto — sigue expirando por el método, como antes', () => {
  const s = abierta({ amount_total: IMPORTE, payment_method_types: ['card'] });
  assert.equal(decidirSesionCheckout(s, ['card', 'bizum'], IMPORTE, H), 'expirar-y-crear');
});

// ─────────────────────────────────────────────────────────────────────────────
// PAY-3 (auditoría 2026-09-23). M-3 quedó CORRECTO en la decisión y ROTO en la
// ejecución: `decidirSesionCheckout` devuelve 'expirar-y-crear' cuando cambia
// el importe, la ruta expira la sesión vieja y pide una nueva… con la MISMA
// clave de idempotencia, que no llevaba el importe, y `unit_amount` distinto.
// Stripe rechaza reutilizar una clave con parámetros distintos, el error caía
// en el catch genérico (500 «No se pudo iniciar el cobro») y la socia quedaba
// SIN poder pagar hasta que la clave caducase en Stripe (~24 h), con la sesión
// anterior ya expirada. Corregir un importe desde el panel dejaba el recibo
// impagable durante un día: peor que el bug que M-3 venía a arreglar.
// ─────────────────────────────────────────────────────────────────────────────

// Instante fijo para las claves: desde D-3 llevan ventana temporal, y dos
// llamadas del mismo test podrían caer en minutos distintos justo en el cambio
// de minuto. El reloj se inyecta para que el test hable de lo que quiere hablar.
const T0 = Date.parse('2026-09-24T10:00:00.000Z');

test('PAY-3: dos importes distintos del mismo recibo dan claves de idempotencia distintas', () => {
  const a = claveCheckoutRecibo('rec-1', ['card'], 5000, H, T0);
  const b = claveCheckoutRecibo('rec-1', ['card'], 8000, H, T0);
  assert.notEqual(a, b, 'sin esto, la sesión nueva tras `expirar-y-crear` la rechaza Stripe');
});

test('PAY-3: la protección de la doble pestaña se conserva — mismo recibo e importe, misma clave', () => {
  assert.equal(
    claveCheckoutRecibo('rec-1', ['card', 'bizum'], 5000, H, T0),
    claveCheckoutRecibo('rec-1', ['bizum', 'card'], 5000, H, T0),
    'el orden de los métodos no puede cambiar la clave: dos peticiones simultáneas comparten sesión',
  );
});

test('PAY-3: cambiar el método sigue dando clave distinta, como antes', () => {
  assert.notEqual(
    claveCheckoutRecibo('rec-1', ['card'], 5000, H, T0),
    claveCheckoutRecibo('rec-1', ['card', 'bizum'], 5000, H, T0),
  );
});

test('PAY-3: la ruta de checkout usa el helper, no una clave construida a mano', () => {
  // El bug nació de tener la clave en línea en la ruta y el discriminante de
  // importe en `lib/`: dos gemelos que divergieron. Esto impide que se separen
  // otra vez.
  const ruta = readFileSync(new URL('../../app/api/stripe/checkout/route.ts', import.meta.url), 'utf8');
  assert.ok(ruta.includes('claveCheckoutRecibo('), 'la clave del recibo sale de sesion-checkout.ts');
  assert.ok(
    !/idempotencyKey: `checkout-\$\{body\.reciboId\}/.test(ruta),
    'no queda ninguna clave de recibo construida a mano en la ruta',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// D-3 (auditoría 2026-09-24). PAY-3 cerró el primer cambio de importe, no el
// segundo. La clave era permanente: deshacer la corrección y volver al importe
// original la reutilizaba, y Stripe devolvía en caché la URL de la sesión que
// `expirar-y-crear` YA había expirado. Enlace muerto para la socia.
// ─────────────────────────────────────────────────────────────────────────────

test('D-3: volver al importe original NO reutiliza la clave de la sesión ya expirada', () => {
  const primera = claveCheckoutRecibo('rec-1', ['card'], 5000, H, T0);
  // El panel corrige a 80 € (sesión nueva) y después deshace la corrección.
  const vuelta = claveCheckoutRecibo('rec-1', ['card'], 5000, H, T0 + 5 * 60_000);
  assert.notEqual(
    primera, vuelta,
    'sin ventana temporal, Stripe devuelve cacheada la URL de una sesión expirada',
  );
});

test('D-3: la ventana no rompe la doble pestaña — dos peticiones del mismo minuto comparten clave', () => {
  assert.equal(
    claveCheckoutRecibo('rec-1', ['card'], 5000, H, T0 + 1_000),
    claveCheckoutRecibo('rec-1', ['card'], 5000, H, T0 + 40_000),
    'el caso que motivó la clave (doble clic) cae siempre dentro del mismo minuto',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// PAY-3, la mitad que faltaba (5-oct-2026): la sesión abierta solo la hereda
// QUIEN la abrió, y en el mismo modo. Una sesión abierta por la titular con su
// sesión lleva `pagadorVerificado` y el webhook guarda en su ficha la tarjeta con
// la que se pague: devolvérsela a quien solo conoce el reciboId metía la tarjeta
// de un tercero en la ficha de la titular.
// ─────────────────────────────────────────────────────────────────────────────

const V: PeticionCheckout = { modo: 'hospedado', pagadorVerificado: true };
const verificada = (p: Parameters<typeof abierta>[0] = {}) => abierta({ metadata: { pagadorVerificado: '1' }, ...p });

test('identidad: los cuatro cruces — solo se reutiliza con la misma', () => {
  assert.equal(decidirSesionCheckout(verificada(), ['card'], IMPORTE, V), 'reutilizar', 'la titular recupera la suya');
  assert.equal(decidirSesionCheckout(abierta(), ['card'], IMPORTE, H), 'reutilizar', 'un enlace sin sesión recupera el suyo');
  assert.equal(decidirSesionCheckout(verificada(), ['card'], IMPORTE, H), 'expirar-y-crear',
    'quien solo conoce el reciboId NO hereda la sesión verificada de la titular');
  assert.equal(decidirSesionCheckout(abierta(), ['card'], IMPORTE, V), 'expirar-y-crear',
    'la titular no hereda una anónima: no guardaría su tarjeta');
});

test('modo: una hospedada no sirve como incrustada ni al revés', () => {
  const I: PeticionCheckout = { modo: 'incrustado', pagadorVerificado: true };
  assert.equal(decidirSesionCheckout(verificada(), ['card'], IMPORTE, I), 'expirar-y-crear');
  const incrustada = verificada({ ui_mode: 'embedded_page', url: null, client_secret: 'cs_secret_1' });
  assert.equal(decidirSesionCheckout(incrustada, ['card'], IMPORTE, I), 'reutilizar', 'la misma incrustada se reutiliza con su client_secret');
  assert.equal(decidirSesionCheckout(incrustada, ['card'], IMPORTE, V), 'expirar-y-crear');
  assert.equal(decidirSesionCheckout(verificada({ ui_mode: 'embedded_page', client_secret: null }), ['card'], IMPORTE, I), 'expirar-y-crear',
    'incrustada sin client_secret no se puede montar, y sigue siendo pagable');
});

test('modoDeSesion: lo que no se sabe leer no se reutiliza', () => {
  assert.equal(modoDeSesion(null), 'hospedado');
  assert.equal(modoDeSesion('hosted_page'), 'hospedado');
  assert.equal(modoDeSesion('hosted'), 'hospedado');
  assert.equal(modoDeSesion('embedded_page'), 'incrustado');
  assert.equal(modoDeSesion('elements'), null);
  assert.equal(decidirSesionCheckout(abierta({ ui_mode: 'elements' }), ['card'], IMPORTE, H), 'expirar-y-crear');
});

test('la clave distingue modo e identidad: dos peticiones distintas del mismo minuto no chocan en Stripe', () => {
  const I: PeticionCheckout = { modo: 'incrustado', pagadorVerificado: false };
  const peticiones: PeticionCheckout[] = [H, V, I, { modo: 'incrustado', pagadorVerificado: true }];
  const claves = peticiones.map(p => claveCheckoutRecibo('rec-1', ['card'], 5000, p, T0));
  assert.equal(new Set(claves).size, 4);
  assert.equal(claveCheckoutRecibo('rec-1', ['card'], 5000, V, T0), claveCheckoutRecibo('rec-1', ['card'], 5000, V, T0 + 30_000));
});

// ── La ruta (alias `@/` y Stripe: `node --test` no la carga) ──

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const rutaCheckout = () => sinComentarios(readFileSync(new URL('../../app/api/stripe/checkout/route.ts', import.meta.url), 'utf8'));

test('rama de recibo: con un cobro de la Caja guardado se PREGUNTA, antes de tocar ninguna sesión, y solo el vivo da 409', () => {
  const s = rutaCheckout();
  const mira = s.indexOf('if (cobroCajaLeido) {');
  assert.ok(mira > 0, 'la rama de recibo no mira el cobro del mostrador');
  assert.ok(mira < s.indexOf('sesionAbiertaId = (recibo.checkout_session_id'));
  const bloque = s.slice(mira, s.indexOf('const penalizacionNoPagable', mira));
  // Se lee sin tocarlo (#2546)…
  assert.match(bloque, /let vida = await vidaDelCobroDeLaCajaEnElRecibo\(/);
  // …salvo el abandonado: al mismo dueño que el mostrador, con el margen. Un datáfono
  // que nadie canceló no deja a la alumna sin poder pagar online para siempre.
  assert.match(bloque, /if \(vida === 'vivo'\) \{[\s\S]*?await soltarCobroDeMostradorDelRecibo\(admin, \{/);
  assert.match(bloque, /cancelarPendienteTrasMs: MINUTOS_COBRO_MOSTRADOR_ABANDONADO \* 60_000/);
  assert.match(bloque, /if \(mostrador\.tipo === 'SEGUIR'\) vida = 'muerto';/);
  // Un solo 409, neutro: la ruta es pública y no puede decir si se cobra en el estudio.
  assert.match(bloque, /if \(vida !== 'muerto'\) \{\s*return conCorsWidget\(req, NextResponse\.json\(\{ error: MENSAJE_PAGO_ONLINE_CON_COBRO_DE_LA_CAJA \}, \{ status: 409 \}\)\);/);
  assert.equal(bloque.split('status: 409').length - 1, 1);
});

test('rama de recibo: una sesión ya pagada da 409, nunca otra sesión', () => {
  const s = rutaCheckout();
  assert.match(s, /decidirSesionCheckout\(previa, paymentMethodTypes, Math\.round\(importe \* 100\), peticionCheckout, ahoraMs\)/);
  assert.match(s, /if \(decision === 'ya-pagada'\) \{\s*return conCorsWidget\(req, NextResponse\.json\(\{ error: MENSAJE_RECIBO_YA_PAGADO_ONLINE \}, \{ status: 409 \}\)\);/);
  assert.match(s, /claveCheckoutRecibo\(body\.reciboId, paymentMethodTypes, Math\.round\(importe \* 100\), peticionCheckout, ahoraMs\)/);
});

test('rama de recibo: el UPDATE que guarda la sesión vuelve a exigir todo lo comprobado', () => {
  const s = rutaCheckout();
  const ini = s.indexOf('.update({ checkout_session_id: session.id })');
  assert.ok(ini > 0);
  const bloque = s.slice(ini, s.indexOf("await guardar.select('id')", ini));
  for (const cond of [
    ".is('cobro_off_session_clave', null)", ".in('estado', [...ESTADOS_COBRABLES])",
    // El cobro de la Caja leído (muerto) o ninguno: uno nuevo entre medias, no se guarda.
    'guar' + 'dar.or(`cobro_mostrador_pi.is.null,cobro_mostrador_pi.eq."${cobroCajaLeido}"`)', ".is('cobro_mostrador_pi', null)",
    ".is('reembolso_stripe_id', null)", ".is('reembolso_solicitado_en', null)", ".or('estado.neq.DEVUELTO,importe_devuelto.eq.0')",
    'exigirSesionLeidaOEsta(guardar, sesionAbiertaId, session.id, { leidaMuerta: sesionLeidaMuerta })',
  ]) assert.ok(bloque.includes(cond), `falta ${cond} en el UPDATE`);
});

// ─────────────────────────────────────────────────────────────────────────────
// La repetición idempotente de Stripe (5-oct-2026): trae la sesión como era al
// crearse. Dos peticiones del mismo intento reciben la MISMA sesión, y la segunda
// en escribir no puede tomarla por «otra» y caducar la que ya se entregó.
// ─────────────────────────────────────────────────────────────────────────────

test('repetición: se decide con la sesión de AHORA, no con la que devuelve Stripe', () => {
  assert.equal(queHacerConSesionRepetida({ status: 'open' }), 'usar');
  assert.equal(queHacerConSesionRepetida({ status: 'expired' }), 'nueva', 'una URL caducada no se entrega: otra, con otra clave');
  assert.equal(queHacerConSesionRepetida({ status: 'complete' }), 'pagada', 'pagada: ni su URL ni otra sesión');
  assert.equal(queHacerConSesionRepetida(null), 'no-se-sabe');
  assert.equal(queHacerConSesionRepetida({ status: null }), 'no-se-sabe');
  assert.notEqual(claveTrasSesion('checkout-rec-1-card-5000-hv-1', 'cs_muerta'), 'checkout-rec-1-card-5000-hv-1');
});

type FiltroSesion = [op: string, columna: string, valor: unknown];
function builderSesion() {
  const filtros: FiltroSesion[] = [];
  const b = {
    is(c: string, v: null) { filtros.push(['is', c, v]); return b; },
    eq(c: string, v: string) { filtros.push(['eq', c, v]); return b; },
    in(c: string, v: string[]) { filtros.push(['in', c, v]); return b; },
    or(expr: string) { filtros.push(['or', '', expr]); return b; },
  };
  return { b, filtros };
}

test('guardar la sesión: la leída, o ya ESTA (la guardó la otra petición del mismo intento)', () => {
  const sinLeida = builderSesion();
  exigirSesionLeidaOEsta(sinLeida.b, null, 'cs_nueva');
  assert.deepEqual(sinLeida.filtros, [['or', '', 'checkout_session_id.is.null,checkout_session_id.eq.cs_nueva']]);
  const conLeida = builderSesion();
  exigirSesionLeidaOEsta(conLeida.b, 'cs_vieja', 'cs_nueva');
  assert.deepEqual(conLeida.filtros, [['in', 'checkout_session_id', ['cs_vieja', 'cs_nueva']]]);
  // Un id con otra forma no entra en un filtro compuesto: lo de siempre, estricto.
  const raro = builderSesion();
  exigirSesionLeidaOEsta(raro.b, 'cs_vieja', 'cs_x,id.neq.y');
  assert.deepEqual(raro.filtros, [['eq', 'checkout_session_id', 'cs_vieja']]);
  // La leída ya está muerta: también vale vacía (el conciliador la soltó entre medias).
  const muerta = builderSesion();
  exigirSesionLeidaOEsta(muerta.b, 'cs_vieja', 'cs_nueva', { leidaMuerta: true });
  assert.deepEqual(muerta.filtros, [['or', '', 'checkout_session_id.is.null,checkout_session_id.eq.cs_vieja,checkout_session_id.eq.cs_nueva']]);
  const muertaRara = builderSesion();
  exigirSesionLeidaOEsta(muertaRara.b, 'cs_vieja', 'cs_x,id.neq.y', { leidaMuerta: true });
  assert.deepEqual(muertaRara.filtros, [['eq', 'checkout_session_id', 'cs_vieja']], 'con un id raro, estricto igual');
});

test('la leída solo cuenta como muerta si no existe, caducó o la cerró esta petición', () => {
  const s = rutaCheckout();
  const ini = s.indexOf('if (sesionAbiertaId) {');
  const bloque = s.slice(ini, s.indexOf('const clavePlan', ini));
  assert.equal((bloque.match(/sesionLeidaMuerta = true;/g) ?? []).length, 3);
  // Tras un cierre que NO dice SEGUIR (pagada o sin saber) nunca se llega a marcarla.
  assert.match(bloque, /cierre\.tipo === 'NO_SE_SABE'[\s\S]{0,200}\}\s*sesionLeidaMuerta = true;/);
});

test('rama de recibo: si no se puede revisar la sesión guardada, NO se crea otra (salvo que no exista)', () => {
  const s = rutaCheckout();
  const ini = s.indexOf('if (sesionAbiertaId) {');
  const bloque = s.slice(ini, s.indexOf('const clavePlan', ini));
  assert.match(bloque, /if \(!sesionNoExisteEnStripe\(err\)\) \{[\s\S]{0,400}status: 503/);
  // Cerrar la previa con el mismo dueño que el mostrador: si la acaban de pagar, 409.
  assert.match(bloque, /await cerrarPagoOnlineAntesDeCobrarAMano\(previa\.id, \{/);
  assert.match(bloque, /cierre\.tipo === 'YA_PAGADO'[\s\S]{0,200}status: 409/);
  assert.match(bloque, /cierre\.tipo === 'NO_SE_SABE'[\s\S]{0,200}status: 503/);
  assert.doesNotMatch(bloque, /catch \(err\) \{\s*\/\/ La sesión guardada ya no se puede consultar/, 'ya no se sigue a ciegas');
});

test('la repetición de Stripe se mira antes de entregar su URL, y la segunda petición no caduca la de la primera', () => {
  const s = rutaCheckout();
  const crea = s.indexOf('= await crearSesion(claveSesion);');
  const mira = s.indexOf('queHacerConSesionRepetida(actual)', crea);
  const guarda = s.indexOf('.update({ checkout_session_id: session.id })', crea);
  assert.ok(crea > 0 && mira > crea && guarda > mira, 'crear → mirar la repetición → guardar');
  // Caducada: otra con otra clave, y la repetición de ESA también se mira (revisión del 5-oct, #2).
  assert.match(s.slice(mira, guarda), /claveActual = claveTrasSesion\(claveActual, session\.id\);\s*session = await crearSesion\(claveActual\);\s*creadaAqui = !esRespuestaRepetida\(session\);\s*continue;/, 'caducada: otra con otra clave');
  assert.match(s.slice(crea, mira), /for \(let vuelta = 0; !creadaAqui && claveActual && vuelta < 4; vuelta\+\+\) \{/);
  const cero = s.indexOf('if (reciboDesaparecido) {', guarda);
  const caduca = s.indexOf('await stripe.checkout.sessions.expire(session.id', guarda);
  assert.ok(cero > 0 && caduca > cero, 'antes de caducar se relee');
  assert.match(s.slice(cero, caduca), /ahora\?\.checkout_session_id === session\.id[\s\S]{0,120}return responderSesion\(session\);/);
});

// ── RECIBOS (6-oct-2026): la sesión INCRUSTADA de la app ────────────────────
import { expiraSesionIncrustada, respuestaIncrustada } from './sesion-checkout.ts';

test('la incrustada caduca a los 32 min del minuto de su clave: igual dentro del minuto, y con margen sobre los 30 de Stripe', () => {
  const inicioMinuto = Date.UTC(2026, 9, 6, 10, 15, 0);
  const a = expiraSesionIncrustada(inicioMinuto + 1_000);
  const b = expiraSesionIncrustada(inicioMinuto + 59_000);
  assert.equal(a, b, 'dos peticiones del mismo minuto mandan el mismo expires_at (misma clave, mismos parámetros)');
  assert.equal(a, inicioMinuto / 1000 + 32 * 60);
  for (const dentro of [0, 1_000, 59_999]) {
    const ahora = inicioMinuto + dentro;
    // Stripe cuenta los 30 min desde que CREA la sesión, que llega después (leer la
    // sesión anterior, cerrarla, el viaje): al menos un minuto de holgura, también
    // en el último milisegundo del minuto (con +31 quedaban 30 min y 1 ms).
    assert.ok(expiraSesionIncrustada(ahora) * 1000 - ahora > 31 * 60_000 - 1, 'Stripe exige ≥30 min desde que se crea, y llega después');
  }
  // Y la clave de ese mismo minuto es la misma: van juntas.
  const I: PeticionCheckout = { modo: 'incrustado', pagadorVerificado: true };
  assert.equal(
    claveCheckoutRecibo('rec-1', ['card'], 5000, I, inicioMinuto + 1_000),
    claveCheckoutRecibo('rec-1', ['card'], 5000, I, inicioMinuto + 59_000),
  );
});

test('la respuesta de la app: el client_secret y la sesión; sin client_secret no hay nada que montar', () => {
  assert.deepEqual(respuestaIncrustada({ id: 'cs_test_1', client_secret: 'cs_test_1_secret_x' }), { clientSecret: 'cs_test_1_secret_x', checkoutSessionId: 'cs_test_1' });
  assert.equal(respuestaIncrustada({ id: 'cs_test_1', client_secret: null }), null);
});

// ── 7-oct-2026: una sesión a punto de caducar no se devuelve ────────────────
import { MINUTOS_MINIMOS_PARA_REUTILIZAR } from './sesion-checkout.ts';

test('a una sesión abierta le tiene que quedar margen para reutilizarla; si no, se cierra y se abre otra', () => {
  const ahora = Date.UTC(2026, 9, 7, 10, 0, 0);
  const quedan = (min: number) => abierta({ expires_at: Math.floor(ahora / 1000) + min * 60 });
  const I: PeticionCheckout = { modo: 'incrustado', pagadorVerificado: true };
  const incrustada = (min: number) => ({ ...quedan(min), ui_mode: 'embedded_page', url: null, client_secret: 'cs_x_secret', metadata: { pagadorVerificado: '1' } });
  assert.equal(decidirSesionCheckout(quedan(30), ['card'], IMPORTE, H, ahora), 'reutilizar');
  assert.equal(decidirSesionCheckout(quedan(MINUTOS_MINIMOS_PARA_REUTILIZAR), ['card'], IMPORTE, H, ahora), 'reutilizar', 'justo el margen, sí');
  assert.equal(decidirSesionCheckout(quedan(MINUTOS_MINIMOS_PARA_REUTILIZAR - 1), ['card'], IMPORTE, H, ahora), 'expirar-y-crear');
  // El caso de verdad: la hoja incrustada vive 32 min; abierta hace 25, le quedan 7.
  assert.equal(decidirSesionCheckout(incrustada(7), ['card'], IMPORTE, I, ahora), 'expirar-y-crear');
  assert.equal(decidirSesionCheckout(incrustada(20), ['card'], IMPORTE, I, ahora), 'reutilizar');
  // Sin saber cuándo caduca, no se arriesga.
  assert.equal(decidirSesionCheckout(abierta({ expires_at: null }), ['card'], IMPORTE, H, ahora), 'expirar-y-crear');
  // Pagada sigue siendo pagada, le quede lo que le quede: nunca otra sesión (ni dos cobros).
  assert.equal(decidirSesionCheckout({ ...quedan(1), status: 'complete' }, ['card'], IMPORTE, H, ahora), 'ya-pagada');
});

test('la ruta cierra la vieja con el MISMO cierre que mira antes si se pagó (nunca dos cobros)', () => {
  const s = readFileSync(new URL('../../app/api/stripe/checkout/route.ts', import.meta.url), 'utf8');
  const desde = s.indexOf("if (decision === 'expirar-y-crear') {");
  assert.ok(desde > 0);
  const rama = s.slice(desde, desde + 900);
  assert.match(rama, /cerrarPagoOnlineAntesDeCobrarAMano\(previa\.id/);
  assert.match(rama, /cierre\.tipo === 'YA_PAGADO'/);
  assert.match(rama, /cierre\.tipo === 'NO_SE_SABE'/);
});
