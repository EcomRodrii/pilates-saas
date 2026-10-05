import { test, expect, type Page } from '@playwright/test';
import { SLUG, SESION_ID, sembrarSociaCompleta } from './socia-completa';

// Compartir con la hoja del sistema («Invita a una amiga» y «Compartir esta
// clase»). En la app de iOS va por `@capacitor/share`; en un navegador que la
// tenga, por `navigator.share`; y donde no hay hoja (casi todo escritorio) se
// copia al portapapeles, como antes, diciendo si de verdad se copió.
//
// ⚠️ Con CONTADOR: «no salió la hoja» puede ser verdad porque nadie la llamó.
// Cada test exige que la llamada (o la copia) ocurriera antes de mirar nada más.

const base = `/portal/${SLUG}`;

/** Un `navigator.share` de pega que apunta lo que le pasan. */
async function conHojaDelNavegador(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __compartido: ShareData[] };
    w.__compartido = [];
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: async (d: ShareData) => { w.__compartido.push(d); },
    });
  });
}

/** Un navegador SIN hoja de compartir, con permiso para escribir en el portapapeles. */
async function sinHojaDelNavegador(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
  });
}

const compartidos = (page: Page) => page.evaluate(() => (window as unknown as { __compartido: ShareData[] }).__compartido);

test.describe('Student PWA · compartir', () => {
  test.describe.configure({ timeout: 120_000 });

  test('«Invita a una amiga» abre la hoja del sistema con su enlace de alta', async ({ page }) => {
    await conHojaDelNavegador(page);
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('abrir-invitar').click({ timeout: 45_000 });
    const boton = page.getByTestId('compartir-invitacion');
    await expect(boton).toHaveText('Compartir la invitación');
    await boton.click();

    await expect.poll(async () => (await compartidos(page)).length).toBeGreaterThan(0);
    const [d] = await compartidos(page);
    expect(d.url).toContain(`${base}/acceso/registro`);
    expect(d.url).toContain('ref=socio-e2e-1');
    expect(d.text).toContain('Te invito a probar');
    // La frase va sin el enlace: el enlace viaja aparte y no se duplica.
    expect(d.text).not.toContain('http');
    // Compartido por la hoja: no se dice «Copiado».
    await expect(page.getByTestId('copiado')).toHaveCount(0);
  });

  test('sin hoja de compartir, se copia y se dice solo si de verdad se copió', async ({ page }) => {
    await sinHojaDelNavegador(page);
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('abrir-invitar').click({ timeout: 45_000 });
    const boton = page.getByTestId('compartir-invitacion');
    await expect(boton).toHaveText('Copiar la invitación');
    await boton.click();

    await expect(page.getByTestId('copiado')).toHaveText(/Copiado/);
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toContain('Te invito a probar');
    expect(copiado).toContain('/acceso/registro?ref=socio-e2e-1');
  });

  test('«Compartir esta clase» manda la frase de la clase y la página pública del estudio', async ({ page }) => {
    await conHojaDelNavegador(page);
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const boton = page.getByTestId('compartir-clase');
    await expect(boton).toHaveText(/Compartir esta clase/, { timeout: 45_000 });
    await boton.click();

    await expect.poll(async () => (await compartidos(page)).length).toBeGreaterThan(0);
    const [d] = await compartidos(page);
    expect(d.text).toMatch(/^¿Te vienes a Reformer (hoy|mañana|el .+) a las \d{2}:\d{2}\?$/);
    expect(new URL(d.url ?? '').pathname).toBe(`/reservar/${SLUG}`);
  });
});
