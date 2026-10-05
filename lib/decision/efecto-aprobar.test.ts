import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  efectoAlAprobar, efectoDe, admiteYaContactada, sigueAbierta, trasDecidir, ROTULO_EFECTO, TONO_TRAS_DECIDIR,
  canalesSocia, emailConfigurado, puedeEscribirle, recibosDeLaAccion, mismosRecibos, recibosACobrar, recibosAprobadosFuera,
  comprobarAprobacion, PANTALLA_DESACTUALIZADA, RECIBOS_CAMBIADOS, TEXTO_COBRO_EN_MARCHA, TEXTO_COBRO_TARDANDO,
  type CanalesSocia, type EfectoAprobar, type RecomendacionParaEfecto, type TipoTrasDecidir,
} from './efecto-aprobar.ts';
import { detalleCobro, detalleInterrumpida, resumirCobro, type IntentoCobro } from './resultado-ejecucion.ts';

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');
/** El código sin comentarios, para no dar por buena una mención en un comentario. */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const rec = (o: Partial<RecomendacionParaEfecto>): RecomendacionParaEfecto => ({
  tipo: 'RECUPERAR_SOCIA', accion: { tipo: 'CONTACTO_MANUAL' }, socioId: 'soc-1', datosUsados: { nombre: 'Marta' }, ...o,
});
const SIN_CANAL: CanalesSocia = { whatsapp: false, email: false };

// ─── La tabla: lo que dice el botón es lo que hace el ejecutor ───────────────
const CASOS: Array<{ caso: string; r: RecomendacionParaEfecto; canales?: CanalesSocia; efecto: EfectoAprobar; rotulo: string }> = [
  {
    caso: 'COBRAR_RECIBOS cobra la tarjeta',
    r: rec({ tipo: 'RECUPERAR_PAGOS', accion: { tipo: 'COBRAR_RECIBOS' }, socioId: null }),
    efecto: 'COBRAR', rotulo: 'Cobrar ahora',
  },
  {
    caso: 'ENVIAR_EMAIL manda el email',
    r: rec({ tipo: 'ENVIAR_REACTIVACION', accion: { tipo: 'ENVIAR_EMAIL' } }),
    canales: { whatsapp: false, email: true },
    efecto: 'ENVIAR_EMAIL', rotulo: 'Enviar email',
  },
  {
    caso: 'ENVIAR_EMAIL a una clienta sin email (o sin email configurado) no lo promete',
    r: rec({ tipo: 'ENVIAR_REACTIVACION', accion: { tipo: 'ENVIAR_EMAIL' } }),
    canales: SIN_CANAL,
    efecto: 'MARCAR', rotulo: 'Hecho',
  },
  {
    caso: 'CONTACTO_MANUAL con socia, mensaje para ella y por dónde mandárselo se lo manda',
    r: rec({}),
    canales: { whatsapp: false, email: true },
    efecto: 'ENVIAR_MENSAJE', rotulo: 'Enviarle el mensaje',
  },
  {
    caso: 'CONTACTO_MANUAL con solo WhatsApp conectado también se lo manda',
    r: rec({ accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP' } }),
    canales: { whatsapp: true, email: false },
    efecto: 'ENVIAR_MENSAJE', rotulo: 'Enviarle el mensaje',
  },
  {
    caso: 'CONTACTO_MANUAL sin email ni WhatsApp por el que llegarle solo marca (el botón de WhatsApp va al lado)',
    r: rec({ accion: { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP' } }),
    canales: SIN_CANAL,
    efecto: 'MARCAR', rotulo: 'Hecho',
  },
  {
    caso: 'CONTACTO_MANUAL sin socia solo marca',
    r: rec({ socioId: null }),
    efecto: 'MARCAR', rotulo: 'Hecho',
  },
  {
    caso: 'CONTACTO_MANUAL de un tipo sin mensaje para la socia solo marca',
    r: rec({ tipo: 'RIESGO_RESERVA_FALLIDA' }),
    efecto: 'MARCAR', rotulo: 'Hecho',
  },
  {
    caso: 'CONTACTO_MANUAL sin el nombre de la socia (no hay mensaje que escribirle) solo marca',
    r: rec({ datosUsados: {} }),
    efecto: 'MARCAR', rotulo: 'Hecho',
  },
  {
    caso: 'MARCAR_GESTIONADO solo marca',
    r: rec({ tipo: 'FUSIONAR_SESIONES', accion: { tipo: 'MARCAR_GESTIONADO' }, socioId: null, datosUsados: {} }),
    efecto: 'MARCAR', rotulo: 'Hecho',
  },
];

for (const { caso, r, canales, efecto, rotulo } of CASOS) {
  test(`efectoAlAprobar: ${caso} → ${efecto} / «${rotulo}»`, () => {
    assert.equal(efectoAlAprobar(r, canales), efecto);
    assert.equal(ROTULO_EFECTO[efectoAlAprobar(r, canales)], rotulo);
  });
}

test('sin canales conocidos (una respuesta sin `efecto`) se da por hecho que hay por dónde: el servidor lo recalcula al aprobar', () => {
  assert.equal(efectoAlAprobar(rec({})), 'ENVIAR_MENSAJE');
  assert.equal(efectoAlAprobar(rec({ tipo: 'ENVIAR_REACTIVACION', accion: { tipo: 'ENVIAR_EMAIL' } })), 'ENVIAR_EMAIL');
});

test('«Hecho» solo existe donde aprobar no hace nada fuera del panel', () => {
  for (const e of ['COBRAR', 'ENVIAR_EMAIL', 'ENVIAR_MENSAJE'] as const) assert.notEqual(ROTULO_EFECTO[e], 'Hecho');
  assert.equal(ROTULO_EFECTO.MARCAR, 'Hecho');
});

test('«Ya la he contactado» solo donde aprobar le escribiría a la socia, nunca en un cobro', () => {
  assert.equal(admiteYaContactada('ENVIAR_MENSAJE'), true);
  assert.equal(admiteYaContactada('ENVIAR_EMAIL'), true);
  assert.equal(admiteYaContactada('COBRAR'), false);
  assert.equal(admiteYaContactada('MARCAR'), false);
});

test('efectoDe: usa el efecto que trae la API y, si no viene o no es uno conocido, lo calcula igual', () => {
  const cobro = rec({ tipo: 'RECUPERAR_PAGOS', accion: { tipo: 'COBRAR_RECIBOS' } });
  assert.equal(efectoDe({ ...cobro, efecto: 'COBRAR' }), 'COBRAR');
  assert.equal(efectoDe(cobro), 'COBRAR');
  assert.equal(efectoDe({ ...cobro, efecto: 'ALGO_RARO' }), 'COBRAR');
  assert.equal(efectoDe({ ...rec({ socioId: null }), efecto: undefined }), 'MARCAR');
  // El servidor dice MARCAR porque no hay por dónde escribirle: manda eso.
  assert.equal(efectoDe({ ...rec({}), efecto: 'MARCAR' }), 'MARCAR');
});

// ─── Canales: lo mismo que mira el ejecutor antes de enviar ──────────────────
test('canalesSocia: WhatsApp solo en un contacto de canal WhatsApp, con teléfono y el WhatsApp del estudio conectado', () => {
  const socia = { email: null, telefono: '+34600000000' };
  const wa = { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP' };
  assert.equal(canalesSocia({ accion: wa, socia, whatsappConectado: true, emailConfigurado: true }).whatsapp, true);
  assert.equal(canalesSocia({ accion: wa, socia, whatsappConectado: false, emailConfigurado: true }).whatsapp, false);
  assert.equal(canalesSocia({ accion: wa, socia: { email: null, telefono: null }, whatsappConectado: true, emailConfigurado: true }).whatsapp, false);
  assert.equal(canalesSocia({ accion: { tipo: 'CONTACTO_MANUAL', canal: 'LLAMADA' }, socia, whatsappConectado: true, emailConfigurado: true }).whatsapp, false);
  assert.equal(canalesSocia({ accion: { tipo: 'ENVIAR_EMAIL' }, socia, whatsappConectado: true, emailConfigurado: true }).whatsapp, false);
});

test('canalesSocia: email con su email y el envío configurado; sin ficha, ningún canal', () => {
  const accion = { tipo: 'CONTACTO_MANUAL', canal: 'WHATSAPP' };
  assert.equal(canalesSocia({ accion, socia: { email: 'a@example.com', telefono: null }, whatsappConectado: false, emailConfigurado: true }).email, true);
  assert.equal(canalesSocia({ accion, socia: { email: 'a@example.com', telefono: null }, whatsappConectado: false, emailConfigurado: false }).email, false);
  assert.equal(puedeEscribirle(canalesSocia({ accion, socia: null, whatsappConectado: true, emailConfigurado: true })), false);
});

test('emailConfigurado: sin clave o con el marcador de ejemplo, no', () => {
  assert.equal(emailConfigurado(undefined), false);
  assert.equal(emailConfigurado(''), false);
  assert.equal(emailConfigurado('re_XXXXXXXX'), false);
  assert.equal(emailConfigurado('re_clave_de_verdad'), true);
});

// ─── Qué recibos cobra «Cobrar ahora» ────────────────────────────────────────
test('mismosRecibos: los que vio la propietaria contra los de ahora, como conjunto', () => {
  assert.equal(mismosRecibos(['a', 'b'], ['b', 'a']), true);
  assert.equal(mismosRecibos(['a', 'b'], ['a', 'b', 'c', 'd', 'e']), false, 'el análisis añadió recibos: no se cobran a ciegas');
  assert.equal(mismosRecibos(['a', 'b', 'c'], ['a', 'b']), false);
  assert.equal(mismosRecibos(undefined, ['a']), false, 'sin decir qué vio, no se cobra');
  assert.equal(mismosRecibos(['a', 1], ['a']), false);
  assert.equal(mismosRecibos('a', ['a']), false);
});

// ─── Lo que /aprobar comprueba antes de aprobar (sus 409) ────────────────────
const COBRO_5 = rec({ tipo: 'RECUPERAR_PAGOS', socioId: null, datosUsados: { n: 5, total: 150 }, accion: { tipo: 'COBRAR_RECIBOS', reciboIds: ['a', 'b', 'c', 'd', 'e'] } });

test('aprobar un cobro con OTROS recibos que los de ahora: 409, aunque el efecto coincida', () => {
  // La tarjeta enseñaba 2 pagos; el análisis refrescó la misma fila con 5.
  assert.deepEqual(comprobarAprobacion(COBRO_5, { efecto: 'COBRAR', reciboIds: ['a', 'b'] }), { ok: false, error: RECIBOS_CAMBIADOS });
  // Sin decir qué recibos vio, tampoco.
  assert.deepEqual(comprobarAprobacion(COBRO_5, { efecto: 'COBRAR' }), { ok: false, error: RECIBOS_CAMBIADOS });
  // Los mismos, en otro orden: adelante, y al ejecutor van esos.
  assert.deepEqual(comprobarAprobacion(COBRO_5, { efecto: 'COBRAR', reciboIds: ['e', 'd', 'c', 'b', 'a'] }),
    { ok: true, efecto: 'COBRAR', reciboIds: ['a', 'b', 'c', 'd', 'e'] });
});

test('aprobar con un botón que ya no dice lo que hace: 409', () => {
  // La pestaña del «Hecho» de antes, sobre un cobro.
  assert.deepEqual(comprobarAprobacion(COBRO_5, { efecto: 'MARCAR' }), { ok: false, error: PANTALLA_DESACTUALIZADA });
  assert.deepEqual(comprobarAprobacion(COBRO_5, null), { ok: false, error: PANTALLA_DESACTUALIZADA });
  // «Enviarle el mensaje» cuando la socia ya no tiene por dónde recibirlo.
  assert.deepEqual(comprobarAprobacion(rec({}), { efecto: 'ENVIAR_MENSAJE' }, SIN_CANAL), { ok: false, error: PANTALLA_DESACTUALIZADA });
  assert.deepEqual(comprobarAprobacion(rec({}), { efecto: 'MARCAR' }, SIN_CANAL), { ok: true, efecto: 'MARCAR', reciboIds: null });
  assert.deepEqual(comprobarAprobacion(rec({}), { efecto: 'ENVIAR_MENSAJE' }, { whatsapp: false, email: true }),
    { ok: true, efecto: 'ENVIAR_MENSAJE', reciboIds: null });
});

test('recibosACobrar: solo los de la recomendación que además aprobó; sin lista aprobada, los de la recomendación', () => {
  assert.deepEqual(recibosACobrar(['a', 'b', 'c'], ['a', 'c', 'z']), ['a', 'c']);
  assert.deepEqual(recibosACobrar(['a', 'b'], undefined), ['a', 'b']);
  assert.deepEqual(recibosACobrar(['a', 'b'], []), []);
  assert.deepEqual(recibosDeLaAccion({ tipo: 'COBRAR_RECIBOS', reciboIds: ['a', 2, 'b'] }), ['a', 'b']);
  assert.deepEqual(recibosDeLaAccion({ tipo: 'MARCAR_GESTIONADO' }), []);
});

test('recibosAprobadosFuera: lo que aprobó y ya no está en la recomendación no se cobra, pero tampoco desaparece', () => {
  // Aprobó a, c y z; un análisis refrescó la fila y z ya no está.
  assert.deepEqual(recibosAprobadosFuera(['a', 'b', 'c'], ['a', 'c', 'z']), ['z']);
  assert.deepEqual(recibosAprobadosFuera(['a'], ['z', 'z', 7]), ['z'], 'sin repetir, y solo ids');
  // Sin lista aprobada (el piloto, un evento de antes) no hay nada que contar.
  assert.deepEqual(recibosAprobadosFuera(['a'], undefined), []);
  // Entre los dos se reparte TODO lo aprobado.
  const deLaRec = ['a', 'b', 'c'];
  const aprobados = ['c', 'd', 'a'];
  assert.deepEqual([...recibosACobrar(deLaRec, aprobados), ...recibosAprobadosFuera(deLaRec, aprobados)].sort(), [...aprobados].sort());
  // Y en el desglose son de «ya no estaba pendiente», no un cobro ni un rechazo.
  const fuera: IntentoCobro = { ok: false, errorCode: 'NO_PENDIENTE', error: 'Ya no estaba en la recomendación' };
  const r = resumirCobro([fuera, { ok: true, status: 'succeeded', importe: 30 }]);
  assert.equal(r.recibos, 2);
  assert.equal(r.yaNoPendientes, 1);
  assert.equal(detalleCobro(r), 'Cobrados 1 de 2 recibos: 30 €. Uno ya no estaba pendiente al ir a cobrarlo.');
});

// ─── Lo que va donde los botones cuando ya no está pendiente ────────────────
test('trasDecidir: botones mientras esté PENDIENTE', () => {
  assert.equal(trasDecidir('COBRAR', 'PENDIENTE'), null);
  assert.equal(trasDecidir('COBRAR', undefined), null);
  assert.equal(sigueAbierta('PENDIENTE'), true);
  assert.equal(sigueAbierta(null), true);
  assert.equal(sigueAbierta('APROBADA'), false);
});

test('trasDecidir: un cobro aprobado dice que está en marcha hasta saber cómo terminó, sin prometer nada en Cobros', () => {
  assert.deepEqual(trasDecidir('COBRAR', 'APROBADA'), { tipo: 'COBRO_EN_MARCHA', texto: TEXTO_COBRO_EN_MARCHA });
  assert.deepEqual(trasDecidir('COBRAR', 'APROBADA', { tardando: true }), { tipo: 'COBRO_TARDANDO', texto: TEXTO_COBRO_TARDANDO });
  // «lo verás en Cobros» era falso con un rechazo: un rechazo no deja nada en Cobros.
  for (const t of [TEXTO_COBRO_EN_MARCHA, TEXTO_COBRO_TARDANDO]) assert.doesNotMatch(t, /Cobros/);
});

/** Lo que el ejecutor guarda de un cobro con estos intentos, y en qué estado la deja. */
const cerradoCon = (estado: 'EJECUTADA' | 'FALLIDA', intentos: IntentoCobro[]) => {
  const cobro = resumirCobro(intentos);
  return trasDecidir('COBRAR', estado, { resultado: { detalle: detalleCobro(cobro), cobro } });
};

test('trasDecidir: un cobro cerrado dice lo que pasó de verdad, cobrado o no', () => {
  // Cobrado: lo que entró, y que se ve en Cobros.
  assert.deepEqual(cerradoCon('EJECUTADA', [{ ok: true, status: 'succeeded', importe: 89 }]),
    { tipo: 'COBRO_TERMINADO', texto: 'Cobrado: 89 €.', enlaceACobros: true });

  // Rechazado: un fallo, en rojo, con el motivo — y SIN «Lo ves en Cobros»: un rechazo no deja nada allí.
  const fallida = cerradoCon('FALLIDA', [{ ok: false, errorCode: 'SIN_TARJETA', error: 'La socia no tiene método de pago guardado' }]);
  assert.deepEqual(fallida, { tipo: 'FALLIDA', texto: 'No se ha podido cobrar. La socia no tiene método de pago guardado.' });
  assert.equal(TONO_TRAS_DECIDIR[fallida!.tipo], 'fallo');

  // Ya pagado por otra vía entre el análisis y el clic: ni «cobrado» ni «no se pudo», y sí se ve en Cobros.
  assert.deepEqual(cerradoCon('EJECUTADA', [{ ok: false, errorCode: 'NO_PENDIENTE', error: 'Este recibo ya no está pendiente' }]),
    { tipo: 'COBRO_TERMINADO', texto: 'Ya no estaba pendiente al ir a cobrarlo.', enlaceACobros: true });
});

test('trasDecidir: cobrado en Stripe sin quedar cobrado el recibo — a revisar, ni éxito ni fallo, y sin mandarla a Cobros', () => {
  const sinPersistir: IntentoCobro = {
    ok: true, status: 'succeeded', importe: 89, aviso: 'COBRADO_SIN_PERSISTIR',
    error: 'El cobro se completó en Stripe pero no se pudo marcar el recibo como COBRADO. Revísalo manualmente.',
  };
  const t = cerradoCon('FALLIDA', [sinPersistir]);
  assert.deepEqual(t, { tipo: 'A_REVISAR', texto: 'Cobrado en Stripe (89 €), pero el recibo no ha quedado cobrado: revísalo antes de volver a cobrarlo.' });
  assert.equal(TONO_TRAS_DECIDIR[t!.tipo], 'aviso');
  // Aunque otro recibo entrara bien: tampoco se lee como un cobro limpio.
  const mezcla = cerradoCon('FALLIDA', [{ ok: true, status: 'succeeded', importe: 30 }, sinPersistir]);
  assert.equal(mezcla?.tipo, 'A_REVISAR');
  assert.equal(mezcla?.enlaceACobros, undefined);
});

test('trasDecidir: un cobro sin confirmar dice «Sin confirmar todavía», sin el rojo de un fallo ni enlace a Cobros', () => {
  const t = cerradoCon('FALLIDA', [{
    ok: false, status: 'processing', errorCode: 'ERROR_TRANSITORIO',
    error: 'El banco aún está procesando el cargo. No lo cobres de otra forma: se confirmará solo.',
  }]);
  assert.deepEqual(t, {
    tipo: 'SIN_CONFIRMAR',
    texto: 'Sin confirmar todavía: el banco aún está procesando el cargo. No lo cobres de otra forma: se confirmará solo.',
  });
  assert.notEqual(TONO_TRAS_DECIDIR[t!.tipo], 'fallo');
  assert.doesNotMatch(t!.texto, /No se ha podido/);
});

test('trasDecidir: el ejecutor no llegó a terminar (onFailure) — a revisar, con lo que hay que mirar', () => {
  for (const efecto of ['COBRAR', 'ENVIAR_MENSAJE', 'MARCAR'] as const) {
    const detalle = detalleInterrumpida(efecto === 'COBRAR' ? 'COBRAR_RECIBOS' : 'CONTACTO_MANUAL', efecto);
    const t = trasDecidir(efecto, 'FALLIDA', { resultado: { detalle, interrumpida: true } });
    assert.deepEqual(t, { tipo: 'A_REVISAR', texto: detalle }, efecto);
  }
  // Nunca «No se ha podido cobrar»: pudo cobrar antes de interrumpirse.
  assert.doesNotMatch(trasDecidir('COBRAR', 'FALLIDA', { resultado: { detalle: detalleInterrumpida('COBRAR_RECIBOS'), interrumpida: true } })!.texto,
    /No se ha podido cobrar/);
});

test('el rojo solo es para lo que falló de verdad', () => {
  const tonos = Object.entries(TONO_TRAS_DECIDIR) as Array<[TipoTrasDecidir, string]>;
  assert.deepEqual(tonos.filter(([, t]) => t === 'fallo').map(([tipo]) => tipo), ['FALLIDA']);
  assert.equal(TONO_TRAS_DECIDIR.SIN_CONFIRMAR, 'normal');
  assert.equal(TONO_TRAS_DECIDIR.A_REVISAR, 'aviso');
});

test('trasDecidir: un cobro sin ningún recibo que cobrar no remite a Cobros', () => {
  const vacio = resumirCobro([]);
  assert.deepEqual(trasDecidir('COBRAR', 'FALLIDA', { resultado: { detalle: detalleCobro(vacio), cobro: vacio } }),
    { tipo: 'FALLIDA', texto: 'No se ha podido cobrar: no había ningún recibo que cobrar.' });
});

test('trasDecidir: cerrado sin resultado guardado (de antes de esta columna), remite a Actividad', () => {
  assert.deepEqual(trasDecidir('COBRAR', 'FALLIDA'), { tipo: 'FALLIDA', texto: 'No se ha podido cobrar: el motivo está en Actividad.' });
  assert.deepEqual(trasDecidir('COBRAR', 'EJECUTADA'), { tipo: 'YA_NO_PENDIENTE', texto: 'Ya no está pendiente: el resultado está en Actividad.' });
});

test('trasDecidir: una FALLIDA dice por qué, también si no es un cobro; el resto, «Ya no está pendiente»', () => {
  assert.deepEqual(trasDecidir('ENVIAR_MENSAJE', 'FALLIDA', { resultado: { detalle: 'No se le ha enviado nada: no tiene email.' } }),
    { tipo: 'FALLIDA', texto: 'No se ha podido completar. No se le ha enviado nada: no tiene email.' });
  assert.equal(trasDecidir('ENVIAR_MENSAJE', 'FALLIDA')?.texto, 'No se ha podido completar: el motivo está en Actividad.');
  assert.deepEqual(trasDecidir('ENVIAR_MENSAJE', 'APROBADA'), { tipo: 'YA_NO_PENDIENTE', texto: 'Ya no está pendiente.' });
  assert.deepEqual(trasDecidir('MARCAR', 'RECHAZADA'), { tipo: 'YA_NO_PENDIENTE', texto: 'Ya no está pendiente.' });
});

// ─── Atado al ejecutor: si cambia lo que hace, el rótulo tiene que cambiar ───
const EJECUTOR = sinComentarios(leer('lib/inngest/decision.ts'));
function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `falta ${firma}`);
  return src.slice(i, src.indexOf('\n}\n', i));
}

test('el ejecutor hace lo que dicen los rótulos', () => {
  assert.match(EJECUTOR, /accion\.tipo === 'ENVIAR_EMAIL'\)\s*\{\s*resultado = await step\.run\('enviar-email', \(\) => ejecutarEnvioEmail\(/);
  assert.match(EJECUTOR, /accion\.tipo === 'COBRAR_RECIBOS'\)\s*\{[\s\S]*?cobrarReciboOffSession\(/);
  assert.match(EJECUTOR, /accion\.tipo === 'CONTACTO_MANUAL'\)\s*\{\s*resultado = await step\.run\('contactar-socia', \(\) => ejecutarContactoSocia\(/);
});

test('con «Hecho» el ejecutor no manda ni cobra nada, sea cual sea la acción: va antes que cualquier otra rama', () => {
  const ejecutar = EJECUTOR.slice(EJECUTOR.indexOf("id: 'decision-ejecutar-recomendacion'"));
  const marcar = ejecutar.search(/if \(efectoAprobado === 'MARCAR'\)\s*\{\s*resultado = \{ ok: true, detalle: 'Marcada como gestionada\.' \};/);
  assert.ok(marcar >= 0, 'el ejecutor no respeta el «Hecho» del botón');
  for (const rama of ["accion.tipo === 'ENVIAR_EMAIL'", "accion.tipo === 'COBRAR_RECIBOS'", "accion.tipo === 'CONTACTO_MANUAL'"]) {
    assert.ok(marcar < ejecutar.indexOf(rama), `«Hecho» se comprueba antes que ${rama}`);
  }
  assert.match(ejecutar, /const efectoAprobado = esEfectoAprobar\(efecto\) \? efecto : null;/);
});

test('«Enviarle el mensaje»: tras haber mensaje para ella, todo «ok: true» viene de un envío; si no sale, falla', () => {
  const contacto = cuerpoDe(EJECUTOR, 'async function ejecutarContactoSocia(');
  // Sin socia o sin mensaje para ella, solo se marca: es el «Hecho» del botón.
  assert.match(contacto, /if \(!r\.socioId\) return \{ ok: true,/);
  assert.match(contacto, /const base = mensajeParaSocia\(r\.tipo, r\.datosUsados,/);
  assert.match(contacto, /if \(!base\) return \{ ok: true,/);
  // Desde la línea siguiente a la salida de «sin mensaje»: lo que pasa cuando SÍ lo hay.
  const trasBase = contacto.slice(contacto.indexOf('\n', contacto.indexOf('if (!base)')));
  assert.ok(trasBase.search(/enviarWhatsAppTexto\(|resend\.emails\.send\(/) > 0, 'sin mensaje para la socia no se manda nada: la salida va antes de cualquier envío');
  // Los canales, con el mismo criterio que el botón.
  assert.match(trasBase, /const canales = canalesSocia\(/);
  assert.match(trasBase, /if \(!puedeEscribirle\(canales\)\) \{[^}]*return \{ ok: false, detalle: `No se le ha enviado nada/);
  // Cada «ok: true» de aquí en adelante sale de un envío que ha ido bien.
  const exitos = [...trasBase.matchAll(/return \{ ok: true,[^\n]*/g)];
  assert.equal(exitos.length, 2, 'un «ok: true» nuevo tras haber mensaje: tiene que venir de un envío');
  for (const e of exitos) {
    const antes = trasBase.slice(0, e.index ?? 0);
    const deWhatsapp = /^return \{ ok: true, detalle: `WhatsApp enviado/.test(e[0]) && /if \(rw\.ok\) $/.test(antes);
    const envio = antes.lastIndexOf('resend.emails.send(');
    const deEmail = /^return \{ ok: true, detalle: `Mensaje enviado por email/.test(e[0])
      && envio >= 0 && /if \(error\) return \{ ok: false/.test(antes.slice(envio));
    assert.ok(deWhatsapp || deEmail, `«${e[0]}» no viene de un envío`);
  }
});

test('«Cobrar ahora» cobra solo los recibos aprobados y guarda lo que pasó de verdad', () => {
  assert.match(EJECUTOR, /const reciboIds = recibosACobrar\(recomendacion\.accion\.reciboIds, reciboIdsAprobados\);/);
  assert.match(EJECUTOR, /const cobro = resumirCobro\(intentos\);\s*resultado = \{ ok: cobroEjecutado\(cobro\), detalle: detalleCobro\(cobro\), cobro \};/);
  // En el mismo UPDATE que el estado, en los dos desenlaces.
  assert.match(EJECUTOR, /dbTransicionarRecomendacion\(recomendacionId, recomendacion\.studioId, 'APROBADA', hacia, \{ resueltoEn, resultado: loQuePaso \}\)/);
  assert.match(EJECUTOR, /step\.run\('marcar-ejecutada', cerrar\('EJECUTADA'\)\)/);
  assert.match(EJECUTOR, /step\.run\('marcar-fallida', cerrar\('FALLIDA'\)\)/);
});

// ─── El ejecutor no deja una recomendación APROBADA para siempre ────────────
const EJECUTAR = EJECUTOR.slice(EJECUTOR.indexOf("id: 'decision-ejecutar-recomendacion'"), EJECUTOR.indexOf("id: 'decision-medir-outcome'"));

test('un fallo de la base de datos al leerla no es «no existe»: se lanza dentro del paso y se reintenta', () => {
  assert.match(EJECUTAR, /step\.run\('fetch', async \(\) => \{\s*const r = await dbGetRecomendacion\(recomendacionId\);\s*if \(r === undefined\) throw new Error\(/);
  // La lectura distingue el error de «no hay ninguna».
  const db = sinComentarios(leer('lib/decision/db.ts'));
  assert.match(cuerpoDe(db, 'export async function dbGetRecomendacion('), /if \(error\) \{ reportError\('\[dbGetRecomendacion\]', error\); return undefined; \}/);
});

test('un fallo al leer los recibos no los da por no encontrados: se lanza, antes de cobrar nada', () => {
  const info = EJECUTAR.slice(EJECUTAR.indexOf("step.run('recibos-info'"), EJECUTAR.indexOf('for (const info of recibosInfo)'));
  assert.match(info, /const \{ data, error \} = await requireSupabaseAdmin\(\)\.from\('recibos'\)/);
  assert.match(info, /if \(error\) throw new Error\(/);
});

test('cerrarla: un fallo de la base de datos se lanza dentro del paso (no es «ya no estaba»)', () => {
  assert.match(EJECUTAR, /const cerrar = \(hacia: 'EJECUTADA' \| 'FALLIDA'\) => async \(\) => \{\s*const t = await dbTransicionarRecomendacion\([^;]*;\s*if \(!t\.ok && !t\.noEstaba\) throw new Error\(/);
  // Y un cierre que no es ni hecho ni «ya no estaba» tampoco sigue en silencio.
  assert.match(EJECUTAR, /\} else if \(!trans\.noEstaba\) \{\s*throw new Error\(/);
});

test('agotados los reintentos, onFailure la pasa de APROBADA a FALLIDA diciendo qué revisar, con su línea en Actividad', () => {
  assert.match(EJECUTAR, /onFailure: async \(\{ event \}\) => \{ await cerrarEjecucionInterrumpida\(event\); \}/);
  const f = cuerpoDe(EJECUTOR, 'async function cerrarEjecucionInterrumpida(');
  // El evento original va en `data.event` (FailureEventPayload); se lee también `data` a secas.
  assert.match(f, /e\?\.data\?\.event\?\.data \?\? e\?\.data/);
  // Solo una APROBADA, y con un compare-and-set: si ya se cerró, no se toca.
  assert.match(f, /if \(!r \|\| r\.estado !== 'APROBADA'\) return;/);
  assert.match(f, /dbTransicionarRecomendacion\(recomendacionId, r\.studioId, 'APROBADA', 'FALLIDA', \{\s*resueltoEn: [^,]+, resultado: loQuePaso,\s*\}\)/);
  assert.match(f, /const loQuePaso: ResultadoEjecucion = \{ detalle: detalleInterrumpida\(r\.accion\.tipo, efecto\), interrumpida: true \};/);
  // Sin poder leerla o cerrarla, se lanza: Inngest reintenta el onFailure.
  assert.match(f, /if \(r === undefined\) throw new Error\(/);
  assert.match(f, /if \(t\.noEstaba\) return;[^\n]*\n\s*throw new Error\(/);
  assert.match(f, /dbLogActividadReciente\(\{/);
});

test('una ejecución por recomendación a la vez', () => {
  assert.match(EJECUTAR, /concurrency: \{ key: 'event\.data\.recomendacionId', limit: 1 \}/);
});

test('lo aprobado que ya no está en la recomendación entra en el desglose como «ya no estaba pendiente»', () => {
  assert.match(EJECUTAR, /const intentos: IntentoCobro\[\] = recibosAprobadosFuera\(recomendacion\.accion\.reciboIds, reciboIdsAprobados\)\s*\.map\(\(\) => \(\{ ok: false, errorCode: 'NO_PENDIENTE', error: FUERA_DE_LA_RECOMENDACION \}\)\);/);
});

test('si ya no estaba APROBADA al cerrarla y se movió dinero, lo cobrado deja su línea en Actividad y avisa a Sentry', () => {
  const rama = EJECUTAR.slice(EJECUTAR.indexOf('} else if (resultado.cobro && pudoMoverDinero(resultado.cobro)) {'));
  assert.ok(rama.length > 0, 'falta la rama del cobro que ya no estaba APROBADA');
  const paso = rama.slice(0, rama.indexOf('return resultado;'));
  assert.match(paso, /await step\.run\('cobro-sin-cerrar', async \(\) => \{\s*await dbLogActividadReciente\(\{[^}]*texto: textoAct/);
  assert.match(paso, /Sentry\.captureMessage\(/);
});

// ─── Un solo dueño del botón principal ───────────────────────────────────────
test('el veredicto y las filas pintan la misma botonera, y es ella la que lee el efecto', () => {
  const botonera = leer('components/decision/acciones-recomendacion.tsx');
  assert.match(botonera, /from '@\/lib\/decision\/efecto-aprobar'/);
  assert.match(botonera, /ROTULO_EFECTO\[efecto\]/);
  assert.match(botonera, /trasDecidir\(efecto, recomendacion\.estado, \{ resultado: recomendacion\.resultado, tardando \}\)/);
  for (const f of ['components/decision/veredicto-del-dia.tsx', 'components/decision/fila-situacion.tsx']) {
    const src = sinComentarios(leer(f));
    assert.match(src, /<AccionesRecomendacion\b/, `${f}: sin la botonera común`);
    // Ni un rótulo propio del botón principal: ni el «Hecho» genérico ni el
    // `botonPrincipal()` que solo sabía de dos tipos.
    assert.doesNotMatch(src, /botonPrincipal|Cobrar ahora|Enviar email|>\s*Hecho\s*</, `${f}: rótulo del botón principal fuera de efecto-aprobar`);
  }
});

test('GET /api/decisiones expone el efecto de cada recomendación que pinta, con los canales de ahora', () => {
  const src = sinComentarios(leer('app/api/decisiones/route.ts'));
  assert.match(src, /const canales = await canalesDeSocias\(sesion\.studioId,/);
  assert.match(src, /efecto: efectoAlAprobar\(r, canales\(r\)\)/);
  assert.match(src, /prioridades: prioridades\.map\(conEfecto\)/);
  assert.match(src, /masSituaciones: masSituaciones\.map\(conEfecto\)/);
  assert.match(src, /recomendacion: recomendacionGanadora \? conEfecto\(recomendacionGanadora\) : null/);
});

test('«Ya la he contactado» marca en el servidor sin ejecutar nada: sesión, rol, plan y estudio', () => {
  const src = sinComentarios(leer('app/api/decisiones/[id]/gestionada/route.ts'));
  assert.match(src, /verificarSesionStaff\(req\)/);
  assert.match(src, /sesion\.rol !== 'PROPIETARIO'/);
  // El plan, con la misma puerta que el resto de rutas del Centro de Control (plan-decisiones.test.ts).
  assert.match(src, /const sinPlan = await bloqueoPorPlan\(sesion\.studioId\);\s*if \(sinPlan\) return sinPlan;/);
  assert.match(src, /recomendacion\.studioId !== sesion\.studioId/);
  assert.match(src, /const efecto = efectoAlAprobar\(recomendacion, canales\(recomendacion\)\);\s*if \(!admiteYaContactada\(efecto\)\)/);
  assert.match(src, /dbTransicionarRecomendacion\(id, sesion\.studioId, 'PENDIENTE', 'EJECUTADA'/);
  assert.match(src, /resueltoPor: sesion\.userId/);
  assert.match(src, /dbLogActividadReciente\(/);
  // Ni aprueba ni dispara el ejecutor: eso le mandaría el mensaje que ella ya le dio.
  assert.doesNotMatch(src, /DECISION_APPROVED|'APROBADA'/);
  // EJECUTADA cuenta como seguida para el Umbral (`dbCalcularSeguimientoPorTipo`).
  assert.match(leer('lib/decision/db.ts'), /const SEGUIDAS = new Set\(\['APROBADA', 'EJECUTADA'\]\)/);
});

test('aprobar: si el envío dio error pero el ejecutor ya la cerró, no se dice que no se puso en marcha (200 y la pantalla pregunta)', () => {
  const src = sinComentarios(leer('app/api/decisiones/[id]/aprobar/route.ts'));
  const captura = src.slice(src.indexOf('} catch (e) {'));
  assert.match(captura, /const vuelta = await dbTransicionarRecomendacion\(id, sesion\.studioId, 'APROBADA', 'PENDIENTE',/);
  assert.match(captura, /if \(!vuelta\.ok && vuelta\.noEstaba\) return NextResponse\.json\(\{ estado: 'APROBADA' \}\);/);
  assert.ok(captura.indexOf('vuelta.noEstaba') < captura.indexOf('status: 503'), 'el 200 va antes del 503');
});

test('aprobar solo ejecuta lo que el botón dijo —y en un cobro, los recibos que enseñó—, y no deja «aprobado» algo que nadie va a ejecutar', () => {
  const src = sinComentarios(leer('app/api/decisiones/[id]/aprobar/route.ts'));
  const transicion = src.indexOf("'PENDIENTE', 'APROBADA'");
  // Lo que la pantalla enseñó tiene que ser lo que el ejecutor va a hacer —y en
  // un cobro, los mismos recibos—, y se comprueba ANTES de aprobar, con los
  // canales de ahora: una pestaña con el «Hecho» de antes no cobra.
  const comprobacion = src.search(/const comprobacion = comprobarAprobacion\(recomendacion, cuerpo, canales\(recomendacion\)\);\s*if \(!comprobacion\.ok\) return NextResponse\.json\(\{ error: comprobacion\.error \}, \{ status: 409 \}\);/);
  assert.ok(comprobacion >= 0, 'aprobar no compara lo que vio la propietaria (409)');
  assert.ok(comprobacion < transicion, 'se comprueba antes de aprobar');
  assert.ok(src.indexOf('canalesDeSocias(sesion.studioId, [recomendacion])') < comprobacion);
  // El ejecutor recibe lo comprobado, no lo que haya en la fila cuando le toque.
  assert.match(src, /try \{\s*await inngest\.send\(\{\s*name: EVENTS\.DECISION_APPROVED,\s*data: \{ recomendacionId: id, efecto, \.\.\.\(reciboIds \? \{ reciboIds \} : \{\}\) \},/);
  assert.match(src, /dbTransicionarRecomendacion\(id, sesion\.studioId, 'APROBADA', 'PENDIENTE', \{ resueltoPor: null, resueltoEn: null \}\)/);
  // Y la pantalla lo manda.
  assert.match(leer('components/decision/use-decisiones.ts'),
    /accion === 'aprobar'\s*\? \{ efecto, \.\.\.\(efecto === 'COBRAR' \? \{ reciboIds: recibosDeLaAccion\(rec\.accion\) \} : \{\}\) \}/);
});

test('la pantalla pregunta cómo terminó un cobro con una ruta acotada a su estudio', () => {
  const ruta = sinComentarios(leer('app/api/decisiones/[id]/estado/route.ts'));
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(ruta, /dbGetEstadoRecomendacion\(id, sesion\.studioId\)/);
  const db = leer('lib/decision/db.ts');
  assert.match(db, /\.from\('recomendaciones'\)\.select\('estado, resultado'\)\.eq\('id', id\)\.eq\('studio_id', studioId\)/);
});
