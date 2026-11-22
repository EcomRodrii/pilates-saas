import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// «Reseñas y premio» (Configuración → Cómo me comunico, 21-nov-2026): el enlace de
// reseñas del estudio y el código que se regala a quien valora una clase en Tentare.
//
// Lo que rompe a un estudio: decir «Guardado» sin que el servidor lo haya dicho, o
// guardar un enlace que no es https. Y lo que hace legal el flujo: que la propia
// pantalla diga que el premio es por valorar en Tentare y no por la reseña pública.
// Siempre con contador de peticiones (un «no escribió» sin contador es un test hueco).

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

interface Ajustes { enlace: string | null; premioTipo: 'PORCENTAJE' | 'IMPORTE_FIJO' | null; premioValor: number | null; premioDias: number }
const VACIOS: Ajustes = { enlace: null, premioTipo: null, premioValor: null, premioDias: 30 };

async function abrir(page: Page, opts: { inicial?: Ajustes; regalados?: number; canjeados?: number; putRechazado?: string; getFalla?: boolean; embudo?: { valoraciones: number; mostrados: number; clicsApp: number; clicsQr: number } } = {}) {
  await montar(page);
  let ajustes = opts.inicial ?? VACIOS;
  const puts: Record<string, unknown>[] = [];
  let gets = 0;
  await page.route('**/api/estudio/resenas', async (r) => {
    if (r.request().method() === 'PUT') {
      puts.push(r.request().postDataJSON() as Record<string, unknown>);
      if (opts.putRechazado) return json(r, { error: opts.putRechazado }, 400);
      const b = r.request().postDataJSON() as { enlace: string | null; premio: { tipo: Ajustes['premioTipo']; valor: number; dias: number } | null };
      ajustes = { enlace: b.enlace, premioTipo: b.premio?.tipo ?? null, premioValor: b.premio?.valor ?? null, premioDias: b.premio?.dias ?? 30 };
    } else {
      gets++;
      if (opts.getFalla) return json(r, { error: 'caído' }, 500);
    }
    return json(r, { ajustes, regalados: opts.regalados ?? 0, canjeados: opts.canjeados ?? 0, slug: 'pilates-centro', embudo: opts.embudo ?? { valoraciones: 0, mostrados: 0, clicsApp: 0, clicsQr: 0 } });
  });
  await page.route('**/api/layout**', (r) => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await ir(page, 'configuracion?tab=comunicacion');
  return { puts, lecturas: () => gets };
}

const valor = (page: Page) => page.locator('#resenas-y-premio [data-resumen]');
const cajon = (page: Page) => page.getByRole('dialog').first();
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });

async function abrirCajon(page: Page) {
  await page.locator('#resenas-y-premio').click({ timeout: 90_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Reseñas y premio', exact: true })).toBeFocused({ timeout: 30_000 });
  await expect(cajon(page).getByTestId('resenas-con-premio')).toBeVisible();
}

test.describe('Configuración · reseñas y premio', () => {
  test.describe.configure({ timeout: 240_000 });

  test('de serie: la fila dice «Sin enlace · sin premio» y el aviso legal solo sale al encender el premio', async ({ page }) => {
    const { lecturas } = await abrir(page);
    await expect(valor(page)).toHaveText('Sin enlace · sin premio', { timeout: 90_000 });
    expect(lecturas()).toBeGreaterThan(0);
    await abrirCajon(page);
    await expect(cajon(page).getByLabel('Enlace de tu página de reseñas')).toHaveValue('');
    await expect(cajon(page).getByTestId('resenas-premio')).toHaveCount(0);

    await cajon(page).getByRole('switch', { name: /regalar un descuento/i }).click();
    const aviso = cajon(page).getByTestId('resenas-aviso-premio');
    await expect(aviso).toContainText('valorar la clase en Tentare');
    await expect(aviso).toContainText('No es por dejar una reseña en Google');
    // Sin guardar no hay nada que decir: «Guardar» ni se ofrece sin cambios… y ahora SÍ los hay.
    await expect(guardar(page)).toBeVisible();
  });

  test('guardar un enlace y un premio manda exactamente eso, y la fila lo dice solo cuando el servidor lo confirma', async ({ page }) => {
    const { puts } = await abrir(page);
    await expect(valor(page)).toHaveText('Sin enlace · sin premio', { timeout: 90_000 });
    await abrirCajon(page);
    await cajon(page).getByLabel('Enlace de tu página de reseñas').fill('  https://g.page/r/ejemplo/review  ');
    await cajon(page).getByRole('switch', { name: /regalar un descuento/i }).click();
    await cajon(page).getByRole('radio', { name: 'Importe fijo' }).click();
    await cajon(page).getByLabel('Importe del descuento en euros').fill('12,5');
    await expect(cajon(page)).toContainText('Tus clientes recibirán 12,5 € de descuento');
    await guardar(page).click();

    await expect.poll(() => puts.length).toBeGreaterThan(0);
    expect(puts[0]).toEqual({ enlace: 'https://g.page/r/ejemplo/review', premio: { tipo: 'IMPORTE_FIJO', valor: 12.5, dias: 30 } });
    await expect(valor(page)).toHaveText('Enlace puesto · premio de 12,5 € de descuento', { timeout: 30_000 });
  });

  test('un enlace que no es https no se puede guardar y no llega al servidor', async ({ page }) => {
    const { puts } = await abrir(page);
    await expect(valor(page)).toHaveText('Sin enlace · sin premio', { timeout: 90_000 });
    await abrirCajon(page);
    await cajon(page).getByLabel('Enlace de tu página de reseñas').fill('http://g.page/r/ejemplo');
    await expect(cajon(page).getByRole('alert').filter({ hasText: 'https://' })).toBeVisible();
    await expect(guardar(page)).toBeDisabled();
    expect(puts).toHaveLength(0);
  });

  test('un descuento fuera de topes se avisa antes de guardar y no se manda', async ({ page }) => {
    const { puts } = await abrir(page);
    await expect(valor(page)).toHaveText('Sin enlace · sin premio', { timeout: 90_000 });
    await abrirCajon(page);
    await cajon(page).getByRole('switch', { name: /regalar un descuento/i }).click();
    await cajon(page).getByLabel('Porcentaje de descuento').fill('100');
    await expect(cajon(page).getByRole('alert').filter({ hasText: 'del 1 % al 50 %' })).toBeVisible();
    await expect(guardar(page)).toBeDisabled();
    expect(puts).toHaveLength(0);
  });

  test('si el servidor dice que no, se enseña su motivo, el cajón sigue abierto y la fila no cambia', async ({ page }) => {
    const { puts } = await abrir(page, { putRechazado: 'No se ha podido guardar: prueba de fallo' });
    await expect(valor(page)).toHaveText('Sin enlace · sin premio', { timeout: 90_000 });
    await abrirCajon(page);
    await cajon(page).getByLabel('Enlace de tu página de reseñas').fill('https://g.page/r/ejemplo/review');
    await guardar(page).click();
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    await expect(page.getByRole('alert').filter({ hasText: 'prueba de fallo' })).toBeVisible();
    await expect(cajon(page)).toBeVisible();
    await expect(cajon(page).getByLabel('Enlace de tu página de reseñas')).toHaveValue('https://g.page/r/ejemplo/review');
    await expect(valor(page)).toHaveText('Sin enlace · sin premio');
  });

  test('con el premio ya activo se ve cargado, y cuántos se han regalado y canjeado', async ({ page }) => {
    await abrir(page, { inicial: { enlace: 'https://g.page/r/ejemplo/review', premioTipo: 'PORCENTAJE', premioValor: 10, premioDias: 45 }, regalados: 7, canjeados: 2 });
    await expect(valor(page)).toHaveText('Enlace puesto · premio de 10 % de descuento', { timeout: 90_000 });
    await abrirCajon(page);
    await expect(cajon(page).getByRole('switch', { name: /regalar un descuento/i })).toHaveAttribute('aria-checked', 'true');
    await expect(cajon(page).getByLabel('Porcentaje de descuento')).toHaveValue('10');
    await expect(cajon(page).getByLabel('Cuántos días vale el código')).toHaveValue('45');
    await expect(cajon(page).getByTestId('resenas-cifras')).toHaveText('7 premios regalados · 2 canjeados');
  });

  test('si no se pueden leer los ajustes, la fila no inventa un valor y el cajón lo dice', async ({ page }) => {
    await abrir(page, { getFalla: true });
    await page.locator('#resenas-y-premio').click({ timeout: 90_000 });
    await expect(cajon(page).getByRole('alert')).toContainText('No se han podido leer los ajustes', { timeout: 30_000 });
    await expect(cajon(page).getByTestId('resenas-con-premio')).toHaveCount(0);
  });

  test('sin enlace guardado: ayuda para sacarlo, pero ni «Probar» ni cartel QR ni embudo', async ({ page }) => {
    await abrir(page);
    await expect(valor(page)).toHaveText('Sin enlace · sin premio', { timeout: 90_000 });
    await abrirCajon(page);
    await expect(cajon(page).getByTestId('resenas-ayuda-enlace')).toContainText('Pedir reseñas');
    await expect(cajon(page).getByTestId('resenas-acciones-enlace')).toHaveCount(0);
    await expect(cajon(page).getByTestId('resenas-embudo')).toHaveCount(0);
    // Cuándo se lo enseñamos, dicho donde se pone el enlace.
    await expect(cajon(page)).toContainText('una sola vez, cuando ya ha ido a 3 clases');
  });

  test('con enlace guardado: «Probar el enlace», cartel con QR y los últimos 30 días, con su salvedad', async ({ page }) => {
    await abrir(page, {
      inicial: { enlace: 'https://g.page/r/ejemplo/review', premioTipo: null, premioValor: null, premioDias: 30 },
      embudo: { valoraciones: 12, mostrados: 5, clicsApp: 3, clicsQr: 2 },
    });
    await expect(valor(page)).toHaveText('Enlace puesto · sin premio', { timeout: 90_000 });
    await abrirCajon(page);
    const acciones = cajon(page).getByTestId('resenas-acciones-enlace');
    await expect(acciones.getByRole('link', { name: 'Probar el enlace' })).toHaveAttribute('href', 'https://g.page/r/ejemplo/review');
    await expect(acciones.getByRole('link', { name: 'Probar el enlace' })).toHaveAttribute('rel', /noopener/);
    const embudo = cajon(page).getByTestId('resenas-embudo');
    await expect(embudo).toContainText('Valoraciones');
    await expect(embudo.locator('dd')).toHaveText(['12', '5', '3', '2']);
    await expect(embudo).toContainText('Un toque no es una reseña publicada');

    // El cartel de recepción: el QR apunta a la ruta con seguimiento del estudio.
    await acciones.getByRole('button').first().click();
    await expect(page.getByRole('dialog').filter({ hasText: 'pilates-centro' }).first()).toContainText('/resena/pilates-centro', { timeout: 30_000 });

  });
});
