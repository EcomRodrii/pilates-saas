import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Seis casos en que la app decía algo que no era cierto, o dejaba hacer algo
// que no debía. Todos salidos del backlog de la auditoría.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: { ajustar?: (f: Record<string, unknown>) => void; avisos?: number; prefs?: number } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  opts.ajustar?.(f);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => {
    const s = opts.avisos ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { items: [], unread: 0 } : { error: 'boom' }) });
  });
  await page.route('**/api/notifications/preferences**', (r) => {
    const s = opts.prefs ?? 200;
    return r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(s === 200 ? { prefs: {} } : { error: 'boom' }) });
  });
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [] }) }));
}

/** Plan mensual ilimitado: `sesionesRestantes: null`. */
function conIlimitado(f: Record<string, unknown>) {
  f.planesTarifa = [{ id: 'plan-ilim', studioId: STUDIO_ID, nombre: 'Mensual ilimitado', precio: 80, sesiones: null, activo: true, tipo: 'MENSUAL' }];
  (f.socia as Record<string, unknown>).suscripciones = [{ id: 'sus-ilim', studioId: STUDIO_ID, socioId: 'socio-e2e-1', planId: 'plan-ilim', estado: 'ACTIVA', sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: null }];
}

test.describe('Student PWA · lo que la app no debe decir', () => {
  test('un plan ilimitado no se pinta como «Infinity de Infinity»', async ({ page }) => {
    await montar(page, { ajustar: conIlimitado });
    await page.goto(`${base}/bonos`);
    await expect(page.getByText('Clases sin límite')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Infinity/)).toHaveCount(0);
    await expect(page.getByText(/NaN/)).toHaveCount(0);
  });

  test('buscar sin resultados no dice «no hay clases este día», porque las hay', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/reservar`);
    await page.getByLabel(/buscar clases/i).fill('zumba');
    // Se busca en TODO el horario, así que el mensaje del día sería falso.
    await expect(page.getByText(/Nada para «zumba»/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no hay clases este día/i)).toHaveCount(0);
    // Y la salida borra la búsqueda, que es lo que filtra de verdad.
    await page.getByRole('button', { name: /borrar la búsqueda/i }).click();
    await expect(page.getByText(/Nada para/)).toHaveCount(0);
  });

  test('si la bandeja de avisos falla, no se dice «Todo al día»', async ({ page }) => {
    await montar(page, { avisos: 500 });
    await page.goto(`${base}/notificaciones`);
    await expect(page.getByRole('button', { name: /intentar de nuevo|reintentar/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/todo al día/i)).toHaveCount(0);
  });

  test('si las preferencias fallan, no se pintan todos los interruptores encendidos', async ({ page }) => {
    await montar(page, { prefs: 500 });
    await page.goto(`${base}/perfil/preferencias`);
    await expect(page.getByRole('button', { name: /intentar de nuevo|reintentar/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('switch')).toHaveCount(0);
  });

  test('Datos personales no deja guardar antes de cargar: borraría apellidos', async ({ page }) => {
    // El payload tarda: el formulario sale vacío y guardar mandaría todo en blanco.
    await sembrarSociaLista(page);
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
    await page.route('**/api/public/studio-data', async (r) => {
      await new Promise((res) => setTimeout(res, 4000));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) });
    });
    await page.goto(`${base}/perfil/datos`);
    const guardar = page.getByRole('button', { name: /guardar/i });
    await expect(guardar).toBeVisible({ timeout: 30_000 });
    await expect(guardar).toBeDisabled();
    // Cuando llegan los datos, se habilita y el nombre ya está puesto.
    await expect(guardar).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByLabel('Nombre')).toHaveValue(/.+/);
  });
});
