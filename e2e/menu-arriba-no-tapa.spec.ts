import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Con el menú ARRIBA, nada pegado puede meterse dentro de la barra.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// La posición «superior» del menú no tenía NI UN test. Su geometría es la de
// una barra `fixed` que envuelve en varias filas —crece con el ancho de la
// ventana, con el zoom, con los módulos que el estudio tenga encendidos— y
// debajo, un Topbar `sticky` con `z-30` contra el `z-20` de la barra. Si el
// tope del sticky se queda corto, el buscador no se esconde detrás del menú:
// lo TAPA, y se ven las filas por detrás de su fondo translúcido.
//
// Eso se reportó con capturas y no había forma de verlo en CI: el panel en
// horizontal no se montaba en ninguna prueba. Esto lo monta y lo MIDE.
//
// ── Qué NO cubre ─────────────────────────────────────────────────────────────
// La aritmética del hueco se prueba aparte y mejor, en `lib/panel-huecos.test.ts`
// —incluido el orden de llamadas que la rompía, que aquí no se puede provocar—.
// Este test es la red de seguridad geométrica: da igual por qué se descuadre,
// si se descuadra se ve.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

async function panelConMenuArriba(page: Page, ancho: number) {
  await montar(page);
  // Registrada DESPUÉS que la de `montar`: Playwright da prioridad a la última.
  await page.route('**/api/layout**', (r) =>
    json(r, { orden: [], ocultos: [], menuPosition: 'superior', home: { orden: [], ocultos: [] } }));
  // «Todo», que es cuando la barra envuelve en varias filas y hay algo que tapar.
  await page.addInitScript(() => localStorage.setItem('nav-mode', 'avanzado'));
  await page.setViewportSize({ width: ancho, height: 900 });
  await ir(page, 'configuracion/apariencia/panel');
}

/** El borde inferior de la barra y el borde superior de lo pegado. */
async function bordes(page: Page) {
  return page.evaluate(() => {
    const barra = document.querySelector('aside.fixed') as HTMLElement | null;
    const pegado = document.querySelector('.sticky.z-30') as HTMLElement | null;
    if (!barra || !pegado) return null;
    const b = barra.getBoundingClientRect();
    const p = pegado.getBoundingClientRect();
    return { barraAbajo: Math.round(b.bottom), barraAlto: Math.round(b.height), pegadoArriba: Math.round(p.top) };
  });
}

test.describe('Menú arriba', () => {
  test('el buscador no se mete en la barra, ni quieto ni al scrollear', async ({ page }) => {
    await panelConMenuArriba(page, 1512);

    const inicial = await bordes(page);
    expect(inicial, 'no se montó el panel en horizontal').not.toBeNull();
    // Guardia contra el verde por vacío: si la barra no hubiera envuelto, este
    // test no estaría midiendo el caso que importa.
    expect(inicial!.barraAlto, 'la barra no llegó a tener más de una fila').toBeGreaterThan(100);
    expect(inicial!.pegadoArriba).toBeGreaterThanOrEqual(inicial!.barraAbajo);

    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(400);
    const scrolleado = await bordes(page);
    expect(scrolleado!.pegadoArriba, 'al scrollear el buscador se ha metido dentro del menú')
      .toBeGreaterThanOrEqual(scrolleado!.barraAbajo);
  });

  test('sigue sin taparse cuando la barra CRECE por estrechar la ventana', async ({ page }) => {
    // El caso que rompía: la barra gana una fila DESPUÉS de haberse medido.
    await panelConMenuArriba(page, 1512);
    const ancho = await bordes(page);

    await page.setViewportSize({ width: 1180, height: 900 });
    await page.waitForTimeout(600);
    const estrecho = await bordes(page);

    expect(estrecho!.barraAlto, 'estrechando la ventana la barra tenía que ganar una fila')
      .toBeGreaterThan(ancho!.barraAlto);
    expect(estrecho!.pegadoArriba).toBeGreaterThanOrEqual(estrecho!.barraAbajo);

    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(400);
    const final = await bordes(page);
    expect(final!.pegadoArriba).toBeGreaterThanOrEqual(final!.barraAbajo);
  });
});
