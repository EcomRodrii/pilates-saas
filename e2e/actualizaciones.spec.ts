import { test, expect, type Page, type Route } from '@playwright/test';

// La sección «Actualizaciones» del panel.
//
// ⚠️ Estos tests existen por un bug concreto que se coló escribiéndola: el reloj
// de «reciente» era un `useSyncExternalStore` cuyo `getSnapshot` devolvía
// `Date.now()`, o sea un valor distinto en cada render. React lo lee y lo compara
// con `Object.is` en cada pasada, veía la store eternamente cambiada y entraba en
// bucle («Maximum update depth exceeded») — la pantalla ENTERA al error boundary.
// Y fallaba de la peor manera posible: se salvaba solo si dos lecturas caían en
// el mismo milisegundo, así que iba bien en local y reventaba con una versión más
// en la lista. Por eso aquí se comprueba SIEMPRE que no salió el error boundary,
// no solo que se ve el título.

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID = 'auth-e2e-duena';
const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const FOTO = 'https://dwqvdycjcffqwfkzapvi.supabase.co/storage/v1/object/public/changelog-media/x/y.webp';

const VERSIONES = [
  { id: '1', version: '0.38', titulo: 'Renovar el bono en un toque', fecha_publicacion: '2026-09-07', changelog_cambios: [
    { etiqueta: 'NUEVA_FUNCIONALIDAD', texto: 'Tus alumnas renuevan su bono desde la app.', orden: 0, imagen_url: FOTO },
    { etiqueta: 'ARREGLO', texto: 'Una reserva podía confirmarse sin descontar la sesión del bono.', orden: 1, imagen_url: null },
  ] },
  { id: '2', version: '0.37', titulo: 'Clases online con Zoom', fecha_publicacion: '2026-08-21', changelog_cambios: [
    { etiqueta: 'MEJORA', texto: 'El listado de clientas carga más rápido.', orden: 0 },
  ] },
];

async function montar(page: Page, versiones: unknown[] = VERSIONES) {
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/api/**', (r) => json(r, {}));
  await page.route('**/api/layout**', (r) => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (r) => json(r, { bloqueado: false }));
  await page.route('**/rest/v1/rpc/current_studio_id', (r) => json(r, STUDIO_ID));
  await page.route('**/rest/v1/studios**', (r) => json(r, { id: STUDIO_ID, nombre: 'Pilates Boutique', slug: 'pilates-boutique', owner_auth_user_id: UID, moneda: 'EUR', iva_por_defecto: 21 }));
  await page.route('**/rest/v1/instructores**', (r) => json(r, [{ id: 'i1', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol: 'PROPIETARIO', color: '#343825', auth_user_id: UID }]));
  // ⚠️ DESPUÉS del catch-all `rest/v1/**`: en Playwright manda la ÚLTIMA ruta
  // registrada, así que declarada antes la comería el comodín y la pantalla
  // saldría vacía sin que ningún test se enterase.
  await page.route('**/rest/v1/changelog_versiones**', (r) => json(r, versiones));
  await page.addInitScript(([k, id]) => {
    localStorage.setItem(k, JSON.stringify({
      access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
      user: { id, email: 'c@e.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, UID] as const);
}

/** Que la pantalla esté, y que NO esté el error boundary que la sustituye. */
async function noRevento(page: Page) {
  await expect(page.getByText('Última actualización')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
}

test('pinta la última versión y su lista', async ({ page }) => {
  test.setTimeout(300_000);
  await montar(page);
  await page.goto('/actualizaciones', { waitUntil: 'domcontentloaded' });
  await noRevento(page);
  // La primera manda en el bloque destacado (es el único `h2` de la pantalla)…
  await expect(page.getByRole('heading', { name: 'Renovar el bono en un toque' })).toBeVisible();
  // …y la siguiente baja al timeline, donde la fila ENTERA es un botón que abre
  // el detalle. Se comprueba por su rol y no por su texto: así el test falla si
  // la fila deja de poder abrirse, no solo si desaparece la letra.
  await expect(page.getByRole('button', { name: /Clases online con Zoom/ })).toBeVisible();
});

test('una versión de SOLO arreglos no tumba la pantalla', async ({ page }) => {
  test.setTimeout(300_000);
  await montar(page, [
    { id: '9', version: '0.39', titulo: 'Una semana de puro mantenimiento', fecha_publicacion: '2026-09-09', changelog_cambios: [
      { etiqueta: 'ARREGLO', texto: 'El recibo de un cobro con descuento mostraba el importe sin aplicar.', orden: 0 },
    ] },
    ...VERSIONES,
  ]);
  await page.goto('/actualizaciones', { waitUntil: 'domcontentloaded' });
  await noRevento(page);
  await expect(page.getByRole('heading', { name: 'Una semana de puro mantenimiento' })).toBeVisible();
});

test('el filtro recorta los CAMBIOS, no solo las versiones', async ({ page }) => {
  test.setTimeout(300_000);
  await montar(page);
  await page.goto('/actualizaciones', { waitUntil: 'domcontentloaded' });
  await noRevento(page);
  await page.getByRole('button', { name: 'Correcciones' }).click();
  // Con un filtro puesto no hay destacado —deja de ser «la última actualización»
  // si se ha escondido media lista—, así que la 0.38 baja al timeline.
  await expect(page.getByText('Última actualización')).toHaveCount(0);
  // Se queda porque trae un arreglo…
  await expect(page.getByRole('button', { name: /Renovar el bono en un toque/ })).toBeVisible();
  // …pero SIN su función nueva: si siguiera ahí, el filtro no filtraría nada,
  // solo escondería versiones enteras.
  await expect(page.getByText('Tus alumnas renuevan su bono desde la app.')).toHaveCount(0);
  // Y la 0.37, que es solo una mejora, desaparece entera.
  await expect(page.getByRole('button', { name: /Clases online con Zoom/ })).toHaveCount(0);
});

test.describe('la captura de un cambio', () => {
  // ⚠️ Casi ningún cambio lleva imagen: una política de RLS que se cierra o una
  // carrera entre transmisiones no se pueden fotografiar. Así que se comprueban
  // las DOS caras — que la que la tiene la pinta, y que la que no, no deja
  // ningún hueco.

  test('se pinta la del cambio que la tiene, y solo esa', async ({ page }) => {
    await montar(page);
    await page.goto('/actualizaciones', { waitUntil: 'domcontentloaded' });
    await noRevento(page);
    await page.getByRole('button', { name: 'Ver detalles' }).click();
    const capturas = page.locator(`img[src="${FOTO}"]`);
    await expect(capturas).toHaveCount(1);
    // Decorativa: el texto del cambio va justo al lado y dice lo mismo, así que
    // un `alt` con esa misma frase se la haría oír dos veces a un lector de
    // pantalla. Si alguien "arregla" el alt vacío, esto lo caza.
    await expect(capturas.first()).toHaveAttribute('alt', '');
  });

  test('sin ninguna captura, sigue saliendo la escena de categoría', async ({ page }) => {
    // La escena genérica es el respaldo, no un adorno que se pueda perder: una
    // versión sin fotos no puede quedarse con el detalle desnudo.
    await montar(page, [
      { id: '5', version: '0.40', titulo: 'Semana sin fotos', fecha_publicacion: '2026-09-12', changelog_cambios: [
        { etiqueta: 'ARREGLO', texto: 'Algo que no se puede fotografiar.', orden: 0, imagen_url: null },
      ] },
    ]);
    await page.goto('/actualizaciones', { waitUntil: 'domcontentloaded' });
    await noRevento(page);
    await page.getByRole('button', { name: 'Ver detalles' }).click();
    // Acotado al drawer: el mismo texto sale también en las viñetas del bloque
    // destacado, y sin acotar esto es una violación de modo estricto, no un fallo.
    const detalle = page.getByLabel(/^Versión /);
    await expect(detalle.getByText('Algo que no se puede fotografiar.')).toBeVisible();
    await expect(page.locator('img[src*="changelog-media"]')).toHaveCount(0);
  });
});
