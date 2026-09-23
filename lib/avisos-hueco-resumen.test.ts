// El recuento de «Rellenar hueco». Lo que se protege aquí es una sola regla:
// toda socia que sale de la lista se cuenta con su motivo. Este repo ya se
// equivocó anunciando éxito con el servidor diciendo que no, y esta frase es
// justo donde eso se nota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenAvisoHueco } from './avisos-hueco-resumen.ts';

test('resumenAvisoHueco: dice por qué canal salió cada aviso', () => {
  assert.equal(
    resumenAvisoHueco({ enviados: 5, porWhatsapp: 3, porEmail: 2 }),
    '5 avisos enviados (3 por WhatsApp y 2 por email)',
  );
  // Singular, y sin paréntesis vacío cuando no hay desglose.
  assert.equal(resumenAvisoHueco({ enviados: 1, porWhatsapp: 1 }), '1 aviso enviado (1 por WhatsApp)');
  assert.equal(resumenAvisoHueco({ enviados: 2 }), '2 avisos enviados');
});

// ── El tope (una plaza libre admite 4 avisos) ────────────────────────────────

test('resumenAvisoHueco: con más seleccionadas que el tope, dice cuántas se quedaron fuera y cuál era', () => {
  const t = resumenAvisoHueco({ enviados: 4, porWhatsapp: 4, saltadasPorTope: 8, tope: 4 });
  assert.equal(t, '4 avisos enviados (4 por WhatsApp) · 8 sin avisar: el tope de esta clase es 4');
});

test('resumenAvisoHueco: sin `tope` no se lo inventa, pero sigue diciendo cuántas faltan', () => {
  // Un servidor viejo (o una respuesta a medias) no manda `tope`. Decir
  // «el tope es undefined» sería peor que no decirlo.
  const t = resumenAvisoHueco({ enviados: 4, saltadasPorTope: 8 });
  assert.equal(t, '4 avisos enviados · 8 sin avisar');
  assert.ok(!t.includes('undefined'));
});

// ── La excepción de la ficha ─────────────────────────────────────────────────

test('resumenAvisoHueco: la socia exenta se cuenta, y con el nombre exacto del interruptor', () => {
  // La exenta SÍ sale en la lista y se puede seleccionar (el filtro vive solo
  // en el servidor), así que sin esto la propietaria ve «0 avisos enviados»
  // tras elegir a alguien a propósito, sin ninguna causa.
  const t = resumenAvisoHueco({ enviados: 0, saltadasPorExcepcion: 1 });
  assert.equal(t, '0 avisos enviados · 1 con «No avisarle de clases con hueco» en su ficha');
});

test('resumenAvisoHueco: un cero enviados nunca se queda sin explicación', () => {
  // Es la regla entera de este módulo: si no salió nada, algo tiene que decir
  // por qué. Cualquier motivo, pero alguno.
  for (const motivo of [
    { saltadasPorExcepcion: 2 },
    { saltadasPorTope: 3, tope: 4 },
    { sinConsentimiento: 1 },
    { sinContacto: 1 },
    { saltadasPorDedup: 1 },
    { errores: 1 },
    { correoRoto: ['Ana'] },
  ]) {
    const t = resumenAvisoHueco({ enviados: 0, ...motivo });
    assert.ok(t.includes(' · '), `sin motivo para ${JSON.stringify(motivo)}: ${t}`);
  }
});

// ── Todo junto, y el orden ───────────────────────────────────────────────────

test('resumenAvisoHueco: con varios motivos los dice todos, el tope primero', () => {
  const t = resumenAvisoHueco({
    enviados: 2, porEmail: 2, saltadasPorTope: 4, tope: 2,
    sinContacto: 1, sinConsentimiento: 1, saltadasPorExcepcion: 1,
    correoRoto: ['Ana', 'Lucía'], saltadasPorDedup: 3, errores: 1,
  });
  assert.equal(t, [
    '2 avisos enviados (2 por email)',
    '4 sin avisar: el tope de esta clase es 2',
    '1 sin teléfono ni email',
    '1 sin consentimiento de marketing',
    '1 con «No avisarle de clases con hueco» en su ficha',
    'el correo de Ana, Lucía rebota — corrígelo en su ficha',
    '3 ya avisadas en las últimas 24 h',
    '1 con error',
  ].join(' · '));
});

test('resumenAvisoHueco: «ya avisada» concuerda en singular', () => {
  assert.ok(resumenAvisoHueco({ enviados: 1, saltadasPorDedup: 1 }).includes('1 ya avisada en las últimas 24 h'));
});

// ── Respuestas a medias ──────────────────────────────────────────────────────

test('resumenAvisoHueco: una respuesta vacía no rompe ni miente', () => {
  // `res.json()` devuelve `{}` ante un cuerpo que no es JSON. La pantalla
  // principal del negocio ya se cayó una vez por dar por hecha una forma.
  assert.equal(resumenAvisoHueco({}), '0 avisos enviados');
  assert.equal(resumenAvisoHueco({ enviados: undefined }), '0 avisos enviados');
});

test('resumenAvisoHueco: basura en los contadores se ignora, no se pinta', () => {
  const t = resumenAvisoHueco({
    enviados: 'tres' as unknown as number,
    saltadasPorTope: null as unknown as number,
    correoRoto: 'Ana' as unknown as string[],
    sinContacto: NaN,
  });
  assert.equal(t, '0 avisos enviados');
});
