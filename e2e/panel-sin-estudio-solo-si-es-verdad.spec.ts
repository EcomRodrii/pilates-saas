import { test, expect, type Route } from '@playwright/test';
import { montar } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Esta cuenta no tiene ningún estudio» solo cuando es verdad.
//
// Hasta el 15-sep-2026 el marco del panel lo decidía con un temporizador: si a
// los 6 s el estudio no había cargado, lo daba por inexistente. Probando en
// producción como propietaria, una recarga lenta de Configuración acabó en esa
// pantalla con el estudio vivo. Y como `resolveStudioId()` devolvía `null`
// también cuando la consulta FALLABA, un error decía lo mismo.
//
// Se fija aquí:
//   · la base de datos contesta «sin estudio» → su pantalla, con la salida a Network;
//   · la consulta falla → pasado el antiguo límite de 6 s NO dice que no hay
//     estudio, y acaba en «tardando en cargar» con «Volver a intentarlo».
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, body: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const SIN_ESTUDIO = 'Esta cuenta no tiene ningún estudio de Tentare.';

test('una cuenta sin estudio lo ve dicho, con la salida a su perfil de Network', async ({ page }) => {
  await montar(page);
  await page.route('**/rest/v1/rpc/current_studio_id', r => json(r, null));

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});

  await expect(page.getByText(SIN_ESTUDIO)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Ir a mi perfil de Network' })).toHaveAttribute('href', '/network/mi-perfil');
  await expect(page.getByText('Tu estudio está tardando en cargar.')).toHaveCount(0);
});

test('si no se puede preguntar por el estudio, no dice que no hay: dice que tarda', async ({ page }) => {
  test.setTimeout(90_000);
  await montar(page);
  let preguntas = 0;
  await page.route('**/rest/v1/rpc/current_studio_id', r => {
    preguntas++;
    return json(r, { code: 'XX000', message: 'fallo de prueba', details: null, hint: null }, 500);
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});

  // Sin esto el test pasaría también si el panel nunca hubiera preguntado.
  await expect.poll(() => preguntas, { timeout: 30_000 }).toBeGreaterThan(0);
  // Pasado el antiguo límite de 6 s: ni rastro de la frase falsa.
  await page.waitForTimeout(8_000);
  await expect(page.getByText(SIN_ESTUDIO)).toHaveCount(0);

  await expect(page.getByText('Tu estudio está tardando en cargar.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Volver a intentarlo' })).toBeVisible();
  await expect(page.getByText(SIN_ESTUDIO)).toHaveCount(0);
});
