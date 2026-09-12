import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exigeAceptacionExplicita } from './legal-aceptacion.ts';

// `exigeAceptacionExplicita` tiene que responder EXACTAMENTE la misma
// pregunta que ya decide si el checkout PINTA la casilla legal (campos
// crudos del estudio) -- nunca si `configLegalDe` compondría algo, porque esa
// función siempre da un documento por defecto.
function fakeAdminEstudio(fila: { politica_privacidad: string | null; terminos_servicio: string | null } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: fila, error: null }),
        }),
      }),
    }),
  } as never;
}

test('sin ningún texto propio, no se exige aceptación', async () => {
  const r = await exigeAceptacionExplicita(
    fakeAdminEstudio({ politica_privacidad: null, terminos_servicio: null }), 'studio-1',
  );
  assert.equal(r, false);
});

test('con política de privacidad propia, se exige aceptación', async () => {
  const r = await exigeAceptacionExplicita(
    fakeAdminEstudio({ politica_privacidad: 'Mi política.', terminos_servicio: null }), 'studio-1',
  );
  assert.equal(r, true);
});

test('con términos de servicio propios, se exige aceptación', async () => {
  const r = await exigeAceptacionExplicita(
    fakeAdminEstudio({ politica_privacidad: null, terminos_servicio: 'Mis términos.' }), 'studio-1',
  );
  assert.equal(r, true);
});

test('estudio inexistente -- fail-safe, no exige (no tumba un cobro por un dato que falta)', async () => {
  const r = await exigeAceptacionExplicita(fakeAdminEstudio(null), 'studio-fantasma');
  assert.equal(r, false);
});
