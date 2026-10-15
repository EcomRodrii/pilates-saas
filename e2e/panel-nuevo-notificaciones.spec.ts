import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La campana en el panel nuevo (interruptor `panelNuevo`), como «Todas las
// notificaciones» de Bonsai: un cajón a toda altura en vez del desplegable, los
// avisos por día (Hoy, Ayer, Esta semana, Antes) y la fecha exacta junto al
// «hace…». Archivar y «Marcar todas» pintan al momento y, si el servidor dice
// que no, lo deshacen: con un 500 el aviso vuelve a su sitio.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const HACE_DIEZ_DIAS = () => new Date(Date.now() - 10 * 86_400_000).toISOString();

async function abrir(page: Page, opts: { panelNuevo?: boolean; falloEscritura?: 500 } = {}) {
  const escrituras: { action: string; id?: string }[] = [];
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: opts.panelNuevo ?? true,
  }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => {
    if (r.request().method() === 'PATCH') {
      escrituras.push(r.request().postDataJSON());
      return opts.falloEscritura ? json(r, { error: 'interno' }, opts.falloEscritura) : json(r, { ok: true });
    }
    // «Hoy» se calcula al pedirlo: un aviso de hace un momento es de hoy.
    const ahora = new Date().toISOString();
    return json(r, {
      items: [
        { id: 'nt-hoy', title: 'Reserva pendiente de aprobación', body: 'Carmen quiere entrar en Reformer de mañana.', category: 'reservas', priority: 'ALTA', eventType: 'reserva.pendiente_aprobacion', createdAt: ahora, readAt: null, deepLink: '/calendario' },
        { id: 'nt-antes', title: 'Un recibo ha fallado', body: 'La tarjeta ha sido rechazada.', category: 'pagos', priority: 'MEDIA', eventType: 'pago.fallido', createdAt: HACE_DIEZ_DIAS(), readAt: null, deepLink: '/cobros' },
      ],
      unread: 2,
    });
  });
  await ir(page, 'dashboard');
  await page.getByRole('button', { name: 'Notificaciones', exact: true }).click();
  return { escrituras, cajon: page.getByRole('dialog', { name: 'Todas las notificaciones' }) };
}

test('la campana abre el cajón con los avisos por día, y se cierra con Escape', async ({ page }) => {
  const { cajon } = await abrir(page);
  await expect(cajon).toBeVisible({ timeout: 30_000 });
  await expect(cajon.getByText('2 sin leer')).toBeVisible();
  await expect(cajon.getByRole('region', { name: 'Hoy' }).getByText('Reserva pendiente de aprobación')).toBeVisible();
  await expect(cajon.getByRole('region', { name: 'Antes' }).getByText('Un recibo ha fallado')).toBeVisible();
  // La fecha exacta junto al «hace…».
  await expect(cajon.getByRole('region', { name: 'Antes' }).getByText(/· hace 10 d/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cajon).toHaveCount(0);
});

test('archivar lo quita con UNA escritura y lo dice el contador', async ({ page }) => {
  const { escrituras, cajon } = await abrir(page);
  await cajon.getByRole('button', { name: 'Archivar «Un recibo ha fallado»' }).click();
  await expect(cajon.getByText('Un recibo ha fallado')).toHaveCount(0);
  await expect(cajon.getByText('1 sin leer')).toBeVisible();
  await expect.poll(() => escrituras.length).toBe(1);
  expect(escrituras[0]).toMatchObject({ action: 'archive', id: 'nt-antes' });
});

test('con un 500 el aviso archivado vuelve y «Marcar todas» se deshace', async ({ page }) => {
  const { escrituras, cajon } = await abrir(page, { falloEscritura: 500 });
  await cajon.getByRole('button', { name: 'Archivar «Un recibo ha fallado»' }).click();
  await expect.poll(() => escrituras.length, 'intentos de escribir').toBeGreaterThan(0);
  await expect(cajon.getByRole('region', { name: 'Antes' }).getByText('Un recibo ha fallado')).toBeVisible();
  await expect(cajon.getByText('2 sin leer')).toBeVisible();

  await cajon.getByRole('button', { name: 'Marcar todas como leídas' }).click();
  await expect.poll(() => escrituras.filter(e => e.action === 'read-all').length).toBe(1);
  await expect(cajon.getByText('2 sin leer')).toBeVisible();
  await expect(cajon.getByText('Todo leído')).toHaveCount(0);
});

test('sin el panel nuevo, la campana sigue siendo el desplegable de siempre', async ({ page }) => {
  await abrir(page, { panelNuevo: false });
  await expect(page.getByText('Reserva pendiente de aprobación')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog', { name: 'Todas las notificaciones' })).toHaveCount(0);
});
