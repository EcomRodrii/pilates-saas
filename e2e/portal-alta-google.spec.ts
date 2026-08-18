import { test, expect } from '@playwright/test';
import { SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El alta al volver de Google.
//
// Decisión de producto explícita: quien entra con Google y todavía no es socia
// de ese estudio SE DA DE ALTA SOLA.
//
// ⚠️ Lo que se prueba aquí es la CERRADURA, que es lo que no puede fallar: la
// identidad sale del JWT verificado, nunca del body. Sin eso, un endpoint que
// crea socias sería una vía para dar de alta a nombre de cualquiera.
//
// El viaje completo (ida a Google y vuelta) no se puede ejercitar sin una
// cuenta real de Google, así que eso hay que mirarlo en un estudio de pruebas
// antes de fiarse — misma limitación que el resto de lo que depende de un
// tercero.
// ─────────────────────────────────────────────────────────────────────────────

test('sin sesión verificada NO se puede dar de alta a nadie', async ({ request }) => {
  const r = await request.post('/api/public/alta-google', {
    data: { slug: SLUG, nombre: 'Quien Sea' },
  });
  expect(r.status()).toBe(401);
});

test('con un token inventado tampoco', async ({ request }) => {
  const r = await request.post('/api/public/alta-google', {
    headers: { Authorization: 'Bearer no-soy-un-token' },
    data: { slug: SLUG },
  });
  expect(r.status()).toBe(401);
});

test('sin estudio no hace nada', async ({ request }) => {
  const r = await request.post('/api/public/alta-google', { data: {} });
  expect(r.status()).toBe(400);
});
