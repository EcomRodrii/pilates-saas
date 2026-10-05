import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importeDelContrato, penalizacionTardiaQueSeCobraria } from './penalizacion-importe.ts';
import { consentimientoCubrePenalizacion } from './penalizacion-consentimiento.ts';

const cobraria = (aplicaTardia: boolean | null, importeEstudio: number | null, importeTipoSesion: number | null) =>
  penalizacionTardiaQueSeCobraria({ aplicaTardia, importeEstudio, importeTipoSesion });

// Los tres casos de la revisión: la app avisaba (o callaba) un cargo que no es el que se cobra.
test('(1) plaza sin tipo en una clase de un tipo con 10 € y estudio sin importe: el SQL lo detecta, el contrato no lo recoge → no se avisa', () => {
  assert.equal(cobraria(true, null, 10), null);
  assert.deepEqual(importeDelContrato(null, 10), { ok: false, motivo: 'estudio_sin_penalizacion' });
});

test('(2) estudio a 8 € y el tipo de ESA sesión a 0: no se detecta nada (un 0 no hereda) → no se avisa', () => {
  assert.equal(cobraria(true, 8, 0), null);
});

test('(3) estudio a 8 € con «Cobrar si cancela tarde» apagado: no se avisa', () => {
  assert.equal(cobraria(false, 8, null), null);
});

test('lo que sí se cobraría: el importe del estudio, si el de la sesión es ese (o hereda)', () => {
  assert.equal(cobraria(true, 8, null), 8, 'el tipo hereda el del estudio');
  assert.equal(cobraria(true, 8, 8), 8);
  assert.equal(cobraria(null, 8, null), 8, 'sin el dato, como la RPC: coalesce(…, true)');
  assert.equal(cobraria(true, 8, 12), null, 'el cargo propio del tipo no está en el contrato');
  assert.equal(cobraria(true, 0, null), null);
  assert.equal(cobraria(true, null, null), null);
});

// La app y el guardia de cobro, con la MISMA regla del importe: lo que la app promete
// es lo que el guardia deja pasar (en lo que depende del importe).
test('lo que avisa la app es exactamente lo que deja pasar el guardia del contrato', () => {
  const importes = [null, 0, 8, 10, 12];
  const texto = 'contrato';
  for (const estudio of importes) {
    for (const tipo of importes) {
      const detectado = tipo ?? estudio;
      const aviso = cobraria(true, estudio, tipo);
      if (detectado === null || !(detectado > 0)) {
        assert.equal(aviso, null, `estudio ${estudio}, tipo ${tipo}: sin detección no hay aviso`);
        continue;
      }
      const guardia = consentimientoCubrePenalizacion({
        studio: { terminosServicio: null, penalizacionImporteEur: estudio, cancelacionVentanaHoras: 12 },
        penalizacion: { tipo: 'NO_SHOW', importe: detectado, detectadaEn: null },
        sesion: null, textoAceptado: texto, textoActual: texto,
      });
      assert.equal(aviso !== null, guardia.ok, `estudio ${estudio}, tipo ${tipo}`);
      if (aviso !== null) assert.equal(aviso, estudio);
    }
  }
});
