import { test, expect, type Locator, type Page } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Los diálogos y popovers de Base UI del panel, abiertos: lo que el barrido de
// contraste no ve porque está «detrás de un clic».
//
// Iban a <body> (Base UI cuelga ahí lo que no tiene `container`), fuera del
// <div> que lleva `.dark`: en modo oscuro TODOS los diálogos del panel salían
// blancos. Y su margen del móvil vivía en el `max-w-*` que cada diálogo pisa,
// así que a 390 px tocaban los dos bordes. La hermana de esta prueba para las
// hojas está en `panel-personalizar.spec.ts` («Modo oscuro — las hojas»).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 60_000 });

// Una regla que escribe a las clientas, apagada: encenderla pide confirmación
// en un diálogo con `className="max-w-md"`, el patrón de medio panel.
const REGLA = {
  id: 'rule-1', studio_id: 'studio-test', nombre: 'Recuperar a quien deja de venir',
  descripcion: 'Escribe a la clienta que lleva 14 días sin reservar.', icono: 'user',
  trigger: 'AUSENCIA_DIAS', condicion: { dias: 14 }, pasos: [], activa: false,
  ejecutada_veces: 0, ultima_ejecucion: null, creada_en: '2026-09-01T09:00:00Z',
};

async function abrirConfirmacion(page: Page): Promise<Locator> {
  // Después de `montar`: Playwright da prioridad a la ruta registrada más tarde.
  await page.route('**/rest/v1/automation_rules**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([REGLA]) }));
  await ir(page, 'automatizaciones');
  await page.getByRole('button', { name: 'Reglas', exact: true }).click();
  await page.getByRole('switch', { name: /Activar la automatización Recuperar/ }).click();
  const dialogo = page.getByRole('dialog').filter({ hasText: 'Esto va a escribir a tus clientas' });
  await expect(dialogo).toBeVisible();
  // Que termine de crecer (`.panel-dialogo` entra con escala): medir a mitad da otra caja.
  await expect.poll(() => dialogo.evaluate(el => el.getAnimations().every(a => a.playState !== 'running'))).toBe(true);
  return dialogo;
}

/**
 * El fondo del elemento, el de `bg-popover` dentro del panel y el de fuera.
 *
 * Se compara contra una muestra en vez de medir luminancia: el color sale en el
 * formato que el navegador quiera (oklab incluido) y aquí solo importa que sea
 * el MISMO que pinta el panel oscuro, y que ese no sea el claro.
 */
async function fondos(el: Locator) {
  return el.evaluate((nodo) => {
    const muestra = (padre: Element) => {
      const d = document.createElement('div');
      d.className = 'bg-popover';
      padre.appendChild(d);
      const c = getComputedStyle(d).backgroundColor;
      d.remove();
      return c;
    };
    return {
      propio: getComputedStyle(nodo).backgroundColor,
      delPanel: muestra(document.getElementById('panel-portal-host')!),
      deFuera: muestra(document.body),
      dentroDeDark: Boolean(nodo.closest('.dark')),
    };
  });
}

test('en oscuro, un diálogo del panel es oscuro y cuelga de `.dark`', async ({ page }) => {
  await montar(page);
  await enOscuro(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const dialogo = await abrirConfirmacion(page);

  const f = await fondos(dialogo);
  expect(f.dentroDeDark, 'el diálogo no cuelga del contenedor con .dark: sigue portaleado a <body>').toBe(true);
  expect(f.delPanel, 'la muestra del panel no es oscura: la prueba no está en modo oscuro').not.toBe(f.deFuera);
  expect(f.propio, 'el diálogo no pinta el fondo del panel oscuro').toBe(f.delPanel);

  // Y sigue siendo un diálogo: se cierra con su botón.
  await dialogo.getByRole('button', { name: 'No, dejarla pausada' }).click();
  await expect(dialogo).toBeHidden();
});

test('en el móvil, el diálogo deja margen a los dos lados aunque pida `max-w-md`', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const dialogo = await abrirConfirmacion(page);

  const caja = (await dialogo.boundingBox())!;
  // 1rem por lado (16 px); medio píxel de holgura por el redondeo del centrado.
  expect(caja.x, 'pegado al borde izquierdo').toBeGreaterThanOrEqual(15.5);
  expect(390 - (caja.x + caja.width), 'pegado al borde derecho').toBeGreaterThanOrEqual(15.5);
});

test('en oscuro, la ayuda de pantalla (popover) también es oscura', async ({ page }) => {
  await montar(page);
  await enOscuro(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'automatizaciones');
  await page.locator('[data-slot="ayuda-pantalla-trigger"]').first().click();
  const ayuda = page.locator('[data-slot="ayuda-pantalla"]');
  await expect(ayuda).toBeVisible();

  const f = await fondos(ayuda);
  expect(f.dentroDeDark, 'la ayuda no cuelga del contenedor con .dark').toBe(true);
  expect(f.propio).toBe(f.delPanel);
});
