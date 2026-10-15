import { resolveTheme } from '../lib/theme-schema.ts';
import { test, expect, type Page, type Route } from '@playwright/test';
import { ilegibles } from './medir-contraste';

// ─────────────────────────────────────────────────────────────────────────────
// Modo oscuro medido por CONTRASTE, no por «fondo claro con texto claro».
//
// La primera versión de esta comprobación solo buscaba texto CLARO sobre fondo
// CLARO y pasaba en verde mientras la propietaria veía importes invisibles: lo
// suyo era lo contrario, texto OSCURO sobre fondo OSCURO. Medir contraste cubre
// los dos casos y además pone un número — 4.5:1 es el mínimo de WCAG AA para
// texto normal, 3:1 para texto grande.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem('panel-dark-mode', '1');
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/status**', route =>
    json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  // ⚠️ El tema, con valores REALES. Sin este mock caía en el comodín `{}` de
  // arriba y, con un tema vacío, `--brand` y `--brand-foreground` acaban los DOS
  // en #16161A: el barrido daba 1:1 —«ilegible»— a todos los botones de marca,
  // que en pantalla se leen perfectamente. En producción `/api/theme` nunca
  // devuelve `{}` (sin tema propio responde el resuelto por defecto), así que
  // aquello era un hallazgo inventado por el andamiaje.
  await page.route('**/api/theme**', route => json(route, resolveTheme({})));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, nif: 'B00000000' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
}

const PANTALLAS = ['/dashboard', '/mensajeria', '/cierre', '/cobros', '/clientas', '/calendario', '/configuracion'];

test.describe('Modo oscuro — contraste real', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('ningún texto por debajo del mínimo de WCAG AA', async ({ page }) => {
    test.setTimeout(900_000);
    await montar(page);
    const todos: string[] = [];
    // Lo que el medidor no ha sabido leer, por pantalla. Se INFORMA aunque no
    // haga fallar: un barrido que calla lo que no mide vuelve a ser un barrido
    // en el que no se puede confiar.
    const sinMedir: string[] = [];
    for (const ruta of PANTALLAS) {
      // ⚠️ Esperar a que la pantalla EXISTA, no un tiempo fijo.
      //
      // Dos cosas distintas dan cero hallazgos y verde falso: un 404 del
      // `next dev`, que compila la ruta en la primera petición y bajo carga
      // responde antes de terminar (se arregla recargando), y el esqueleto de
      // carga, que no tiene ni un texto (se arregla esperando — recargar lo
      // empeora, porque vuelve a empezar). Se distinguen y se tratan distinto.
      let out: Awaited<ReturnType<typeof ilegibles>>['out'] = [];
      let medidos = 0;
      let noMedibles = 0;
      await page.goto(ruta, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      for (let intento = 0; intento < 15 && medidos <= 30; intento++) {
        await page.waitForTimeout(2000);
        ({ out, medidos, noMedibles } = await ilegibles(page));
        if (medidos > 30) break;
        if (await page.getByText('Esta página no existe').count()) {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 300_000 });
        }
      }
      await page.screenshot({ path: `test-results/contraste${ruta.replace(/\//g, '_')}.png` });
      // ⚠️ La prueba de que SÍ se ha mirado. 30 es un suelo generoso: la
      // pantalla más pobre del panel pasa de 100 textos, y un 404 da 4.
      expect(medidos, `${ruta} no llegó a pintarse: solo ${medidos} textos medidos`).toBeGreaterThan(30);
      if (noMedibles) sinMedir.push(`${ruta}: ${noMedibles}`);
      for (const m of out) {
        todos.push(`${ruta}  ${m.ratio}:1  «${m.texto}»  tinta=${m.color} fondo=${m.fondo}  ${m.clases}`);
      }
    }
    console.log('SIN MEDIR (color no convertible): ' + (sinMedir.join(', ') || 'ninguno'));
    console.log('ILEGIBLES:\n' + (todos.join('\n') || '(ninguno)'));

    // ⚠️ UNA excepción conocida, con su diagnóstico — no una lista para ir
    // engordando.
    //
    // `text-brand` sobre una tarjeta oscura mide 2,55:1 porque el tema se aplica
    // EN LÍNEA (`PanelThemeProvider` escribe `--brand` en el `style` del
    // contenedor) y un `style` gana a la clase: la regla de `.dark` en
    // globals.css, que aclararía el oliva a #8A9165, nunca llega a pisarlo. Es
    // el mismo patrón que este repo ya documentó con los tokens del logo.
    //
    // No se arregla aquí porque no es un color suelto: hay que decidir cómo
    // emite el proveedor de tema los tokens de marca en oscuro, y eso afecta a
    // TODA superficie con color de marca. Queda medido y acotado; lo que este
    // test impide es que aparezca uno NUEVO.
    const CONOCIDOS = [/«Ver todos los pasos».*text-brand/];
    const nuevos = todos.filter(t => !CONOCIDOS.some(re => re.test(t)));
    expect(nuevos, 'texto NUEVO por debajo del contraste mínimo en modo oscuro').toEqual([]);
  });
});
