process.env.HOME_PREVIEW_TOKEN_SECRET = 'e2e-test-home-preview-secret';

import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { firmarTokenPreviewHome } from '../lib/theme/home-preview-token.ts';

// LA CAMPANA DEL INICIO — el número y la lista tienen que ser la misma cosa.
//
// Durante meses no lo fueron. La campana contaba por su cuenta (reservas y
// recibos derivados en el cliente, "leído hasta" en localStorage) mientras la
// pantalla de Avisos leía el motor de notificaciones. Dos consecuencias, y la
// segunda es peor que la primera:
//
//  1. El contador no bajaba NUNCA: lo único que escribía ese "leído hasta" se
//     quedó sin llamador cuando la pantalla migró al motor (#308).
//  2. El número no describía la lista que abría. Podía poner "23" y enseñar
//     tres avisos, o tres distintos.
//
// De ahí que el primer test no se conforme con "el contador baja": comprueba
// que el número del Inicio y lo que dice la pantalla de Avisos cuentan lo
// mismo ANTES de abrirla. Si alguien vuelve a calcular el número por otro
// lado, ahí es donde salta.

const STUDIO_ID = 'studio-test';

// El círculo de la campana se localiza por su aria-label, que ya distingue los
// dos estados (portal-home-view.tsx). Es también lo que oye un lector de
// pantalla, así que probarlo por aquí cubre las dos cosas a la vez.
const CAMPANA_CON = 'Notificaciones, 2 sin leer';
const CAMPANA_SIN = 'Notificaciones';

// Dos cosas que no son de la app y que hay que absorber aquí:
//
//  · Al llegar a Avisos desde la campana —navegación cliente, no `goto`— el
//    árbol entrante y el saliente conviven un instante en el DOM, así que el
//    subtítulo aparece DUPLICADO y el modo estricto se planta. Se asienta solo
//    en menos de un segundo (comprobado); esperar a que se asiente sería
//    esperar a un detalle de Next, no a la app. `.first()` mira lo que importa.
//  · Es la primera visita a /notificaciones del proceso, y en `next dev`
//    Turbopack compila la ruta al pedirla: los 5 s por defecto de `expect` se
//    quedan cortos y el test falla en frío y pasa en caliente. 30 s, como el
//    resto de primeras aserciones de las specs del portal.
const verSubtitulo = (page: import('@playwright/test').Page, texto: string) =>
  expect(page.getByText(texto).first()).toBeVisible({ timeout: 30_000 });

// Estos tres tests recorren DOS rutas cada uno (Inicio ↔ Avisos, o el preview),
// y en `next dev` Turbopack compila cada ruta la primera vez que se pide: el
// tope de 30 s por test se lo come la compilación y falla en frío aunque pase
// en caliente. Se sube el TOPE del test, no los `expect` de dentro — esos
// siguen en 30 s, que es donde tiene que saltar un fallo de verdad.
test.describe.configure({ timeout: 150_000 });

test.describe('Campana del Inicio del portal', () => {
  test('el número del Inicio es el mismo que cuenta la pantalla de Avisos', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);

    const campana = page.getByRole('link', { name: CAMPANA_CON });
    await expect(campana).toBeVisible({ timeout: 30_000 });
    await expect(campana).toHaveText('2');

    // La otra mitad del bug: que ese "2" describa la bandeja de verdad. El
    // subtítulo de Avisos sale de `resumenAvisos(sinLeer)` contando los items
    // que devuelve el motor — si el Inicio contara por su cuenta, aquí es
    // donde las dos cifras se separarían.
    await campana.click();
    await verSubtitulo(page, 'Dos cosas nuevas.');
  });

  test('tras pasar por Avisos, el contador baja a cero y pierde el punto', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('link', { name: CAMPANA_CON })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: CAMPANA_CON }).click();

    // Abrir la bandeja es lo que marca todo como leído. Esperar al subtítulo
    // no es adorno: el `read-all` sale del efecto que corre DESPUÉS de pintar
    // la lista, así que volver antes de eso se lleva por delante el PATCH.
    await verSubtitulo(page, 'Dos cosas nuevas.');
    await page.getByRole('button', { name: 'Volver a Inicio' }).click();

    const campana = page.getByRole('link', { name: CAMPANA_SIN, exact: true });
    await expect(campana).toBeVisible({ timeout: 30_000 });
    await expect(campana).toHaveText('0');
    // El punto de 6 px es la única señal de alerta del diseño — el numeral se
    // queda siempre. Que valga "0" no basta: hay que ver que el punto se fue.
    await expect(campana.locator('span').nth(1)).toHaveCount(0);
  });

  test('la vista previa del editor no pregunta por los avisos de nadie', async ({ page }) => {
    // Con sesión de socia EN localStorage: es el caso peligroso, no el
    // inofensivo. /portal-preview corre en un iframe del mismo origen que
    // /portal/[slug], así que si la propietaria entró alguna vez a su propio
    // portal como socia en ese navegador, el token sigue disponible y la
    // campana enseñaría avisos reales dentro del editor de temas.
    await montarPortal(page, { conSesion: true });

    const peticiones: string[] = [];
    page.on('request', r => { if (r.url().includes('/api/notifications')) peticiones.push(r.url()); });

    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}?t=${token}`);
    await expect(page.getByRole('heading', { name: /Hola, Vista\./ })).toBeVisible({ timeout: 30_000 });

    expect(peticiones).toEqual([]);
    // Y la campana enseña el valor de muestra, no un círculo vacío: apagar la
    // petición en el editor no puede significar enseñar ahí un estado de carga
    // congelado que no existe en el portal real. `toBeVisible()` a secas daba
    // por bueno el círculo en blanco.
    await expect(page.getByRole('link', { name: CAMPANA_SIN, exact: true })).toHaveText('0');
  });

  test('si los avisos no se pueden cargar, la campana calla — no dice "0"', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    // Después de montarPortal para que gane esta ruta: la socia sin cobertura,
    // que en una PWA de móvil es el caso normal y no el límite.
    await page.route('**/api/notifications', route => route.abort('failed'));
    await page.goto(`/portal/${SLUG}/home`);

    // Se espera al Inicio por otra cosa que sí carga, para no confundir "falló"
    // con "aún no ha pintado".
    await expect(page.getByRole('heading', { name: /Hola,/ })).toBeVisible({ timeout: 30_000 });

    // Ni número ni punto: no se sabe cuántos hay y decir "0" sería afirmar que
    // está al día. Mismo criterio en la fila de accesos rápidos — las dos
    // representaciones del contador tienen que callar A LA VEZ.
    const campana = page.getByRole('link', { name: CAMPANA_SIN, exact: true });
    await expect(campana).toHaveText('');
    await expect(page.getByRole('link', { name: /^Notificaciones/ })).toHaveCount(2); // campana + fila
    await expect(page.getByText('Al día')).toHaveCount(0);
  });
});
