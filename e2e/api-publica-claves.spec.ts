import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «API para tu contabilidad» (Configuración → Conexiones, F1 de la API).
//
// Lo que se fija:
//   · sin la API activada, el cajón explica para qué sirve y cómo pedirla, y no
//     ofrece crear nada;
//   · crear una clave la enseña UNA vez, con «Copiar» y el texto seleccionable;
//   · si el servidor dice que no, se dice por qué y NO aparece ninguna clave —
//     contando que la petición SÍ salió (un test de fallo sin contador puede
//     pasar sin haber intentado nada).
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const CLAVE = `tnt_sk_${'a'.repeat(43)}`;

async function abrir(page: Page, opts: { activada: boolean; falloCrear?: boolean }) {
  const posts: unknown[] = [];
  await montar(page);
  // Después de montar(): Playwright prueba las rutas en orden inverso al registro.
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
  await page.route(u => u.pathname === '/api/integrations/api-publica/actividad', r => json(r, { llamadas: [] }));
  await page.route(u => u.pathname === '/api/integrations/api-publica/claves', r => {
    if (r.request().method() === 'GET') {
      return json(r, { activada: opts.activada, permitidos: ['clientas:leer', 'clientas:datos_fiscales', 'pagos:leer', 'facturas:leer', 'planes:leer'], claves: [] });
    }
    posts.push(r.request().postDataJSON());
    if (opts.falloCrear) return json(r, { error: 'No puedes dar estos permisos: pagos:leer.' }, 400);
    return json(r, {
      clave: CLAVE,
      detalle: { id: 'apik-1', nombre: 'Contabilidad', prefijo: 'tnt_sk_aaaaaa', scopes: ['pagos:leer'], creadaEn: '2026-10-01T10:00:00Z', expiraEn: null, ultimoUsoEn: null, revocadaEn: null, estado: 'activa' },
    }, 201);
  });
  await ir(page, 'configuracion?tab=conexiones');
  await page.locator('#api-publica').click({ timeout: 30_000 });
  return { posts };
}

const cajon = (page: Page) => page.getByRole('dialog').first();

test('sin activar: explica para qué sirve y cómo pedirla, sin botón de crear', async ({ page }) => {
  await abrir(page, { activada: false });
  await expect(cajon(page).getByText('Todavía no está activada para tu estudio.')).toBeVisible();
  await expect(cajon(page).getByRole('link', { name: /Pedir la API por WhatsApp/ })).toBeVisible();
  await expect(cajon(page).getByRole('button', { name: /Crear una clave/ })).toHaveCount(0);
});

test('crear una clave la enseña una vez, con los permisos de contabilidad por defecto', async ({ page }) => {
  const { posts } = await abrir(page, { activada: true });
  await cajon(page).getByRole('button', { name: /Crear una clave/ }).click();
  await cajon(page).getByRole('button', { name: 'Crear la clave' }).click();

  await expect(cajon(page).getByText(/Cópiala ahora: no la volverás a ver/)).toBeVisible();
  await expect(cajon(page).getByLabel('Clave de API')).toHaveValue(CLAVE);
  expect(posts.length, 'la petición de crear tiene que salir').toBeGreaterThan(0);
  const cuerpo = posts[0] as { nombre: string; scopes: string[]; caducaEnDias: number | null };
  expect(cuerpo.nombre).toBe('Contabilidad');
  expect(cuerpo.scopes.sort()).toEqual(['clientas:datos_fiscales', 'clientas:leer', 'facturas:leer', 'pagos:leer', 'planes:leer']);
  expect(cuerpo.caducaEnDias).toBe(365);

  // Una vez guardada, la clave desaparece de la pantalla.
  await cajon(page).getByRole('button', { name: 'Ya la he guardado' }).click();
  await expect(cajon(page).getByLabel('Clave de API')).toHaveCount(0);
});

test('si el servidor dice que no, se dice por qué y no aparece ninguna clave', async ({ page }) => {
  const { posts } = await abrir(page, { activada: true, falloCrear: true });
  await cajon(page).getByRole('button', { name: /Crear una clave/ }).click();
  await cajon(page).getByRole('button', { name: 'Crear la clave' }).click();

  await expect(cajon(page).getByRole('alert')).toContainText('No puedes dar estos permisos');
  expect(posts.length, 'la petición tiene que haber salido: si no, este test no prueba nada').toBeGreaterThan(0);
  await expect(cajon(page).getByLabel('Clave de API')).toHaveCount(0);
  await expect(cajon(page).getByText(/no la volverás a ver/)).toHaveCount(0);
});
