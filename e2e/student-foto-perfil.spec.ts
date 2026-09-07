import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La foto de perfil de la alumna.
//
// Lo que se comprueba no es que haya un botón, sino las reglas que la hacen
// segura y honesta: que el servidor decide, que la validación no depende del
// navegador, y que un fallo no deja a la alumna creyendo que guardó algo.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: { subida?: { status: number; body: string }; conFoto?: boolean } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  const socio = (f.socia as Record<string, unknown>).socio as Record<string, unknown>;
  socio.apellidos = 'Test';
  if (opts.conFoto) socio.fotoUrl = 'https://cdn.example/foto.png';
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  await page.route((u) => u.pathname === '/api/public/foto-perfil', (r) => r.fulfill(
    opts.subida ?? { status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://cdn.example/nueva.png?v=1' }) },
  ));
  // Un PNG diminuto de verdad, para que el redimensionado tenga algo que leer.
  await page.route('**/cdn.example/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('89504e470d0a1a0a', 'hex') }));
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('Student PWA · foto de perfil', () => {
  test.describe.configure({ timeout: 120_000 });

  test('sin foto se ven sus INICIALES, no un hueco', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
    const boton = page.getByTestId('avatar-boton');
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await expect(boton).toContainText('AT');
    // Y se anuncia como lo que es: un control para añadir foto.
    await expect(boton).toHaveAttribute('aria-label', /añadir/i);
  });

  test('un formato que el bucket rechaza se corta ANTES de subir', async ({ page }) => {
    // Si llegara al servidor, el rechazo vendría de Storage con un mensaje que
    // la alumna no puede interpretar.
    let intentos = 0;
    await montar(page);
    await page.route((u) => u.pathname === '/api/public/foto-perfil', (r) => { intentos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('avatar-boton')).toBeVisible({ timeout: 30_000 });
    await page.setInputFiles('input[type=file]', { name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(page.getByTestId('foto-error')).toContainText(/JPG, PNG o WebP/i);
    expect(intentos).toBe(0);
  });

  test('si el servidor rechaza, NO se queda la previsualización mintiendo', async ({ page }) => {
    // Dejar la foto en pantalla tras un fallo sería enseñarle algo que no está
    // guardado en ninguna parte: al recargar habría desaparecido.
    await montar(page, { subida: { status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'No hemos podido guardar la foto.' }) } as never });
    await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('avatar-boton')).toBeVisible({ timeout: 30_000 });
    await page.setInputFiles('input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect(page.getByTestId('foto-error')).toBeVisible({ timeout: 30_000 });
    // Vuelven las iniciales: la previsualización se ha revertido.
    await expect(page.getByTestId('avatar-boton')).toContainText('AT');
  });

  test('con foto se ofrece quitarla; sin foto, no', async ({ page }) => {
    await montar(page, { conFoto: true });
    await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Quitar la foto' })).toBeVisible({ timeout: 30_000 });

    await montar(page);
    await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('avatar-boton')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Quitar la foto' })).toHaveCount(0);
  });

  test('la subida manda el estudio y NO el id de la socia: eso lo pone el token', async ({ page }) => {
    // Aceptar el id del cliente sería dejarle elegir a quién le cambia la foto:
    // la ruta del fichero en el bucket ES ese id.
    let url = '';
    let cuerpo = '';
    await montar(page);
    await page.route((u) => u.pathname === '/api/public/foto-perfil', async (r) => {
      url = r.request().url();
      cuerpo = r.request().postData() ?? '';
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://cdn.example/n.png' }) });
    });
    await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('avatar-boton')).toBeVisible({ timeout: 30_000 });
    await page.setInputFiles('input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect.poll(() => url, { timeout: 30_000 }).toContain('studioId=');
    expect(cuerpo).not.toContain('socioId');
  });
});
