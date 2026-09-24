import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El menú de perfil tiene que quedar POR ENCIMA de la barra de filtros de la
// pantalla (Equipo, Clientas…).
//
// El fallo: la barra superior del panel es `sticky z-30` y las pantallas llevan
// su propia barra de filtros `sticky z-30`. Con el mismo z-index gana la que va
// más abajo en el DOM, y el menú de perfil (que vive dentro de la barra superior)
// se quedaba debajo de los filtros: «Cambiar de sede» y lo de después, tapados.
//
// Se comprueba por QUÉ elemento recibe el clic en varios puntos del menú, no por
// un z-index: lo que importa es lo que ve y toca la persona.
// ─────────────────────────────────────────────────────────────────────────────
// Baja a propósito: hace falta scroll para que la barra de filtros quede PEGADA
// bajo la barra superior, que es donde el menú se le cruza. Sin bajar, la barra
// está más abajo, no se cruzan y el test pasaría con o sin el arreglo.
test.use({ viewport: { width: 1280, height: 560 } });

test('el menú de perfil no queda tapado por la barra de filtros de Equipo', async ({ page }) => {
  await montar(page);
  // La barra de filtros solo existe si hay tarjetas de equipo.
  const M = (o: Record<string, unknown>) => ({ avatar: null, fotoUrl: null, activo: true, conAcceso: true, esYo: false, email: null, telefono: null, enClaseAhora: false, claseHoyLabel: null, proximaClaseIso: null, ultimaClaseIso: null, clasesUltimos90Dias: 10, semana: [1, 0, 0, 0, 0, 0, 0], horasDia: ['10:00', null, null, null, null, null, null], ocupacionPct: 80, valoracion: null, horasMes: 4, costeMes: null, coincideContigo: null, disponibilidadActualizadaEn: null, ...o });
  await page.route((u) => u.pathname === '/api/equipo/tarjetas', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    // Doce miembros: hace falta una pantalla lo bastante alta para poder bajar
    // y que la barra de filtros se quede pegada arriba, que es donde se cruza.
    body: JSON.stringify({ items: Array.from({ length: 12 }, (_, i) => M({ id: `ins-${i}`, nombre: `Instructora ${String.fromCharCode(65 + i)}`, rol: 'INSTRUCTOR', color: '#D9C29E' })) }),
  }));
  await ir(page, 'equipo');

  const filtros = page.getByText('Ordenar', { exact: false }).first();
  await expect(filtros).toBeVisible({ timeout: 30_000 });

  // Con la pantalla bajada, la barra de filtros se queda pegada arriba (sticky).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Abrir menú de perfil' }).click();
  const cerrar = page.getByText('Cerrar sesión', { exact: true });
  await expect(cerrar).toBeVisible();

  // En cada punto del menú (arriba, medio y el último renglón) tiene que
  // responder EL MENÚ, no la barra de filtros que hay debajo.
  const menu = page.locator('.menu-pop-in').first();
  const caja = await menu.boundingBox();
  expect(caja).not.toBeNull();
  const puntos = [0.1, 0.35, 0.6, 0.9].map((f) => ({ x: caja!.x + caja!.width / 2, y: caja!.y + caja!.height * f }));
  for (const p of puntos) {
    const dentroDelMenu = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest('.menu-pop-in');
    }, p);
    expect(dentroDelMenu, `en (${Math.round(p.x)}, ${Math.round(p.y)}) responde el menú`).toBe(true);
  }
});
