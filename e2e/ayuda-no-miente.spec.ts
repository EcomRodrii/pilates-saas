import { test, expect } from '@playwright/test';
import { FAQS } from '@/lib/faqs';

// ─────────────────────────────────────────────────────────────────────────────
// La ayuda del panel decía que el portal de clientas no pedía contraseña.
//
// «Con su email, desde /portal/tu-estudio/login. No necesita contraseña.»
//
// Y sí la pide. La dueña leía la ayuda, se lo repetía a sus clientas, y las
// mandaba a una pantalla que les pedía justo lo que le habían dicho que no
// existía. El coste no lo paga ella: lo paga en llamadas de clientas que no
// pueden entrar.
//
// Este test ata las dos pantallas. Al rediseñar el portal (v2) volvió a saltar,
// y con razón: el enlace que la ayuda nombraba a la clienta —«¿Primera vez o
// olvidaste tu contraseña?»— había pasado a llamarse otra cosa. Exactamente el
// fallo para el que se escribió.
//
// Así que ya no se comprueba una frase suelta, sino las dos cosas que de verdad
// tienen que ser ciertas: que la pantalla pide contraseña, y que el control que
// la ayuda le manda buscar EXISTE con ese nombre.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';

/** El nombre del control que la ayuda le dice a la clienta que busque. */
const CONTROL_PRIMER_ACCESO = 'Nunca he creado una — mándame un enlace';

test('el portal pide contraseña y la ayuda nombra un control que existe', async ({ page }) => {
  // El paso 2 de la puerta, que es donde se pide la contraseña y donde está
  // el control que la ayuda nombra. Se llega con el email en la URL porque sin
  // él no hay paso 2 (se vuelve al paso 1).
  await page.goto(`/portal/${SLUG}/login?email=quien.sea%40ejemplo.com`);

  // 1. La verdad sobre el terreno: hay un campo de contraseña de verdad.
  const clave = page.getByPlaceholder(/contraseña/i);
  await expect(clave).toBeVisible({ timeout: 30_000 });
  await expect(clave).toHaveAttribute('type', 'password');

  // 2. Lo que la ayuda del panel le cuenta a la dueña. Se lee del módulo de
  //    datos en vez de abrir el panel (que exige sesión): lo que se protege
  //    aquí es el texto, y así el test no depende de la UI del widget.
  const respuesta = FAQS.find(f => f.pregunta.includes('primera vez'))?.respuesta ?? '';
  expect(respuesta, 'la respuesta sobre el primer acceso tiene que existir').not.toBe('');
  expect(respuesta).not.toMatch(/no necesita contraseña|sin contraseña/i);
  expect(respuesta).toMatch(/contraseña/i);

  // 3. Y el puente entre las dos: el control que la ayuda nombra está en la
  //    pantalla, escrito igual. Si alguien renombra el botón sin tocar la
  //    ayuda —o al revés—, esto salta.
  expect(respuesta).toContain(CONTROL_PRIMER_ACCESO);
  await expect(page.getByRole('link', { name: CONTROL_PRIMER_ACCESO })).toBeVisible();
});
