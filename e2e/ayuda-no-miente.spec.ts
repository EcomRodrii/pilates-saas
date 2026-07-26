import { test, expect } from '@playwright/test';
import { FAQS } from '@/lib/faqs';

// ─────────────────────────────────────────────────────────────────────────────
// La ayuda del panel decía que el portal de clientas no pedía contraseña.
//
// «Con su email, desde /portal/tu-estudio/login. No necesita contraseña.»
//
// Y sí la pide: esa pantalla dice literalmente "Entra con tu email y contraseña".
// La dueña leía la ayuda, se lo repetía a sus clientas, y las mandaba a una
// pantalla que les pedía justo lo que le habían dicho que no existía. El coste
// no lo paga ella: lo paga en llamadas de clientas que no pueden entrar.
//
// Este test ata las dos pantallas: lo que la ayuda promete y lo que el portal
// hace de verdad. Si una cambia sin la otra, salta.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';

test('el portal de clientas pide contraseña, y la ayuda ya no dice lo contrario', async ({ page }) => {
  // 1. La verdad sobre el terreno.
  await page.goto(`/portal/${SLUG}/login`);
  await expect(page.getByText(/con tu email y contraseña/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/¿Primera vez o olvidaste tu contraseña\?/i)).toBeVisible();

  // 2. Lo que la ayuda del panel le cuenta a la dueña. Se lee del módulo de
  //    datos en vez de abrir el panel (que exige sesión): lo que se protege
  //    aquí es el texto, y así el test no depende de la UI del widget.
  const respuesta = FAQS.find(f => f.pregunta.includes('primera vez'))?.respuesta ?? '';

  expect(respuesta, 'la respuesta sobre el primer acceso tiene que existir').not.toBe('');
  expect(respuesta).not.toMatch(/no necesita contraseña|sin contraseña/i);
  expect(respuesta).toMatch(/contraseña/i);
});
