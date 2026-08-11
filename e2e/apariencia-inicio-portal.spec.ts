import { test, expect, type Page, type Route } from '@playwright/test';
import { abrirCategoriaTema, abrirSecciones } from './apariencia-mock.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Constructor de bloques del portal, dentro del editor a pantalla completa
// (PR 4 — components/theme/theme-editor-fullscreen.tsx). Antes vivía en su
// propia pestaña ("Bloques del portal" → "Secciones", con un selector de
// página); ahora es el grupo "Pantallas" del rail izquierdo, con Inicio
// desplegado por defecto (mismo motivo que antes: es la vista de llegada).
// Guardar borrador/Publicar por pantalla desaparecen — todo pasa por el
// botón único "Publicar" de la barra superior + el diálogo "Antes de
// publicar", que guarda y publica tema + bloques de Inicio/Clases/Bonos
// juntos.
//
// Verifica el lado del EDITOR — el lado del consumo (portal cliente) se
// verifica en e2e/portal-home-modulos.spec.ts (legacy) y
// e2e/portal-home-bloques-render.spec.ts (bloques nuevos).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const BLOQUES_HOME_DEFAULT = [
  { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
  { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
  { id: 'sistema-contenidoEstudio', kind: 'sistema', sistemaId: 'contenidoEstudio' },
];
const BLOQUES_CLASES_DEFAULT = [{ id: 'sistema-listadoClases', kind: 'sistema', sistemaId: 'listadoClases' }];
const BLOQUES_BONOS_DEFAULT = [{ id: 'sistema-listadoBonos', kind: 'sistema', sistemaId: 'listadoBonos' }];

async function montar(page: Page, opts: { bloquesHomeGuardar?: unknown[] } = {}) {
  const putsPorPantalla: Record<string, unknown[][]> = { home: [], clases: [], bonos: [] };
  const publicadasPorPantalla: Record<string, number> = { home: 0, clases: 0, bonos: 0 };
  let temaPublicaciones = 0;

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
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route => json(route, {
    orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] }, portalHome: { orden: [], ocultos: [] },
  }));
  await page.route('**/api/theme**', route => {
    if (route.request().url().endsWith('/publish')) { temaPublicaciones++; return json(route, { primary: '#6D28D9', secondary: '#7C3AED' }); }
    return json(route, { primary: '#6D28D9', secondary: '#7C3AED' });
  });

  const bloques: Record<string, unknown[]> = {
    home: opts.bloquesHomeGuardar ?? BLOQUES_HOME_DEFAULT,
    clases: BLOQUES_CLASES_DEFAULT,
    bonos: BLOQUES_BONOS_DEFAULT,
  };
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    const pantalla = url.searchParams.get('pantalla') ?? 'home';
    // `pantalla=todas`: el editor carga las tres de una sola vez (antes eran
    // tres peticiones para una misma lectura del layout). El mock tiene que
    // conocer esa forma o el editor se queda sin bloques y el test falla
    // diciendo que no encuentra una sección — que es justo lo que pasó.
    if (pantalla === 'todas') return json(route, bloques);
    if (url.pathname.endsWith('/publish')) { publicadasPorPantalla[pantalla]++; return json(route, bloques[pantalla]); }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      putsPorPantalla[pantalla].push(body);
      bloques[pantalla] = body;
      return json(route, body);
    }
    return json(route, bloques[pantalla]);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  // El editor a pantalla completa arranca con "Inicio" ya desplegado en el
  // grupo Pantallas del rail — es la vista de llegada, no hace falta
  // clicar nada para ver sus bloques.
  await page.goto('/configuracion/apariencia/editor');
  return { putsPorPantalla, publicadasPorPantalla, temaPublicacionesRef: () => temaPublicaciones };
}

/** Publica desde el botón único de la barra superior + el diálogo "Antes de publicar". */
async function publicar(page: Page) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Publicar/ }).click();
}

test.describe('Editor a pantalla completa — constructor de bloques del portal', () => {
  test('Inicio llega desplegado, con los 4 módulos de siempre listados', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Accesos rápidos/)).toBeVisible();
    await expect(page.getByText('Invita a una amiga')).toBeVisible();
    await expect(page.getByText(/Contenido del estudio/)).toBeVisible();
  });

  test('ocultar "Invita a una amiga" se autoguarda en el BORRADOR, sin publicar', async ({ page }) => {
    const { putsPorPantalla, publicadasPorPantalla } = await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Ocultar Invita a una amiga' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();

    // Antes esto afirmaba "no manda nada al servidor solo" y esperaba 300 ms.
    // Con el autoguardado (1,5 s de espera tras la última tecla) eso pasaba
    // por accidente de reloj, no porque fuera cierto. Lo que de verdad hay que
    // sostener es la distinción que importa: se guarda el BORRADOR, y publicar
    // sigue siendo un acto deliberado.
    await expect(page.locator('[data-estado-guardado]')).toHaveText(/Guardado/, { timeout: 15_000 });
    expect(putsPorPantalla.home).toHaveLength(1);
    expect(publicadasPorPantalla.home).toBe(0);
  });

  test('añadir un bloque de texto, configurarlo y publicar manda el borrador y publica las 3 pantallas', async ({ page }) => {
    const { putsPorPantalla, publicadasPorPantalla, temaPublicacionesRef } = await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Texto/ }).click();
    await page.locator('textarea').first().fill('Bienvenidas al estudio');

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques/publish') && r.url().includes('pantalla=home')),
      publicar(page),
    ]);

    expect(putsPorPantalla.home.at(-1)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'texto' })]));
    expect(publicadasPorPantalla.home).toBe(1);
    expect(publicadasPorPantalla.clases).toBe(1);
    expect(publicadasPorPantalla.bonos).toBe(1);
    expect(temaPublicacionesRef()).toBe(1);
    await expect(page.getByText('¡Publicado!')).toBeVisible();
  });

  test('un bloque de texto vacío bloquea Publicar con "está incompleto"', async ({ page }) => {
    await montar(page, { bloquesHomeGuardar: [...BLOQUES_HOME_DEFAULT, { id: 'b-vacio', kind: 'texto', config: { titulo: '', texto: '' } }] });
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText(/está incompleto/)).toBeVisible();
    await expect(dialogo.getByRole('button', { name: /Publicar/ })).toBeDisabled();
  });

  test('eliminar un bloque del catálogo (no un bloque sistema) lo quita de la lista', async ({ page }) => {
    await montar(page, {
      bloquesHomeGuardar: [
        ...BLOQUES_HOME_DEFAULT,
        { id: 'b-1', kind: 'texto', config: { titulo: 'Aviso', texto: 'x' } },
      ],
    });
    // ⚠️ `getByText('Aviso')` coincidía por SUBCADENA con el grupo del rail
    // "Avisos y banners" (#747), así que resolvía a dos elementos. Se acota al
    // botón de la fila, que es lo que este test quiere de verdad.
    await expect(page.getByRole('button', { name: 'Texto', exact: true })).toBeVisible({ timeout: 30_000 });
    // Los bloques `sistema` no tienen botón de eliminar; el nuevo sí.
    await expect(page.getByRole('button', { name: /Eliminar Esta semana/ })).toHaveCount(0);
    const eliminar = page.getByRole('button', { name: /Eliminar Texto/ });
    await expect(eliminar).toBeVisible();
    await eliminar.click();
    await expect(eliminar).toHaveCount(0);
  });

  test('desplegar Clases muestra su bloque sistema propio', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Desplegar Clases' }).click();
    await expect(page.getByText('Calendario de clases', { exact: true })).toBeVisible();
  });

  // El rail era una lista plana bajo un solo rótulo, "Pantallas", donde
  // convivían tres productos distintos. "Inicio" e "Inicio del panel" parecían
  // variantes de lo mismo y no lo son: uno lo ve la clienta en su móvil y el
  // otro la recepcionista en el mostrador.
  test('el rail agrupa por a QUIÉN pertenece cada cosa, no en una lista plana', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    for (const grupo of ['Portal de la socia', 'Avisos y banners', 'Panel del equipo']) {
      await expect(page.getByText(grupo, { exact: true })).toBeVisible();
    }
    // Y el grupo NO se llama igual que el bloque "Contenido del estudio" que
    // vive dentro de Inicio: son cosas distintas (aquí se escriben, allí se
    // decide dónde caen) y compartir nombre era la confusión que esto quita.
    //
    // ⚠️ Esto afirmaba `toHaveCount(0)`, y funcionaba de rebote: el bloque se
    // llamaba «Contenido del estudio (mensaje destacado y banners)», así que
    // con `exact: true` no coincidía NADA y el test pasaba sin comprobar lo
    // que dice comprobar. Al acortar los nombres —el paréntesis se fue a la
    // línea gris de debajo— apareció el uno de verdad y saltó.
    //
    // Lo que hay que sostener es que aparezca UNA vez (el bloque) y no dos
    // (bloque + grupo), no que no aparezca ninguna.
    await expect(page.getByText('Contenido del estudio', { exact: true })).toHaveCount(1);

    // Y cada grupo dice de quién es, sin tener que probarlo.
    await expect(page.getByText('Lo que ve tu clienta en su móvil.')).toBeVisible();
    await expect(page.getByText(/No lo ve ninguna clienta/)).toBeVisible();

    // Las pantallas sin bloques lo dicen, en vez de dejar buscando un
    // desplegable que no existe.
    await expect(page.getByText('solo ver').first()).toBeVisible();
  });

  // LA queja de fondo: el estado por defecto de las tres pantallas es 100 %
  // bloques de sistema, y todos tenían `campos: []`. Una propietaria abría el
  // editor y solo podía reordenar y ocultar — no editar NADA — hasta que
  // añadiera un bloque de catálogo. Estos tests no lo cazaban porque todos
  // empiezan añadiendo un bloque de texto: probaban el camino que funciona.
  test('un bloque de SISTEMA abre su panel de propiedades, con los textos de hoy', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    // Sin añadir nada: se selecciona un módulo de los que vienen de fábrica.
    await page.getByText('Invita a una amiga').click();

    // Y aparecen sus campos, rellenos con el texto que hasta ahora estaba
    // escrito a fuego en portal-home-view.tsx para TODOS los estudios.
    const titular = page.getByLabel('Titular', { exact: true });
    await expect(titular).toBeVisible();
    await expect(titular).toHaveValue('La calma se comparte mejor.');
    await expect(page.getByLabel('Texto pequeño de arriba')).toHaveValue('Trae a quien quieras');

    // Y se puede cambiar de verdad.
    await titular.fill('Ven con quien tú quieras');
    await expect(titular).toHaveValue('Ven con quien tú quieras');
  });

  // Los ejes de FORMA (variantes, flags de barra) no tenían ningún control:
  // solo se fijaban instalando un tema entero. Ahora salen del schema
  // (lib/theme/campos-forma.ts) y los pinta el Inspector genérico.
  test('"Forma del portal" cambia una variante y la guarda en el tema, sin perder las demás', async ({ page }) => {
    await montar(page);
    await abrirCategoriaTema(page, 'Forma del portal');

    // Los cinco ejes del panel, con nombre de negocio (no el id del catálogo).
    await expect(page.getByText('Accesos rápidos', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cabecera del Inicio')).toBeVisible();

    await page.getByRole('button', { name: 'Círculos', exact: true }).click();

    // El tema se guarda al publicar; aquí basta con que el borrador lo haya
    // recogido — se comprueba en el control, que refleja el estado real.
    await expect(page.getByRole('button', { name: 'Círculos', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Y el eje que NO se tocó sigue en su valor, que es el fallo clásico de
    // escribir `{ [eje]: valor }` en vez del objeto entero.
    await expect(page.getByRole('button', { name: 'Neutra', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  // Las categorías del tema son un ACORDEÓN dentro de la propia columna, no
  // una lista que abre un panel aparte. Lo que prueba este test es lo que
  // hace falta para que sea un acordeón de verdad y no una lista con adorno:
  // que la cabecera abierta se pueda volver a pulsar para cerrarla. Sin eso
  // no habría ninguna forma de plegarla, porque ya no hay otro sitio donde
  // clicar.
  test('una categoría del tema se despliega y se vuelve a plegar en la misma columna', async ({ page }) => {
    await montar(page);
    const cabecera = page.getByRole('tab', { name: 'Ajustes del tema' });
    await cabecera.click();

    const esquinas = page.getByRole('button', { name: 'Esquinas', exact: true });
    await expect(esquinas).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 });

    await esquinas.click();
    await expect(esquinas).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Recto', exact: true })).toBeVisible();

    await esquinas.click();
    await expect(esquinas).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Recto', exact: true })).toHaveCount(0);
  });

  test('los flags de la barra viven junto a su propio preview, en "Navegación del portal"', async ({ page }) => {
    await montar(page);
    await abrirCategoriaTema(page, 'Navegación del portal');
    await expect(page.getByText('Barra pegada abajo')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Barra oscura')).toBeVisible();
    await expect(page.getByText('Texto bajo los iconos')).toBeVisible();
  });

  // Antes el botón lo confesaba en su propio tooltip: "los ajustes del tema
  // todavía no entran". Cambiar un color no se podía deshacer.
  test('deshacer alcanza también a los ajustes del tema, no solo a los bloques', async ({ page }) => {
    await montar(page);
    await abrirCategoriaTema(page, 'Esquinas');

    const rectas = page.getByRole('button', { name: 'Recto', exact: true });
    await expect(rectas).toBeVisible({ timeout: 30_000 });
    const antes = await rectas.getAttribute('aria-pressed');

    await rectas.click();
    await expect(rectas).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(rectas).toHaveAttribute('aria-pressed', antes ?? 'false');
  });

  // Con DOS historiales y un solo botón, lo que importa es que deshaga lo
  // ÚLTIMO — no lo último de una pila elegida de antemano.
  test('deshacer va a la pila del paso más reciente, aunque las dos tengan pasos', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    // 1º un cambio en BLOQUES.
    await page.getByRole('button', { name: 'Ocultar Invita a una amiga' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();

    // 2º un cambio en AJUSTES, después.
    await abrirCategoriaTema(page, 'Esquinas');
    const rectas = page.getByRole('button', { name: 'Recto', exact: true });
    await rectas.click();
    await expect(rectas).toHaveAttribute('aria-pressed', 'true');

    // Deshacer tiene que quitar lo del TEMA (lo último), dejando el bloque
    // oculto como estaba. Elegir la pila equivocada aquí es el bug que
    // `pilaADeshacer` existe para evitar.
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(rectas).toHaveAttribute('aria-pressed', 'false');
    // Y el cambio ANTERIOR (el del bloque) sigue en pie: deshacer quitó lo
    // último, no lo primero. Hay que volver a Secciones para verlo: el rail
    // ya no enseña las dos mitades a la vez, y la otra no está oculta sino
    // desmontada.
    await abrirSecciones(page);
    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();
  });

  // Las esquinas por pieza usan `numeroHeredado`: la casilla VACÍA es un
  // estado real ("sigue el tema"), no un cero. Si se pintara pre-rellenada,
  // guardar fijaría ese número donde antes había herencia.
  test('las esquinas por pieza llegan vacías, y vaciarlas vuelve a heredar', async ({ page }) => {
    await montar(page);
    await abrirCategoriaTema(page, 'Esquinas');

    const tarjetas = page.getByLabel('Tarjetas', { exact: true });
    await expect(tarjetas).toBeVisible({ timeout: 30_000 });
    // Vacía de verdad, no un número por defecto.
    await expect(tarjetas).toHaveValue('');
    await expect(tarjetas).toHaveAttribute('placeholder', 'Del tema');

    await tarjetas.fill('26');
    await expect(tarjetas).toHaveValue('26');
    // Y se puede volver atrás: vaciar tiene que ser posible, o la herencia
    // sería un billete de ida.
    await tarjetas.fill('');
    await expect(tarjetas).toHaveValue('');
  });

  // Al hacer seleccionables los módulos fijos, un clic dentro de la vista
  // previa deja de navegar. Eso no puede pasar en silencio: hay un
  // interruptor que lo dice con dos palabras, y arranca en "Editar" (que es
  // lo que el editor hacía antes de existir el interruptor).
  test('el interruptor Editar/Navegar arranca en Editar y cambia al pulsar', async ({ page }) => {
    await montar(page);
    // Vive dentro del menú «…» desde que la barra se descongestionó: se usa
    // una vez por sesión, no cada minuto.
    await page.getByRole('button', { name: 'Más opciones' }).click();
    const grupo = page.getByRole('group', { name: 'Qué hace un clic en la vista previa' });
    await expect(grupo).toBeVisible({ timeout: 30_000 });

    const editar = grupo.getByRole('button', { name: 'Seleccionar para editar' });
    const navegar = grupo.getByRole('button', { name: 'Navegar como una socia' });
    await expect(editar).toHaveAttribute('aria-pressed', 'true');
    await expect(navegar).toHaveAttribute('aria-pressed', 'false');

    await navegar.click();
    await expect(navegar).toHaveAttribute('aria-pressed', 'true');
    await expect(editar).toHaveAttribute('aria-pressed', 'false');
    // El menú NO se cierra al elegir: son dos ajustes que se prueban mirando
    // el lienzo, y reabrirlo en cada clic sería un peaje por nada.
    await expect(grupo).toBeVisible();
  });
});

// ── El Inspector agrupa (punto 4 del encargo) ───────────────────────────────
// "Al seleccionar un bloque debe abrirse un panel con TODAS sus propiedades"
// ya se cumplía; lo que faltaba era que ese panel tuviera forma. La tarjeta de
// próxima clase son 16 campos, y en lista plana no es "todo a la vista", es un
// muro: solo una de sus cinco situaciones se da a la vez.
test.describe('Inspector — secciones', () => {
  test('los bloques fijos SIGUEN en la lista después de cargar el borrador', async ({ page }) => {
    // ⚠️ Regresión real: el borrador guardado no contiene los bloques fijos
    // (se añadieron después), y el editor cargaba el GET tal cual. El bloque
    // parpadeaba una vez y desaparecía: la propietaria lo veía en su portal y
    // en la vista previa, pero no podía ni seleccionarlo. El render ya lo
    // arreglaba con `conFijos`; faltaba aplicarlo también al cargar.
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    const fijo = page.getByRole('button', { name: /Tarjeta de próxima clase/ });
    await expect(fijo).toBeVisible();
    await page.waitForTimeout(2500); // más que el autoguardado (1,5 s)
    await expect(fijo).toBeVisible();
  });

  test('la tarjeta de próxima clase abre por secciones, con la primera desplegada', async ({ page }) => {
    await montar(page);
    // Esperar a que el rail asiente antes de clicar: mientras carga se
    // re-renderiza y el botón se desengancha del DOM a media pulsación.
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Tarjeta de próxima clase/ }).click();

    // La PRIMERA sección es la que llega abierta, y desde que la tarjeta puede
    // tener foto propia esa primera es «Foto»: es lo que se viene a tocar, y
    // los grupos salen en el orden de su primer campo.
    const panel = page.getByRole('button', { name: 'Foto', exact: true });
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveAttribute('aria-expanded', 'true');

    // Las otras cinco existen y llegan plegadas.
    for (const titulo of ['Sin clases', 'Próxima clase', 'Bono acabándose', 'Racha en riesgo', 'Sin venir']) {
      const s = page.getByRole('button', { name: titulo, exact: true });
      await expect(s).toBeVisible();
      await expect(s).toHaveAttribute('aria-expanded', 'false');
    }

    // Plegada = su contenido NO está en el DOM (no es solo `display:none`):
    // así el panel se recorre de un vistazo y no hay 17 controles a la vez.
    // Con solo «Foto» abierta no hay ningún «Titular» — los cuatro que existen
    // viven en secciones plegadas.
    await expect(page.getByLabel('Titular')).toHaveCount(0);
    await page.getByRole('button', { name: 'Bono acabándose' }).click();
    await expect(page.getByLabel('Titular')).toHaveCount(1);
  });
});

// ── Etapa 1: el panel de estilo, agrupado y condicional ─────────────────────
test.describe('Inspector — estilo por secciones y condiciones', () => {
  test('"Esquinas" aparece SOLO al poner un fondo', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Texto/ }).click();

    // Las tres secciones del estilo existen; "Forma" llega plegada.
    for (const t of ['Color', 'Disposición', 'Forma']) {
      await expect(page.getByRole('button', { name: t, exact: true })).toBeVisible();
    }
    // ⚠️ Acotado a la SECCIÓN "Forma": "Esquinas" es además una categoría del
    // tema en el rail izquierdo, así que un getByText suelto la encuentra
    // siempre y el test pasaría por el motivo equivocado.
    const forma = page.locator('section').filter({ has: page.getByRole('button', { name: 'Forma', exact: true }) });
    await page.getByRole('button', { name: 'Forma', exact: true }).click();
    await expect(forma.getByText('Sombra')).toBeVisible();
    // Sin fondo ni sombra no hay nada que redondear: el control no está.
    await expect(forma.getByText('Esquinas')).toHaveCount(0);

    // Al poner un fondo, aparece. (La sección "Color" ya llega abierta: es la
    // primera. Clicarla la CERRARÍA.)
    await page.getByLabel('Fondo', { exact: true }).fill('#FFEEDD');
    await expect(forma.getByText('Esquinas')).toBeVisible();
  });
});

// ── Etapa 2: el bloque contenedor ──────────────────────────────────────────
test.describe('Grupo — bloques dentro de bloques', () => {
  test('crear un Grupo, meterle dos bloques y reordenarlos', async ({ page }) => {
    const { putsPorPantalla } = await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Grupo/ }).click();

    // El botón de añadir dentro nombra a su padre: se ve DÓNDE va a caer.
    const dentro = page.getByRole('button', { name: 'Añadir dentro de Grupo' });
    await expect(dentro).toBeVisible();

    await dentro.click();
    await page.getByRole('button', { name: /^Texto/ }).click();
    await dentro.click();
    await page.getByRole('button', { name: /^Vídeo/ }).click();

    // Los dos cuelgan del grupo, y el catálogo de dentro NO ofrece otro Grupo
    // (el anidamiento es de un nivel).
    await dentro.click();
    await expect(page.getByRole('dialog', { name: 'Elegir una sección' }).getByRole('button', { name: /^Grupo/ })).toHaveCount(0);
    // El picker se cierra pulsando fuera. `Escape` no lo cierra, y su fondo a
    // pantalla completa se come todos los clics siguientes.
    await page.locator('button.fixed.inset-0').click();

    // Reordenar con las flechas: "Subir Vídeo" existe y "Subir Texto" no,
    // porque Texto ya es el primero.
    await expect(page.getByRole('button', { name: 'Subir Vídeo' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Subir Texto' })).toBeDisabled();
    await page.getByRole('button', { name: 'Subir Vídeo' }).click();
    await expect(page.getByRole('button', { name: 'Subir Vídeo' })).toBeDisabled();

    // Y todo eso viaja al borrador en el mismo autoguardado.
    await expect(page.locator('[data-estado-guardado]')).toHaveText(/Guardado/, { timeout: 15_000 });
    const ultimo = putsPorPantalla.home.at(-1) as Array<{ kind: string; hijos?: unknown[] }>;
    const grupo = ultimo.find((b) => b.kind === 'contenedor');
    expect(grupo?.hijos).toHaveLength(2);
  });

  test('un hijo abre su propio panel de propiedades', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Grupo/ }).click();
    await page.getByRole('button', { name: 'Añadir dentro de Grupo' }).click();
    await page.getByRole('button', { name: /^Texto/ }).click();

    // Al añadirlo queda seleccionado: el panel es el del HIJO, no el del grupo.
    await expect(page.locator('textarea').first()).toBeVisible();
    await page.locator('textarea').first().fill('Dentro del grupo');
    await expect(page.locator('textarea').first()).toHaveValue('Dentro del grupo');
  });
});

// ── Etapa 4: duplicar (primer consumidor del documento mapa+orden) ─────────
test.describe('Duplicar un bloque', () => {
  test('la copia cae JUSTO detrás, con su contenido, y queda seleccionada', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Texto/ }).click();
    await page.locator('textarea').first().fill('Se copia conmigo');

    await page.getByRole('button', { name: 'Duplicar Texto' }).first().click();

    // Dos filas "Texto" en el rail, y el panel abierto es el de la COPIA con
    // el contenido del original.
    await expect(page.getByRole('button', { name: 'Duplicar Texto' })).toHaveCount(2);
    await expect(page.locator('textarea').first()).toHaveValue('Se copia conmigo');

    // Editar la copia NO toca al original: son identidades distintas.
    await page.locator('textarea').first().fill('Solo la copia');
    const valores = await page.locator('textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    expect(valores.filter((v) => v === 'Solo la copia')).toHaveLength(1);
  });

  test('un bloque de SISTEMA no se puede duplicar', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Duplicar Esta semana' })).toHaveCount(0);
  });
});

// ── Fotos por bloque ────────────────────────────────────────────────────────
// Todo el trabajo de imágenes (subida real desde el editor, foto propia por
// tarjeta y por pantalla) entró sin una sola prueba de pantalla. Estas cubren
// lo que se rompería sin que nadie se entere: que el control siga siendo de
// SUBIR y no una casilla de pegar URL, y que la foto llegue al guardado.
test.describe('Fotos por bloque', () => {
  test('un banner ofrece SUBIR la foto, no solo pegar un enlace', async ({ page }) => {
    await montar(page, {
      bloquesHomeGuardar: [
        ...BLOQUES_HOME_DEFAULT,
        { id: 'b-ban', kind: 'banner', config: { imagenUrl: '', titulo: 'T', texto: '', href: '' } },
      ],
    });
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    // ⚠️ `/^Banner/` y no `/Banner/`: el rail tiene también «Reordenar
    // Banner», que casa antes y no abre el panel — el test fallaba por eso,
    // no por el código.
    await page.getByRole('button', { name: /^Banner/ }).click();

    // Lo que importa: hay un botón de subir. Antes esto era un `<input>` de
    // texto donde había que pegar una URL — el campo existía y no lo usaba
    // nadie.
    await expect(page.getByRole('button', { name: 'Subir foto' })).toBeVisible();

    // Y el enlace sigue disponible para quien ya tenga la foto en su web,
    // pero PLEGADO: no es lo primero que se ofrece.
    const verEnlace = page.getByRole('button', { name: 'o pegar un enlace' });
    await expect(verEnlace).toBeVisible();
    await expect(page.getByLabel(/Enlace de/)).toHaveCount(0);
    await verEnlace.click();
    await expect(page.getByLabel(/Enlace de/)).toBeVisible();
  });

  test('la foto pegada en un banner llega al borrador que se guarda', async ({ page }) => {
    const { putsPorPantalla } = await montar(page, {
      bloquesHomeGuardar: [
        ...BLOQUES_HOME_DEFAULT,
        { id: 'b-ban', kind: 'banner', config: { imagenUrl: '', titulo: 'T', texto: '', href: '' } },
      ],
    });
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    // ⚠️ `/^Banner/` y no `/Banner/`: el rail tiene también «Reordenar
    // Banner», que casa antes y no abre el panel — el test fallaba por eso,
    // no por el código.
    await page.getByRole('button', { name: /^Banner/ }).click();
    await page.getByRole('button', { name: 'o pegar un enlace' }).click();
    await page.getByLabel(/Enlace de/).fill('https://ejemplo.test/sala.jpg');

    await expect(page.locator('[data-estado-guardado]')).toHaveText(/Guardado/, { timeout: 15_000 });
    expect(putsPorPantalla.home.at(-1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'b-ban', config: expect.objectContaining({ imagenUrl: 'https://ejemplo.test/sala.jpg' }) }),
    ]));
  });

  test('la tarjeta de próxima clase tiene su propia foto, separada de la del portal', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    // Es un bloque FIJO: su fila se llama «… siempre arriba» y no tiene
    // botón de reordenar, así que el prefijo basta y es único.
    await page.getByRole('button', { name: /^Tarjeta de próxima clase/ }).click();

    // La sección «Foto» llega abierta y con su control de subida dentro.
    await expect(page.getByRole('button', { name: 'Foto', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Subir foto' })).toBeVisible();
  });
});
