import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatsappDelEstudio } from './whatsapp-estudio.ts';

const CONECTADO = { activo: true, config: { token: 'EAAx', phoneId: '109' } };

test('sin fila, apagada o a medias no hay envío posible', () => {
  assert.equal(whatsappDelEstudio(null), null);
  assert.equal(whatsappDelEstudio(undefined), null);
  assert.equal(whatsappDelEstudio({ activo: false, config: { token: 'EAAx', phoneId: '109' } }), null);
  // Credenciales a medias: devolver el phoneId sin token solo serviría para
  // llevarse un 401 de Meta más adelante, con el envío ya dado por intentado.
  assert.equal(whatsappDelEstudio({ activo: true, config: { token: 'EAAx' } }), null);
  assert.equal(whatsappDelEstudio({ activo: true, config: { phoneId: '109' } }), null);
  assert.equal(whatsappDelEstudio({ activo: true, config: null }), null);
});

test('conectado sin ninguna casilla marcada: credenciales sí, plantillas no', () => {
  const w = whatsappDelEstudio(CONECTADO);
  assert.deepEqual(w, {
    token: 'EAAx', phoneId: '109',
    plantillaRecordatorio: false, plantillaHueco: false, plantillaSustitucion: false,
  });
});

test('cada plantilla es independiente de las demás', () => {
  // Este es el motivo de que haya tres interruptores y no uno: un estudio puede
  // tener aprobada una y no las otras, y dar por aprobada la que no lo está
  // devuelve 132001 en TODOS los envíos de ese emisor, no en algunos.
  const soloHueco = whatsappDelEstudio({ activo: true, config: { ...CONECTADO.config, plantillaHuecoAprobada: 'true' } });
  assert.equal(soloHueco?.plantillaHueco, true);
  assert.equal(soloHueco?.plantillaRecordatorio, false);
  assert.equal(soloHueco?.plantillaSustitucion, false);

  const soloSustitucion = whatsappDelEstudio({ activo: true, config: { ...CONECTADO.config, plantillaSustitucionAprobada: 'true' } });
  assert.equal(soloSustitucion?.plantillaSustitucion, true);
  assert.equal(soloSustitucion?.plantillaHueco, false);
});

test("la casilla es el STRING 'true': cualquier otro valor es NO aprobada", () => {
  // El checkbox guarda 'true'/'false' como texto en el jsonb. Un `!!config.x`
  // daría por aprobada una plantilla con el valor 'false' — y entonces TODOS
  // los envíos de ese emisor fallarían con 132001.
  for (const valor of ['false', '', 'TRUE', '1', 'sí']) {
    const w = whatsappDelEstudio({ activo: true, config: { ...CONECTADO.config, plantillaAprobada: valor } });
    assert.equal(w?.plantillaRecordatorio, false, `'${valor}' no debe contar como aprobada`);
  }
  const ok = whatsappDelEstudio({ activo: true, config: { ...CONECTADO.config, plantillaAprobada: 'true' } });
  assert.equal(ok?.plantillaRecordatorio, true);
});
