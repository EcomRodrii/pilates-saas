import { test, expect, type Locator } from '@playwright/test';
import { SLUG, sembrarSociaCompleta } from './socia-completa';

// «Privacidad y datos» de la alumna.
//
// Dos cosas que comprobar. Una, que las acciones RGPD ya no están a un toque en
// el Perfil: se llega por una sola fila. Dos, que pedir la eliminación exige
// escribir la frase, y que sin ella NO SALE NINGUNA PETICIÓN — con contador,
// porque «no mintió» también es verdad de un botón que no intentó nada.

const base = `/portal/${SLUG}`;
const ETIQUETA = 'Escribe «Solicitar la eliminación de mis datos» para confirmar';
const FRASE_SIN_TILDE = 'Solicitar la eliminacion de mis datos';

const arriba = async (l: Locator) => (await l.boundingBox())?.y ?? Number.NaN;

test.describe('Student PWA · privacidad y datos', () => {
  test.describe.configure({ timeout: 120_000 });

  test('el Perfil solo tiene una fila; dentro, descargar va primero', async ({ page }) => {
    // Con consentimiento de salud: es el caso en que antes el Perfil pintaba
    // también ese bloque.
    const and = await sembrarSociaCompleta(page, { saludConsentida: true });
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });

    const fila = page.getByRole('link', { name: 'Privacidad y datos' });
    await expect(fila).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /descargar mis datos/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /retirar consentimiento/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /eliminación de mis datos/i })).toHaveCount(0);

    await fila.click();
    await expect(page).toHaveURL(new RegExp(`${base}/perfil/privacidad$`));

    const descargar = page.getByRole('button', { name: 'Descargar mis datos', exact: true });
    const retirar = page.getByRole('button', { name: 'Retirar consentimiento de salud', exact: true });
    const eliminar = page.getByRole('button', { name: 'Solicitar la eliminación de mis datos', exact: true });
    await expect(descargar).toBeVisible({ timeout: 30_000 });
    await expect(retirar).toBeVisible({ timeout: 30_000 });
    await expect(eliminar).toBeVisible();

    expect(await arriba(descargar)).toBeLessThan(await arriba(retirar));
    expect(await arriba(retirar)).toBeLessThan(await arriba(eliminar));
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });

  test('pedir la eliminación exige la frase: sin ella no sale ningún POST', async ({ page }) => {
    const and = await sembrarSociaCompleta(page);
    const posts: Array<Record<string, unknown>> = [];
    // Registrada DESPUÉS del andamiaje, así que gana; el GET sigue al suyo.
    await page.route((u) => u.pathname === '/api/public/solicitud-derechos', (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      posts.push(r.request().postDataJSON() as Record<string, unknown>);
      return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ solicitud: null, yaExistia: false }) });
    });

    await page.goto(`${base}/perfil/privacidad`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Solicitar la eliminación de mis datos', exact: true }).click({ timeout: 30_000 });

    const hoja = page.getByRole('dialog', { name: '¿Pedir que eliminen tus datos?' });
    await expect(hoja).toBeVisible();
    // El texto honesto sigue ahí: plazo y lo que NO se borra.
    await expect(hoja.getByText(/máximo de 30 días/)).toBeVisible();
    await expect(hoja.getByText(/facturas y los recibos se conservan/i)).toBeVisible();

    const campo = hoja.getByLabel(ETIQUETA);
    const enviar = hoja.getByRole('button', { name: 'Enviar solicitud' });
    await expect(campo).toBeVisible();
    await expect(enviar).toBeDisabled();

    // Una frase a medias tampoco habilita, y ni forzando el toque sale nada.
    await campo.fill('Solicitar la eliminacion');
    await expect(enviar).toBeDisabled();
    await enviar.click({ force: true });
    await page.waitForTimeout(800);
    expect(posts).toHaveLength(0);

    // Sin tilde vale.
    await campo.fill(FRASE_SIN_TILDE);
    await expect(enviar).toBeEnabled();
    await enviar.click();

    await expect.poll(() => posts.length, { timeout: 15_000 }).toBe(1);
    expect(posts[0]).toMatchObject({ slug: SLUG, tipo: 'supresion', confirmacion: FRASE_SIN_TILDE });
    await expect(page.getByText(/Solicitud enviada a/)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);
    expect(posts).toHaveLength(1);
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });
});
