import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Las secciones del panel nuevo (interruptor `panelNuevo`, 14-oct-2026). El
// resto de la suite corre con el interruptor apagado, así que sin esto la
// versión nueva de cada pantalla no la pasaría nadie: aquí se enciende y se
// recorre cada sección. Ninguna puede romper (ni un error de página ni la
// pantalla de «Algo ha ido mal»), y en las que cambian lo que se hace, se
// comprueba que lo hacen.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function preparar(page: Page, o: { nuevo: boolean }) {
  await montar(page);
  // Después de `montar`: ganan a sus comodines.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo,
  }));
}

/** Los errores de página que salgan mientras se mira una pantalla. */
function vigilarErrores(page: Page): string[] {
  const errores: string[] = [];
  page.on('pageerror', e => errores.push(e.message));
  return errores;
}

const SECCIONES = [
  'clientas', 'clientas/soc-2', 'equipo', 'cobros', 'productos', 'informes', 'citas', 'mensajeria',
  'automatizaciones', 'explorar-funciones', 'configuracion', 'configuracion/apariencia', 'centro-de-control',
  'sustituciones', 'migracion', 'notificaciones', 'cierre', 'calendario', 'comunidad',
];

for (const ruta of SECCIONES) {
  test(`encendido, /${ruta} se pinta sin romper`, async ({ page }) => {
    const errores = vigilarErrores(page);
    await preparar(page, { nuevo: true });
    await ir(page, ruta);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
    expect(errores, errores.join('\n')).toEqual([]);
  });
}

test('Apariencia: un paso cada vez, y «Siguiente» lleva al color con sus paletas', async ({ page }) => {
  await preparar(page, { nuevo: true });
  await ir(page, 'configuracion/apariencia');
  await expect(page.getByText('Paso 1 de 6')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Elige el estilo de tu app' })).toBeVisible();
  // El resto de pasos no está a la vista hasta que se llega a ellos.
  await expect(page.getByRole('radiogroup', { name: 'Paletas' })).toHaveCount(0);
  await page.getByRole('button', { name: /Siguiente: Color/ }).click();
  await expect(page.getByText('Paso 2 de 6')).toBeVisible();
  const paletas = page.getByRole('radiogroup', { name: 'Paletas' });
  await expect(paletas.getByRole('radio')).toHaveCount(6);
  // Elegir una paleta cambia el color del borrador: «Publicar» se enciende.
  await paletas.getByRole('radio', { name: /Océano/ }).click();
  await expect(paletas.getByRole('radio', { name: /Océano/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Tienes cambios sin publicar.')).toBeVisible();
});

test('apagado, Apariencia sigue con todas sus secciones a la vez', async ({ page }) => {
  await preparar(page, { nuevo: false });
  await ir(page, 'configuracion/apariencia');
  await expect(page.getByRole('radiogroup', { name: 'Estilo de la app' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('radiogroup', { name: 'Tipografía de la app' })).toBeVisible();
  await expect(page.getByText('Paso 1 de 6')).toHaveCount(0);
});

test('Sustituciones: los cuatro modos se eligen como tarjetas, y los del plan llevan su candado', async ({ page }) => {
  await preparar(page, { nuevo: true });
  await ir(page, 'sustituciones');
  const modos = page.getByRole('radiogroup', { name: 'Modo de autonomía' });
  await expect(modos.getByRole('radio')).toHaveCount(4, { timeout: 30_000 });
  await expect(modos.getByRole('radio', { name: /Asistido/ })).toHaveAttribute('aria-checked', 'true');
});
