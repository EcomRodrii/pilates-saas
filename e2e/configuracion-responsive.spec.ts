import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { SECCIONES, type TarjetaConfiguracion } from '../lib/configuracion/secciones';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración cabe en un móvil, en el iPad de recepción y en un portátil.
//
// El fundador la describió como «0 responsive», y tenía razón con números: el
// horario de la semana pedía 440 px en una columna de 295 y la página se
// desplazaba de lado, los interruptores medían 20×36, los campos iban a 13 px
// (iOS amplía la página al enfocarlos) y el «Guardar» se quedaba debajo de la
// barra de navegación del móvil. Nada de eso falla en un test normal: la
// pantalla funciona, solo que no se puede usar con el dedo.
//
// Cada comprobación sale de la especificación de la reorganización (§6):
//   1. nada se sale de lado — ni la lista, ni ninguna sección, ni un modal;
//   2. con el dedo, ningún campo por debajo de 16 px;
//   3. con el dedo, todo lo que se pulsa mide al menos 44 px;
//   4. la barra de guardar no queda debajo de la navegación;
//   5. cada sección está a un toque y cada tarjeta, en su sección;
//   8. girar el iPad no cambia de sección ni pierde el ancla;
//  11. los modales dejan margen a los lados en el móvil.
//
// ⚠️ Esto NO sustituye mirarlo en un iPhone y un iPad de verdad: el teclado de
// iOS y su zoom al enfocar no los reproduce Playwright.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const UID = 'auth-e2e-duena';

// El estudio sembrado, con plan de pago: Motivación vive tras un PlanGate y sin
// plan sus tarjetas ni se pintan.
const STUDIO = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID, email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
  plan: 'ESTUDIO', subscription_status: 'active',
};

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function panel(page: Page) {
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO));
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
}

const raiz = '[data-tour="configuracion-vista"]';
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

async function abrir(page: Page, seccion: { id: string; titulo: string }) {
  await ir(page, `configuracion?tab=${seccion.id}`);
  await expect(titulo(page, seccion.titulo)).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(sel => !document.querySelector(`${sel} .animate-pulse`), raiz, { timeout: 10_000 }).catch(() => {});
  // Lo plegado también cuenta: «Opciones avanzadas» se abre para medirlo.
  await page.evaluate(sel => document.querySelectorAll<HTMLDetailsElement>(`${sel} details`).forEach(d => { d.open = true; }), raiz);
  await page.waitForTimeout(300);
}

/** Cuánto se sale la página de lado (0 o menos: nada). */
const desborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Campos de texto visibles con la letra por debajo de 16 px. */
const camposPequenos = (page: Page) => page.evaluate(sel => {
  const sinTexto = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'button', 'submit', 'reset', 'image']);
  return [...document.querySelectorAll<HTMLElement>(`${sel} input, ${sel} select, ${sel} textarea`)]
    .filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (el instanceof HTMLInputElement && sinTexto.has(el.type)) return false;
      return parseFloat(getComputedStyle(el).fontSize) < 16;
    })
    .map(el => `${el.tagName.toLowerCase()} «${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id}» ${getComputedStyle(el).fontSize}`);
}, raiz);

/**
 * Todo lo que se pulsa y mide menos de 44 px. Un interruptor cuenta con su
 * `::before` invisible (el área que se toca, no el dibujo). Fuera, por la
 * especificación: los enlaces dentro de un texto y las vistas previas, que
 * tienen que ser iguales a lo que ve la alumna.
 */
const objetivosPequenos = (page: Page) => page.evaluate(sel => {
  const px = (v: string) => parseFloat(v) || 0;
  return [...document.querySelectorAll<HTMLElement>(`${sel} a, ${sel} button, ${sel} [role="switch"]`)]
    .flatMap(el => {
      if (el.closest('[data-vista-previa]')) return [];
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return [];
      const cs = getComputedStyle(el);
      if (el.tagName === 'A' && cs.display === 'inline') return [];
      let ancho = r.width;
      let alto = r.height;
      const antes = getComputedStyle(el, '::before');
      if (antes.position === 'absolute') {
        ancho = Math.max(ancho, r.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - px(antes.left) - px(antes.right));
        alto = Math.max(alto, r.height - px(cs.borderTopWidth) - px(cs.borderBottomWidth) - px(antes.top) - px(antes.bottom));
      }
      if (ancho >= 43.5 && alto >= 43.5) return [];
      const nombre = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      return [`${el.tagName.toLowerCase()} «${nombre}» ${Math.round(ancho)}×${Math.round(alto)}`];
    });
}, raiz);

const VISTAS = [
  {
    nombre: 'móvil 375×812',
    uso: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    tactil: true, conNavInferior: true, columna: false,
  },
  {
    nombre: 'iPad vertical 768×1024',
    uso: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    tactil: true, conNavInferior: true, columna: true,
  },
  {
    nombre: 'portátil 1024×768',
    uso: { viewport: { width: 1024, height: 768 } },
    tactil: false, conNavInferior: false, columna: true,
  },
] as const;

for (const vista of VISTAS) {
  test.describe(`Configuración en ${vista.nombre}`, () => {
    test.use(vista.uso);

    test('el puntero es el que toca (si no, lo demás pasaría en verde sin medir nada)', async ({ page }) => {
      await panel(page);
      await ir(page, 'configuracion');
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(vista.tactil);
    });

    test('1-3 · nada se sale de lado, y con el dedo los campos van a 16 px y lo que se pulsa a 44', async ({ page }) => {
      test.setTimeout(240_000);
      await panel(page);

      await ir(page, 'configuracion');
      await expect(page.locator('#inicio-seccion-estudio')).toBeVisible({ timeout: 30_000 });
      expect(await desborde(page), 'el inicio se sale de lado').toBeLessThanOrEqual(0);
      if (vista.tactil) {
        expect([...await camposPequenos(page), ...await objetivosPequenos(page)], 'el inicio').toEqual([]);
      }

      const fallos: string[] = [];
      for (const seccion of SECCIONES) {
        await abrir(page, seccion);
        const sobra = await desborde(page);
        if (sobra > 0) fallos.push(`${seccion.id}: se sale ${sobra} px de lado`);
        if (vista.tactil) {
          for (const c of await camposPequenos(page)) fallos.push(`${seccion.id}: campo ${c}`);
          for (const o of await objetivosPequenos(page)) fallos.push(`${seccion.id}: objetivo ${o}`);
        }
      }
      expect(fallos, `\n${fallos.join('\n')}\n`).toEqual([]);
    });

    // Desde el 15-sep (v2) las reglas de reserva se cambian en un cajón: su barra
    // va pegada al borde de abajo del cajón, que tapa la navegación.
    test('4 · la barra de guardar de un cajón queda a la vista, también al ir campo a campo', async ({ page }) => {
      await panel(page);
      await abrir(page, { id: 'reservas', titulo: 'Cómo reservan mis alumnas' });

      await page.locator('#reservar').click();
      const cajon = page.getByRole('dialog');
      await expect(titulo(page, 'Reservar')).toBeFocused();
      // Entra deslizándose desde la derecha: se mide cuando ha llegado.
      await expect.poll(async () => {
        const b = await cajon.boundingBox();
        return b ? Math.round(b.x + b.width) : null;
      }).toBe(vista.uso.viewport.width);
      await cajon.getByLabel('Días antes de la clase en que se abre la reserva').fill('30');
      const barra = cajon.locator('[data-barra-guardar]');
      await expect(barra).toContainText('Cambios sin guardar en: Reservar');

      const cajaBarra = (await barra.boundingBox())!;
      expect(cajaBarra.y + cajaBarra.height, 'la barra de guardar, dentro de la pantalla').toBeLessThanOrEqual(vista.uso.viewport.height + 0.5);
      const alcanzable = await page.evaluate(() => {
        const boton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] [data-barra-guardar] button')].at(-1)!;
        const r = boton.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!el && boton.contains(el);
      });
      expect(alcanzable, '«Guardar» se puede pulsar').toBe(true);

      // Campo a campo con el teclado, por el cajón: ninguno queda tapado por la barra.
      await cajon.locator('input').first().focus();
      const tapados: string[] = [];
      let medidos = 0;
      // Se mide ANTES de pasar al siguiente: el primero también cuenta.
      for (let i = 0; i < 20; i++) {
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el?.closest('[role="dialog"]') || !el.matches('input, select, textarea')) return null;
          const barraEl = document.querySelector('[role="dialog"] [data-barra-guardar]')!;
          const campo = el.getBoundingClientRect();
          const tope = Math.min(barraEl.getBoundingClientRect().top, window.innerHeight);
          return campo.bottom > tope + 0.5 ? `${el.id || el.getAttribute('aria-label') || el.tagName} (${Math.round(campo.bottom)} > ${Math.round(tope)})` : '';
        });
        if (r !== null) {
          medidos++;
          if (r) tapados.push(r);
        }
        await page.keyboard.press('Tab');
      }
      // Verde por vacío no: tiene que haber recorrido campos de verdad.
      expect(medidos, 'campos recorridos').toBeGreaterThan(2);
      expect(tapados, `\n${tapados.join('\n')}\n`).toEqual([]);
    });

    test('5 · cada sección está a un toque, y en ella cada una de sus tarjetas', async ({ page }) => {
      test.setTimeout(240_000);
      await panel(page);
      await ir(page, 'configuracion');
      const filaInicio = (id: string) => page.locator(`#inicio-seccion-${id}`);
      await expect(filaInicio('estudio')).toBeVisible({ timeout: 30_000 });
      // El inicio tiene todas las secciones, a cualquier anchura.
      await expect(page.locator('[id^="inicio-seccion-"]')).toHaveCount(SECCIONES.length);
      const nav = page.getByRole('navigation', { name: 'Secciones de Configuración' });
      if (vista.columna) await expect(nav.getByRole('link')).toHaveCount(SECCIONES.length + 3); // + «Configuración», «Plan de Tentare» y «Mi cuenta»

      const faltan: string[] = [];
      for (const seccion of SECCIONES) {
        // Con columna se salta de sección en sección por ella; en el móvil, desde el inicio.
        if (vista.columna) await nav.getByRole('link', { name: seccion.titulo, exact: true }).click();
        else await filaInicio(seccion.id).click();
        await expect(titulo(page, seccion.titulo)).toBeVisible({ timeout: 30_000 });

        for (const t of seccion.tarjetas as readonly TarjetaConfiguracion[]) {
          if (t.condicion) continue; // sedes y catálogo de la cadena: solo con varias sedes
          // En la sección, una herramienta es su fila; sus tarjetas están en su pantalla.
          // Se espera igual que a una tarjeta: en «Clases» y «Comunicación» la
          // fila es lo primero de la sección y se miraba antes de que cargara.
          if (t.herramienta) {
            const fila = page.locator(`#fila-herramienta-${t.herramienta}`);
            if (!(await fila.count())) {
              await fila.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => faltan.push(`${seccion.id}#fila-herramienta-${t.herramienta}`));
            }
            continue;
          }
          if (!(await page.locator(`#${t.id}`).count())) {
            await page.locator(`#${t.id}`).waitFor({ state: 'attached', timeout: 10_000 }).catch(() => faltan.push(`${seccion.id}#${t.id}`));
          }
        }

        if (!vista.columna) {
          await page.getByRole('button', { name: 'Volver a Configuración' }).click();
          await expect(filaInicio(seccion.id)).toBeVisible();
          // «Volver» es el atrás del navegador: se espera a que la URL llegue
          // antes del siguiente toque, como le pasa a una persona. Tocar otra
          // fila con el atrás aún en vuelo mezcla los dos pasos del historial.
          await expect(page).toHaveURL(/\/configuracion$/);
        }
      }
      expect(faltan, `\n${faltan.join('\n')}\n`).toEqual([]);
    });

    if (vista.nombre.startsWith('iPad')) {
      test('8 · girar el iPad deja la misma herramienta abierta', async ({ page }) => {
        await panel(page);
        await ir(page, 'configuracion?tab=web&abrir=widgets');
        await expect(titulo(page, 'Widgets para tu web')).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#widgets')).toBeVisible({ timeout: 15_000 });

        await page.setViewportSize({ width: 1024, height: 768 });
        await expect(titulo(page, 'Widgets para tu web')).toBeVisible();
        await expect(page).toHaveURL(/\?tab=web&abrir=widgets$/);
        await expect(page.locator('#widgets')).toBeVisible();

        await page.setViewportSize({ width: 768, height: 1024 });
        await expect(titulo(page, 'Widgets para tu web')).toBeVisible();
        await expect(page).toHaveURL(/\?tab=web&abrir=widgets$/);
      });
    }

    if (vista.nombre.startsWith('móvil')) {
      test('11 · los modales dejan margen a los lados y no sacan la página de lado', async ({ page }) => {
        await panel(page);
        const modales: [{ id: string; titulo: string }, () => Promise<void>][] = [
          // Salas y correos, en la pantalla de su herramienta (15-sep, v2).
          [{ id: 'estudio&abrir=salas', titulo: 'Salas' }, () => page.getByRole('button', { name: 'Nueva sala' }).click()],
          [{ id: 'clases', titulo: 'Mis clases y citas' }, () => page.getByRole('button', { name: 'Nuevo servicio' }).click()],
          [{ id: 'comunicacion&abrir=correos-automaticos', titulo: 'Correos automáticos' }, () => page.getByRole('button', { name: /Bienvenida/ }).click()],
        ];
        for (const [seccion, abrirModal] of modales) {
          await abrir(page, seccion);
          await abrirModal();
          const dialogo = page.getByRole('dialog');
          await expect(dialogo).toBeVisible();
          await page.waitForTimeout(300); // la animación de entrada escala el modal
          const caja = (await dialogo.boundingBox())!;
          expect(caja.x, `${seccion.id}: margen izquierdo del modal`).toBeGreaterThanOrEqual(16);
          expect(375 - (caja.x + caja.width), `${seccion.id}: margen derecho del modal`).toBeGreaterThanOrEqual(16);
          expect(await desborde(page), `${seccion.id}: con el modal abierto`).toBeLessThanOrEqual(0);
          await page.keyboard.press('Escape');
          await expect(dialogo).toHaveCount(0);
        }
      });
    }
  });
}
