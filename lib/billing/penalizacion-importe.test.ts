import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horasDeCobroTardio, importeDelContrato, penalizacionTardiaQueSeCobraria } from './penalizacion-importe.ts';
import { consentimientoCubrePenalizacion } from './penalizacion-consentimiento.ts';
import { avisoPenalizacionTardia } from '../student/clase-fija-vista.ts';
import { instanteEnEstudio } from '../utils.ts';

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

test('con términos propios del estudio el guardia no cobra nunca, y la app no avisa', () => {
  assert.equal(penalizacionTardiaQueSeCobraria({ aplicaTardia: true, importeEstudio: 8, importeTipoSesion: null, terminosPropios: true }), null);
  assert.equal(penalizacionTardiaQueSeCobraria({ aplicaTardia: true, importeEstudio: 8, importeTipoSesion: null, terminosPropios: false }), 8);
  const texto = 'contrato';
  const guardia = consentimientoCubrePenalizacion({
    studio: { terminosServicio: 'Mis términos', penalizacionImporteEur: 8, cancelacionVentanaHoras: 12 },
    penalizacion: { tipo: 'NO_SHOW', importe: 8, detectadaEn: null },
    sesion: null, textoAceptado: texto, textoActual: texto,
  });
  assert.deepEqual(guardia, { ok: false, motivo: 'terminos_propios' });
});

test('la ventana en la que se cobra es la menor entre la de la detección y la del contrato', () => {
  assert.equal(horasDeCobroTardio({ ventanaTipoSesion: null, ventanaEstudio: 12 }), 12);
  assert.equal(horasDeCobroTardio({ ventanaTipoSesion: 24, ventanaEstudio: 12 }), 12, 'el tipo detecta a 24 h, el contrato solo cobra a 12');
  assert.equal(horasDeCobroTardio({ ventanaTipoSesion: 6, ventanaEstudio: 12 }), 6, 'el tipo detecta a 6 h: antes no hay nada que cobrar');
  assert.equal(horasDeCobroTardio({ ventanaTipoSesion: 0, ventanaEstudio: 12 }), null, 'un 0 en el tipo: sin ventana no se detecta');
  assert.equal(horasDeCobroTardio({ ventanaTipoSesion: null, ventanaEstudio: null }), null);
});

// Cruce con el guardia real en CANCELACION_TARDIA: para cada combinación de ventanas y
// horas antes del inicio, la app avisa exactamente cuando se detecta Y el guardia cobra.
test('lo que avisa la app por la ventana es exactamente lo que el guardia deja cobrar', () => {
  const texto = 'contrato';
  const inicio = Date.parse('2026-10-12T10:00:00Z');
  for (const ventanaEstudio of [6, 12, 24]) {
    for (const ventanaTipo of [null, 6, 12, 24]) {
      for (const horasAntes of [1, 5, 6, 7, 11, 12, 13, 18, 23, 24, 25]) {
        const deteccion = ventanaTipo ?? ventanaEstudio;
        const detectada = horasAntes <= deteccion;
        const horas = horasDeCobroTardio({ ventanaTipoSesion: ventanaTipo, ventanaEstudio });
        const avisa = horas !== null && horasAntes <= horas;
        if (!detectada) { assert.equal(avisa, false, `estudio ${ventanaEstudio}, tipo ${ventanaTipo}, ${horasAntes} h: no se detecta`); continue; }
        const guardia = consentimientoCubrePenalizacion({
          studio: { terminosServicio: null, penalizacionImporteEur: 8, cancelacionVentanaHoras: ventanaEstudio },
          penalizacion: { tipo: 'CANCELACION_TARDIA', importe: 8, detectadaEn: new Date(inicio - horasAntes * 36e5).toISOString() },
          sesion: { inicio: new Date(inicio).toISOString() }, textoAceptado: texto, textoActual: texto,
        });
        assert.equal(avisa, guardia.ok, `estudio ${ventanaEstudio}, tipo ${ventanaTipo}, ${horasAntes} h antes`);
      }
    }
  }
});

// El cruce de verdad: lo que PINTA la app (`avisoPenalizacionTardia`, la misma que usan los
// dos diálogos) frente a la detección del SQL (`coalesce(tipo, estudio) > 0` y
// `now() >= inicio - ventana`) más el guardia de cobro real, con instantes UTC y con el
// móvil en varias zonas: la fecha y la hora de la clase son las del ESTUDIO.
// Límite conocido, fuera de esto: el payload manda la ventana del estudio con `?? 12`, así
// que una columna a NULL (0 estudios hoy; ningún formulario la deja así) avisaría de más.
test('lo que pinta la app es exactamente detección + guardia, en cualquier zona del móvil', () => {
  const eur = (n: number) => `${n} €`;
  const fecha = '2026-10-12', hora = '10:00';
  const inicio = Date.parse(instanteEnEstudio(fecha, hora)!);
  const texto = 'contrato';
  const tzOriginal = process.env.TZ;
  try {
    for (const tz of ['Europe/Madrid', 'Atlantic/Canary', 'America/New_York', 'Europe/Athens']) {
      process.env.TZ = tz;
      for (const ventanaEstudio of [null, 0, 6, 12, 24]) {
        for (const ventanaTipo of [null, 0, 6, 12, 24]) {
          for (const minutosAntes of [30, 330, 360, 361, 690, 720, 721, 1080, 1440, 1441, 1500]) {
            const ahora = new Date(inicio - minutosAntes * 60_000);
            const ventana = ventanaTipo ?? ventanaEstudio ?? 0;
            const detecta = ventana > 0 && ahora.getTime() >= inicio - ventana * 36e5;
            const clase = {
              fecha, hora,
              penalizacionTardiaEur: penalizacionTardiaQueSeCobraria({ aplicaTardia: true, importeEstudio: 8, importeTipoSesion: null }),
              penalizacionTardiaHoras: horasDeCobroTardio({ ventanaTipoSesion: ventanaTipo, ventanaEstudio }),
            };
            const avisa = avisoPenalizacionTardia(clase, ahora, eur) !== null;
            const cobra = detecta && consentimientoCubrePenalizacion({
              studio: { terminosServicio: null, penalizacionImporteEur: 8, cancelacionVentanaHoras: ventanaEstudio },
              penalizacion: { tipo: 'CANCELACION_TARDIA', importe: 8, detectadaEn: ahora.toISOString() },
              sesion: { inicio: new Date(inicio).toISOString() }, textoAceptado: texto, textoActual: texto,
            }).ok;
            assert.equal(avisa, cobra, `${tz}, estudio ${ventanaEstudio}, tipo ${ventanaTipo}, ${minutosAntes} min antes`);
          }
        }
      }
    }
  } finally {
    if (tzOriginal === undefined) delete process.env.TZ; else process.env.TZ = tzOriginal;
  }
});
