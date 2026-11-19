import { test, expect } from '@playwright/test';
import { sembrarSociaLista } from './socia-lista';

// «Reservar o cancelar por WhatsApp» en Ayuda de la app de la alumna: un enlace al chat del
// estudio con el mensaje escrito, para quien no quiere usar la app. El teléfono del estudio en
// el entorno de pruebas (`studio-seo`, E2E_TEST: lo resuelve el servidor, no el mock) es un móvil, así que el enlace tiene que estar.
// Que NO salga con un fijo lo cubre `lib/student/whatsapp-estudio.test.ts` (es lógica pura).

test('Ayuda enseña «Reservar o cancelar por WhatsApp» con el chat del estudio', async ({ page }) => {
  await sembrarSociaLista(page);
  await page.goto('/portal/tentare/ayuda');
  const enlace = page.getByRole('link', { name: /Reservar o cancelar por WhatsApp/ });
  await expect(enlace).toBeVisible({ timeout: 30_000 });
  const href = await enlace.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/34600000000\?text=/);
  expect(decodeURIComponent(href!.split('text=')[1])).toBe('Hola, quería reservar o cancelar una clase.');
});
