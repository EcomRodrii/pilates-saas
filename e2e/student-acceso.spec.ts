import { test, expect } from '@playwright/test';
import { SLUG, sembrarSociaLista, fixtureSociaLista } from './socia-lista';

// Acceso.
//
// ⚠️ ALCANCE DELIBERADO. Aquí se comprueba lo que solo se puede ver en la
// pantalla: que las tres vías se distinguen. La REGLA de los errores —qué
// texto y qué código sale de cada fallo de gotrue, incluido el «email sin
// confirmar» que abre la puerta a cuentas duplicadas— se prueba en
// `lib/student/auth-errores.test.ts`, donde es determinista.
//
// Se intentó cubrirla conduciendo el formulario, y no encontró un solo defecto
// del producto: el clic llegaba a veces antes de que React enganchara el
// manejador y se perdía en silencio, fallando en casos DISTINTOS cada vuelta.
// No hay señal fiable de hidratación en esta pantalla (`disabled={!online}` ya
// viene en falso desde el servidor) y reintentar el envío dispara intentos de
// login de más. Probar la regla donde es pura cubre lo mismo sin la carrera.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · acceso', () => {
  test.describe.configure({ timeout: 120_000 });

  test('las tres vías se distinguen: entrar, crear cuenta y Google', async ({ page }) => {
    await sembrarSociaLista(page);
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
    await page.route(/js\.stripe\.com/, (r) => r.abort());
    await page.addInitScript(() => { try { localStorage.removeItem('sb-portal-auth'); } catch { /* nada */ } });

    await page.goto(`${base}/acceso/login`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 30_000 });
    // Entrar con contraseña.
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    // Continuar con Google, que el encargo pedía y ya existía.
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    // Y la salida para quien no tiene contraseña, que es la misma que resuelve
    // el email sin confirmar.
    await expect(page.getByRole('button', { name: /mándame un enlace/i })).toBeVisible();
  });
});
