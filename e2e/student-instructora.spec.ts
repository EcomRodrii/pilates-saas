import { test, expect } from '@playwright/test';
import { SESION_ID, SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// La ficha de la instructora desde la hoja de clase. Antes la píldora con su
// nombre era un botón sin acción.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · instructora', () => {
  test('la píldora abre su ficha: bio, próximas clases, y un tap lleva a la clase', async ({ page }) => {
    await sembrarSociaLista(page);
    const f = fixtureSociaLista();
    (f.instructores[0] as unknown as Record<string, unknown>).bio = 'Reformer y suelo pélvico. Diez años enseñando.';
    (f.instructores[0] as unknown as Record<string, unknown>).valoracion = { media: 4.75, total: 23 };
    f.sesiones.push({ ...f.sesiones[0], id: 'ses-12', inicio: '2026-08-13T10:00:00', fin: '2026-08-13T10:50:00' });
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));

    await page.goto(`${base}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /Ana/ }).first().click({ timeout: 30_000 });
    const hoja = page.getByTestId('instructora-sheet');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText('Diez años enseñando', { exact: false })).toBeVisible();
    await expect(hoja.getByText('4,8 · 23 valoraciones')).toBeVisible();
    // Sus clases de hoy en adelante: la de hoy (10:00) y la de mañana.
    await expect(hoja.getByRole('link')).toHaveCount(2);
    await hoja.getByRole('link').last().click();
    await expect(page).toHaveURL(/\/reservar\/ses-12$/);
  });

  test('sin bio ni nota publicable, la ficha no inventa nada', async ({ page }) => {
    await sembrarSociaLista(page);
    const f = fixtureSociaLista();
    (f.instructores[0] as unknown as Record<string, unknown>).valoracion = { media: 5, total: 2 };
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
    await page.goto(`${base}/reservar/${SESION_ID}`);
    await page.getByRole('button', { name: /Ana/ }).first().click({ timeout: 30_000 });
    const hoja = page.getByTestId('instructora-sheet');
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText('★')).toHaveCount(0);
    await expect(hoja.getByText('Instructora del estudio')).toBeVisible();
    void STUDIO_ID;
  });
  // ── «Conoce al equipo»: cuándo encontrar a cada una ──────────────────────
  //
  // La lista daba cara, nombre y especialidades, y no decía en qué momento de
  // la semana existe cada instructora — que es lo que hace falta para elegir
  // con quién reservar. Sale del MISMO payload y la MISMA función que la hoja
  // (`proximasClasesDe`): ni una petición nueva ni un segundo criterio de qué
  // es «próxima».
  test('la lista dice cuándo es la próxima clase de cada una, y calla la de quien no tiene', async ({ page }) => {
    await sembrarSociaLista(page);
    const f = fixtureSociaLista();
    // Cuatro instructoras: hoy más tarde, mañana, el viernes, y ninguna.
    f.instructores = [
      { id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' },
      { id: 'ins-2', studioId: STUDIO_ID, nombre: 'Lucía', rol: 'INSTRUCTOR' },
      { id: 'ins-3', studioId: STUDIO_ID, nombre: 'Marta', rol: 'INSTRUCTOR' },
      { id: 'ins-4', studioId: STUDIO_ID, nombre: 'Nerea', rol: 'INSTRUCTOR' },
    ] as typeof f.instructores;
    const base0 = f.sesiones[0];
    f.sesiones = [
      // ⚠️ La de las 06:00 de Ana YA ha pasado (el reloj del andamiaje son las
      // 08:00) y no debe ganarle a la de las 19:00. Es el caso que justifica
      // pasar la hora y no solo el día.
      { ...base0, id: 's-ana-pasada', instructorId: 'ins-1', inicio: '2026-08-12T06:00:00', fin: '2026-08-12T06:50:00' },
      { ...base0, id: 's-ana', instructorId: 'ins-1', inicio: '2026-08-12T19:00:00', fin: '2026-08-12T19:50:00' },
      { ...base0, id: 's-lucia', instructorId: 'ins-2', inicio: '2026-08-13T10:00:00', fin: '2026-08-13T10:50:00' },
      { ...base0, id: 's-marta', instructorId: 'ins-3', inicio: '2026-08-14T11:30:00', fin: '2026-08-14T12:20:00' },
    ] as typeof f.sesiones;
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));

    await page.goto(`${base}/instructoras`);
    // ⚠️ Por NOMBRE ACCESIBLE y anclado al principio. Dos trampas seguidas:
    //   · `hasText: 'Ana'` es subcadena, y «Ma-ñana 10:00» la contiene — el
    //     localizador resolvía a la fila de Ana Y a la de Lucía;
    //   · anclar con `^` sobre el texto tampoco vale, porque el monograma del
    //     avatar («AN») está en el textContent aunque sea `aria-hidden`.
    // El nombre accesible sí excluye lo oculto, así que ahí «Ana …» sí empieza
    // por «Ana».
    const fila = (n: string) => page.getByRole('button', { name: new RegExp('^' + n + '\\b') });
    await expect(fila('Ana').getByTestId('instructora-proxima')).toHaveText('Próxima · Hoy 19:00', { timeout: 30_000 });
    await expect(fila('Lucía').getByTestId('instructora-proxima')).toHaveText('Próxima · Mañana 10:00');
    await expect(fila('Marta').getByTestId('instructora-proxima')).toHaveText('Próxima · Vie 14 11:30');
    // Sin clases publicadas no se escribe una línea vacía ni un «—».
    await expect(fila('Nerea').getByTestId('instructora-proxima')).toHaveCount(0);
  });
});
