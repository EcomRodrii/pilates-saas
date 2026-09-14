import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El NIF de una clienta se guarda por el SERVIDOR (PUT /api/socios/[id]/nif),
// nunca en la tabla con la sesión del navegador: `authenticated` ya no tiene
// UPDATE sobre esa columna (migr 20260914190000).
//
//   · camino feliz: el NIF va a la ruta y el PATCH de la tabla ya no lo lleva;
//   · camino de fallo: si la ruta dice que no, la ficha no lo da por guardado,
//     el diálogo sigue abierto y no se escribe el resto a medias.
//
// ⚠️ Cada «no se hizo» va con su contador de «sí se intentó»: sin él, «no mintió»
// sería verdad también si la pantalla no hubiera llamado a nada.
// La RLS y los grants son la cerradura real; esto comprueba la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const NIF = '12345678Z';

async function espiarSocios(page: Page) {
  const parches: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/socios**', async (r) => {
    if (r.request().method() === 'PATCH') {
      parches.push(JSON.parse(r.request().postData() ?? '{}'));
      return r.fulfill({ status: 204, body: '' });
    }
    return r.fallback();
  });
  return parches;
}

async function editarNif(page: Page, telefono: string) {
  await ir(page, 'clientas/soc-1');
  await page.getByRole('button', { name: 'Editar clienta' }).click({ timeout: 30_000 });
  const dialogo = page.getByRole('dialog', { name: 'Editar clienta' });
  await dialogo.getByLabel('Teléfono').fill(telefono);
  await dialogo.getByLabel('NIF (opcional)').fill(NIF);
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();
  return dialogo;
}

test('la propietaria cambia el NIF de una clienta y viaja al servidor, no a la tabla', async ({ page }) => {
  await montar(page);
  const parches = await espiarSocios(page);
  const envios: { metodo: string; nif: unknown }[] = [];
  await page.route((u) => u.pathname === '/api/socios/soc-1/nif', (r) => {
    const cuerpo = JSON.parse(r.request().postData() ?? '{}') as { nif?: unknown };
    envios.push({ metodo: r.request().method(), nif: cuerpo.nif });
    return r.fulfill({ json: { ok: true, nif: cuerpo.nif } });
  });

  const dialogo = await editarNif(page, '600999000');

  await expect(page.getByText('Clienta actualizada')).toBeVisible({ timeout: 30_000 });
  await expect(dialogo).toBeHidden();
  expect(envios).toEqual([{ metodo: 'PUT', nif: NIF }]);
  expect(parches.length).toBeGreaterThan(0);
  expect(parches.some((p) => p.telefono === '600999000')).toBe(true);
  for (const p of parches) expect(p).not.toHaveProperty('nif');
});

test('si el servidor rechaza el NIF, la ficha no lo da por guardado ni escribe el resto a medias', async ({ page }) => {
  await montar(page);
  const parches = await espiarSocios(page);
  let intentos = 0;
  await page.route((u) => u.pathname === '/api/socios/soc-1/nif', (r) => {
    intentos++;
    return r.fulfill({ status: 403, json: { error: 'Solo la propietaria o recepción pueden cambiar el NIF de una clienta.' } });
  });

  const dialogo = await editarNif(page, '600999111');

  await expect(page.getByText('Solo la propietaria o recepción pueden cambiar el NIF de una clienta.')).toBeVisible({ timeout: 30_000 });
  expect(intentos).toBeGreaterThan(0);
  await expect(dialogo).toBeVisible();
  await expect(page.getByText('Clienta actualizada')).toHaveCount(0);
  expect(parches).toEqual([]);
});
