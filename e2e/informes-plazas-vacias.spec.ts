import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Informes › «Plazas que dejaron vacías» (P3.15), apagado tras
// `INFORMES_PLAZAS_VACIAS`. Lo cuenta el servidor; aquí se mira la pantalla:
// apagado no se pinta ni se piden datos; encendido, cifra y base sin
// porcentajes, y un fallo se dice (nunca una lista vacía). Con contador.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

async function montarCon(page: Page, o: { disponible: boolean; status?: number; filas?: unknown[] }) {
  await montar(page);
  const pedidas: URL[] = [];
  // ⚠️ Después de `montar()`: gana la ruta registrada más tarde.
  await page.route((u) => u.pathname === '/api/informes/plazas-vacias', (r) => {
    const url = new URL(r.request().url());
    if (!url.searchParams.has('desde')) return json(r, { disponible: o.disponible });
    pedidas.push(url);
    if (o.status && o.status >= 400) return json(r, { error: 'No se ha podido calcular.' }, o.status);
    return json(r, { disponible: true, desde: url.searchParams.get('desde'), hasta: url.searchParams.get('hasta'), filas: o.filas ?? [] });
  });
  await ir(page, 'informes');
  await expect(page.getByRole('heading', { name: 'Clientas' })).toBeVisible({ timeout: 60_000 });
  return pedidas;
}

test('apagado: la pantalla es la de siempre y no se piden datos', async ({ page }) => {
  const pedidas = await montarCon(page, { disponible: false });
  await expect(page.getByText('Las que más vienen')).toBeVisible();
  await expect(page.getByTestId('informe-plazas-vacias')).toHaveCount(0);
  expect(pedidas).toHaveLength(0);
});

test('encendido: quién dejó plazas vacías en el periodo que se ve, con su base y sin porcentajes', async ({ page }) => {
  const pedidas = await montarCon(page, {
    disponible: true,
    filas: [{ socioId: 'soc-2', tarde: 2, sinVenir: 1, conPlaza: 9 }, { socioId: 'soc-3', tarde: 0, sinVenir: 3, conPlaza: 4 }],
  });
  const bloque = page.getByTestId('informe-plazas-vacias');
  await expect(bloque.getByRole('heading', { name: 'Plazas que dejaron vacías' })).toBeVisible();
  await expect(bloque).toContainText('Puede haber un motivo');
  const lista = bloque.getByTestId('informe-plazas-vacias-lista');
  await expect(lista.getByRole('listitem')).toHaveCount(2);
  await expect(lista.getByRole('listitem').first()).toContainText('Laura Martín');
  await expect(lista.getByRole('listitem').first()).toContainText('2 tarde · 1 sin venir, de 9 reservas');
  await expect(lista.getByRole('link', { name: 'Laura Martín' })).toHaveAttribute('href', '/clientas/soc-2');
  await expect(bloque).not.toContainText('%');
  // Se pidió el periodo que se ve (el mes en curso, hasta hoy).
  expect(pedidas.length).toBeGreaterThan(0);
  expect(pedidas[0].searchParams.get('desde')).toBe(`${hoy.slice(0, 7)}-01`);
  expect(pedidas[0].searchParams.get('hasta')! <= hoy).toBe(true);
});

test('encendido y nadie llega: se dice, sin lista', async ({ page }) => {
  const pedidas = await montarCon(page, { disponible: true, filas: [] });
  await expect(page.getByTestId('informe-plazas-vacias')).toContainText('Nadie ha dejado 3 o más plazas vacías en este periodo.');
  expect(pedidas.length).toBeGreaterThan(0);
});

test('si el servidor no puede calcularlo, se dice en rojo: nunca una lista vacía', async ({ page }) => {
  const pedidas = await montarCon(page, { disponible: true, status: 503 });
  const bloque = page.getByTestId('informe-plazas-vacias');
  await expect(bloque.getByRole('alert')).toContainText('No se ha podido calcular');
  await expect(bloque).not.toContainText('Nadie ha dejado');
  expect(pedidas.length).toBeGreaterThan(0);
});
