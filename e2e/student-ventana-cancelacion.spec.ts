import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, AHORA, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La ventana de cancelación que se le DICE a la alumna.
//
// ⚠️ El bug no estaba en la decisión —`avisoCancelacion` ya resolvía la cascada
// «ventana del tipo de clase manda sobre la del estudio»— sino en la FRASE: dos
// pantallas decidían con la resuelta y escribían la del estudio. Con un tipo que
// exige 24 h y un estudio que pide 12, cancelar 18 h antes pintaba el aviso
// ámbar (correcto) y a la vez decía «Quedan menos de 12 h», que es falso y se
// contradice solo: si quedaran menos de 12, el aviso no sería una advertencia,
// sería un hecho.
//
// Se prueba en la PANTALLA porque el unitario del helper ya pasaba: lo que
// fallaba era el sitio donde se pinta.

const base = `/portal/${SLUG}`;
// La clase del fixture es a las 10:00 y el reloj está a las 08:00 del mismo día.
const AHORA_MS = new Date(AHORA).getTime();

async function montar(page: Page, o: { ventanaTipo: number | null; ventanaEstudio: number; horasAntes: number }) {
  await page.clock.install({ time: new Date(new Date('2026-08-12T10:00:00').getTime() - o.horasAntes * 36e5) });
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.studio as Record<string, unknown>).cancelacionVentanaHoras = o.ventanaEstudio;
  (f.tiposClase as Record<string, unknown>[])[0].ventanaCancelacionHoras = o.ventanaTipo;
  (f.socia as Record<string, unknown>).reservas = [
    { id: 'res-1', socioId: SOCIO_ID, sesionId: 'ses-10', estado: 'CONFIRMADA', creadoEn: '2026-08-01T09:00:00Z' },
  ];
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  void STUDIO_ID; void AHORA_MS;
}

test.describe('Student PWA · la ventana de cancelación que se le dice', () => {
  test.describe.configure({ timeout: 120_000 });

  test('el diálogo cita la ventana DEL TIPO de clase, no la del estudio', async ({ page }) => {
    // Tipo 24 h, estudio 12 h, faltan 18: fuera de plazo por el tipo.
    await montar(page, { ventanaTipo: 24, ventanaEstudio: 12, horasAntes: 18 });
    await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Cancelar$/ }).first().click({ timeout: 30_000 });
    const texto = await page.locator('body').innerText();
    expect(texto).toContain('Quedan menos de 24 h');
    expect(texto, 'sigue citando la ventana del estudio').not.toContain('Quedan menos de 12 h');
  });

  test('sin ventana propia del tipo, se cita la del estudio', async ({ page }) => {
    await montar(page, { ventanaTipo: null, ventanaEstudio: 12, horasAntes: 6 });
    await page.goto(`${base}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Cancelar$/ }).first().click({ timeout: 30_000 });
    await expect(page.getByText('Quedan menos de 12 h')).toBeVisible({ timeout: 15_000 });
  });

  test('la ficha de la clase promete el plazo con la ventana resuelta', async ({ page }) => {
    // Tipo 1 h, estudio 12: a 2 h vista está DENTRO de plazo por el tipo, y el
    // «gratis hasta» tiene que decir 1, que es lo que de verdad se aplica.
    // (Sin mover el reloj: reinstalarlo deja la ficha en «Cargando…».)
    await montar(page, { ventanaTipo: 1, ventanaEstudio: 12, horasAntes: 2 });
    await page.goto(`${base}/reservar/ses-10`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Gratis hasta 1 h antes')).toBeVisible({ timeout: 30_000 });
  });
});
