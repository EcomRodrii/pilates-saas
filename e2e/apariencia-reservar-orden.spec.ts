import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Reordenar las secciones de la página pública de reservas (`/reservar/<slug>`)
// desde el rail del editor de Apariencia.
//
// Lo que aquí se comprueba de verdad es que el orden ELEGIDO es el orden
// GUARDADO: el resto de la cadena (que lo guardado llega a la página) ya vive
// en `lib/reservar/secciones.test.ts`, que es puro y no necesita navegador. Lo
// que un unitario no puede ver es si el arrastre llega al cuerpo del PUT.
//
// Y las dos reglas que más importan, que son DISTINTAS entre sí:
//  · el horario no se mueve NI se oculta — su fila no tiene ni asa ni ojo;
//  · la portada no se mueve pero SÍ se oculta — tiene ojo y no tiene asa.
// Se comprueba que los controles no existen, no solo que "no funcionan".
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, reservar = { orden: [] as string[], ocultos: [] as string[] }) {
  const puts: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => {
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, {});
    }
    return json(route, {
      orden: [], ocultos: [], menuPosition: 'lateral',
      home: { orden: [], ocultos: [] }, reservar,
    });
  });
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route => json(route, resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED' })));
  await page.route('**/api/portal-bloques**', route => {
    if (new URL(route.request().url()).searchParams.get('pantalla') === 'todas') {
      return json(route, { home: [], clases: [], bonos: [] });
    }
    return json(route, []);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  // Dos clics porque son dos cosas distintas, aquí y en todas las filas del
  // rail: el nombre SELECCIONA la página (es lo que hace aparecer el lienzo y
  // el botón de guardar en la barra) y el chevron DESPLIEGA su lista.
  await page.getByRole('button', { name: 'Secciones de la página', exact: true }).click();
  await page.getByLabel('Desplegar Secciones de la página').click();
  return { puts };
}

test.describe('Página pública de reservas — orden de secciones', () => {
  test('el orden por defecto es el de la página, con el horario en su sitio', async ({ page }) => {
    await montar(page);
    await expect(page.getByLabel('Reordenar Cifras del estudio')).toBeVisible();

    // El esquema del lienzo enseña el orden completo, fijas incluidas.
    const esquema = page.getByText('Tu página de reservas').locator('..');
    await expect(esquema.getByText('Portada', { exact: true })).toBeVisible();
    await expect(esquema.getByText('Horario y reservas', { exact: true })).toBeVisible();
    await expect(esquema.getByText('Cifras del estudio', { exact: true })).toBeVisible();
    await expect(esquema.getByText('Contacto y pie', { exact: true })).toBeVisible();
  });

  test('⚠️ el horario no ofrece ni arrastrar ni ocultar', async ({ page }) => {
    await montar(page);
    // Las movibles sí tienen asa; el horario, ninguno de los dos controles.
    await expect(page.getByLabel('Reordenar Cifras del estudio')).toBeVisible();
    await expect(page.getByLabel('Reordenar Horario y reservas')).toHaveCount(0);
    await expect(page.getByLabel('Ocultar Horario y reservas')).toHaveCount(0);
  });

  test('⚠️ la portada no ofrece arrastrar, pero SÍ ocultar', async ({ page }) => {
    // Los dos permisos son distintos y confundirlos costaría justo lo que más
    // se pide: quitar la portada porque la web del estudio ya tiene cabecera.
    const { puts } = await montar(page);
    await expect(page.getByLabel('Reordenar Portada')).toHaveCount(0);
    await page.getByLabel('Ocultar Portada').click();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();
    const enviado = puts[0].reservar as { orden: string[]; ocultos: string[] };
    expect(enviado.ocultos).toEqual(['portada']);
    // Y no se cuela en `orden`: no es reordenable.
    expect(enviado.orden).not.toContain('portada');
  });

  test('ocultar una sección y guardar manda ese id en `ocultos`', async ({ page }) => {
    const { puts } = await montar(page);
    await page.getByLabel('Ocultar Cifras del estudio').click();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();

    expect(puts).toHaveLength(1);
    const enviado = puts[0].reservar as { orden: string[]; ocultos: string[] };
    expect(enviado.ocultos).toEqual(['cifras']);
    // Lo anclado nunca viaja en `orden` — no es reordenable, así que guardarlo
    // solo daría trabajo a `ordenarSecciones` para volver a descartarlo.
    expect(enviado.orden).not.toContain('horario');
    expect(enviado.orden).not.toContain('portada');
  });

  test('arrastrar las cifras al final cambia el orden que se guarda', async ({ page }) => {
    const { puts } = await montar(page);
    // A mano y no con `dragTo`: el PointerSensor de dnd-kit exige 5 px de
    // movimiento para activarse y luego lee cada `pointermove`, así que un
    // salto único de origen a destino no levanta nada.
    // ⚠️ Traerlas a la vista ANTES de medir. Este grupo es el penúltimo de un
    // rail largo, así que las filas movibles nacen por debajo del borde;
    // `boundingBox()` devuelve coordenadas igualmente y el ratón acababa
    // moviéndose fuera de la ventana — el arrastre no fallaba, no llegaba a
    // empezar, y el test parecía decir que reordenar no funciona.
    await page.getByLabel('Reordenar Contacto y pie').scrollIntoViewIfNeeded();
    const a = (await page.getByLabel('Reordenar Cifras del estudio').boundingBox())!;
    const b = (await page.getByLabel('Reordenar Contacto y pie').boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    // Se pasa de largo a propósito: dnd-kit intercambia al cruzar el CENTRO de
    // la fila de destino, y quedarse justo en su asa se queda corto — con dos
    // filas movibles adyacentes, «casi» no mueve nada.
    const destino = b.y + b.height * 1.5;
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(a.x + a.width / 2, a.y + ((destino - a.y) * i) / 10);
    }
    await page.mouse.up();

    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();
    // Solo viajan las MOVIBLES: ni el horario ni la portada, que van ancladas.
    // Las que no se han tocado conservan su sitio relativo.
    expect((puts[0].reservar as { orden: string[] }).orden).toEqual(['bonos', 'sobre', 'contacto', 'cifras']);
  });

  test('un orden ya guardado se lee y se vuelve a guardar igual', async ({ page }) => {
    // Lo guardado solo conoce dos de las cuatro movibles; «sobre» y «bonos» se
    // añadieron al catálogo después. Se releen al final —la regla de siempre— y
    // se vuelve a guardar así, ya completo: leer no puede perder una sección, y
    // tampoco colar una nueva por delante de lo que el estudio ya colocó.
    const { puts } = await montar(page, { orden: ['contacto', 'cifras'], ocultos: [] });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();
    expect((puts[0].reservar as { orden: string[] }).orden).toEqual(['contacto', 'cifras', 'bonos', 'sobre']);
  });
});

// ── «Sobre nosotros»: el panel donde se escribe ─────────────────────────────
// Categoría propia en «Ajustes del tema», y no un campo más en la de la
// portada: la portada son textos que adornan una página que ya existe, y esto
// es una SECCIÓN que no existe hasta que se escribe. Se comprueba aquí porque
// la regla de producto («vacío = no se ve») solo se entiende si el panel lo
// dice, y un panel que no lo dijera pasaría todos los tests de la página.
test('la categoría «Sobre nosotros» existe y avisa de que sin texto no se ve', async ({ page }) => {
  await montar(page);
  await page.getByRole('tab', { name: 'Ajustes del tema' }).click();
  await page.getByRole('button', { name: 'Sobre nosotros', exact: true }).click();
  await expect(page.getByText(/si dejas el texto vacío, no se ve/i)).toBeVisible();
  await page.getByPlaceholder(/Cuenta quién sois/).fill('Somos tres instructoras.');
  // El contador de caracteres es lo que confirma que el campo está enganchado
  // al borrador y no es un textarea suelto.
  await expect(page.getByText('24/600')).toBeVisible();
});
