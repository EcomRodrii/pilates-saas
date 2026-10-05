import { test, expect } from '@playwright/test';
import { SLUG, sembrarSociaLista, fixtureSociaLista } from './socia-lista';

// Acceso.
//
// ⚠️ ALCANCE DELIBERADO. Aquí se comprueba lo que solo se puede ver en la
// pantalla: que las vías se distinguen. La REGLA de los errores —qué texto y
// qué código sale de cada fallo de gotrue, incluido el «email sin confirmar»
// que abre la puerta a cuentas duplicadas— se prueba en
// `lib/student/auth-errores.test.ts`, donde es determinista. Los caminos
// completos (código bueno y malo, nueva y conocida, contraseña) los conduce
// `acceso-codigo-casillas.spec.ts`, contando lo que sale.
//
// Se intentó cubrir la regla conduciendo el formulario, y no encontró un solo
// defecto del producto: el clic llegaba a veces antes de que React enganchara
// el manejador y se perdía en silencio. No hay señal fiable de hidratación en
// esta pantalla (`disabled={!online}` ya viene en falso desde el servidor).

const base = `/portal/${SLUG}`;

test.describe('Student PWA · acceso', () => {
  test.describe.configure({ timeout: 120_000 });

  test('las vías se distinguen: el código del correo (entrar y darse de alta), Google y la contraseña', async ({ page }) => {
    await sembrarSociaLista(page);
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
    await page.route(/js\.stripe\.com/, (r) => r.abort());
    await page.addInitScript(() => { try { localStorage.removeItem('sb-portal-auth'); } catch { /* nada */ } });

    await page.goto(`${base}/acceso/login`, { waitUntil: 'domcontentloaded' });
    // Una sola puerta: el correo y «Seguir», que manda el código y sirve igual
    // a quien ya tiene cuenta y a quien no (antes, «Crear cuenta» y «mándame
    // un enlace» por separado).
    await expect(page.getByRole('heading', { name: /^Entra en / })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Tu correo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Seguir', exact: true })).toBeVisible();
    // Continuar con Google, que el encargo pedía y ya existía.
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    // Y la contraseña, como segunda opción.
    await expect(page.getByRole('button', { name: 'Usar mi contraseña' })).toBeVisible();
    // Nadie llega a esta pantalla con un «Hola de nuevo» la primera vez.
    await expect(page.getByText('Hola de nuevo')).toHaveCount(0);
  });
});
