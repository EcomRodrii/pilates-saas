import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAS_PARA_DESACTIVAR, DIAS_PARA_DESACTIVAR_AL_AGOTAR, HORAS_PARA_AVISAR, saludTrasIntento } from './salud.ts';
import { EVENTOS, PLANTILLAS, REGLAS, render } from '../../notifications/catalog.ts';
import { hrefDeTarjeta, resolverHref } from '../../configuracion/destino.ts';
import type { ResultadoEnvio } from './envio.ts';

const H = 3_600_000;
const inicio = new Date('2026-10-01T08:00:00Z');
const tras = (ms: number) => new Date(inicio.getTime() + ms);
const ok: ResultadoEnvio = { tipo: 'respuesta', estadoHttp: 200, duracionMs: 5 };
const cae: ResultadoEnvio = { tipo: 'respuesta', estadoHttp: 503, duracionMs: 5 };
const gone: ResultadoEnvio = { tipo: 'respuesta', estadoHttp: 410, duracionMs: 5 };
const sano = { fallandoDesde: null, avisoFallandoEn: null };
const fallando = (desde: Date, avisado: Date | null = null) => ({ fallandoDesde: desde.toISOString(), avisoFallandoEn: avisado?.toISOString() ?? null });

test('un fallo suelto no avisa a nadie: empieza la racha y ya', () => {
  const s = saludTrasIntento(sano, cae, 'ninguno', inicio);
  assert.deepEqual(s, { fallandoDesde: inicio.toISOString(), avisoFallandoEn: null, desactivar: null, aviso: null });
  // Y si se arregla antes de avisar, tampoco hay «vuelve a funcionar».
  assert.equal(saludTrasIntento(fallando(inicio), ok, 'ninguno', tras(2 * H)).aviso, null);
});

test(`a las ${HORAS_PARA_AVISAR} h sin entregar se avisa, una sola vez por racha`, () => {
  assert.equal(saludTrasIntento(fallando(inicio), cae, 'ninguno', tras(HORAS_PARA_AVISAR * H - 60_000)).aviso, null);
  const s = saludTrasIntento(fallando(inicio), cae, 'ninguno', tras(HORAS_PARA_AVISAR * H));
  assert.equal(s.aviso, 'fallando');
  assert.equal(s.avisoFallandoEn, tras(HORAS_PARA_AVISAR * H).toISOString());
  assert.equal(s.fallandoDesde, inicio.toISOString(), 'la racha no se reinicia al avisar');
  assert.equal(saludTrasIntento(fallando(inicio, tras(HORAS_PARA_AVISAR * H)), cae, 'ninguno', tras(20 * H)).aviso, null);
});

test('si vuelve a entregar después de avisar, se le dice que ya funciona', () => {
  const s = saludTrasIntento(fallando(inicio, tras(12 * H)), ok, 'ninguno', tras(30 * H));
  assert.deepEqual(s, { fallandoDesde: null, avisoFallandoEn: null, desactivar: null, aviso: 'recuperado' });
});

test(`a los ${DIAS_PARA_DESACTIVAR} días sin entregar se desactiva y se avisa`, () => {
  const s = saludTrasIntento(fallando(inicio, tras(12 * H)), cae, 'ninguno', tras(DIAS_PARA_DESACTIVAR * 24 * H));
  assert.equal(s.desactivar, 'fallos');
  assert.equal(s.aviso, 'desactivado');
});

test('con poco movimiento: si una entrega agota sus reintentos y lleva días sin entregar, se desactiva ya', () => {
  // Sin esto, un estudio sin entregas nuevas nunca llegaría a la comprobación de los 3 días.
  const agotada = saludTrasIntento(fallando(inicio, tras(12 * H)), cae, 'agotado', tras(DIAS_PARA_DESACTIVAR_AL_AGOTAR * 24 * H + H));
  assert.equal(agotada.desactivar, 'fallos');
  // Pero una entrega agotada en un webhook que entregó hace poco no lo apaga.
  assert.equal(saludTrasIntento(fallando(tras(60 * H)), cae, 'agotado', tras(70 * H)).desactivar, null);
});

test('410: el destino dice que ya no existe → desactivado al momento, con aviso', () => {
  const s = saludTrasIntento(sano, gone, 'desactivar_destino_retirado', inicio);
  assert.equal(s.desactivar, 'destino_retirado');
  assert.equal(s.aviso, 'desactivado');
});

test('los tres avisos van a la propietaria, al cajón de la API, y el de desactivado no se puede apagar', () => {
  for (const ev of [EVENTOS.WEBHOOK_FALLANDO, EVENTOS.WEBHOOK_DESACTIVADO, EVENTOS.WEBHOOK_RECUPERADO]) {
    assert.equal(REGLAS[ev].audiencia, 'propietaria', ev);
    const p = PLANTILLAS[`${ev}#PROPIETARIO`];
    assert.ok(p, `${ev} sin texto para la propietaria`);
    const enlace = p.deepLink({} as never);
    assert.equal(enlace, hrefDeTarjeta('api-publica'));
    assert.deepEqual(resolverHref(enlace), { tab: 'conexiones', ancla: 'api-publica' }, `${enlace} no abre el cajón de la API`);
  }
  assert.equal(REGLAS[EVENTOS.WEBHOOK_DESACTIVADO].priority, 'CRITICA');
  assert.ok(REGLAS[EVENTOS.WEBHOOK_DESACTIVADO].canales.includes('EMAIL'));
});

test('los textos se pintan enteros con los datos que manda el emisor', () => {
  const datos = { nombre: 'Contabilidad', desde: 'miércoles, 1 de octubre a las 10:00', error: 'Respondió 503.', motivo: 'llevaba días sin poder entregar ningún aviso' };
  for (const ev of [EVENTOS.WEBHOOK_FALLANDO, EVENTOS.WEBHOOK_DESACTIVADO, EVENTOS.WEBHOOK_RECUPERADO]) {
    const p = PLANTILLAS[`${ev}#PROPIETARIO`];
    for (const texto of [render(p.title, datos), render(p.body, datos)]) {
      assert.doesNotMatch(texto, /\{\w+\}|undefined|null/, `${ev}: ${texto}`);
    }
  }
});
