import { expect, test, type Page } from '@playwright/test';
import { STUDIO_ID, json, montarAlta, saltarLogo } from './onboarding-andamio';
import { CAPITULOS } from '../lib/tour/capitulos.ts';

// La visita guiada por capítulos (lib/tour/, components/tour/).
//
// Mismo andamiaje que el alta (sesión sembrada y `**/api/**` → `{}`), con un
// estudio NUEVO (`tour_obligatorio`) que ya selló la bienvenida. Los demás specs
// del panel no traen esa columna: valen `false` y la visita nunca arranca, así que
// no hace falta ningún flag de E2E que la apague (y por eso aquí NO se enmascara).
//
// ⚠️ Cada test de un camino de fallo cuenta sus intentos: `expect(intentos)
// .toBeGreaterThan(0)`. Un «no mintió» sin contador puede ser verdad porque nunca
// se intentó nada (test-4xx-necesita-contador-de-intentos).
const BIENVENIDA = '2026-10-07T10:00:00Z';

interface Servidor { patches: Record<string, unknown>[]; progreso: unknown; fallar: boolean; intentos: number }

async function montarVisita(
  page: Page,
  opciones: { nuevo?: boolean; progreso?: unknown; fallar?: boolean; extra?: (p: Page) => Promise<void> } = {},
) {
  const s: Servidor = { patches: [], progreso: opciones.progreso ?? {}, fallar: opciones.fallar ?? false, intentos: 0 };
  await montarAlta(page, {
    estudio: { bienvenida_vista_en: BIENVENIDA },
    antes: async (p) => {
      // Después de las rutas por defecto del andamiaje: la última registrada gana.
      await p.route('**/rest/v1/studios**', route => {
        const req = route.request();
        if (req.method() === 'PATCH') {
          s.intentos += 1;
          if (s.fallar) return json(route, { message: 'boom' }, 500);
          const cuerpo = (req.postDataJSON() ?? {}) as Record<string, unknown>;
          s.patches.push(cuerpo);
          if ('tour_progreso' in cuerpo) s.progreso = cuerpo.tour_progreso;
          return json(route, [{ id: STUDIO_ID }]);
        }
        return json(route, {
          id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', color_primario: '#4F46E5',
          owner_auth_user_id: 'auth-e2e-duena', bienvenida_vista_en: BIENVENIDA,
          tour_obligatorio: opciones.nuevo ?? true, tour_progreso: s.progreso, tour_completado_en: null,
        });
      });
      if (opciones.extra) await opciones.extra(p);
    },
  });
  return s;
}

const inicio = (page: Page) => page.getByRole('heading', { name: 'Vamos a recorrer Tentare juntas' });
const tarjeta = (page: Page, titulo: string) => page.getByRole('region', { name: `Visita guiada: ${titulo}` });

test.describe('La visita guiada por capítulos', () => {
  test('arranca sola en un estudio nuevo, y no se puede cerrar ni saltar', async ({ page }) => {
    await montarVisita(page);
    await expect(inicio(page)).toBeVisible({ timeout: 30_000 });
    const pantalla = page.getByRole('dialog', { name: 'Visita guiada de Tentare' });
    await expect(pantalla).toContainText(/\d+ capítulos, unos \d+ minutos/);
    await expect(pantalla).toContainText('El mapa');
    await expect(pantalla).toContainText('Tarifas: qué vendes, a quién y para qué clases');
    // Sin salida: ni «Ahora no», ni «Saltar», ni «Cerrar».
    for (const nombre of [/ahora no/i, /saltar/i, /cerrar/i, /salir/i]) {
      await expect(pantalla.getByRole('button', { name: nombre })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');
    await expect(inicio(page)).toBeVisible();
  });

  test('en un estudio que ya existía NO arranca (con control positivo de que el panel cargó)', async ({ page }) => {
    await montarVisita(page, { nuevo: false });
    await expect(page.getByRole('link', { name: 'Calendario' }).first()).toBeVisible({ timeout: 30_000 });
    await expect(inicio(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: /Visita guiada/ })).toHaveCount(0);
  });

  test('«Empezar» guarda el progreso en el servidor y enseña el primer paso sin X', async ({ page }) => {
    const s = await montarVisita(page);
    await inicio(page).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: /Empezar/ }).click();

    const paso = tarjeta(page, 'Tu menú');
    await expect(paso).toBeVisible();
    await expect(paso).toContainText(/Capítulo 1 de \d+ · Paso 1 de 3/);
    await expect(paso.getByRole('button', { name: /saltar|cerrar|salir/i })).toHaveCount(0);
    // Ocultar la tarjeta no es omitir: queda la píldora, y se vuelve a abrir.
    await paso.getByRole('button', { name: /Ocultar la tarjeta/ }).click();
    const pildora = page.getByRole('button', { name: /Visita guiada · Cap\. 1 de \d+ · Continuar/ });
    await expect(pildora).toBeVisible();
    await pildora.click();
    await expect(paso).toBeVisible();

    await expect.poll(() => s.patches.some(p => (p.tour_progreso as { inicio?: boolean } | undefined)?.inicio === true)).toBe(true);
  });

  test('«Entendido» avanza, y al recargar sigue en el paso exacto', async ({ page }) => {
    const s = await montarVisita(page);
    await inicio(page).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: /Empezar/ }).click();
    await tarjeta(page, 'Tu menú').getByRole('button', { name: /Entendido/ }).click();
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible();
    await expect.poll(() => JSON.stringify(s.progreso)).toContain('c1.1');
    // Guardado en el servidor: NO queda copia en el navegador (si quedara, ganaría al servidor y no se
    // podría reiniciar la visita desde la base de datos).
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('panel-tour-respaldo')))).toEqual([]);

    await page.reload();
    // No vuelve a la bienvenida: reanuda en el paso 2 del capítulo 1.
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible({ timeout: 30_000 });
    await expect(inicio(page)).toHaveCount(0);
  });

  test('si te vas a otra pantalla, no te persigue: dice dónde está el paso y ofrece «Llévame»', async ({ page }) => {
    // Navega a pantallas pesadas (calendario, Paquetes, Configuración): en CI la primera compilación tarda.
    test.slow();
    await montarVisita(page);
    await inicio(page).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: /Empezar/ }).click();
    await expect(tarjeta(page, 'Tu menú')).toBeVisible();

    await page.goto('/calendario');
    const paso = tarjeta(page, 'Tu menú');
    await expect(paso).toBeVisible({ timeout: 30_000 });
    await expect(paso).toContainText('Este paso está en el Resumen');
    // No hay redirección forzada: ni al cargar ni después. Se espera un momento y se
    // comprueba que seguimos en el calendario.
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/calendario/);
    await paso.getByRole('button', { name: /Llévame/ }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('si no se puede guardar el progreso, la visita sigue (y se intentó guardar)', async ({ page }) => {
    const s = await montarVisita(page, { fallar: true });
    await inicio(page).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: /Empezar/ }).click();
    await expect(tarjeta(page, 'Tu menú')).toBeVisible();
    await tarjeta(page, 'Tu menú').getByRole('button', { name: /Entendido/ }).click();
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible();
    await expect.poll(() => s.intentos).toBeGreaterThan(0);
    // Con el servidor caído SÍ queda la copia, para no perder el avance.
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('panel-tour-respaldo')).length)).toBe(1);
  });

  test('al cerrar el último paso de un capítulo sale su resumen, y «Seguir otro día» deja solo la píldora', async ({ page }) => {
    const s = await montarVisita(page, { progreso: { v: 1, inicio: true, hechos: CAPITULOS[0].pasos.map(p => p.id), aplazados: [], vistos: [] } });
    const pantalla = page.getByRole('dialog', { name: /Capítulo 1 completado/ });
    await expect(pantalla).toBeVisible({ timeout: 30_000 });
    await expect(pantalla).toContainText('Ahora sabes');
    await expect(pantalla).toContainText('El mapa');
    await expect(pantalla.getByRole('button', { name: /Siguiente: Tu estudio y tus clases/ })).toBeVisible();

    await pantalla.getByRole('button', { name: 'Seguir otro día' }).click();
    await expect(pantalla).toHaveCount(0);
    // Sin tarjeta, pero la píldora sigue: la visita no se ha cerrado, solo se ha parado.
    await expect(page.getByRole('button', { name: /Visita guiada · Cap\. 2 de \d+ · Continuar/ })).toBeVisible();
    await expect.poll(() => JSON.stringify(s.progreso)).toContain('"vistos":["c1"]');
  });

  test('un paso «hacer» se cierra solo cuando los datos cambian: el caso de la clienta con 4 tarifas', async ({ page }) => {
    // Navega a pantallas pesadas (calendario, Paquetes, Configuración): en CI la primera compilación tarda.
    test.slow();
    // Capítulos 1–4 cerrados y 5.1 visto: toca 5.2, «una tarifa en borrador no existe».
    const hasta4 = CAPITULOS.slice(0, 4);
    const progreso = {
      v: 1, inicio: true,
      hechos: [...hasta4.flatMap(c => c.pasos.map(p => p.id)), 'c5.1'], aplazados: [], vistos: hasta4.map(c => c.id),
    };
    const tarifa = (id: string, precio: number, activo: boolean) => ({
      id, studio_id: STUDIO_ID, nombre: `Tarifa ${id}`, tipo: 'MENSUAL', precio, activo, periodicidad_meses: 1,
    });
    // Primero solo borradores (activo:false y a 0 €): NO cuentan.
    let planes = [tarifa('a', 0, false), tarifa('b', 0, false)];
    await montarVisita(page, { progreso, extra: async p => { await p.route('**/rest/v1/planes_tarifa**', r => json(r, planes)); } });
    await page.goto('/productos');
    const paso = page.getByRole('region', { name: /Visita guiada: Una tarifa en borrador no existe para tus clientas/ });
    await expect(paso).toBeVisible({ timeout: 30_000 });
    await expect(paso).toContainText('Esperando a que lo hagas');
    await expect(paso).not.toContainText('Ya lo tienes');

    // Activa una con precio y recarga: ya lo tenía al llegar, así que lo LEE a su ritmo (sin saltar solo).
    planes = [tarifa('a', 35, true), tarifa('b', 0, false)];
    await page.reload();
    const leyendo = page.getByRole('region', { name: /Visita guiada: Una tarifa en borrador/ });
    await expect(leyendo).toContainText('Ya lo tienes hecho', { timeout: 30_000 });
    await expect(leyendo).toContainText('Ya tienes tarifas activas. Para crear otra, usa «Crear».');
    await page.waitForTimeout(2500);
    await expect(leyendo).toBeVisible();
    await leyendo.getByRole('button', { name: /Entendido/ }).click();
    await expect(page.getByRole('region', { name: /Visita guiada: ¿Qué clases cubre cada tarifa\?/ })).toBeVisible({ timeout: 10_000 });
  });

  test('con un diálogo abierto, la tarjeta se vuelve un banner de solo texto que no tapa nada', async ({ page }) => {
    await montarVisita(page, { progreso: { v: 1, inicio: true, hechos: [], aplazados: [], vistos: [], abiertos: ['c1'] } });
    const paso = tarjeta(page, 'Tu menú');
    await expect(paso).toBeVisible({ timeout: 30_000 });
    // Un diálogo de la app (aquí uno cualquiera): la tarjeta cede el sitio.
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.setAttribute('role', 'dialog'); d.id = 'dialogo-de-prueba'; d.textContent = 'Asignar plan';
      document.body.appendChild(d);
    });
    await expect(paso).toHaveCount(0);
    const banner = page.getByRole('status').filter({ hasText: 'Tu menú' });
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCSS('pointer-events', 'none');
    expect(await banner.getByRole('button').count()).toBe(0);
    // Al cerrarlo, vuelve la tarjeta.
    await page.evaluate(() => document.getElementById('dialogo-de-prueba')?.remove());
    await expect(paso).toBeVisible();
  });

  test('la visita opcional (estudios existentes) se puede cerrar: «Ahora no» y «Salir»', async ({ page }) => {
    await montarVisita(page, { nuevo: false });
    await expect(page.getByRole('link', { name: 'Calendario' }).first()).toBeVisible({ timeout: 30_000 });
    await page.goto('/primeros-pasos');
    await page.getByRole('button', { name: /Ver la visita guiada del panel/ }).click();
    const pantalla = page.getByRole('dialog', { name: 'Visita guiada de Tentare' });
    await expect(pantalla).toBeVisible();
    await pantalla.getByRole('button', { name: 'Ahora no' }).click();
    await expect(pantalla).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Visita guiada · Cap\./ })).toHaveCount(0);
  });

  test('cada capítulo se abre diciendo para qué sirve y qué se va a ver, y cada paso dice qué hacer', async ({ page }) => {
    // Navega a pantallas pesadas (calendario, Paquetes, Configuración): en CI la primera compilación tarda.
    test.slow();
    const hechosC1 = CAPITULOS[0].pasos.map(p => p.id);
    await montarVisita(page, { progreso: { v: 1, inicio: true, hechos: hechosC1, aplazados: [], vistos: ['c1'] } });
    const apertura = page.getByRole('dialog', { name: /Capítulo 2: Tu estudio y tus clases/ });
    await expect(apertura).toBeVisible({ timeout: 30_000 });
    await expect(apertura).toContainText('Para dejar listo el sitio donde darás clase');
    await expect(apertura).toContainText('Lo que vas a ver');
    await expect(apertura).toContainText('Tus salas');
    // Lo que hace la persona se distingue de lo que solo mira.
    await expect(apertura.getByText('lo haces tú').first()).toBeVisible();
    await apertura.getByRole('button', { name: /Empezar el capítulo/ }).click();

    const paso = tarjeta(page, 'Configuración, por preguntas');
    await expect(paso).toBeVisible({ timeout: 30_000 });
    await expect(paso).toContainText('Las tarifas no están aquí');
  });

  test('una sección que no existe en el menú (Marketing, apagado) no se enseña', async ({ page }) => {
    // Capítulos 1–7 cerrados: toca el 8, que trae Marketing como último paso.
    const previos = CAPITULOS.slice(0, 7);
    const progreso = {
      v: 1, inicio: true, hechos: previos.flatMap(c => c.pasos.map(p => p.id)), aplazados: [],
      vistos: previos.map(c => c.id), abiertos: previos.map(c => c.id),
    };
    await montarVisita(page, { progreso });
    const apertura = page.getByRole('dialog', { name: /Capítulo \d+: Que el estudio trabaje solo/ });
    await expect(apertura).toBeVisible({ timeout: 30_000 });
    await expect(apertura).toContainText('Automatizaciones');
    await expect(apertura).not.toContainText('Marketing');
  });

  test('estar en Configuración no es estar en el sitio: la pestaña cuenta, y «Llévame» lleva a la buena', async ({ page }) => {
    // Navega a pantallas pesadas (calendario, Paquetes, Configuración): en CI la primera compilación tarda.
    test.slow();
    // Toca «Correos automáticos» (pestaña «Cómo me comunico»), pero estamos en la pestaña «Marca».
    const previos = CAPITULOS.slice(0, 8);
    const hechos = [...previos.flatMap(c => c.pasos.map(p => p.id)), 'c9.1', 'c9.2'];
    const progreso = { v: 1, inicio: true, hechos, aplazados: [], vistos: previos.map(c => c.id), abiertos: [...previos.map(c => c.id), 'c9'] };
    await montarVisita(page, { progreso });
    await page.goto('/configuracion?tab=marca');
    const paso = tarjeta(page, 'Correos automáticos');
    await expect(paso).toBeVisible({ timeout: 60_000 });
    // La ruta es la misma (/configuracion), pero la pestaña no: el paso lo dice y ofrece llevarte.
    await expect(paso).toContainText('Este paso está en Configuración');
    await expect(paso).not.toContainText('No encuentro el recuadro');
    await paso.getByRole('button', { name: /Llévame/ }).click();
    await expect(page).toHaveURL(/tab=comunicacion/);
  });

  test('al empezar un capítulo te lleva solo a su pantalla (sin recargar y sin esperar a que lo pidas)', async ({ page }) => {
    // Navega a pantallas pesadas (calendario, Paquetes, Configuración): en CI la primera compilación tarda.
    test.slow();
    const previos = CAPITULOS.slice(0, 2);
    const progreso = { v: 1, inicio: true, hechos: previos.flatMap(c => c.pasos.map(p => p.id)), aplazados: [], vistos: previos.map(c => c.id), abiertos: previos.map(c => c.id) };
    await montarVisita(page, { progreso });
    const apertura = page.getByRole('dialog', { name: /Capítulo 3: Tu horario/ });
    await expect(apertura).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await apertura.getByRole('button', { name: /Empezar el capítulo/ }).click();
    await expect(page).toHaveURL(/\/calendario/, { timeout: 30_000 });
    await expect(tarjeta(page, 'El calendario')).toBeVisible({ timeout: 30_000 });
  });

  test('con la tecla → se pasa al siguiente paso y con ← se vuelve', async ({ page }) => {
    await montarVisita(page, { progreso: { v: 1, inicio: true, hechos: [], aplazados: [], vistos: [], abiertos: ['c1'] } });
    await expect(tarjeta(page, 'Tu menú')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('ArrowRight');
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(tarjeta(page, 'Tu menú')).toBeVisible();
    await expect(page.getByRole('button', { name: /Seguir donde iba/ })).toBeVisible();
  });

  test('la tarjeta se queda en una esquina y no salta de un paso a otro', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await montarVisita(page, { progreso: { v: 1, inicio: true, hechos: [], aplazados: [], vistos: [], abiertos: ['c1'] } });
    const caja = async () => (await tarjeta(page, 'Tu menú').boundingBox())!;
    await expect(tarjeta(page, 'Tu menú')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    const a = await caja();
    await page.keyboard.press('ArrowRight');
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible();
    await page.waitForTimeout(800);
    const b = (await tarjeta(page, 'Tu Resumen').boundingBox())!;
    // Misma esquina (el menú y el Resumen no se tapan con ella): mismo borde derecho y mismo suelo.
    expect(Math.abs((a.x + a.width) - (b.x + b.width))).toBeLessThan(2);
    expect(Math.abs((a.y + a.height) - (b.y + b.height))).toBeLessThan(2);
  });

  test('si se recarga justo después de un paso (antes de que se guarde), no se pierde el avance', async ({ page }) => {
    const s = await montarVisita(page, { progreso: { v: 1, inicio: true, hechos: [], aplazados: [], vistos: [], abiertos: ['c1'] } });
    await expect(tarjeta(page, 'Tu menú')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('region', { name: /Visita guiada: Tu menú/ }).getByRole('button', { name: /Entendido/ }).click();
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible();
    // Recarga inmediata: el servidor (con su pausa de guardado) aún no ha recibido nada.
    expect(s.patches.some(p => 'tour_progreso' in p)).toBe(false);
    await page.reload();
    await expect(tarjeta(page, 'Tu Resumen')).toBeVisible({ timeout: 30_000 });
  });

  test('el camino real de un estudio nuevo: alta → «Configurar luego» → empieza la visita (sin encimarse a la bienvenida)', async ({ page }) => {
    test.slow();
    let bienvenida: string | null = null;
    await montarAlta(page, {
      estudio: {},
      antes: async (p) => {
        await p.route('**/rest/v1/studios**', route => {
          const req = route.request();
          if (req.method() === 'PATCH') {
            const cuerpo = (req.postDataJSON() ?? {}) as Record<string, unknown>;
            if (typeof cuerpo.bienvenida_vista_en === 'string') bienvenida = cuerpo.bienvenida_vista_en;
            return json(route, [{ id: STUDIO_ID }]);
          }
          return json(route, {
            id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', color_primario: '#4F46E5', owner_auth_user_id: 'auth-e2e-duena',
            bienvenida_vista_en: bienvenida, tour_obligatorio: true, tour_progreso: {}, tour_completado_en: null,
          });
        });
      },
    });
    // Mientras la bienvenida no se haya visto, la visita NO aparece (no se encima).
    await saltarLogo(page);
    await expect(inicio(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Configurar luego' }).click();
    await expect.poll(() => bienvenida).not.toBeNull();
    // Ya sellada: la visita empieza.
    await expect(inicio(page)).toBeVisible({ timeout: 60_000 });
  });
});

