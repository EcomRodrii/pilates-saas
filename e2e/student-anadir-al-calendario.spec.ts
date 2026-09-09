import { test, expect, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// «+ Calendario» tiene que dejar la clase en el calendario que esa persona usa.
//
// ⚠️ Mandaba SIEMPRE a la plantilla de Google Calendar. En Android está bien —
// el enlace lo recoge la app que viene instalada. En un iPhone no hay Google
// Calendar salvo que la alumna lo haya instalado, así que abría una PÁGINA WEB
// de Google pidiéndole iniciar sesión, para meter la clase en el calendario que
// ya usa, que es el de Apple: el único sitio donde de verdad la quería era al
// que ese enlace no llegaba.
//
// Esto no prueba el `esApple` (eso es unitario) sino que el BOTÓN
// hace cosas distintas de verdad: en Android abre una URL de Google, en iPhone
// descarga un `.ics`.

const base = `/portal/${SLUG}`;

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.socia as Record<string, unknown>).reservas = [
    { id: 'res-1', socioId: SOCIO_ID, sesionId: SESION_ID, estado: 'CONFIRMADA', creadoEn: '2026-08-01T09:00:00Z' },
  ];
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

test.describe('Student PWA · añadir al calendario', () => {
  test.describe.configure({ timeout: 120_000 });

  test.describe('en Android', () => {
    test.use({ viewport: { width: 390, height: 844 }, userAgent: UA_ANDROID });

    test('abre la plantilla de Google Calendar, con la clase ya rellenada', async ({ page }) => {
      // ⚠️ Se comprueba la URL que ABRE LA APP, no dónde acaba el navegador.
      // Google redirige `calendar/render` a su página de producto cuando no hay
      // sesión iniciada —que es el caso en un navegador de pruebas— así que
      // mirar `page.url()` del popup medía a Google, no a nosotros. En un
      // Android real el enlace lo intercepta la app de Google Calendar antes de
      // que ningún redirect entre en juego.
      await page.addInitScript(() => {
        (window as unknown as { __abierto?: string }).__abierto = undefined;
        window.open = (u?: string | URL) => {
          (window as unknown as { __abierto?: string }).__abierto = String(u ?? '');
          return null;
        };
      });
      await montar(page);
      await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
      const boton = page.getByRole('button', { name: '+ Calendario' }).first();
      await expect(boton).toBeVisible({ timeout: 30_000 });
      await boton.click();

      const url = await page.evaluate(() => (window as unknown as { __abierto?: string }).__abierto ?? '');
      expect(url, 'no abre Google Calendar en Android').toContain('calendar.google.com/calendar/render');
      const p = new URL(url).searchParams;
      expect(p.get('text')).toContain('Reformer');
      expect(p.get('dates'), 'sin fechas, la plantilla sale vacía').toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
      expect(p.get('location')).toBeTruthy();
    });
  });

  test('«Cómo llegar» tampoco manda a un iPhone a la app equivocada', async ({ browser }) => {
    // ⚠️ Mismo fallo que «+ Calendario», una línea más abajo en el mismo
    // fichero: `maps.google.com` en un iPhone abre Google Maps (la app si la
    // tiene, si no dentro de Safari) y NUNCA Apple Maps, que es la que ese
    // teléfono trae y la que está conectada a su coche y a su reloj.
    for (const [ua, host] of [[UA_IPHONE, 'maps.apple.com'], [UA_ANDROID, 'maps.google.com']] as const) {
      const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        window.open = (u?: string | URL) => {
          (window as unknown as { __abierto?: string }).__abierto = String(u ?? '');
          return null;
        };
      });
      await montar(page);
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      const boton = page.getByRole('button', { name: 'Cómo llegar' }).first();
      await expect(boton).toBeVisible({ timeout: 30_000 });
      await boton.click();
      const url = await page.evaluate(() => (window as unknown as { __abierto?: string }).__abierto ?? '');
      expect(new URL(url).hostname, `con ${ua.slice(0, 24)}… abre el mapa equivocado`).toBe(host);
      await ctx.close();
    }
  });

  test.describe('en iPhone', () => {
    test.use({ viewport: { width: 390, height: 844 }, userAgent: UA_IPHONE });

    test('descarga un .ics para Calendario, en vez de mandar a una web de Google', async ({ page }) => {
      await montar(page);
      await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
      const boton = page.getByRole('button', { name: '+ Calendario' }).first();
      await expect(boton).toBeVisible({ timeout: 30_000 });

      const descarga = page.waitForEvent('download', { timeout: 15_000 });
      await boton.click();
      const d = await descarga;
      expect(d.suggestedFilename(), 'no descarga un .ics').toMatch(/\.ics$/);

      // Y el fichero es un evento válido, no un texto cualquiera.
      const ruta = await d.path();
      const ics = ruta ? await (await import('node:fs/promises')).readFile(ruta, 'utf8') : '';
      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('BEGIN:VEVENT');
      // UID y DTSTAMP son obligatorios en RFC 5545 — sin ellos Outlook rechaza
      // el evento sin decir por qué.
      expect(ics).toMatch(/^UID:/m);
      expect(ics).toMatch(/^DTSTAMP:/m);
      expect(ics).toMatch(/^DTSTART:\d{8}T\d{6}Z$/m);
      expect(ics).toMatch(/^DTEND:\d{8}T\d{6}Z$/m);
      expect(ics).toMatch(/SUMMARY:.*Reformer/);
    });
  });
});
