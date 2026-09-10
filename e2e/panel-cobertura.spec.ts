import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// Cuánto del panel ven de verdad las suites que se apoyan en `panel-sembrado`.
//
// ⚠️ Este fichero no busca bugs del producto: mide el ANDAMIAJE. El catch-all
// de `montar()` contesta **`{}` con éxito** a todo endpoint `/api/` que no esté
// sembrado —el panel llama a unos 200 y allí se nombran cinco—, así que la
// pantalla pinta su estado vacío y el test que la mire pasará sin haber visto
// nada. Ya costó un susto: «Un `[...data.prioridades]` a secas con un `{}` por
// respuesta no rompe su tarjeta: rompe la pantalla principal del negocio».
//
// Lo que hace este test es dejar por escrito CUÁNTO se contesta en falso hoy,
// pantalla por pantalla, para que el número solo pueda bajar. Si alguien siembra
// un endpoint, el tope de esa pantalla baja y el test lo pide. Si alguien añade
// una pantalla que pide diez cosas sin sembrar ninguna, sale aquí.

/** Tope de endpoints contestados con `{}` que se acepta HOY en cada pantalla. */
const TOPE: Record<string, number> = {
  dashboard: 7,
  cobros: 5,
  clientas: 5,
  productos: 5,
  equipo: 8,
  informes: 6,
  'centro-de-control': 7,
  calendario: 7,
  citas: 5,
  configuracion: 5,
  automatizaciones: 5,
  cierre: 6,
  comunidad: 6,
  libreta: 5,
  mensajeria: 5,
  'mi-perfil': 13,
  sustituciones: 7,
};

test.describe('Panel · cobertura del andamiaje', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [ruta, tope] of Object.entries(TOPE)) {
    test(`${ruta}: no se contesta en falso más de lo ya sabido`, async ({ page }) => {
      const cob = await montar(page);
      await ir(page, ruta);
      await page.waitForTimeout(3500);

      const texto = await page.locator('body').innerText();
      expect(texto, `${ruta} no llegó a pintar`).not.toContain('Esta página no existe');

      const falsos = cob.sinSembrar();
      expect(
        falsos.length,
        `${ruta} contesta \`{}\` a ${falsos.length} endpoints (tope ${tope}):\n  ${falsos.join('\n  ')}\n` +
        'Si has sembrado alguno, baja el tope. Si has añadido pantalla o llamada, siémbrala o sube el tope a sabiendas.',
      ).toBeLessThanOrEqual(tope);
    });
  }
});
