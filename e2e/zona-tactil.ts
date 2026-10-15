import { expect, type Locator, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// La zona táctil de un control del panel nuevo, medida como se toca (el iPad de
// recepción, `.zona-tactil` en globals.css): un círculo de 44 px centrado en el
// control. Sus 9 marcas (centro, los cuatro lados a 21 px y las cuatro
// diagonales a 15, que caen dentro del círculo) tienen que caer en ÉL o en lo
// que lleva dentro. Así cuenta la zona que crece sin cambiar el dibujo (un
// `::after`) y se ve si la de un control se mete en la del de al lado. Las
// diagonales no van a 21: Chromium no da por tocada la esquina de una caja
// redondeada, y un botón de 44 px con `rounded-lg` fallaría en sus cuatro picos
// aunque se toque bien.

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** El panel sembrado, con el panel nuevo (o sin él) y la guía de primeros pasos plegada. */
export async function abrirPanel(page: Page, ruta: string, panelNuevo = true) {
  await page.addInitScript(() => { try { localStorage.setItem('tentare-primeros-pasos-plegado', '1'); } catch { /* */ } });
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo,
  }));
  await ir(page, ruta);
}

/** Las marcas del círculo de 44 px que NO caen en el control (vacío = bien). */
export async function fueraDeLaZona(control: Locator) {
  await expect(control).toBeVisible({ timeout: 30_000 });
  // Una lista que se vuelve a pintar al llegar sus datos (los recuentos de los
  // filtros de Clientas) puede dejar una caja vacía justo al medir: se repite.
  for (let i = 0; i < 4; i++) {
    const medida = await medirUnaVez(control);
    if (medida.caja !== '0×0') return medida;
    await control.page().waitForTimeout(500);
  }
  return medirUnaVez(control);
}

function medirUnaVez(control: Locator) {
  return control.evaluate((el) => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const marcas: [number, number][] = [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21], [-15, -15], [15, -15], [-15, 15], [15, 15]];
    const fuera: string[] = [];
    for (const [dx, dy] of marcas) {
      const hit = document.elementFromPoint(cx + dx, cy + dy);
      if (!hit || !(hit === el || el.contains(hit))) {
        const quien = hit ? (hit.getAttribute('aria-label') || hit.getAttribute('title') || (hit as HTMLElement).innerText || hit.tagName) : 'nada';
        fuera.push(`(${dx},${dy}) → ${quien.replace(/\s+/g, ' ').trim().slice(0, 30)}`);
      }
    }
    return { caja: `${Math.round(r.width)}×${Math.round(r.height)}`, fuera };
  });
}

/** Los controles cuya zona no llega a 44 px, con dónde cae cada marca que falla. */
export async function controlesCortos(controles: [string, Locator][]) {
  const malos: string[] = [];
  for (const [nombre, control] of controles) {
    const { caja, fuera } = await fueraDeLaZona(control);
    if (fuera.length) malos.push(`${nombre} (${caja}): ${fuera.join(' · ')}`);
  }
  return malos;
}

/** Quita la marca del panel nuevo de la raíz: lo que queda es el diseño de antes. */
export async function quitarMarcaPanelNuevo(page: Page) {
  await expect(page.locator('.panel-app[data-panel-nuevo]')).toHaveCount(1, { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.panel-app')!.removeAttribute('data-panel-nuevo'));
}
