import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Academy dentro del panel (14-nov-2026): el curso «Conoce Tentare» (/primeros-pasos) y el curso «Cambiar a Tentare» con su progreso.
//  · El curso de migración enseña de qué software vienes y SOLO da pasos de exportación donde constan en su ayuda pública.
//  · Un paso se guarda con lo que CONTESTA el servidor (y con un 4xx no se anuncia nada): cada test cuenta las peticiones de escritura,
//    porque «no mintió» sin haber intentado nada no prueba nada.
//  · El vídeo de una lección va con fachada: hasta pulsar reproducir no se le pide nada a Vimeo.
//  · La /academy pública es solo un escaparate: sin contenido propio y con su metadata.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 420_000 });

const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

interface Opciones { filas?: Array<{ paso: string; estado: string; nota: string | null }>; origen?: string | null; videos?: unknown[]; rechazar?: boolean }

async function abrir(page: Page, ruta: string, o: Opciones = {}) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false, nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await page.route((u) => u.pathname === '/api/ayuda/videos', (r) => json(r, { videos: o.videos ?? [] }));
  const escrituras: Array<Record<string, unknown>> = [];
  let filas = o.filas ?? [];
  let origen = o.origen ?? null;
  await page.route((u) => u.pathname === '/api/migracion/recorrido', async (r) => {
    if (r.request().method() === 'PUT') {
      const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
      escrituras.push(cuerpo);
      if (o.rechazar) return json(r, { error: 'No se ha podido guardar el paso.' }, 500);
      filas = [...filas.filter((f) => f.paso !== cuerpo.paso), { paso: String(cuerpo.paso), estado: String(cuerpo.estado), nota: (cuerpo.nota as string | null) ?? null }];
      if (cuerpo.origen) origen = String(cuerpo.origen);
      return json(r, { ok: true });
    }
    return json(r, { filas, origen });
  });
  await ir(page, ruta);
  return { escrituras };
}

test('el curso «Conoce Tentare» ofrece «Cambiar a Tentare» a quien gestiona clientas', async ({ page }) => {
  await abrir(page, 'primeros-pasos');
  const enlace = page.getByRole('link', { name: /Cambiar a Tentare/ });
  await expect(enlace).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText('Tentare Academy')).toBeVisible();
  await enlace.click();
  await expect(page).toHaveURL(/\/primeros-pasos\/cambiar-de-software$/);
  await expect(page.getByRole('heading', { name: 'Cambiar a Tentare' })).toBeVisible();
});

test('«Cambiar a Tentare» enseña los 11 pasos, los límites y no inventa pasos de exportación', async ({ page }) => {
  await abrir(page, 'primeros-pasos/cambiar-de-software');
  await expect(page.getByTestId('resumen-migracion')).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('li[data-paso]')).toHaveCount(11);
  await expect(page.getByText(/tarjetas guardadas/i).first()).toBeVisible();
  // Sin origen elegido no hay guía de exportación.
  await expect(page.getByTestId('guia-origen')).toContainText('Elige antes de qué software vienes');
});

test('elegir el software de origen guarda el diagnóstico y enseña su guía con fecha y fuente', async ({ page }) => {
  const { escrituras } = await abrir(page, 'primeros-pasos/cambiar-de-software');
  await expect(page.getByTestId('resumen-migracion')).toBeVisible({ timeout: 300_000 });
  await page.getByLabel('Software de origen').selectOption('timp');
  await expect.poll(() => escrituras.length).toBeGreaterThan(0);
  expect(escrituras[0]).toMatchObject({ paso: 'diagnostico', estado: 'COMPLETADO', origen: 'timp' });
  const guia = page.getByTestId('guia-origen');
  await expect(guia).toContainText('Cómo exportar desde');
  await expect(guia).toContainText('Pasos comprobados en su ayuda pública');
  await expect(guia.getByRole('link')).toHaveAttribute('href', /^https:\/\//);
  await expect(page.getByTestId('estado-diagnostico')).toHaveText('Completado');
});

test('un origen sin pasos verificados lo dice, y no enseña una lista inventada', async ({ page }) => {
  await abrir(page, 'primeros-pasos/cambiar-de-software', { origen: 'mindbody', filas: [{ paso: 'diagnostico', estado: 'COMPLETADO', nota: null }] });
  const guia = page.getByTestId('guia-origen');
  await expect(guia).toContainText('Cómo exportar desde', { timeout: 300_000 });
  await expect(guia).toContainText('No confirmado en su ayuda pública');
  await expect(guia.locator('ol')).toHaveCount(0);
});

test('si el servidor no guarda el paso, la pantalla lo dice y no lo da por hecho', async ({ page }) => {
  const { escrituras } = await abrir(page, 'primeros-pasos/cambiar-de-software', { rechazar: true });
  await expect(page.getByTestId('resumen-migracion')).toBeVisible({ timeout: 300_000 });
  await page.getByLabel('Software de origen').selectOption('eversports');
  await expect.poll(() => escrituras.length).toBeGreaterThan(0);
  await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido guardar' })).toBeVisible();
  await expect(page.getByTestId('estado-diagnostico')).not.toHaveText('Completado');
});

test('el vídeo de una lección va con fachada: no se pide nada a Vimeo hasta pulsar reproducir', async ({ page }) => {
  const aVimeo: string[] = [];
  page.on('request', (q) => { if (q.url().includes('vimeo.com')) aVimeo.push(q.url()); });
  await page.route('**/player.vimeo.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }));
  await abrir(page, 'primeros-pasos/cambiar-de-software', {
    videos: [{ articulo: 'primeros-pasos/cambiar-de-software', videoId: '123456789', hashPrivado: null, titulo: 'Así se cambia a Tentare', duracionSeg: 245, nivel: 'esencial', resultado: 'Sabrás por dónde empezar', destacado: false, publicado: true }],
  });
  const reproducir = page.getByRole('button', { name: /reproducir/i });
  await expect(reproducir).toBeVisible({ timeout: 300_000 });
  expect(aVimeo, 'se pidió algo a Vimeo antes de pulsar').toEqual([]);
  await reproducir.click();
  await expect(page.locator('iframe[src*="player.vimeo.com"]')).toHaveAttribute('src', /dnt=1/);
});

test('sin vídeo publicado, la lección no pinta ningún reproductor', async ({ page }) => {
  await abrir(page, 'primeros-pasos/cambiar-de-software');
  await expect(page.getByTestId('resumen-migracion')).toBeVisible({ timeout: 300_000 });
  await expect(page.getByRole('button', { name: /reproducir/i })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('la /academy pública es un escaparate: enseña el curso y manda al panel, sin vídeos que no existen', async ({ request }) => {
  const res = await request.get('/academy');
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('Aprende a sacar el máximo partido a Tentare');
  expect(html).toContain('/soluciones/cambiar-de-software');
  expect(html).not.toContain('player.vimeo.com');
});
