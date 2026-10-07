import { test, type Page } from '@playwright/test';
import { montarAlta, saltarLogo } from './onboarding-andamio';

// Capturas del alta nueva. NO es un test: solo corre con
// CAPTURAS_ONBOARDING=<carpeta> y deja allí los PNG (a 1280 y a 390). Datos de
// muestra de los andamiajes de e2e (estudio ficticio, `@example.com`): NUNCA
// datos reales, el repo es público.
const DESTINO = process.env.CAPTURAS_ONBOARDING;
test.skip(!DESTINO, 'solo con CAPTURAS_ONBOARDING=<carpeta>');

const LOGO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#5A6142"/><path d="M20 44 32 18l12 26M25 36h14" stroke="#F3EFE6" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}`;

const TAMANOS = [{ n: 1280, w: 1280, h: 800 }, { n: 390, w: 390, h: 844 }] as const;

async function foto(page: Page, nombre: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DESTINO}/onboarding-${nombre}-${page.viewportSize()!.width}.png`, fullPage: false });
}

for (const t of TAMANOS) {
  test.describe(`${t.n}`, () => {
    test.use({ viewport: { width: t.w, height: t.h } });

    test('logo, tres pantallas y pantalla final', async ({ page }) => {
      await montarAlta(page, { estudio: { nombre: 'Estudio Alma', slug: 'estudio-alma', logo_url: LOGO_SVG } });
      await page.getByRole('button', { name: 'Saltar', exact: true }).waitFor({ timeout: 30_000 });
      await foto(page, '01-logo');
      await saltarLogo(page);
      await foto(page, '02-tu-estudio');
      await page.getByLabel('¿Con qué lo llevas ahora?').selectOption('Bsport');
      await foto(page, '03-tu-estudio-migrable');
      await page.getByRole('button', { name: 'Continuar' }).click();
      await page.getByRole('heading', { name: 'Tus clases y tu sala' }).waitFor();
      await foto(page, '04-clases-y-sala');
      await page.getByRole('radio', { name: '2 salas' }).click();
      await foto(page, '05-clases-dos-salas');
      await page.getByRole('radio', { name: '1 sala' }).click();
      await page.getByRole('button', { name: 'Continuar' }).click();
      await page.getByRole('heading', { name: 'Antes de entrar' }).waitFor();
      await foto(page, '06-antes-de-entrar');
      await page.getByRole('radio', { name: 'Prefiero que me llamen' }).click();
      await foto(page, '07-llamada-sin-telefono');
      await page.getByRole('button', { name: 'Ver mi estudio' }).click();
      await foto(page, '08-llamada-con-errores');
      const campo = page.getByTestId('campo-llamada');
      await campo.getByRole('textbox', { name: 'Teléfono' }).fill('612345678');
      await campo.getByRole('button', { name: 'Por la tarde' }).click();
      await campo.getByRole('checkbox').check();
      await foto(page, '09-llamada-con-telefono');
      await page.getByRole('button', { name: 'Ver mi estudio' }).click();
      await page.getByRole('heading', { name: /ya está en marcha/ }).waitFor();
      await page.waitForTimeout(900);
      await foto(page, '10-tu-estudio-listo');
      await page.mouse.wheel(0, 700);
      await foto(page, '11-tu-estudio-listo-abajo');
    });
  });
}

for (const t of TAMANOS) {
  for (const esquema of ['light', 'dark'] as const) {
    test.describe(`interno ${t.n} ${esquema}`, () => {
      test.use({ viewport: { width: t.w, height: t.h }, colorScheme: esquema });

      test('llamadas en /interno', async ({ page }) => {
        await page.addInitScript((key) => {
          localStorage.setItem(key, JSON.stringify({
            access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
            user: { id: 'u-marco', email: 'marco@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
          }));
          localStorage.setItem('theme', 'system');
        }, 'sb-example-auth-token');
        const j = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        await page.route('**/rest/v1/**', (r) => r.fulfill(j([])));
        await page.route('**/api/interno/sesion**', (r) => r.fulfill(j({ nombre: 'Marco', cargo: 'Fundador', email: 'marco@example.com', permisos: ['crm.update'] })));
        await page.route('**/api/interno/llamadas**', (r) => r.fulfill(j({
          llamadas: [
            { id: '11111111-1111-4111-8111-111111111111', studioId: 'a', estudio: 'Estudio Alma', telefono: '+34612345678', horaPreferida: 'tarde', estado: 'pendiente', creadaEn: '2026-10-07T09:12:00Z', atendidaEn: null },
            { id: '33333333-3333-4333-8333-333333333333', studioId: 'c', estudio: 'Pilates Brisa', telefono: '+351912345678', horaPreferida: null, estado: 'pendiente', creadaEn: '2026-10-07T10:40:00Z', atendidaEn: null },
            { id: '22222222-2222-4222-8222-222222222222', studioId: 'b', estudio: 'Estudio Norte', telefono: null, horaPreferida: null, estado: 'hecha', creadaEn: '2026-10-05T09:00:00Z', atendidaEn: '2026-10-06T10:00:00Z' },
          ],
        })));
        await page.goto('/interno/llamadas');
        await page.getByRole('heading', { name: 'Llamadas de puesta en marcha' }).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${DESTINO}/onboarding-12-interno-llamadas-${esquema === 'dark' ? 'oscuro' : 'claro'}-${t.n}.png` });
      });
    });
  }
}
