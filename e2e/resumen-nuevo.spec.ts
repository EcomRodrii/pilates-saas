import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La home del panel nuevo (interruptor `panelNuevo`, 14-oct-2026). Apagado, el
// Resumen es el de siempre; encendido, cifras arriba, «Hoy» y «Cómo va» en dos
// columnas y, en un estudio recién creado, «Pon en marcha tu estudio» con sus
// seis pasos. Ocultar esa tarjeta solo la quita si el servidor dice que sí
// (contador de peticiones en el camino de fallo).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function preparar(page: Page, o: { nuevo: boolean; vacio?: boolean }) {
  await montar(page);
  // Después de `montar`: ganan a sus comodines.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo,
  }));
  if (o.vacio) {
    for (const t of ['instructores', 'socios', 'planes_tarifa', 'suscripciones', 'tipos_clase', 'sesiones', 'reservas', 'recibos']) {
      await page.route(`**/rest/v1/${t}**`, (r) => json(r, []));
    }
    await page.route((u) => u.pathname === '/api/calendario', (r) => json(r, { sesiones: [], reservas: [], salas: [], instructores: [] }));
  }
}

test('apagado, el Resumen es el de siempre', async ({ page }) => {
  await preparar(page, { nuevo: false });
  await ir(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('resumen-nuevo')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Accesos rápidos' })).toHaveCount(0);
});

test('encendido: cifras arriba, accesos rápidos y la agenda en su tarjeta', async ({ page }) => {
  await preparar(page, { nuevo: true });
  await ir(page, 'dashboard');
  const home = page.getByTestId('resumen-nuevo');
  await expect(home).toBeVisible();
  for (const etiqueta of ['Ocupación hoy', 'Ocupación semana', 'Ingresos del mes', 'Clientas activas']) {
    await expect(home.getByText(etiqueta, { exact: true })).toBeVisible();
  }
  // Las gráficas, con su tabla para lectores de pantalla.
  for (const grafica of ['Ingresos por mes', 'Reservas por día, últimos 14 días', 'Altas por mes']) {
    await expect(home.getByRole('img', { name: grafica })).toBeVisible();
  }
  await expect(home.getByRole('heading', { name: 'Accesos rápidos' })).toBeVisible();
  await expect(home.getByRole('link', { name: 'Crear clase' })).toHaveAttribute('href', '/calendario?nueva=1');
  await expect(home.getByRole('region', { name: 'Hoy en el estudio' })).toBeVisible();
  // «No hay clases» nunca dos veces: o la frase de Tenti o la lista.
  expect(await home.getByText(/no hay clases/i).count()).toBeLessThanOrEqual(1);
});

test('un estudio recién creado ve «Pon en marcha tu estudio» con sus seis pasos', async ({ page }) => {
  await preparar(page, { nuevo: true, vacio: true });
  await ir(page, 'dashboard');
  const tarjeta = page.getByTestId('primeros-pasos');
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.getByText('0 de 6', { exact: true })).toBeVisible();
  await expect(tarjeta.getByRole('listitem')).toHaveCount(7); // seis y el opcional
  // La siguiente lleva al sitio exacto.
  await expect(tarjeta.getByRole('link', { name: /Empezar/ })).toHaveAttribute('href', '/equipo?nuevo=1');
  // Con el horario vacío, la agenda enseña a programarlo.
  await expect(page.getByRole('link', { name: 'Programar mis clases' })).toHaveAttribute('href', '/calendario?nueva=1');
});

test('ocultar «Pon en marcha»: si el servidor dice que no, la tarjeta se queda y lo dice', async ({ page }) => {
  await preparar(page, { nuevo: true, vacio: true });
  let escrituras = 0;
  await page.route('**/rest/v1/studios**', (r) => {
    if (r.request().method() === 'PATCH') {
      escrituras++;
      return json(r, { message: 'no' }, 500);
    }
    return r.fallback();
  });
  await ir(page, 'dashboard');
  const tarjeta = page.getByTestId('primeros-pasos');
  await expect(tarjeta).toBeVisible();
  await tarjeta.getByRole('button', { name: /Ocultar/ }).click();
  await expect.poll(() => escrituras).toBeGreaterThan(0);
  await expect(tarjeta.getByText('No se ha podido ocultar. Inténtalo otra vez.')).toBeVisible();
  await expect(tarjeta).toBeVisible();
});
