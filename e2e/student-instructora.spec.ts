import { test, expect } from '@playwright/test';
import { SESION_ID, SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La ficha de la instructora desde la hoja de clase. Antes la píldora con su
// nombre era un botón sin acción.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · instructora', () => {
  test('la píldora abre su ficha: bio, próximas clases, y un tap lleva a la clase', async ({ page }) => {
    await sembrarSociaLista(page);
    const f = fixtureSociaLista();
    (f.instructores[0] as unknown as Record<string, unknown>).bio = 'Reformer y suelo pélvico. Diez años enseñando.';
    (f.instructores[0] as unknown as Record<string, unknown>).valoracion = { media: 4.75, total: 23 };
    f.sesiones.push({ ...f.sesiones[0], id: 'ses-12', inicio: '2026-08-13T10:00:00', fin: '2026-08-13T10:50:00' });
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));

    await page.goto(`${base}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /Ana/ }).first().click({ timeout: 30_000 });
    const hoja = page.getByTestId('instructora-sheet');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText('Diez años enseñando', { exact: false })).toBeVisible();
    await expect(hoja.getByText('4,8 · 23 valoraciones')).toBeVisible();
    // Sus clases de hoy en adelante: la de hoy (10:00) y la de mañana.
    await expect(hoja.getByRole('link')).toHaveCount(2);
    await hoja.getByRole('link').last().click();
    await expect(page).toHaveURL(/\/reservar\/ses-12$/);
  });

  test('sin bio ni nota publicable, la ficha no inventa nada', async ({ page }) => {
    await sembrarSociaLista(page);
    const f = fixtureSociaLista();
    (f.instructores[0] as unknown as Record<string, unknown>).valoracion = { media: 5, total: 2 };
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /Ana/ }).first().click({ timeout: 30_000 });
    const hoja = page.getByTestId('instructora-sheet');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText('★')).toHaveCount(0);
    await expect(hoja.getByText('Instructora del estudio')).toBeVisible();
    void STUDIO_ID;
  });
});
