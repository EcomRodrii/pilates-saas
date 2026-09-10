import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// El botón de filtros de Inicio y la hoja que abre.
//
// ⚠️ El test de la POSICIÓN no es decorativo. La hoja vive dentro del
// formulario del buscador, que lleva `.a-up`; esa animación termina en
// `transform: none` pero el `fill-mode` deja el estilo calculado en
// `matrix(1, 0, 0, 1, 0, 0)`, y una matriz identidad sigue creando bloque
// contenedor. Con eso, un `position: fixed` deja de referirse a la ventana:
// medido antes del arreglo, el panel salía a y=212 en una ventana de 852 y el
// velo cubría solo la caja del formulario. Se arregla portando la hoja a un
// anfitrión propio; esto es lo que impide que vuelva.

const base = `/portal/${SLUG}`;

test.describe('Student PWA · filtros rápidos de Inicio', () => {
  test.describe.configure({ timeout: 90_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('la hoja se abre pegada abajo, no donde la deje su ancestro', async ({ page }) => {
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.getByRole('button', { name: 'Filtrar clases' }).click();

    const panel = page.getByRole('dialog', { name: 'Filtrar clases' });
    await expect(panel).toBeVisible();
    const alto = page.viewportSize()!.height;
    // ⚠️ Con `poll`, no con una medida a secas: la hoja ENTRA deslizándose
    // (spring de `--dur-sheet`), así que medir justo después del clic la pilla
    // a mitad de camino — 25,7 px por debajo del borde la primera vez. Lo que
    // se afirma es dónde ACABA.
    await expect.poll(
      async () => {
        const c = await panel.boundingBox();
        return c ? Math.round(c.y + c.height) : -1;
      },
      { timeout: 10_000, message: 'la hoja acaba pegada al borde de abajo de la ventana' },
    ).toBe(alto);
    const caja = await panel.boundingBox();
    expect(caja!.x, 'y ocupa desde el borde izquierdo').toBeLessThanOrEqual(1);
  });

  test('la hoja se pinta CON los estilos del kit', async ({ page }) => {
    // El portal la saca de `<main>`; si además la sacara de `.student-app`,
    // saldría bien colocada y sin una sola regla encima — pasó: texto plano,
    // sin píldoras y sin el color del estudio.
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.getByRole('button', { name: 'Filtrar clases' }).click();
    const panel = page.getByRole('dialog', { name: 'Filtrar clases' });
    await expect(panel).toBeVisible();
    const radio = await panel.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(radio, 'la hoja tiene su radio del kit').not.toBe('0px');
    const pastilla = panel.getByRole('button', { name: 'Con plaza libre' });
    await expect(pastilla).toBeVisible();
    const bordePildora = await pastilla.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(bordePildora, 'las píldoras son píldoras').not.toBe('0px');
  });

  test('elegir un filtro abre el horario YA filtrado', async ({ page }) => {
    await sembrarSociaCompleta(page);
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.getByRole('button', { name: 'Filtrar clases' }).click();
    await page.getByRole('button', { name: 'Con plaza libre' }).click();
    await expect(page).toHaveURL(/\/reservar\?filtro=Con\+hueco|\/reservar\?filtro=Con%20hueco/);
    // Y llega marcado, no solo con el parámetro puesto.
    await expect(page.getByRole('button', { name: 'Con hueco', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('un `?filtro=` que esta alumna no tiene no la deja en una lista vacía', async ({ page }) => {
    // «Favoritas» solo existe como píldora si ha guardado alguna. Sin el
    // respaldo, llegar con ese parámetro dejaba un horario vacío y ni siquiera
    // la píldora con la que quitarlo.
    await sembrarSociaCompleta(page);
    await page.goto(`${base}/reservar?filtro=Favoritas`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await expect(page.getByRole('button', { name: 'Todo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
