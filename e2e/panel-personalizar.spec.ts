import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «Personalizar tu panel» y el menú arriba.
//
// Existe porque la primera versión se entregó SIN mirarla y salió rota: la
// barra superior se solapaba con el buscador y con la cabecera, y el botón de
// guardar el color no hacía nada. Nada de eso lo habría cazado un test de
// tipos — hacía falta pintarlo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, layout: Record<string, unknown> = {}, oscuro = false) {
  const puts: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid, dark]) => {
    // Misma clave que usa `PanelThemeProvider`: así el panel arranca ya en
    // oscuro y no hay que pulsar nada (ni esperar a la transición).
    if (dark) localStorage.setItem('panel-dark-mode', '1');
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID, oscuro ? '1' : ''] as const);

  const gets = { layout: 0, misEstudios: 0 };
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => {
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON() as Record<string, unknown>);
      // El PUT real devuelve la configuración COMPLETA ya resuelta
      // (`guardarLayout`, lib/layout-data.ts), no el parche — y de eso depende
      // que la caché del cliente pueda guardarla encima sin quedarse a medias.
      return json(route, {
        orden: [], ocultos: [], menuPosition: 'lateral',
        home: { orden: [], ocultos: [] },
        ...(route.request().postDataJSON() as Record<string, unknown>),
      });
    }
    gets.layout += 1;
    return json(route, {
      orden: [], ocultos: [], menuPosition: 'lateral',
      home: { orden: [], ocultos: [] }, ...layout,
    });
  });
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route =>
    json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));

  const tema = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED' });
  await page.route('**/api/theme**', route => {
    if (route.request().url().endsWith('/publish')) return json(route, tema);
    if (route.request().method() === 'PUT') return json(route, resolveTheme(route.request().postDataJSON()));
    return json(route, tema);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // ⚠️ Después del comodín `**/rest/v1/**`: Playwright prueba las rutas en
  // orden INVERSO al registro, así que puesta antes no la vería nadie.
  await page.route('**/rest/v1/rpc/mis_estudios', route => { gets.misEstudios += 1; return json(route, []); });
  return { puts, gets };
}

test.describe('Apariencia — mantenimiento y salida', () => {
  test('la pantalla avisa y ofrece un solo botón', async ({ page }) => {
    await montar(page);
    await page.goto('/configuracion/apariencia');
    await expect(page.getByText('La portada y el diseño de tu portal, en mantenimiento')).toBeVisible({ timeout: 30_000 });
    // Y dice que lo publicado no se rompe: sin eso, «mantenimiento» se lee
    // como «mis clientas ya no ven mi marca».
    await expect(page.getByText(/sigue\s+funcionando igual/)).toBeVisible();
    // Evaluación del 13-sep: la pantalla no decía que el color del portal SÍ
    // se cambia, y una propietaria se fue creyendo que no podía. La salida
    // tiene que decirlo y llevar a donde se cambia.
    const salida = page.getByRole('link', { name: /Tu color y tu panel/ });
    await expect(salida).toBeVisible();
    await expect(salida).toContainText('ven tus alumnas en tu página de reservas');
    await expect(salida).toHaveAttribute('href', '/configuracion/apariencia/panel');
  });

  test('el editor no se abre ni escribiendo la URL', async ({ page }) => {
    await montar(page);
    await page.goto('/configuracion/apariencia/editor');
    await expect(page).toHaveURL(/\/configuracion\/apariencia$/, { timeout: 30_000 });
  });
});

test.describe('Personalizar tu panel', () => {
  test('trae las cinco cosas', async ({ page }) => {
    await montar(page);
    await page.goto('/configuracion/apariencia/panel');
    for (const t of [
      'Los colores de tu software', 'Los módulos de tu menú',
      'Las secciones de tu Inicio', 'Dónde va el menú', 'Claro u oscuro',
    ]) {
      await expect(page.getByRole('heading', { name: t })).toBeVisible({ timeout: 30_000 });
    }
  });

  test('los módulos que no se pueden esconder salen con candado, no sin control', async ({ page }) => {
    await montar(page);
    await page.goto('/configuracion/apariencia/panel');
    // Por `title` y no por `aria-label` del módulo concreto: el candado es un
    // <span> no interactivo (getByLabel no lo alcanza) y el rótulo del módulo
    // es «Dashboard», no «Inicio» — dos formas de que el test mienta sobre algo
    // que sí está pintado.
    await expect(page.getByTitle('Siempre visible').first()).toBeVisible({ timeout: 30_000 });
    // Y el resto sí se puede esconder.
    await expect(page.getByRole('button', { name: /^Ocultar / }).first()).toBeVisible();
  });

  test('cambiar la posición guarda `menuPosition` en el layout, no otra cosa', async ({ page }) => {
    const { puts } = await montar(page);
    await page.goto('/configuracion/apariencia/panel');
    await page.getByRole('button', { name: /Fijo arriba/ }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    expect(puts[0].menuPosition).toBe('superior');
    // ⚠️ El orden y los ocultos viajan en el MISMO guardado: si fueran
    // peticiones distintas, guardar uno pisaría lo que el otro tuviera sin
    // guardar.
    expect(puts[0]).toHaveProperty('orden');
    expect(puts[0]).toHaveProperty('home');
  });

  test('ocultar un módulo y guardar lo saca del menú EN EL SITIO, sin recargar', async ({ page }) => {
    const { puts } = await montar(page);
    await page.goto('/configuracion/apariencia/panel');
    await page.getByRole('button', { name: 'Ocultar Informes' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    expect(puts[0].ocultos).toContain('/informes');
  });
});

// ⚠️ Estos dos existen porque «lo de mover los módulos no se cambian» fue la
// queja EXACTA del fundador sobre la primera entrega. Uno prueba que el editor
// reordena y lo guarda; el otro, que el menú obedece lo guardado. Con solo el
// primero, el editor podía verse perfecto y el menú seguir igual — que es justo
// lo que pasaba.
test.describe('Reordenar módulos', () => {
  test('arrastrar un módulo cambia su orden y viaja en el guardado', async ({ page }) => {
    const { puts } = await montar(page);
    await page.goto('/configuracion/apariencia/panel');
    // Con el ratón, que es como se usa. `PointerSensor` no arranca hasta los
    // 5 px (para que pulsar el ojo no cuente como arrastre), así que el gesto
    // tiene que ir por pasos: un salto seco de A a B no lo despierta.
    const asa = page.getByRole('button', { name: 'Reordenar Citas' });
    await asa.waitFor({ state: 'visible', timeout: 30_000 });
    // ⚠️ Traer la fila a la vista ANTES de medirla. `boundingBox()` devuelve
    // coordenadas de página, no de pantalla: con la lista abajo del todo salían
    // y=791 en un viewport de 720 y el ratón se movía a un sitio donde no hay
    // nada — los eventos caían en <html> y el arrastre no arrancaba. El test
    // decía «no se mueve» de una pantalla que sí se mueve.
    await asa.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const desde = (await asa.boundingBox())!;
    const hasta = (await page.getByRole('button', { name: 'Reordenar Calendario' }).boundingBox())!;
    await page.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2);
    await page.mouse.down();
    // Pasar del CENTRO de la fila de destino: dnd-kit decide por colisión, no
    // por haber salido de la fila propia.
    for (const paso of [0.25, 0.5, 0.75, 1]) {
      await page.mouse.move(
        desde.x + desde.width / 2,
        desde.y + desde.height / 2 + (hasta.y - desde.y) * paso,
        { steps: 5 },
      );
    }
    await page.mouse.up();
    // El botón solo existe si algo cambió de verdad: su sola aparición ya
    // descarta el fallo original («arrastro y no pasa nada»).
    await page.getByRole('button', { name: 'Guardar cambios' }).click({ timeout: 15_000 });
    await expect.poll(() => puts.length).toBeGreaterThan(0);
    const orden = puts[0].orden as string[];
    expect(orden.indexOf('/citas')).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf('/citas')).toBeLessThan(orden.indexOf('/calendario'));
  });

  test('el menú pinta los módulos en el orden guardado, no en el de fábrica', async ({ page }) => {
    // De fábrica Calendario va antes que Citas (lib/nav-config.ts).
    await montar(page, { orden: ['/citas', '/calendario'] });
    await page.goto('/dashboard');
    // «Todo»: en modo esencial no se listan los dos y no habría nada que comparar.
    await page.getByRole('button', { name: 'Todo' }).click({ timeout: 30_000 });
    const hrefs = await page.locator('aside').first().locator('a[href]').evaluateAll(
      as => as.map(a => a.getAttribute('href')),
    );
    expect(hrefs).toContain('/citas');
    expect(hrefs.indexOf('/citas')).toBeLessThan(hrefs.indexOf('/calendario'));
  });
});

// ⚠️ Estos números salen de una medición real con StrictMode APAGADO (que es lo
// único que separa un duplicado de verdad del doble efecto de desarrollo) sobre
// una carga de /dashboard: `/api/layout` la pedían el Sidebar a los 5721 ms y el
// Dashboard a los 7094 ms —1,4 s de separación, imposible de unir con el dedupe
// en vuelo— y `mis_estudios` la pedían SedeActiva y NotificationBell con 9 ms de
// diferencia. Sin este test, cualquier consumidor nuevo las devuelve a dos sin
// que nadie se entere.
test.describe('El panel no pide dos veces lo mismo', () => {
  test('el menú y las sedes se piden UNA vez por carga', async ({ page }) => {
    const { gets } = await montar(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 30_000 });
    // Margen para que llegue cualquier petición tardía (la del Dashboard iba
    // 1,4 s por detrás de la del menú).
    await page.waitForTimeout(3000);
    expect(gets.layout).toBe(1);
    expect(gets.misEstudios).toBe(1);
  });
});

test.describe('El menú arriba', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('la barra no tapa el contenido ni se solapa con la cabecera', async ({ page }) => {
    await montar(page, { menuPosition: 'superior' });
    await page.goto('/dashboard');

    const barra = page.locator('aside').first();
    await expect(barra).toBeVisible({ timeout: 30_000 });

    const b = await barra.boundingBox();
    expect(b, 'la barra no se ha pintado').toBeTruthy();
    // Tumbada de verdad: ancha y baja, no una columna. La comparación es
    // RELATIVA a propósito — el número fijo que había aquí (110 px) se escribió
    // cuando la barra medía siempre lo mismo, y ya no: con todos los módulos
    // envuelve en varias filas. Lo que la define como barra es la proporción,
    // no una altura concreta.
    expect(b!.width).toBeGreaterThan(900);
    expect(b!.height).toBeLessThan(b!.width / 4);

    // ⚠️ Lo que se rompió la primera vez: el contenido arrancaba DEBAJO de la
    // barra flotante y la primera fila quedaba tapada.
    await page.screenshot({ path: 'test-results/menu-arriba.png', fullPage: false });

    const main = page.locator('main').first();
    const m = await main.boundingBox();
    const primero = page.locator('main h1, main h2').first();
    if (await primero.count()) {
      const p = await primero.boundingBox();
      expect(p!.y, 'el primer título queda debajo de la barra').toBeGreaterThan(b!.y + b!.height);
    }
    expect(m).toBeTruthy();
  });

  // ⚠️ El hueco se MIDE contra la barra real, no contra un número escrito a
  // mano. Con el selector de sede de una cadena, o con el zoom del navegador,
  // la barra crece y el contenido acababa por debajo de ella.
  test('el hueco del contenido coincide con el alto REAL de la barra', async ({ page }) => {
    await montar(page, { menuPosition: 'superior' });
    await page.goto('/dashboard');
    const barra = page.locator('aside').first();
    await expect(barra).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);

    const b = (await barra.boundingBox())!;
    const hueco = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-top')));
    // El hueco tiene que cubrir la barra entera (borde superior incluido), con
    // un margen de holgura de 2 px por el redondeo.
    expect(hueco + 2).toBeGreaterThanOrEqual(b.y + b.height);
  });

  test('con el menú a la izquierda, la barra sigue siendo una columna', async ({ page }) => {
    await montar(page, { menuPosition: 'lateral' });
    await page.goto('/dashboard');
    const aside = page.locator('aside').first();
    await expect(aside).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/menu-izquierda.png', fullPage: false });
    const b = await aside.boundingBox();
    expect(b!.height).toBeGreaterThan(300);
    expect(b!.width).toBeLessThan(400);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Modo oscuro — «hay secciones que no se ven, ni letras ni números».
//
// El síntoma clásico es un fondo CLARO fijo (`bg-white`, un hex a pelo) debajo
// de un texto que sí usa token: en oscuro el token se vuelve casi blanco y el
// texto desaparece sobre su propio fondo. Este test no mira clases: mira
// PÍXELES, que es lo único que no se puede discutir.
// ─────────────────────────────────────────────────────────────────────────────
const PANTALLAS = ['/dashboard', '/calendario', '/clientas', '/cobros', '/configuracion', '/configuracion/apariencia/panel'];

test.describe('Modo oscuro', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // ⚠️ UNA sola prueba para las seis pantallas, con tiempo largo. Con una
  // prueba por ruta, `next dev` compila cada una DENTRO de su test y las
  // últimas se pasan de los 30 s — el falso rojo que este repo ya tiene
  // documentado. Recorriéndolas seguidas, cada ruta se compila una vez y el
  // resto del recorrido va caliente.
  test('ninguna pantalla deja texto claro sobre fondo claro', async ({ page }) => {
    test.setTimeout(300_000);
    await montar(page, {}, true);

    const problemas: string[] = [];
    for (const ruta of PANTALLAS) {
      await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `test-results/oscuro${ruta.replace(/\//g, '_')}.png` });

      // No se miran clases: se miran PÍXELES. Un fondo claro propio con texto
      // claro encima es texto que no se lee, venga de donde venga.
      const malos = await page.evaluate(() => {
        const lum = (c: string) => {
          const m = c.match(/[\d.]+/g);
          if (!m || m.length < 3) return null;
          const [r, g, b] = m.map(Number);
          if (m.length > 3 && Number(m[3]) < 0.5) return null; // translúcido: manda lo de debajo
          return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        };
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const fondo = lum(cs.backgroundColor);
          if (fondo === null || fondo < 0.75) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 16) continue;
          // Solo el texto PROPIO: si el hijo repinta su fondo, el problema es suyo.
          const propio = Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join('').trim();
          if (!propio) continue;
          const tinta = lum(cs.color);
          if (tinta !== null && tinta > 0.6) {
            out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} :: "${propio.slice(0, 40)}"`);
          }
        }
        return out;
      });
      for (const m of malos) problemas.push(`${ruta}  ${m}`);
    }
    expect(problemas, 'texto claro sobre fondo claro en modo oscuro').toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// La prueba de fuego del modo oscuro: una HOJA abierta.
//
// Las hojas y modales del panel se renderizan en un portal. Iban a
// `document.body`, o sea FUERA del <div> que lleva `.dark`, así que sus tokens
// volvían a los CLAROS: tarjeta blanca sobre panel oscuro y texto pensado para
// fondo oscuro, blanco sobre blanco. Ninguna captura de una pantalla de fondo
// lo enseña — hay que ABRIR la hoja.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Modo oscuro — las hojas', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('una hoja abierta en oscuro es oscura, no una isla blanca', async ({ page }) => {
    test.setTimeout(180_000);
    await montar(page, {}, true);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 120_000 });

    await page.getByRole('button', { name: 'Abrir menú de perfil' }).click({ timeout: 60_000 });
    // Sin `exact`: el ítem lleva una etiqueta «BETA» al lado, así que su
    // nombre accesible es «Apariencia BETA» y un texto exacto no lo encuentra.
    await page.getByRole('button', { name: /Apariencia/ }).first().click({ timeout: 30_000 });

    const hoja = page.getByRole('dialog');
    await expect(hoja).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/oscuro_hoja.png' });

    const fondo = await hoja.evaluate(el => getComputedStyle(el).backgroundColor);
    const m = fondo.match(/[\d.]+/g)!;
    const lum = (0.2126 * Number(m[0]) + 0.7152 * Number(m[1]) + 0.0722 * Number(m[2])) / 255;
    expect(lum, `la hoja salió con fondo ${fondo}: sigue portaleada fuera de .dark`).toBeLessThan(0.5);

    // Y que herede la clase de verdad, no que acierte por casualidad.
    const dentroDeDark = await hoja.evaluate(el => Boolean(el.closest('.dark')));
    expect(dentroDeDark, 'la hoja no cuelga del contenedor con .dark').toBe(true);
  });
});
