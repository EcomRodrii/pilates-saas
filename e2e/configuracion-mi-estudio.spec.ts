import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Mi estudio» en filas con su cajón (15-sep, v2).
//
// La sección eran formularios apilados, con el horario a medio abrir y el cierre
// del centro debajo. Ahora cada fila dice cómo está HOY y abre un cajón para
// cambiarlo. Lo que se fija aquí:
//   · cada fila enseña lo guardado, no una descripción;
//   · tocar una abre su cajón con el foco en el título, sin sacar nada de lado
//     (375 y 1024), y las horas del horario en la línea de su día;
//   · si el servidor dice que no, el cajón se queda abierto con lo escrito y lo
//     dice — contando que SÍ se intentó escribir;
//   · guardado de verdad: el cajón se cierra y la fila enseña el valor nuevo;
//   · salir con cambios pregunta, y salir sin guardar no escribe nada.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';

const FILA = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', plan: 'ESTUDIO', subscription_status: 'active',
  direccion: 'Calle Mayor 4', ciudad: 'Almería', codigo_postal: '04001', telefono: '600111222', sitio_web: null,
};

// dia_semana: 0 = domingo … 6 = sábado. L-V 8-22, sábado 9-14, domingo cerrado.
const HORARIO = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  studio_id: STUDIO_ID, dia_semana: d, abierto: d !== 0,
  hora_apertura: d === 0 ? null : d === 6 ? '09:00:00' : '08:00:00',
  hora_cierre: d === 0 ? null : d === 6 ? '14:00:00' : '22:00:00',
}));

const dentroDe = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('en-CA');
};

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, opts: { fallo?: 500 } = {}) {
  const patches: Record<string, unknown>[] = [];
  await montar(page);
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', r => {
    if (r.request().method() !== 'PATCH') return json(r, FILA);
    patches.push(r.request().postDataJSON() as Record<string, unknown>);
    if (opts.fallo === 500) return json(r, { code: 'XX000', message: 'error interno' }, 500);
    return json(r, [{ id: STUDIO_ID }]);
  });
  await page.route('**/rest/v1/studio_horario**', r => json(r, HORARIO));
  await page.route('**/rest/v1/cierres_estudio**', r => json(r, [{ id: 'cie-1', desde: dentroDe(20), hasta: dentroDe(22), motivo: null }]));
  await ir(page, 'configuracion?tab=estudio');
  return { patches };
}

const valor = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
const cajon = (page: Page) => page.getByRole('dialog').first();
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });
const guardar = (page: Page) => page.getByRole('button', { name: 'Guardar', exact: true });
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Lo que dentro del cajón se sale de él (un `fixed` no ensancha la página: hay que mirarlo aquí). */
const seSaleDelCajon = (page: Page) => page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')!;
  const caja = d.getBoundingClientRect();
  return [...d.querySelectorAll<HTMLElement>('input, button, li, p, h2')]
    .filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && (r.left < caja.left - 0.5 || r.right > caja.right + 0.5);
    })
    .map(el => `${el.tagName} ${el.getAttribute('aria-label') ?? (el.textContent ?? '').slice(0, 30)}`);
});

const VISTAS = [
  { nombre: 'móvil 375×812', ancho: 375, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  { nombre: 'escritorio 1024×768', ancho: 1024, use: { viewport: { width: 1024, height: 768 } } },
] as const;

for (const vista of VISTAS) {
  test.describe(`Mi estudio en ${vista.nombre}`, () => {
    test.use(vista.use);

    test('cada fila dice lo guardado, y tocarla abre su cajón con el foco en el título', async ({ page }) => {
      await abrir(page);
      await expect(valor(page, 'horario')).toHaveText('L-V 8:00–22:00 · S 9:00–14:00 · D cerrado', { timeout: 30_000 });
      await expect(valor(page, 'nombre-y-direccion')).toHaveText('Pilates Centro · Calle Mayor 4 · Almería');
      await expect(valor(page, 'contacto')).toHaveText('600111222 · cloe@example.com');
      await expect(valor(page, 'cerrar-el-centro')).toHaveText(/^Cerrado \d{1,2}/);
      expect(await desborde(page), 'la sección se sale de lado').toBeLessThanOrEqual(0);

      await page.locator('#horario').click();
      await expect(titulo(page, 'Horario')).toBeFocused();
      // Entra deslizándose desde la derecha: se mide cuando ha llegado.
      await expect.poll(async () => {
        const b = await cajon(page).boundingBox();
        return b ? Math.round(b.x + b.width) : null;
      }).toBe(vista.ancho);
      const caja = (await cajon(page).boundingBox())!;
      if (vista.ancho === 375) {
        expect(Math.round(caja.x)).toBe(0);
      } else {
        // Un cajón a la derecha, con la sección detrás.
        expect(caja.width).toBeLessThan(500);
      }
      // Las dos horas, en la línea de su día.
      const [interruptor, abre, cierra] = await Promise.all([
        page.getByRole('switch', { name: 'Abierto el miércoles' }).boundingBox(),
        page.getByLabel('Abre el miércoles').boundingBox(),
        page.getByLabel('Cierra el miércoles').boundingBox(),
      ]);
      const centro = (b: { y: number; height: number } | null) => b!.y + b!.height / 2;
      expect(Math.abs(centro(abre) - centro(interruptor)), 'la hora de abrir baja de línea').toBeLessThan(4);
      expect(Math.abs(centro(cierra) - centro(interruptor)), 'la hora de cerrar baja de línea').toBeLessThan(4);
      expect(await seSaleDelCajon(page)).toEqual([]);
      expect(await desborde(page)).toBeLessThanOrEqual(0);
    });
  });
}

test.describe('Mi estudio: guardar en un cajón', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('si el servidor dice que no, el cajón se queda abierto con lo escrito y lo dice', async ({ page }) => {
    const { patches } = await abrir(page, { fallo: 500 });
    await expect(valor(page, 'contacto')).toHaveText('600111222 · cloe@example.com', { timeout: 30_000 });
    await page.locator('#contacto').click();

    const telefono = page.getByRole('textbox', { name: 'Teléfono' });
    await expect(telefono).toHaveValue('600111222');
    await telefono.fill('600999888');
    await guardar(page).click();

    await expect(cajon(page).getByRole('alert')).toHaveText(/^No se ha guardado: .+\. Tus cambios siguen aquí\.$/);
    // «No dijo Guardado» también sería verdad si nunca se hubiera intentado.
    expect(patches.length, 'intentos de escribir').toBeGreaterThan(0);
    expect(Object.keys(patches[0]).sort()).toEqual(['email', 'sitio_web', 'telefono']);
    await expect(titulo(page, 'Contacto')).toBeVisible();
    await expect(telefono).toHaveValue('600999888');
    await expect(page.getByText('Contacto guardado')).toHaveCount(0);
  });

  test('guardado de verdad: el cajón se cierra y la fila enseña el valor nuevo', async ({ page }) => {
    const { patches } = await abrir(page);
    await expect(valor(page, 'contacto')).toHaveText('600111222 · cloe@example.com', { timeout: 30_000 });
    await page.locator('#contacto').click();
    await page.getByRole('textbox', { name: 'Teléfono' }).fill('600999888');
    await guardar(page).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(patches).toHaveLength(1);
    await expect(valor(page, 'contacto')).toHaveText('600999888 · cloe@example.com');
    await expect(page.getByText('Contacto guardado')).toBeVisible();
  });

  test('salir con cambios pregunta, y salir sin guardar no escribe nada', async ({ page }) => {
    const { patches } = await abrir(page);
    await expect(valor(page, 'nombre-y-direccion')).toHaveText('Pilates Centro · Calle Mayor 4 · Almería', { timeout: 30_000 });
    await page.locator('#nombre-y-direccion').click();

    const ciudad = page.getByRole('textbox', { name: 'Ciudad' });
    await expect(ciudad).toHaveValue('Almería');
    await ciudad.fill('Granada');

    const pregunta = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await page.keyboard.press('Escape');
    await expect(pregunta).toBeVisible();
    await pregunta.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(pregunta).toHaveCount(0);
    await expect(ciudad).toHaveValue('Granada');

    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(pregunta).toBeVisible();
    await pregunta.getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(patches).toHaveLength(0);
    await expect(valor(page, 'nombre-y-direccion')).toHaveText('Pilates Centro · Calle Mayor 4 · Almería');

    // Sin cambios, cerrar no pregunta.
    await page.locator('#nombre-y-direccion').click();
    await expect(titulo(page, 'Nombre y dirección')).toBeFocused();
    await page.getByRole('button', { name: 'Volver', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
