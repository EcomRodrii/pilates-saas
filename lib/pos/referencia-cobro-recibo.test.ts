import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claveCobroRecibo, esMismoIntentoVivo, estadoParaSoltar, mensajeCajaAntesDeCobrar, MENSAJE_PAGO_ONLINE_CON_COBRO_DE_LA_CAJA,
  respuestaTrasCancelar, trasGuardarReferencia, vidaDelCobroDeLaCaja,
} from './referencia-cobro-recibo.ts';
import type { EstadoPagoPOS } from './tipos.ts';

// «Vengo a pagar la cuota» con datáfono o Bizum: si la referencia del cobro no
// queda guardada (el recibo cambió, otro arranque ya guardó la suya, o el UPDATE
// dio error), el cobro en vuelo se cancela y se responde error.

test('⚠️ ninguna fila tocada al guardar la referencia → se cancela el cobro', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 0 }), 'CANCELAR');
});

test('⚠️ error al guardar la referencia → también se cancela (el sondeo diría «no llegó a iniciarse»)', () => {
  assert.equal(trasGuardarReferencia({ error: true, tocadas: 0 }), 'CANCELAR');
  assert.equal(trasGuardarReferencia({ error: true, tocadas: 1 }), 'CANCELAR');
});

test('fila tocada sin error → se sigue', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 1 }), 'SEGUIR');
});

test('recibo cambiado, tras cancelar: solo un final sin cobrar dice que se ha cancelado (409)', () => {
  // RECHAZADO incluido: el datáfono solo lo da con el cobro ya cancelado en Stripe.
  for (const estado of ['CANCELADO', 'EXPIRADO', 'RECHAZADO'] as EstadoPagoPOS[]) {
    const r = respuestaTrasCancelar(estado, 'CAMBIO');
    assert.equal(r.confirmado, true, estado);
    assert.equal(r.http, 409);
    assert.match(r.mensaje, /Hemos cancelado el cobro/);
  }
});

test('⚠️ error al guardar, cancelado de verdad → 503 y a reintentar', () => {
  for (const estado of ['CANCELADO', 'EXPIRADO', 'RECHAZADO'] as EstadoPagoPOS[]) {
    assert.deepEqual(respuestaTrasCancelar(estado, 'ERROR_AL_GUARDAR'),
      { confirmado: true, http: 503, mensaje: 'No se ha podido iniciar el cobro: vuelve a intentarlo.' });
  }
});

test('⚠️ tras cancelar: con el pago dentro no se dice que se canceló, y se avisa de no volver a cobrarlo', () => {
  for (const [motivo, http] of [['CAMBIO', 409], ['ERROR_AL_GUARDAR', 503]] as const) {
    const r = respuestaTrasCancelar('PAGADO', motivo);
    assert.equal(r.confirmado, false);
    assert.equal(r.http, http);
    assert.doesNotMatch(r.mensaje, /Hemos cancelado|vuelve a intentarlo/);
    assert.match(r.mensaje, /no lo vuelvas a cobrar/);
  }
});

test('⚠️ tras cancelar: sin confirmación del proveedor no se promete nada', () => {
  for (const motivo of ['CAMBIO', 'ERROR_AL_GUARDAR'] as const) {
    for (const estado of ['PENDIENTE', 'PROCESANDO', 'ERROR'] as EstadoPagoPOS[]) {
      const r = respuestaTrasCancelar(estado, motivo);
      assert.equal(r.confirmado, false, `${motivo} ${estado}`);
      assert.doesNotMatch(r.mensaje, /Hemos cancelado|vuelve a intentarlo/, `${motivo} ${estado}`);
      assert.match(r.mensaje, /no podemos confirmarlo/, `${motivo} ${estado}`);
    }
  }
  assert.doesNotMatch(respuestaTrasCancelar('PROCESANDO', 'ERROR_AL_GUARDAR').mensaje, /ha cambiado/, 'un error no es que el recibo cambiara');
});

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

test('⚠️ la ruta del mostrador guarda la referencia con CAS sobre estado y referencia leídos, y cancela antes de responder', () => {
  const fuente = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/pos/recibo/route.ts'), 'utf8'));
  const iniciar = fuente.indexOf('await cobro.iniciar(');
  const update = fuente.indexOf('cobro_mostrador_pi: inicio.referencia', iniciar);
  const cas = fuente.indexOf(".eq('id', reciboId).eq('studio_id', sesion.studioId).eq('estado', recibo.estado);", update);
  const casRef = fuente.indexOf("? guardarSinOtroEnlace.eq('cobro_mostrador_pi', referenciaPrevia)\n      : guardarSinOtroEnlace.is('cobro_mostrador_pi', null)", cas);
  const select = fuente.indexOf(").select('id');", casRef);
  const decision = fuente.indexOf("trasGuardarReferencia({ error: !!errRef, tocadas: tocadas?.length ?? 0, yaGuardadaEsLaMisma }) === 'CANCELAR'", select);
  const motivo = fuente.indexOf("const motivo = errRef ? 'ERROR_AL_GUARDAR' : 'CAMBIO';", decision);
  const cancelar = fuente.indexOf('await cobro.cancelar(inicio.referencia, inicio.checkoutSessionId ?? null);', motivo);
  const consultar = fuente.indexOf('await cobro.consultar(inicio.referencia);', cancelar);
  const respuesta = fuente.indexOf('respuestaTrasCancelar(tras.estado, motivo)', consultar);
  const error = fuente.indexOf('{ status: respuesta.http }', respuesta);
  const ok = fuente.indexOf('referencia: inicio.referencia,', error);
  assert.ok(iniciar > 0 && update > iniciar && cas > update && casRef > cas && select > casRef, 'UPDATE con CAS (estado + referencia) y conteo de filas');
  assert.ok(decision > select && motivo > decision && cancelar > motivo && consultar > cancelar && respuesta > consultar && error > respuesta,
    'cancelar → preguntar → error con el HTTP de la regla');
  assert.ok(ok > error, 'la respuesta de éxito va después del corte');
  // Solo ids a Sentry.
  assert.ok(fuente.includes('extra: { reciboId, studioId: sesion.studioId, referencia: inicio.referencia, pagoEstado: tras.estado, motivo }'));
});

test('⚠️ otra petición del MISMO intento ya guardó este cobro: se sigue, no se cancela el bueno', () => {
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 0, yaGuardadaEsLaMisma: true }), 'SEGUIR');
  assert.equal(trasGuardarReferencia({ error: false, tocadas: 0, yaGuardadaEsLaMisma: false }), 'CANCELAR');
  // Con error no se sabe qué hay guardado: se cancela igual.
  assert.equal(trasGuardarReferencia({ error: true, tocadas: 0, yaGuardadaEsLaMisma: true }), 'CANCELAR');
});

test('⚠️ la clave del cobro de un recibo es la del INTENTO: dos intentos, dos claves; el mismo intento, la misma', () => {
  const a = claveCobroRecibo('rec-1', 'DATAFONO', 'b7e1c2d4-0f3a-4c5e-9a1b-2c3d4e5f6a7b');
  const b = claveCobroRecibo('rec-1', 'DATAFONO', '4a5b6c7d-8e9f-4a0b-8c1d-2e3f4a5b6c7d');
  assert.ok(a && b && a !== b, 'tras cancelar o un rechazo, el intento siguiente no recibe el cobro muerto');
  assert.equal(claveCobroRecibo('rec-1', 'DATAFONO', 'b7e1c2d4-0f3a-4c5e-9a1b-2c3d4e5f6a7b'), a);
  for (const malo of [undefined, null, '', 'corto', 'con espacios aquí', 'x'.repeat(65), 42, { a: 1 }]) {
    assert.equal(claveCobroRecibo('rec-1', 'DATAFONO', malo), null, String(malo));
  }
});

test('⚠️ la ruta usa la clave del intento (y una nueva del servidor si no llega), nunca la del recibo a secas', () => {
  const fuente = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/pos/recibo/route.ts'), 'utf8'));
  // Una sola vez: la misma clave decide qué hacer con el cobro guardado y abre el nuevo.
  assert.ok(fuente.includes('const claveIntento = claveCobroRecibo(reciboId, metodo, body?.intentoId)'));
  assert.ok(fuente.includes('claveIdempotencia: claveIntento,'));
  assert.equal(fuente.split('claveCobroRecibo(reciboId, metodo, body?.intentoId)').length - 1, 1);
  assert.doesNotMatch(fuente, /referenciaPrevia \?\? 'sin'/);
});

// Un recibo con otro cobro aún en marcha al empezar uno nuevo en la Caja: lo resuelve el
// MISMO dueño que el cobro a mano (`soltarPagosEnMarchaAntesDeCobrar`), y manda el último.
const leido = (estado: EstadoPagoPOS, clave: string | null = 'k-viejo') => ({ comprobado: true as const, estado, clave });

test('⚠️ el mismo intento repetido con su cobro vivo no se cancela; cualquier otro, sí', () => {
  for (const estado of ['PENDIENTE', 'PROCESANDO'] as EstadoPagoPOS[]) {
    assert.equal(esMismoIntentoVivo(leido(estado, 'k-nuevo'), 'k-nuevo'), true, estado);
    assert.equal(esMismoIntentoVivo(leido(estado), 'k-nuevo'), false, `${estado}: otro intento`);
    assert.equal(esMismoIntentoVivo(leido(estado, null), 'k-nuevo'), false, `${estado}: sin clave guardada`);
  }
  // Ya acabado, entrado o sin leer: nunca es «el mismo cobro vivo».
  for (const estado of ['PAGADO', 'CANCELADO', 'RECHAZADO', 'EXPIRADO', 'ERROR'] as EstadoPagoPOS[]) {
    assert.equal(esMismoIntentoVivo(leido(estado, 'k-nuevo'), 'k-nuevo'), false, estado);
  }
  assert.equal(esMismoIntentoVivo({ comprobado: false }, 'k-nuevo'), false);
  // El cobro a mano no manda intento: nunca conserva el cobro de la Caja.
  assert.equal(esMismoIntentoVivo(leido('PENDIENTE', 'k-nuevo'), undefined), false);
});

test('⚠️ lo leído, para soltarlo: si ya no existe o no es de este recibo se suelta; sin leerlo, no', () => {
  assert.equal(estadoParaSoltar(null), 'CANCELADO', 'antes una referencia ilegible bloqueaba el recibo para siempre');
  assert.equal(estadoParaSoltar({ comprobado: false }), 'ERROR');
  for (const estado of ['PENDIENTE', 'PROCESANDO', 'PAGADO', 'RECHAZADO'] as EstadoPagoPOS[]) {
    assert.equal(estadoParaSoltar(leido(estado)), estado);
  }
});

test('la Caja dice por qué no empieza el cobro con sus palabras, sin prometer lo que no es', () => {
  // «Ya cobrado» no lo está hasta que llega el aviso: no se dice «recarga».
  assert.match(mensajeCajaAntesDeCobrar({ motivo: 'YA_PAGADO_EN_EL_MOSTRADOR', mensaje: 'x' }), /aparecerá cobrado en unos segundos/);
  assert.doesNotMatch(mensajeCajaAntesDeCobrar({ motivo: 'YA_PAGADO_EN_EL_MOSTRADOR', mensaje: 'x' }), /[Rr]ecarga/);
  // Vale para el datáfono y para Bizum.
  assert.doesNotMatch(mensajeCajaAntesDeCobrar({ motivo: 'COBRO_EN_EL_MOSTRADOR', mensaje: 'x' }), /datáfono|no se ha podido cancelar/,
    'también sale cuando hay otro intento guardado (no siempre es que no se pudiera cancelar)');
  assert.equal(mensajeCajaAntesDeCobrar({ motivo: 'YA_PAGADO_ONLINE', mensaje: 'del dueño' }), 'del dueño');
});

test('⚠️ el arranque de un cobro de la Caja pasa por el dueño de «pagos en marcha» ANTES de abrir el nuevo', () => {
  const f = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/pos/recibo/route.ts'), 'utf8'));
  const clave = f.indexOf('const claveIntento = claveCobroRecibo(reciboId, metodo, body?.intentoId)');
  // Preparar el cobro nuevo no toca nada: va ANTES del dueño, que sí cierra cosas (el
  // enlace de la socia, el cobro de otra pestaña). Sin cuenta, no se cierra nada para nada.
  const nuevo = f.indexOf('await prepararCobroNuevo(', clave);
  const noSePuede = f.indexOf('if (!preparado.ok) return NextResponse.json({ error: preparado.motivo }, { status: 409 });', nuevo);
  const duenyo = f.indexOf('await soltarPagosEnMarchaAntesDeCobrar(', noSePuede);
  const conIntento = f.indexOf('admin, { studioId: sesion.studioId, reciboId, claveIntento }, preparadorDeStripe(admin, sesion.studioId),', duenyo);
  const corta = f.indexOf('if (!enMarcha.ok) return NextResponse.json({ error: mensajeCajaAntesDeCobrar(enMarcha) }, { status: 409 });', conIntento);
  const iniciar = f.indexOf('await cobro.iniciar(', corta);
  assert.ok(clave > 0 && nuevo > clave && noSePuede > nuevo && duenyo > noSePuede && conIntento > duenyo && corta > conIntento && iniciar > corta,
    'clave del intento → preparar (sin efectos) → dueño (con la clave) → no se abre si no deja → abrir el nuevo');
  // Ni una segunda copia de la regla: la ruta no cancela ni suelta cobros previos por su cuenta.
  assert.ok(!f.includes('prepararCobroExistente(') && !f.includes("proveedorDeReferencia(referenciaPrevia)"));
  // Y al guardar, ni con un enlace de pago abierto después de cerrarlo: «la leída o
  // ninguna» (el conciliador suelta la sesión que caduca; eso no es un enlace nuevo).
  assert.ok(f.includes('const guardarSinOtroEnlace = exigirCheckoutLeido(guardar, enMarcha.checkoutLeido);'));
  assert.equal(f.indexOf('contextoCobroDe('), -1);
});

// El enlace de pago online de la socia con un cobro de la Caja guardado en el recibo.
test('⚠️ enlace online: solo un cobro de la Caja vivo (o que entró) lo frena; uno muerto, no', () => {
  for (const estado of ['PENDIENTE', 'PROCESANDO'] as EstadoPagoPOS[]) assert.equal(vidaDelCobroDeLaCaja(estado), 'vivo', estado);
  assert.equal(vidaDelCobroDeLaCaja('PAGADO'), 'pagado');
  // Un Bizum caducado que nadie soltó, o uno que ya no existe en la cuenta: no la deja sin pagar online.
  for (const estado of ['RECHAZADO', 'CANCELADO', 'EXPIRADO'] as EstadoPagoPOS[]) assert.equal(vidaDelCobroDeLaCaja(estado), 'muerto', estado);
  assert.equal(vidaDelCobroDeLaCaja(null), 'muerto');
  // Sin poder leerlo, o un estado que no se reconoce: no se abre otro pago a ciegas.
  assert.equal(vidaDelCobroDeLaCaja('SIN_LEER'), 'no-se-sabe');
  assert.equal(vidaDelCobroDeLaCaja('ERROR'), 'no-se-sabe');
  // Uno solo y sin decir que está en el estudio: la ruta es pública (basta el enlace del recibo).
  assert.doesNotMatch(MENSAJE_PAGO_ONLINE_CON_COBRO_DE_LA_CAJA, /estudio|mostrador|datáfono|pagado/);
  assert.match(MENSAJE_PAGO_ONLINE_CON_COBRO_DE_LA_CAJA, /Vuelve a mirarlo en unos minutos/);
});

test('⚠️ el enlace online mira el cobro de la Caja ANTES de reutilizar o crear una sesión, y al guardarla exige el mismo', () => {
  const f = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'app/api/stripe/checkout/route.ts'), 'utf8'));
  assert.ok(f.includes('checkout_session_id, cobro_off_session_clave, cobro_mostrador_pi,'), 'lo lee con el recibo');
  const offSession = f.indexOf('if (recibo.cobro_off_session_clave) {');
  const caja = f.indexOf('cobroCajaLeido = (recibo.cobro_mostrador_pi as string | null) ?? null;', offSession);
  const mira = f.indexOf('await vidaDelCobroDeLaCajaEnElRecibo(admin, body.studioId, body.reciboId, cobroCajaLeido, { origen: req.nextUrl.origin });', caja);
  const frena = f.indexOf("if (vida !== 'muerto') {", mira);
  const reutiliza = f.indexOf('sesionAbiertaId = (recibo.checkout_session_id as string | null) ?? null;', frena);
  const crea = f.indexOf('stripe.checkout.sessions.create(', reutiliza);
  assert.ok(offSession > 0 && caja > offSession && mira > caja && frena > mira && reutiliza > frena && crea > reutiliza,
    'tarjeta guardada → cobro de la Caja (vivo frena) → reutilizar una sesión abierta → crear');
  // Solo lee: nunca para el cobro del mostrador desde el enlace de la socia.
  assert.ok(!f.includes('soltarPagosEnMarchaAntesDeCobrar') && !/cancelar\(cobroCajaLeido|anularCobroDelDatafono/.test(f));
  // Y la sesión nueva no se guarda si entre medias empezó otro cobro de la Caja.
  // (El leído estaba muerto: si entre medias alguien lo soltó, no es un cobro nuevo.)
  assert.ok(f.includes('? guardar.or(`cobro_mostrador_pi.is.null,cobro_mostrador_pi.eq."${cobroCajaLeido}"`)\n        : guardar.is(\'cobro_mostrador_pi\', null)'));
});

test('⚠️ sin cuenta de Stripe la referencia vieja se suelta; con la cuenta pero sin poder consultarla, se frena', () => {
  const f = sinComentarios(readFileSync(join(import.meta.dirname, '../..', 'lib/cobros/antes-de-cobrar-a-mano-servidor.ts'), 'utf8'));
  // Solo el 409 («sin cuenta conectada») es «referencia vieja»; el 503 del entorno, no.
  assert.ok(f.includes("stripeDelEstudio = c.status === 409 ? { tipo: 'sin-cuenta' } : { tipo: 'sin-consultar' };"));
  assert.ok(f.includes("? { consultar: async () => 'CANCELADO', cancelar: async () => {}, soltar: () => soltarReferencia(ref) }"));
  assert.ok(f.includes("? { consultar: async () => 'ERROR', cancelar: async () => {}, soltar: async () => false }"));
  assert.ok(f.includes("if (s.tipo === 'sin-consultar') return { ok: false, motivo: 'PAGO_ONLINE_SIN_COMPROBAR', mensaje: MENSAJE_PAGO_ONLINE_SIN_COMPROBAR };"));
});
