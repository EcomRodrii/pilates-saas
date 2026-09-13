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
    // ⚠️ `force` se salta la espera de «estable»: sin esto el toque sale con la
    // hoja aún subiendo (medido: desplazada 352 px justo tras `toBeVisible`) y
    // Playwright falla con «outside of the viewport» antes de probar nada.
    await expect(enviar).toBeInViewport({ ratio: 1 });
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

  test('mientras llega el consentimiento no se mueve nada bajo el dedo', async ({ page }) => {
    // Los enlaces de «Otras solicitudes» se pintaban al momento y bajaban
    // ~190 px cuando llegaba el bloque de salud: «Retirar consentimiento» caía
    // justo donde estaba «Limitar u oponerme», así que un toque durante la
    // carga acababa en otra acción.
    const and = await sembrarSociaCompleta(page, { saludConsentida: true });
    let servido = false;
    await page.route((u) => u.pathname === '/api/public/consentimiento-salud', async (r) => {
      await new Promise((ok) => setTimeout(ok, 2_500));
      servido = true;
      return r.fallback();
    });

    await page.goto(`${base}/perfil/privacidad`, { waitUntil: 'domcontentloaded' });
    const eliminar = page.getByRole('button', { name: 'Solicitar la eliminación de mis datos', exact: true });
    await expect(eliminar).toBeVisible({ timeout: 30_000 });
    const antes = await arriba(eliminar);

    await expect(page.getByRole('button', { name: 'Retirar consentimiento de salud', exact: true })).toBeVisible({ timeout: 30_000 });
    expect(servido, 'la respuesta retrasada tiene que haberse servido').toBe(true);
    expect(await arriba(eliminar), 'el enlace se movió al llegar el bloque de salud').toBe(antes);
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });

  test('la fecha dice cuándo autorizó, y las hojas no repiten título ni salida', async ({ page }) => {
    const and = await sembrarSociaCompleta(page, { saludConsentida: true });
    await page.route((u) => u.pathname === '/api/public/solicitud-derechos', (r) => r.request().method() === 'GET'
      ? r.fulfill({ json: { excluirDePerfilado: false, solicitudes: [{
        id: 's1', socioId: 'socio-e2e', tipo: 'supresion', estado: 'pendiente',
        solicitadaEn: '2026-09-10T10:00:00Z', plazoHasta: '2026-10-10T10:00:00Z', resueltaEn: null, nota: null,
      }] } })
      : r.fallback());
    await page.goto(`${base}/perfil/privacidad`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Retirar consentimiento de salud', exact: true })).toBeVisible({ timeout: 30_000 });

    // «…para adaptar tus clases el 1 de agosto de 2026» se leía como la fecha
    // de las clases, no la de la autorización.
    await expect.soft(page.getByText(/^El 1 de agosto de 2026 autorizaste a /)).toBeVisible();

    // «¿Qué quieres pedir?» llevaba debajo un segundo título, «Elige una opción».
    await page.getByRole('button', { name: 'Limitar u oponerme al uso de mis datos', exact: true }).click();
    const elegir = page.getByRole('dialog', { name: 'Limitar u oponerme al uso de mis datos' });
    await expect(elegir.getByRole('heading', { name: '¿Qué quieres pedir?' })).toBeVisible();
    await expect.soft(elegir.getByText('Elige una opción', { exact: true })).toHaveCount(0);
    await elegir.getByRole('button', { name: 'Volver', exact: true }).click();
    // ⚠️ No `toBeHidden()`: la hoja del kit cerrada no se oculta, se desplaza
    // fuera de la pantalla y sigue «visible» para Playwright.
    await expect(elegir).not.toBeInViewport();

    // En curso solo hay algo que hacer: enterarse. «Entendido» y «Volver» eran
    // dos botones que hacían lo mismo.
    await page.getByRole('button', { name: /^Solicitar la eliminación de mis datos · En curso$/ }).click();
    const enCurso = page.getByRole('dialog', { name: 'Tu solicitud está en curso' });
    await expect(enCurso.getByRole('button', { name: 'Entendido', exact: true })).toBeVisible();
    await expect.soft(enCurso.getByRole('button', { name: 'Volver', exact: true })).toHaveCount(0);
    expect([...new Set(and.sinMockear())], 'andamiaje incompleto').toEqual([]);
  });
});
