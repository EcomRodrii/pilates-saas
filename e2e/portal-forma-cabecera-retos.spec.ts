import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// Cabecera del Inicio y tarjetas de Retos por variante (lib/theme-variantes.ts).
// Como en el resto de esta tanda, el primer test de cada bloque fija el
// comportamiento SIN variante — que es lo que ve todo estudio que no haya
// instalado Oliva/Bloom/Noir.

// Las 4 variantes de cabecera (clásica/saludo/nombre/titular) quedaron
// RETIRADAS por decisión explícita (31-ago, verificado contra
// CHEATSHEET-CSS.md/docs/diseno-referencia-portal/): el diseño vigente tiene
// un solo hero fotográfico de 314px, igual para todo estudio, sin variante
// que elegir. `variantes.cabeceraInicio` ya no cambia nada en Home — pasar
// un valor distinto de 'clasica' (como hacía el test `titular` de antes) no
// tiene ningún efecto observable, así que ese test se retira en vez de
// mantenerlo probando una rama muerta.
test.describe('Inicio — cabecera (hero único)', () => {
  test('saludo por hora + nombre, y el mensaje del día como H1 sobre la foto', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByText(/^Buen(os|as) (días|tardes|noches), Marta/)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: /Hoy tienes una cita contigo\.|¿Qué te apetece hoy\?/ }),
    ).toBeVisible();
    // Ya no hay ninguna variante "Hola, {nombre}." — ni con `cabeceraInicio`
    // en su valor por defecto ni pasando otro: se retiró la rama entera.
    await expect(page.getByRole('heading', { name: /^Hola, /, exact: false })).toHaveCount(0);
  });
});

test.describe('Inicio — retos por variante', () => {
  test('sin variante: la tarjeta usa la superficie neutra, no un color propio', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [{ id: 'sistema-retos', kind: 'sistema', sistemaId: 'retos' }],
      retoConteos: { core: 7 },
    });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: 'Retos' })).toBeVisible({ timeout: 30_000 });
    const fondos = await page.getByRole('button', { name: /Apuntarme|Apuntada/ })
      .evaluateAll((els) => els.map((e) => getComputedStyle(e.parentElement as Element).backgroundColor));
    // Los dos IGUALES: sin variante ambos usan la misma superficie del modo.
    expect(fondos[0]).toBe(fondos[1]);
  });

  test('`color`: fondo propio por reto, y el conteo sigue siendo el REAL', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      variantes: { retos: 'color' },
      homeBloques: [
        { id: 'sistema-retos', kind: 'sistema', sistemaId: 'retos' },
      ],
      retoConteos: { core: 7 },
    });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: 'Retos' })).toBeVisible({ timeout: 30_000 });

    // Los dos retos tienen fondos DISTINTOS — es lo que los separa a la vista.
    const fondos = await page.getByRole('button', { name: /Apuntarme|Apuntada/ })
      .evaluateAll((els) => els.map((e) => getComputedStyle(e.parentElement as Element).backgroundColor));
    expect(fondos.length).toBe(2);
    expect(fondos[0]).not.toBe(fondos[1]);

    // El conteo es el del mock, nunca la cifra de marketing del prototipo.
    await expect(page.getByText('7 apuntadas')).toBeVisible();
    await expect(page.getByText(/156 K/)).toHaveCount(0);
  });
});
