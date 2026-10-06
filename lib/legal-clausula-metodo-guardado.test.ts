import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hashTextoLegal } from './legal-hash.ts';
import {
  clausulaCobrosConMetodoGuardado, configLegalDe, configLegalDeFila, datosLegalesDeFila, terminosServicioPorDefecto,
  textoLegalCompleto, textoLegalVigenteDeFila,
} from './legal-textos.ts';

// Cobros con el método de pago guardado (6-oct-2026): decisión del fundador, va en los
// TÉRMINOS y no a la vista en la app. Condicional, como la de penalización: solo en los
// estudios que cobran online (cuenta de Stripe conectada).

const FILA = {
  nombre: 'Pilates Boutique', razon_social: 'Pilates Boutique SL', nif: 'B12345678',
  direccion: 'Calle Larios 1', ciudad: 'Málaga', codigo_postal: '29005', email: 'hola@ejemplo.es',
  cancelacion_ventana_horas: 24, penalizacion_importe_eur: null, politica_privacidad: null, terminos_servicio: null,
};

test('sale en los estudios que cobran online, y dice lo que de verdad pasa', () => {
  const t = terminosServicioPorDefecto({ nombre: 'X', stripeAccountId: 'acct_1' });
  assert.match(t, /autoriza al Estudio a cobrar en él sus cuotas y renovaciones y los importes que tenga pendientes/);
  assert.match(t, /Puede quitar la tarjeta en cualquier momento desde la app o pedírselo al Estudio/);
  assert.match(t, /Si ha elegido para sus cuotas la domiciliación bancaria a través de la pasarela de pago, se cobrarán por domiciliación/);
  // Sin decir por dónde la guardó (también vale el enlace que manda el panel), y sin prometer que la tarjeta no se
  // usa con la remesa del banco: con una tarjeta guardada, el cron arma el cobro y la remesa lo deja fuera.
  assert.doesNotMatch(t, /en la app o al pagar|solo se usará/);
  // En «Planes y tarifas», no suelta en otro sitio.
  assert.ok(t.indexOf('autoriza al Estudio') > t.indexOf('2. PLANES Y TARIFAS') && t.indexOf('autoriza al Estudio') < t.indexOf('3. RESERVAS'));
});

test('no sale en los que no cobran online (sin cuenta, null o vacía)', () => {
  for (const sin of [{}, { stripeAccountId: null }, { stripeAccountId: '' }, { stripeAccountId: '   ' }]) {
    assert.equal(clausulaCobrosConMetodoGuardado(sin), '');
    assert.doesNotMatch(terminosServicioPorDefecto({ nombre: 'X', ...sin }), /autoriza al Estudio a cobrar/);
  }
});

test('la fila la lee de `stripe_account_id`', () => {
  assert.equal(datosLegalesDeFila({ ...FILA, stripe_account_id: 'acct_1' }).stripeAccountId, 'acct_1');
  assert.equal(datosLegalesDeFila(FILA).stripeAccountId, null);
});

test('⚠️ el texto que se ENSEÑA (panel y portal, desde el estudio en camelCase) es el que se SELLA (desde la fila)', () => {
  for (const cuenta of ['acct_1', null]) {
    const fila = { ...FILA, stripe_account_id: cuenta };
    const sellado = textoLegalVigenteDeFila(fila);
    // `studioPublico` compone con `configLegalDeFila`; el portal y el panel, con `configLegalDe` sobre el estudio.
    const portal = textoLegalCompleto(configLegalDeFila(fila));
    const estudio = {
      nombre: FILA.nombre, razonSocial: FILA.razon_social, nif: FILA.nif, direccion: FILA.direccion, ciudad: FILA.ciudad,
      codigoPostal: FILA.codigo_postal, email: FILA.email, cancelacionVentanaHoras: 24, penalizacionImporteEur: null,
      stripeAccountId: cuenta,
    };
    const panel = textoLegalCompleto(configLegalDe(estudio, { politicaPrivacidad: null, terminosServicio: null }));
    assert.equal(hashTextoLegal(portal), hashTextoLegal(sellado), `portal ≠ sello (${cuenta})`);
    assert.equal(hashTextoLegal(panel), hashTextoLegal(sellado), `panel ≠ sello (${cuenta})`);
  }
});

test('unos términos reescritos por el estudio no se tocan', () => {
  const propio = 'Mis condiciones.';
  assert.equal(configLegalDe({ stripeAccountId: 'acct_1' }, { terminosServicio: propio }).terminosServicio, propio);
});

test('todo SELECT que compone el texto desde la fila trae `stripe_account_id`', () => {
  const raiz = join(import.meta.dirname, '..');
  for (const f of ['lib/legal-sellado.ts', 'app/api/penalizaciones/aprobar/route.ts', 'lib/inngest/penalizaciones.ts']) {
    const s = readFileSync(join(raiz, f), 'utf8');
    assert.ok(s.includes('textoLegalVigenteDeFila('), f);
    assert.ok(s.includes('stripe_account_id'), `${f}: sin la columna, el sello no llevaría la cláusula que se enseña`);
  }
  // El payload público la lleva (el portal compone con ella).
  const admin = readFileSync(join(raiz, 'lib/db/supabase-data-admin.ts'), 'utf8');
  const ini = admin.indexOf('function studioPublico(');
  const cuerpo = admin.slice(ini, admin.indexOf('\n}\n', ini));
  assert.match(cuerpo, /configLegalDeFila\(r\b/);
  assert.match(cuerpo, /stripeAccountId: r\.stripe_account_id \?\? null/);
});
