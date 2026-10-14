import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';
import { accesoProducto, tieneFeature } from '../lib/billing/entitlements.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Módulos en el panel nuevo (interruptor `panelNuevo`), calcada sobre la de
// Bonsai (b-74): la cabecera con activos y total, el buscador, los grupos con
// su frase y cada módulo con su chapa, su interruptor e «Ir →».
//
// Lo que se prueba de verdad es la escritura: activar guarda al momento;
// ocultar pregunta ANTES, diciendo qué deja de verse, qué notan las alumnas y
// —con su cifra— lo que les toca; y nada cambia en pantalla hasta que el
// servidor ha guardado. Cada camino de fallo lleva su contador de peticiones:
// «no mintió» sin un intento de escribir no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const LAYOUT = { orden: [], ocultos: [] as string[], menuPosition: 'lateral', home: { orden: [], ocultos: [] } };
const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};

async function abrir(page: Page, o: {
  ocultos?: string[];
  plan?: string; estado?: string | null;
  put?: (r: Route, cuerpo: Record<string, unknown>) => Promise<void> | void;
  rol?: 'MANAGER';
  automatizaciones?: number;
} = {}) {
  await montar(page);
  let ocultos = o.ocultos ?? [];
  const cuenta = { puts: [] as Record<string, unknown>[] };
  // Después de `montar`: ganan a sus comodines.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await page.route('**/rest/v1/studios**', (r) => json(r, { ...STUDIO, plan: o.plan ?? 'ESTUDIO', subscription_status: o.estado === undefined ? 'active' : o.estado }));
  if (o.rol) {
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-yo', studio_id: STUDIO.id, nombre: 'Gerente', activo: true, rol: o.rol, color: '#5A6142', auth_user_id: 'auth-e2e-duena' },
    ]));
  }
  if (o.automatizaciones) {
    await page.route('**/rest/v1/automatizaciones**', (r) => json(r, Array.from({ length: o.automatizaciones! }, (_, i) => ({
      id: `aut-${i}`, studio_id: STUDIO.id, nombre: `Aviso ${i}`, trigger: 'CUMPLEANOS', accion: 'EMAIL',
      asunto: 'Hola', mensaje: 'Hola', activa: true, ejecutadas: 0, creada_en: '2026-01-01T00:00:00Z', pasos: null,
    }))));
  }
  await page.route('**/api/layout**', async (r) => {
    if (r.request().method() === 'PUT') {
      const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
      cuenta.puts.push(cuerpo);
      if (o.put) return o.put(r, cuerpo);
      ocultos = (cuerpo.ocultos as string[]) ?? ocultos;
      // El PUT real devuelve la configuración entera ya fusionada.
      return json(r, { ...LAYOUT, ocultos });
    }
    return json(r, { ...LAYOUT, ocultos });
  });
  await ir(page, 'explorar-funciones');
  await expect(page.getByTestId('modulos-nuevo')).toBeVisible({ timeout: 60_000 });
  return cuenta;
}

const tarjeta = (page: Page, href: string) => page.locator(`[data-testid="modulo-nuevo"][data-modulo="${href}"]`);
const enElMenu = (page: Page, nombre: string) => page.locator('aside').getByRole('link', { name: nombre, exact: true });
const cifra = (page: Page, etiqueta: 'Activos' | 'En total') =>
  page.getByTestId('cifras-modulos').getByText(etiqueta, { exact: true }).locator('xpath=preceding-sibling::p[1]');

test('como Bonsai: cabecera con activos y total, buscador, grupos con su frase y cada módulo con chapa, interruptor e «Ir»', async ({ page }) => {
  await abrir(page, { ocultos: ['/informes'] });
  await expect(page.getByRole('heading', { level: 1, name: 'Módulos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personaliza tu plataforma' })).toBeVisible();
  const total = await page.getByTestId('modulo-nuevo').count();
  await expect(cifra(page, 'En total')).toHaveText(String(total));
  await expect(cifra(page, 'Activos')).toHaveText(String(total - 1));

  // Los grupos, con su frase.
  for (const [grupo, frase] of [['Operación', 'Clases, citas, alumnas'], ['Negocio', 'Lo que vendes, lo que cobras']]) {
    const g = page.getByRole('region', { name: grupo });
    await expect(g).toBeVisible();
    await expect(g.getByText(new RegExp(frase))).toBeVisible();
  }

  // Cada módulo: su chapa, su interruptor y su «Ir».
  const citas = tarjeta(page, '/citas');
  await expect(citas.getByTestId('chapa-modulo')).toHaveText('Activo');
  await expect(citas.getByRole('switch', { name: 'Citas en el menú' })).toHaveAttribute('aria-checked', 'true');
  await expect(citas.getByRole('link', { name: 'Ir a Citas' })).toHaveAttribute('href', '/citas');
  await expect(tarjeta(page, '/informes').getByTestId('chapa-modulo')).toHaveText('Oculto');
  // Lo fijo no se oculta: sin interruptor.
  await expect(tarjeta(page, '/configuracion').getByTestId('chapa-modulo')).toHaveText('Siempre activo');
  await expect(tarjeta(page, '/configuracion').getByRole('switch')).toHaveCount(0);

  // El buscador filtra por nombre y por lo que hace, sin tildes.
  await page.getByRole('searchbox', { name: 'Buscar un módulo' }).fill('festivo');
  await expect(page.getByTestId('modulo-nuevo')).toHaveCount(1);
  await expect(tarjeta(page, '/festivos')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar un módulo' }).fill('zzz');
  await expect(page.getByText('Ningún módulo se llama así')).toBeVisible();
});

test('activar un módulo oculto guarda al momento: solo `ocultos`, y la tarjeta y el menú cambian cuando el servidor contesta', async ({ page }) => {
  const cuenta = await abrir(page, { ocultos: ['/informes'] });
  const interruptor = tarjeta(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await expect(enElMenu(page, 'Informes')).toHaveCount(0);
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  expect(cuenta.puts).toEqual([{ ocultos: [] }]);
  await expect(tarjeta(page, '/informes').getByTestId('chapa-modulo')).toHaveText('Activo');
  await expect(enElMenu(page, 'Informes')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Informes vuelve a estar en tu menú' })).toBeVisible();
});

test('ocultar pregunta antes: qué deja de verse, qué notan las alumnas y qué sigue igual; «Cancelar» no escribe nada', async ({ page }) => {
  const cuenta = await abrir(page);
  await tarjeta(page, '/calendario').getByRole('switch', { name: 'Calendario en el menú' }).click();
  const dialogo = page.getByRole('dialog', { name: '¿Ocultar Calendario?' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('region', { name: 'Deja de verse' })).toContainText('«Calendario» en el menú, para ti y para tu equipo.');
  await expect(dialogo.getByRole('region', { name: 'Deja de verse' })).toContainText('Su botón en la barra de abajo del móvil.');
  await expect(dialogo.getByRole('region', { name: 'En la app de tus alumnas' })).toContainText('siguen viendo tus clases y reservando');
  await expect(dialogo.getByRole('region', { name: 'Sigue igual' })).toContainText('No se borra nada');
  // Hay reservas por delante en el estudio sembrado: el aviso las cuenta.
  await expect(dialogo.getByTestId('aviso-ocultar')).toContainText(/Hay \d+ reservas? en tus próximas clases/);

  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
  expect(cuenta.puts).toHaveLength(0);
  await expect(tarjeta(page, '/calendario').getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

test('con automatizaciones encendidas, ocultarlas avisa de que seguirán escribiendo a las alumnas', async ({ page }) => {
  await abrir(page, { automatizaciones: 2 });
  await tarjeta(page, '/automatizaciones').getByRole('switch').click();
  const dialogo = page.getByRole('dialog', { name: '¿Ocultar Automatizaciones?' });
  await expect(dialogo.getByTestId('aviso-ocultar')).toContainText('Tienes 2 automatizaciones encendidas: seguirán escribiendo a tus alumnas.');
  await expect(dialogo.getByRole('region', { name: 'En la app de tus alumnas' })).toContainText('Les siguen llegando los mensajes');
});

test('confirmar ocultar manda solo `ocultos`; la tarjeta, el contador y el menú cambian, y «Deshacer» lo devuelve', async ({ page }) => {
  const cuenta = await abrir(page);
  const total = await page.getByTestId('modulo-nuevo').count();
  await expect(enElMenu(page, 'Informes')).toBeVisible();
  await tarjeta(page, '/informes').getByRole('switch', { name: 'Informes en el menú' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Ocultar Informes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(cuenta.puts).toEqual([{ ocultos: ['/informes'] }]);
  await expect(tarjeta(page, '/informes').getByTestId('chapa-modulo')).toHaveText('Oculto');
  await expect(cifra(page, 'Activos')).toHaveText(String(total - 1));
  await expect(enElMenu(page, 'Informes')).toHaveCount(0);

  await page.getByRole('status').getByRole('button', { name: 'Deshacer' }).click();
  await expect(tarjeta(page, '/informes').getByTestId('chapa-modulo')).toHaveText('Activo');
  expect(cuenta.puts[1]).toEqual({ ocultos: [] });
  await expect(enElMenu(page, 'Informes')).toBeVisible();
});

test('si ocultar falla (400, 500 o sin red), el diálogo se queda con el motivo, el módulo sigue activo y el menú no cambia', async ({ page }) => {
  for (const falla of [
    (r: Route) => json(r, { error: 'Datos inválidos' }, 400),
    (r: Route) => json(r, { error: 'boom' }, 500),
    (r: Route) => r.abort(),
  ]) {
    const cuenta = await abrir(page, { put: falla });
    const interruptor = tarjeta(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
    await interruptor.click();
    const dialogo = page.getByRole('dialog', { name: '¿Ocultar Informes?' });
    await dialogo.getByRole('button', { name: 'Ocultar Informes' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('Informes sigue activo.');
    expect(cuenta.puts.length, 'intentos de escribir').toBeGreaterThan(0);
    // Se queda abierto con el motivo (con el diálogo abierto, el resto de la página no está en el árbol accesible).
    await expect(dialogo.getByRole('button', { name: 'Ocultar Informes' })).toBeEnabled();
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toHaveCount(0);
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await expect(tarjeta(page, '/informes').getByTestId('chapa-modulo')).toHaveText('Activo');
    await expect(enElMenu(page, 'Informes')).toBeVisible();
    await expect(page.getByText('Informes ya no está en tu menú')).toHaveCount(0);
  }
});

test('si activar falla, el interruptor sigue apagado, lo dice en la tarjeta y no anuncia nada', async ({ page }) => {
  const cuenta = await abrir(page, { ocultos: ['/informes'], put: (r) => json(r, { error: 'boom' }, 500) });
  const interruptor = tarjeta(page, '/informes').getByRole('switch', { name: 'Informes en el menú' });
  await interruptor.click();
  await expect(tarjeta(page, '/informes').getByRole('alert')).toBeVisible();
  expect(cuenta.puts.length, 'intentos de escribir').toBeGreaterThan(0);
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Informes vuelve a estar en tu menú')).toHaveCount(0);
});

test('la chapa del plan la decide `tieneFeature`: con el plan que lo incluye, ninguna; sin acceso al producto, tampoco', async ({ page }) => {
  await abrir(page, { plan: 'ESTUDIO' });
  await expect(page.getByTestId('chapa-plan')).toHaveCount(0);

  await abrir(page, { plan: 'BASE' });
  const base = { plan: 'BASE', subscriptionStatus: 'active' };
  const falta = accesoProducto(base) && !tieneFeature(base, 'decisiones');
  await expect(tarjeta(page, '/centro-de-control').getByTestId('chapa-plan')).toHaveCount(falta ? 1 : 0);
  if (falta) await expect(tarjeta(page, '/centro-de-control').getByTestId('chapa-plan')).toHaveText('Desde el plan Estudio');
  // Solo el Centro de Control depende del plan.
  await expect(page.getByTestId('chapa-plan')).toHaveCount(falta ? 1 : 0);

  await abrir(page, { plan: 'BASE', estado: 'trial_expirado' });
  await expect(page.getByTestId('chapa-plan')).toHaveCount(0);
});

test('la gerencia ve los módulos pero no los interruptores: guardar es cosa de la propietaria', async ({ page }) => {
  const cuenta = await abrir(page, { rol: 'MANAGER' });
  await expect(tarjeta(page, '/citas').getByTestId('chapa-modulo')).toHaveText('Activo');
  await expect(page.getByTestId('modulos-nuevo').getByRole('switch')).toHaveCount(0);
  await expect(page.getByText('Activar u ocultar un módulo es cosa de la propietaria del estudio.')).toBeVisible();
  expect(cuenta.puts).toHaveLength(0);
});

test('con el panel nuevo apagado, /explorar-funciones es la de siempre', async ({ page }) => {
  await montar(page);
  await ir(page, 'explorar-funciones');
  await expect(page.getByRole('heading', { level: 1, name: 'Explorar todas las funciones' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('modulos-nuevo')).toHaveCount(0);
});

// Fuera del run normal: `E2E_CAPTURAS=1` (y `E2E_CAPTURAS_DIR`, por defecto test-results).
test.describe('capturas', () => {
  test.skip(!process.env.E2E_CAPTURAS, 'solo a mano, para mirar la pantalla');
  const OUT = process.env.E2E_CAPTURAS_DIR ?? 'test-results';
  for (const [ancho, alto, oscuro] of [[1440, 900, false], [375, 812, false], [1440, 900, true]] as const) {
    test(`Módulos a ${ancho}${oscuro ? ' en oscuro' : ''}`, async ({ page }) => {
      if (oscuro) await enOscuro(page);
      await page.setViewportSize({ width: ancho, height: alto });
      await abrir(page, { ocultos: ['/informes', '/libreta'], automatizaciones: 2 });
      await page.mouse.move(0, 0);
      const sufijo = `${ancho}${oscuro ? '-oscuro' : ''}`;
      await page.screenshot({ path: `${OUT}/modulos-${sufijo}.png` });
      await page.screenshot({ path: `${OUT}/modulos-${sufijo}-entera.png`, fullPage: true });
      await tarjeta(page, '/automatizaciones').getByRole('switch').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/modulos-${sufijo}-ocultar.png` });
    });
  }
});
