import { test, expect, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, sembrarSociaLista } from './socia-lista';

// La bandeja de avisos: qué CARA lleva cada mensaje.
//
// ⚠️ El icono es lo único que distingue un aviso de otro —el disco no cambia de
// color— y salía de la CATEGORÍA, no del evento. La categoría `reservas` caía en
// el 🎉 de «se ha liberado una plaza», y ahí viven también «tu reserva se ha
// cancelado» y «no terminaste tu reserva»: en producción, 26 cancelaciones y 12
// abandonos entregados a alumnas, todos con confeti. `clases` caía en el ⏰ de
// recordatorio, y ahí vive «se ha cancelado tu clase»: un despertador para
// avisar de que no hay clase a la que despertarse.
//
// Se prueba en la PANTALLA porque el unitario cubre la decisión; esto comprueba
// que la decisión llega hasta el emoji que se ve.

const base = `/portal/${SLUG}`;

/** Eventos reales del catálogo, con el emoji que les toca. */
const AVISOS: Array<{ id: string; eventType: string; category: string; title: string; icono: string }> = [
  { id: 'n-lib', eventType: 'reserva.plaza_liberada', category: 'reservas', title: 'Se ha liberado una plaza', icono: '🎉' },
  { id: 'n-can', eventType: 'reserva.cancelada', category: 'reservas', title: 'Tu reserva se ha cancelado', icono: '⚠️' },
  { id: 'n-aba', eventType: 'reserva.abandonada', category: 'reservas', title: 'No terminaste tu reserva', icono: '⚠️' },
  { id: 'n-rec', eventType: 'reserva.recordatorio_1h', category: 'reservas', title: 'Tu clase es dentro de 1 hora', icono: '⏰' },
  { id: 'n-cla', eventType: 'clase.cancelada', category: 'clases', title: 'Se ha cancelado tu clase', icono: '⚠️' },
  { id: 'n-pag', eventType: 'pago.fallido', category: 'pagos', title: 'No hemos podido cobrarte', icono: '⚠️' },
  { id: 'n-bon', eventType: 'bono.por_caducar', category: 'pagos', title: 'Tu bono caduca pronto', icono: '🎟' },
  { id: 'n-val', eventType: 'clase.valorar', category: 'reservas', title: '¿Qué tal la clase?', icono: '⭐' },
  { id: 'n-com', eventType: 'comunidad.post_nuevo', category: 'mensajeria', title: 'Novedad en la comunidad', icono: '📣' },
];

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({
    items: AVISOS.map((a, i) => ({
      id: a.id, title: a.title, body: 'Cuerpo del aviso.', category: a.category, eventType: a.eventType,
      createdAt: '2026-08-11T18:00:00Z', readAt: i % 2 ? '2026-08-11T19:00:00Z' : null,
    })),
    unread: AVISOS.filter((_, i) => !(i % 2)).length,
  })));
}

test.describe('Student PWA · la cara de cada aviso', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('cada aviso lleva el icono que le corresponde, no el de su categoría', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/notificaciones`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Tu reserva se ha cancelado')).toBeVisible({ timeout: 30_000 });

    for (const a of AVISOS) {
      const fila = page.getByText(a.title, { exact: true }).locator('xpath=ancestor::*[self::a or self::div][1]/..');
      const texto = await fila.first().innerText();
      expect(texto, `«${a.title}» no lleva ${a.icono}`).toContain(a.icono);
    }
  });

  test('ninguna mala noticia se celebra', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/notificaciones`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Tu reserva se ha cancelado')).toBeVisible({ timeout: 30_000 });

    for (const malo of ['Tu reserva se ha cancelado', 'No terminaste tu reserva', 'Se ha cancelado tu clase', 'No hemos podido cobrarte']) {
      const fila = page.getByText(malo, { exact: true }).locator('xpath=ancestor::*[self::a or self::div][1]/..');
      const texto = await fila.first().innerText();
      expect(texto, `confeti encima de «${malo}»`).not.toContain('🎉');
      expect(texto, `un despertador encima de «${malo}»`).not.toContain('⏰');
    }
    // Y el 🎉 sigue existiendo donde sí toca: esto no es «quitar el confeti».
    const buena = page.getByText('Se ha liberado una plaza', { exact: true }).locator('xpath=ancestor::*[self::a or self::div][1]/..');
    expect(await buena.first().innerText()).toContain('🎉');
  });
});
