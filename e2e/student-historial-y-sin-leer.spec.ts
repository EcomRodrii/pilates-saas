import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Dos cosas que la app decía mal sin que ningún test mirara:
//
// 1. El historial de «Mis clases» llamaba «Cancelada» a TODO lo que no fuera
//    asistida o ausencia. Al historial llegan también las CONFIRMADA de clases
//    ya pasadas en las que el estudio no pasó lista —en producción las hay, lo
//    documenta la propia pantalla—, así que a una socia que reservó y fue se le
//    decía que había cancelado.
//
// 2. El punto de «sin leer» de Avisos era `--success`, el color que la hoja
//    reserva para «Reservada ✓». Mensajes, la bandeja hermana, ya usaba el
//    acento.

const base = `/portal/${SLUG}`;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function mocksComunes(page: Page) {
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

test.describe('Student PWA · el historial no llama cancelada a lo que no se canceló', () => {
  test.describe.configure({ timeout: 120_000 });

  test('una clase reservada y nunca marcada dice «Reservada», no «Cancelada»', async ({ page }) => {
    await sembrarSociaLista(page);
    await mocksComunes(page);
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
    const f = fixtureSociaLista();
    const b = f.sesiones[0];
    f.tiposClase = [
      { ...f.tiposClase[0], id: 'tc-ref', nombre: 'Reformer' },
      { ...f.tiposClase[0], id: 'tc-mat', nombre: 'Mat Pilates' },
      { ...f.tiposClase[0], id: 'tc-bar', nombre: 'Barre' },
    ] as typeof f.tiposClase;
    // Desfase EXPLÍCITO: días pasados en Madrid, en cualquier máquina.
    f.sesiones = [
      { ...b, id: 'p-ref', tipoClaseId: 'tc-ref', inicio: '2026-08-10T10:00:00+02:00', fin: '2026-08-10T10:50:00+02:00' },
      { ...b, id: 'p-mat', tipoClaseId: 'tc-mat', inicio: '2026-08-07T18:00:00+02:00', fin: '2026-08-07T18:50:00+02:00' },
      { ...b, id: 'p-bar', tipoClaseId: 'tc-bar', inicio: '2026-08-05T09:00:00+02:00', fin: '2026-08-05T09:50:00+02:00' },
    ] as typeof f.sesiones;
    const s = f.socia as unknown as Record<string, unknown>;
    s.reservas = [
      // ⚠️ El caso que importa: CONFIRMADA de una clase que YA pasó. El estado
      // es el real de `reservas.estado` —no uno inventado—; el que no existe
      // (`NO_SHOW`, que solo es un tipo de penalización) caía en el mismo
      // `else` y fue lo que destapó esto.
      { id: 'r-ref', socioId: SOCIO_ID, sesionId: 'p-ref', estado: 'CONFIRMADA', creadoEn: '2026-08-01T09:00:00Z' },
      { id: 'r-mat', socioId: SOCIO_ID, sesionId: 'p-mat', estado: 'CANCELADA', creadoEn: '2026-08-01T09:00:00Z' },
      { id: 'r-bar', socioId: SOCIO_ID, sesionId: 'p-bar', estado: 'ASISTIDA', creadoEn: '2026-08-01T09:00:00Z' },
    ];
    await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));

    await page.goto(`${base}/mis-reservas`);
    await page.getByRole('tab', { name: 'Historial' }).click({ timeout: 30_000 });

    const fila = (clase: string) => page.getByRole('link', { name: new RegExp('^' + clase) });
    await expect(fila('Reformer')).toContainText('Reservada', { timeout: 30_000 });
    await expect(fila('Reformer')).not.toContainText('Cancelada');
    // La cancelación de verdad y la asistencia siguen diciéndose igual.
    await expect(fila('Mat Pilates')).toContainText('Cancelada');
    await expect(fila('Barre')).toContainText('Asistida');
    void STUDIO_ID;
  });
});

test.describe('Student PWA · el punto de «sin leer» no usa el verde de «Reservada»', () => {
  test.describe.configure({ timeout: 120_000 });

  test('en Avisos el punto es del color de acento, como en Mensajes', async ({ page }) => {
    await sembrarSociaLista(page);
    await mocksComunes(page);
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({
      items: [{
        id: 'n1', title: 'Tu clase es mañana', body: 'Reformer a las 10:00.', category: 'reservas',
        eventType: 'reserva.recordatorio_24h', createdAt: '2026-08-11T18:00:00Z', readAt: null,
      }],
      unread: 1,
    })));
    await page.route('**/api/public/studio-data', (r) => r.fulfill(json(fixtureSociaLista())));

    await page.goto(`${base}/notificaciones`);
    // ⚠️ `exact: true`. La campana de la cabecera se etiqueta «Notificaciones,
    // 1 sin leer», y `getByLabel` casa por subcadena sin mirar mayúsculas: sin
    // esto `.first()` medía la CAMPANA —tarjeta blanca— y el test daba un rojo
    // que parecía un fallo del producto. Tercera vez la misma trampa en esta
    // app (`hasText: 'Ana'`, `getByText('Pendiente')`).
    const punto = page.getByLabel('Sin leer', { exact: true }).first();
    await expect(punto).toBeVisible({ timeout: 30_000 });
    // Se compara el color PINTADO con el valor resuelto de cada token en esa
    // misma pantalla: así vale para cualquier marca de estudio, que tiñe el
    // acento pero no `--success`.
    const { fondo, acento, exito } = await punto.evaluate((el) => {
      const raiz = el.closest('.student-app') ?? document.documentElement;
      const probar = (v: string) => {
        const s = document.createElement('span');
        s.style.background = `var(${v})`;
        raiz.appendChild(s);
        const c = getComputedStyle(s).backgroundColor;
        s.remove();
        return c;
      };
      return { fondo: getComputedStyle(el).backgroundColor, acento: probar('--accent'), exito: probar('--success') };
    });
    expect(acento, 'el andamiaje tiene que dar tokens distintos o el test no prueba nada').not.toBe(exito);
    expect(fondo).toBe(acento);
  });
});
