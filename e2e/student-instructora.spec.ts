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
});

// ── «Conoce al equipo»: cuándo encontrar a cada una ─────────────────────────
//
// ⚠️ EL NAVEGADOR VA EN UTC A PROPÓSITO, y el reloj se fija a un INSTANTE
// absoluto. Las dos cosas son el guardia, no andamiaje:
//
// Las horas contra las que se compara vienen todas en la zona del estudio
// (`Clase.hora` sale de `horaLocal`, Europe/Madrid), y «qué hora es» se sacaba
// del reloj del DISPOSITIVO. Con el móvil en otra zona —de viaje, o en
// Canarias— la socia veía como «próxima» una clase que ya había empezado, con
// el desfase exacto de su zona. Con el navegador en hora de Madrid el fallo es
// invisible: por eso se fuerza UTC.
test.describe('Student PWA · «Conoce al equipo», con el móvil en otra zona', () => {
  test.use({ timezoneId: 'UTC' });

  test('la lista dice cuándo es la próxima clase de cada una, y calla la de quien no tiene', async ({ page }) => {
    await sembrarSociaLista(page);
    // Instante absoluto: 06:00Z son las 08:00 en Madrid en agosto. Sin esto,
    // `new Date('2026-08-12T08:00:00')` valdría un instante distinto en mi
    // máquina y en el runner, que es la mitad de lo que falló aquí.
    await page.clock.setFixedTime(new Date('2026-08-12T06:00:00Z'));
    const f = fixtureSociaLista();
    f.instructores = [
      { id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' },
      { id: 'ins-2', studioId: STUDIO_ID, nombre: 'Lucía', rol: 'INSTRUCTOR' },
      { id: 'ins-3', studioId: STUDIO_ID, nombre: 'Marta', rol: 'INSTRUCTOR' },
      { id: 'ins-4', studioId: STUDIO_ID, nombre: 'Nerea', rol: 'INSTRUCTOR' },
    ] as typeof f.instructores;
    const base0 = f.sesiones[0];
    // Con desfase EXPLÍCITO (+02:00 = Madrid en agosto): así estas horas
    // significan lo mismo en cualquier máquina.
    f.sesiones = [
      // Ya empezada a las 08:00 de Madrid: no puede ganarle a la de la tarde.
      { ...base0, id: 's-ana-pasada', instructorId: 'ins-1', inicio: '2026-08-12T06:00:00+02:00', fin: '2026-08-12T06:50:00+02:00' },
      { ...base0, id: 's-ana', instructorId: 'ins-1', inicio: '2026-08-12T19:00:00+02:00', fin: '2026-08-12T19:50:00+02:00' },
      { ...base0, id: 's-lucia', instructorId: 'ins-2', inicio: '2026-08-13T10:00:00+02:00', fin: '2026-08-13T10:50:00+02:00' },
      { ...base0, id: 's-marta', instructorId: 'ins-3', inicio: '2026-08-14T11:30:00+02:00', fin: '2026-08-14T12:20:00+02:00' },
    ] as typeof f.sesiones;
    await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
    await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));

    await page.goto(`${base}/instructoras`);
    // ⚠️ Por NOMBRE ACCESIBLE y anclado al principio. Dos trampas seguidas:
    //   · `hasText: 'Ana'` es subcadena, y «Ma-ñana 10:00» la contiene — el
    //     localizador resolvía a la fila de Ana Y a la de Lucía;
    //   · anclar con `^` sobre el texto tampoco vale, porque el monograma del
    //     avatar («AN») está en el textContent aunque sea `aria-hidden`.
    const fila = (n: string) => page.getByRole('button', { name: new RegExp('^' + n + '\\b') });
    await expect(fila('Ana').getByTestId('instructora-proxima')).toHaveText('Próxima · Hoy 19:00', { timeout: 30_000 });
    await expect(fila('Lucía').getByTestId('instructora-proxima')).toHaveText('Próxima · Mañana 10:00');
    await expect(fila('Marta').getByTestId('instructora-proxima')).toHaveText('Próxima · Vie 14 11:30');
    // Sin clases publicadas no se escribe una línea vacía ni un «—».
    await expect(fila('Nerea').getByTestId('instructora-proxima')).toHaveCount(0);
  });
});
