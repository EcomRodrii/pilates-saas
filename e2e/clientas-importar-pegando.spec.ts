import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Clientas › Importar › «Pega aquí las filas de tu hoja» (P3.16), apagado tras
// `IMPORTAR_PEGANDO`. Pegar no escribe nada: lleva a la misma vista previa que
// un fichero, y solo el botón «Importar» manda algo, con los campos de la
// clienta y nada más (una columna de salud no sale del navegador, y si alguien
// la relaciona a mano no se deja importar).
// Con contador de peticiones: «no se envió» tiene que ser porque no se intentó
// hasta confirmar; y en el camino de fallo, que se intentó.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

// Lo que deja Excel en el portapapeles al copiar un bloque: tabuladores, CRLF,
// una coma dentro de una celda (sin comillas) y una fila de solo tabuladores al
// final (se copió una de más).
const PEGADO = [
  'Nombre\tApellidos\tEmail\tTeléfono\tLesiones',
  'Ana\tGarcía López, de Madrid\tana.pegada@example.com\t600123456\tHernia lumbar L4',
  'Bea\tRuiz\tbea.pegada@example.com\t611654321\tEmbarazo 20 semanas',
  '\t\t\t\t',
  '',
].join('\r\n');

const CUADRO = 'Pega aquí las filas de tu hoja';

async function montarCon(page: Page, o: { encendido: boolean; importar?: { status: number; body: unknown } }) {
  await montar(page);
  const importadas: string[] = [];
  const preguntas = { interruptores: 0 };
  // ⚠️ Después de `montar()`: gana la ruta registrada más tarde.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => {
    preguntas.interruptores++;
    return json(r, { filtrosClientas: false, importarPegando: o.encendido });
  });
  await page.route((u) => u.pathname === '/api/socios/import', (r) => {
    importadas.push(r.request().postData() ?? '');
    const res = o.importar ?? { status: 200, body: { total: 2, importadas: 2, duplicadas: 0, errores: [] } };
    return json(r, res.body, res.status);
  });
  await ir(page, 'clientas/importar');
  await expect(page.getByRole('heading', { name: 'Importar clientas' })).toBeVisible({ timeout: 60_000 });
  return { importadas, preguntas };
}

/** Un pegado de verdad: se escribe en el portapapeles y se pega con el teclado (evento de confianza). */
async function pegar(page: Page, texto: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((t) => navigator.clipboard.writeText(t), texto);
  await page.getByRole('textbox', { name: CUADRO }).focus();
  await page.keyboard.press('ControlOrMeta+V');
}

/** El número grande de un contador del paso 2, exacto (no vale «12» por «2»). */
const contador = (page: Page, etiqueta: string) =>
  page.getByText(etiqueta, { exact: true }).locator('xpath=preceding-sibling::p[1]');

test('apagado: el importador es el de siempre, sin cuadro para pegar (y sí se preguntó)', async ({ page }) => {
  const { preguntas } = await montarCon(page, { encendido: false });
  await expect(page.getByText('Arrastra tu CSV o Excel aquí')).toBeVisible();
  await expect.poll(() => preguntas.interruptores, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByRole('textbox', { name: CUADRO })).toHaveCount(0);
  await expect(page.getByText('Subir archivo', { exact: true })).toBeVisible();
});

test('encendido: pegar lleva a la vista previa; nada se envía hasta «Importar», y la columna de salud no viaja', async ({ page }) => {
  const { importadas } = await montarCon(page, { encendido: true });
  await pegar(page, PEGADO);

  await expect(page.getByText('Pegado desde tu hoja')).toBeVisible({ timeout: 20_000 });
  await expect(contador(page, 'Listos para importar')).toHaveText('2');
  await expect(page.getByRole('checkbox', { name: 'La primera fila son los títulos' })).toBeChecked();
  // La coma de «García López, de Madrid» no partió la celda.
  await expect(page.locator('table')).toContainText('García López, de Madrid');
  // Se avisa de la columna de salud (sin relacionar: no bloquea).
  await expect(page.getByText(/La columna «Lesiones» parece de salud/)).toBeVisible();
  expect(importadas).toHaveLength(0);

  await page.getByRole('button', { name: 'Importar 2 clientas' }).click();
  await expect(page.getByText('2 clientas importadas')).toBeVisible({ timeout: 20_000 });
  expect(importadas).toHaveLength(1);
  expect(importadas[0]).toContain('ana.pegada@example.com');
  expect(importadas[0]).not.toContain('Hernia');
  expect(importadas[0]).not.toContain('Embarazo');
});

test('relacionar a mano la columna de salud no deja importar', async ({ page }) => {
  const { importadas } = await montarCon(page, { encendido: true });
  await pegar(page, PEGADO);
  await expect(page.getByText('Pegado desde tu hoja')).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Etiquetas').selectOption({ label: 'Lesiones' });
  await expect(page.getByRole('alert').filter({ hasText: '«Lesiones» parece de salud y está relacionada con «Etiquetas»' })).toBeVisible();
  const boton = page.getByRole('button', { name: /Importar 2 clientas/ });
  await expect(boton).toBeDisabled();
  await boton.click({ force: true });
  expect(importadas).toHaveLength(0);

  await page.getByLabel('Etiquetas').selectOption({ label: '— Sin asignar —' });
  await expect(boton).toBeEnabled();
});

test('sin títulos (pegado desde el menú): la casilla lo corrige sin perder lo relacionado', async ({ page }) => {
  const { importadas } = await montarCon(page, { encendido: true });
  // Sin evento con texto (hay teclados de móvil así): queda en el cuadro y se revisa con el botón.
  await page.getByRole('textbox', { name: CUADRO })
    .fill('Ana García\tana.pegada@example.com\t600123456\nBea Ruiz\tbea.pegada@example.com\t611654321');
  await page.getByRole('button', { name: 'Revisar lo pegado' }).click();

  const casilla = page.getByRole('checkbox', { name: 'La primera fila son los títulos' });
  await expect(casilla).not.toBeChecked();
  await expect(contador(page, 'Listos para importar')).toHaveText('2');
  await expect(page.getByLabel('Email')).toHaveValue('1');
  await expect(page.getByLabel('Nombre')).toHaveValue('0');

  // Marcarla convierte la primera fila en títulos: queda una lista, y el mapeo sigue.
  await casilla.check();
  await expect(contador(page, 'Listos para importar')).toHaveText('1');
  await expect(page.getByLabel('Email')).toHaveValue('1');
  expect(importadas).toHaveLength(0);
});

test('si el servidor no importa, se dice (y sí se intentó)', async ({ page }) => {
  const { importadas } = await montarCon(page, { encendido: true, importar: { status: 500, body: { error: 'fallo' } } });
  await pegar(page, PEGADO);
  await page.getByRole('button', { name: 'Importar 2 clientas' }).click();
  await expect.poll(() => importadas.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.getByText('La importación falló')).toBeVisible();
  await expect(page.getByText(/clientas importadas/)).toHaveCount(0);
});

test('más de 5.000 listas: se dice antes y el botón no envía nada', async ({ page }) => {
  const { importadas } = await montarCon(page, { encendido: true });
  const muchas = ['Nombre\tEmail', ...Array.from({ length: 5001 }, (_, i) => `N${i}\tn${i}.pegada@example.com`)].join('\n');
  await pegar(page, muchas);
  await expect(page.getByRole('alert').filter({ hasText: 'se importan como mucho 5000 de una vez' })).toBeVisible({ timeout: 30_000 });
  const boton = page.getByRole('button', { name: /Importar 5001 clientas/ });
  await expect(boton).toBeDisabled();
  await boton.click({ force: true });
  expect(importadas).toHaveLength(0);
});
