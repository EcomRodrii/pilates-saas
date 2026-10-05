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

  test('«Compartir esta clase» manda la frase de la clase y ESA clase en la página pública, con quién invita', async ({ page }) => {
    await conHojaDelNavegador(page);
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    // Es un icono sobre la foto (P04): su nombre accesible es la frase que antes llevaba el botón.
    const boton = page.getByTestId('compartir-clase');
    await expect(boton).toHaveAccessibleName('Compartir esta clase', { timeout: 45_000 });
    await boton.click();

    await expect.poll(async () => (await compartidos(page)).length).toBeGreaterThan(0);
    const [d] = await compartidos(page);
    expect(d.text).toMatch(/^¿Te vienes a Reformer (hoy|mañana|el .+) a las \d{2}:\d{2}\?$/);
    const url = new URL(d.url ?? '');
    expect(url.pathname).toBe(`/reservar/${SLUG}`);
    expect(url.searchParams.get('sesion')).toBe(SESION_ID);
    expect(url.searchParams.get('invita')).toBe('socio-e2e-1');
  });

  test('«Compartir esta clase» sin hoja: copia el enlace y lo dice solo si de verdad se copió', async ({ page }) => {
    await sinHojaDelNavegador(page);
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const boton = page.getByTestId('compartir-clase');
    await expect(boton).toHaveAccessibleName('Copiar el enlace de esta clase', { timeout: 45_000 });
    await boton.click();
    await expect(page.getByText('Enlace copiado. Pégalo donde quieras.')).toBeVisible();
    const copiado = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiado).toContain(`/reservar/${SLUG}?sesion=${SESION_ID}&invita=socio-e2e-1`);
  });

  test('«Compartir esta clase» sin hoja y con el portapapeles roto: lo dice, no «copiado»', async ({ page }) => {
    await sinHojaDelNavegador(page);
    // El portapapeles rechaza la escritura (Safari sin gesto, permisos…): contador de intentos, o el test no prueba nada.
    await page.addInitScript(() => {
      const w = window as unknown as { __intentosCopia: number };
      w.__intentosCopia = 0;
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: async () => { w.__intentosCopia += 1; throw new Error('denegado'); },
      });
    });
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('compartir-clase').click({ timeout: 45_000 });
    await expect(page.getByText('No hemos podido copiarlo. Inténtalo de nuevo.')).toBeVisible();
    await expect(page.getByText(/Enlace copiado/)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __intentosCopia: number }).__intentosCopia)).toBeGreaterThan(0);
  });

  test('«Invita a una amiga a esta clase» sale con lo que gana, solo si el estudio premia invitar', async ({ page }) => {
    await conHojaDelNavegador(page);
    await sembrarSociaCompleta(page, { reglasCreditos: [{ trigger: 'REFERIDO_AMIGO', creditos: 100, topeMensual: 3 }] });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    const fila = page.getByTestId('invitar-a-clase');
    await expect(fila).toContainText('Invita a una amiga a esta clase', { timeout: 45_000 });
    await expect(fila).toContainText('ganas 100 créditos cuando venga a su primera clase · hasta 3 amigas al mes');
    await fila.click();
    await expect.poll(async () => (await compartidos(page)).length).toBeGreaterThan(0);
    const [d] = await compartidos(page);
    expect(new URL(d.url ?? '').searchParams.get('invita')).toBe('socio-e2e-1');
  });

  test('sin la regla de invitar, no hay fila de premio (y el icono de compartir sigue)', async ({ page }) => {
    await conHojaDelNavegador(page);
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('compartir-clase')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('invitar-a-clase')).toHaveCount(0);
  });
});
