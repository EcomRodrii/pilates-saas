import { readFile } from 'node:fs/promises';
import { test, expect, type Download, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El código QR de cada enlace del estudio, para el escaparate.
//
// Quien pasa por delante no va a teclear «tentare.app/reservar/…»: lo escanea
// o no entra. En «Dirección y enlaces» cada enlace —página de reservas, app de
// las alumnas y la web del estudio— lleva «Código QR»: el cartel A4 con los
// colores que elija el estudio (PDF y PNG) y solo el código (PNG y SVG). Todo se
// genera en el navegador.
//
// Lo que se comprueba es lo que se lleva la propietaria: que el archivo se
// descarga con un nombre que se entiende y que por dentro ES lo que dice, con
// sus colores. Que el QR se lee lo cubre lib/qr/escaparate.test.ts (los módulos
// pintados son exactamente los del código y conservan su zona de silencio).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Boutique Mar', slug: 'pilates-boutique-mar',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function prepararPanel(page: Page, estudio: Record<string, unknown>) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, estudio));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion?tab=estudio&sub=enlaces');
  await expect(page.getByRole('heading', { level: 2, name: 'Dirección y enlaces' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('textbox', { name: 'Dirección de tu página de reservas' }))
    .toHaveValue('pilates-boutique-mar', { timeout: 30_000 });
}

const botonesQr = (page: Page) => page.getByRole('button', { name: 'Código QR' });

async function descargar(page: Page, boton: RegExp): Promise<{ nombre: string; bytes: Buffer }> {
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: /^Código QR/ }).getByRole('button', { name: boton }).click(),
  ]);
  return { nombre: descarga.suggestedFilename(), bytes: await leer(descarga) };
}

async function leer(descarga: Download): Promise<Buffer> {
  const ruta = await descarga.path();
  return readFile(ruta);
}

const ladoPng = (bytes: Buffer) => ({ ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) });

test.describe('Código QR para el escaparate', () => {
  test('la página de reservas: cartel con el color de la marca, en PDF y PNG, y solo el código en PNG y SVG', async ({ page, baseURL }) => {
    await prepararPanel(page, { ...STUDIO_ROW, sitio_web: 'pilatesboutiquemar.example.com' });

    // Reservas, app y web: un QR por enlace.
    await expect(botonesQr(page)).toHaveCount(3);
    await botonesQr(page).first().click();

    const dialogo = page.getByRole('dialog', { name: 'Código QR · Página de reservas' });
    await expect(dialogo).toBeVisible();
    // Se ve el cartel de verdad y a dónde lleva, antes de descargar nada.
    await expect(dialogo.getByRole('img', { name: 'Cartel con el código QR de Página de reservas' })).toBeVisible();
    const legible = `${new URL(baseURL!).host}/reservar/pilates-boutique-mar`;
    await expect(dialogo.locator('figcaption')).toHaveText(legible);
    // Arranca con el color de su marca (el tema: #6D28D9 en el mock).
    await expect(dialogo.getByRole('radiogroup', { name: 'Fondo del cartel' }).getByRole('radio', { name: 'El color de tu marca' }))
      .toHaveAttribute('aria-checked', 'true');

    const pdf = await descargar(page, /cartel.*PDF para imprimir/);
    expect(pdf.nombre).toBe('cartel-qr-reservas-pilates-boutique-mar.pdf');
    const textoPdf = pdf.bytes.toString('latin1');
    expect(textoPdf.startsWith('%PDF-1.4')).toBe(true);
    expect(textoPdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(textoPdf).toContain('(PILATES BOUTIQUE MAR)');
    expect(textoPdf).toContain('(Reserva tu clase)');
    expect(textoPdf).toContain(`(${legible})`);
    expect(textoPdf, 'el fondo es el morado de la marca').toContain('0.427 0.157 0.851 rg');

    const cartelPng = await descargar(page, /cartel.*Imagen PNG/);
    expect(cartelPng.nombre).toBe('cartel-qr-reservas-pilates-boutique-mar.png');
    expect(cartelPng.bytes.subarray(0, 8).toString('hex'), 'firma PNG').toBe('89504e470d0a1a0a');
    expect(ladoPng(cartelPng.bytes), 'A4 a 200 ppp').toEqual({ ancho: 1654, alto: 2339 });

    const codigoPng = await descargar(page, /solo el código.*PNG/);
    expect(codigoPng.nombre).toBe('qr-reservas-pilates-boutique-mar.png');
    const { ancho, alto } = ladoPng(codigoPng.bytes);
    expect(ancho).toBe(alto);
    expect(ancho, 'de sobra para imprimir o Instagram').toBeGreaterThanOrEqual(1600);

    const svg = await descargar(page, /solo el código.*SVG/);
    expect(svg.nombre).toBe('qr-reservas-pilates-boutique-mar.svg');
    expect(svg.bytes.toString('utf8')).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

    // Escape cierra el QR y deja el cajón donde estaba.
    await page.keyboard.press('Escape');
    await expect(dialogo).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Dirección y enlaces' })).toBeVisible();
  });

  test('los colores los elige el estudio, el código solo en tonos que se leen, y se recuerdan para los otros carteles', async ({ page }) => {
    await prepararPanel(page, { ...STUDIO_ROW, sitio_web: 'pilatesboutiquemar.example.com' });
    await botonesQr(page).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Código QR · Página de reservas' });

    await dialogo.getByLabel('Otro color para el fondo').fill('#0f766e');
    const pdf = await descargar(page, /cartel.*PDF para imprimir/);
    expect(pdf.bytes.toString('latin1'), 'el fondo elegido').toContain('0.059 0.463 0.431 rg');

    // Un rosa pastel no vale para el código: se dice y no se aplica.
    await dialogo.getByLabel('Otro color para el código').fill('#ffe4ec');
    await expect(dialogo.getByRole('alert')).toContainText('demasiado claro');
    const svg = await descargar(page, /solo el código.*SVG/);
    expect(svg.bytes.toString('utf8')).toContain('fill="#111111"');

    await dialogo.getByLabel('Otro color para el código').fill('#8a2451');
    await expect(dialogo.getByRole('alert')).toHaveCount(0);
    const svgColor = await descargar(page, /solo el código.*SVG/);
    expect(svgColor.bytes.toString('utf8')).toContain('fill="#8A2451"');
    await page.keyboard.press('Escape');

    // El cartel de la app sale con los mismos colores, sin volver a elegirlos.
    await botonesQr(page).nth(1).click();
    await expect(page.getByRole('dialog', { name: 'Código QR · App de tus alumnas' })).toBeVisible();
    const app = await descargar(page, /cartel.*PDF para imprimir/);
    expect(app.nombre).toBe('cartel-qr-app-pilates-boutique-mar.pdf');
    const textoApp = app.bytes.toString('latin1');
    expect(textoApp).toContain('/portal/pilates-boutique-mar)');
    expect(textoApp).toContain('0.059 0.463 0.431 rg');
    expect(textoApp).toContain('0.541 0.141 0.318 rg');
    await page.keyboard.press('Escape');

    await botonesQr(page).nth(2).click();
    await expect(page.getByRole('dialog', { name: 'Código QR · Tu web' })).toBeVisible();
    const web = await descargar(page, /cartel.*PDF para imprimir/);
    expect(web.nombre).toBe('cartel-qr-web-pilates-boutique-mar.pdf');
    // «pilatesboutiquemar.example.com» escrita sin protocolo: el QR lleva https.
    expect(web.bytes.toString('latin1')).toContain('(Visita nuestra web)');
    expect(web.bytes.toString('latin1')).toContain('(pilatesboutiquemar.example.com)');
  });

  test('sin web en Contacto se dice dónde ponerla, en vez de un QR que no lleva a nada', async ({ page }) => {
    await prepararPanel(page, { ...STUDIO_ROW, sitio_web: null });

    await expect(botonesQr(page)).toHaveCount(2);
    await expect(page.getByText(/añádela en Mi estudio → Contacto/)).toBeVisible();
  });
});
