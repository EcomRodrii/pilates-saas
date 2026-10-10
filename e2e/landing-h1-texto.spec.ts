import { test, expect } from '@playwright/test';

// El HTML crudo de la home trae la landing entera: un <h1> que empieza por
// texto (sin marcado delante) y habla de Pilates. Se mira la respuesta del
// servidor, no el DOM hidratado, que es lo que leen Google y los lectores de
// pantalla. No clava el titular exacto: el copy lo escribe quien lo escribe.
test('la home trae su <h1> con texto en el HTML del servidor', async ({ page }) => {
  const res = await page.request.get('/');
  const html = await res.text();
  expect(html.toLowerCase()).toContain('pilates');
  expect(html).toMatch(/<h1[^>]*>[^<]*\S/);
});
