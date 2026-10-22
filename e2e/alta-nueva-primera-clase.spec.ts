import { test, expect, type Page, type Route } from '@playwright/test';
import { json, montarAlta } from './onboarding-andamio';

// «Tu primera clase» y «¡Listo!» del alta nueva (PR-4), tras `ALTA_NUEVA`. Desde el
// 21-oct (fundador: «lo de crear la clase durante el onboarding, descartado») ya no
// son pasos del alta: se abren sobre el Calendario (`/calendario?primera=1`), que es
// adonde llevan «Empezar» de «Tus primeros pasos» y la tarea «Crea tu primera
// clase». Mismo andamio que el resto del alta
// (e2e/onboarding-andamio.ts): sesión sembrada y la red mockeada con `page.route`.
//
// ⚠️ Un camino de fallo sin contador de peticiones es hueco: «no avanzó» puede
// ser verdad porque no se intentó nada. Por eso cada fallo cuenta sus intentos,
// y lo que la pantalla corta antes de llamar exige CERO.

const CORS = { 'access-control-allow-origin': '*' };
const AVISO_VENTA_SIN_STRIPE = 'Una alumna nueva todavía no puede reservar desde tu app: pides bono para reservar y, sin Stripe, no puede comprarlo online. Conecta Stripe o véndeselo tú en el mostrador.';

type Respuesta = { status: number; body: unknown; espera?: number };
const EXITO_SI: Respuesta = {
  status: 200,
  body: { ok: true, clase: { nombre: 'Reformer', cuando: 'jueves 22 a las 18:30, cada semana' }, sesiones: 4, repetida: false, veredicto: { estado: 'SI' }, correo: true },
};

async function montarPrimeraClase(page: Page, { respuesta = EXITO_SI, estudio = {} }: {
  respuesta?: Respuesta;
  estudio?: Record<string, unknown>;
} = {}) {
  const red = {
    publicar: [] as Record<string, unknown>[],
    puedeReservar: 0,
    usuario: [] as Record<string, unknown>[],
  };
  const pet = await montarAlta(page, {
    // El alta ya terminada: «Tu primera clase» vive en el panel.
    estudio: { bienvenida_vista_en: '2026-10-21T08:00:00Z', ...estudio },
    antes: async (p) => {
      await p.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { altaNueva: true }));
      await p.route('**/auth/v1/user**', (r) => {
        const req = r.request();
        if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (req.method() === 'PUT') red.usuario.push((req.postDataJSON() ?? {}) as Record<string, unknown>);
        return r.fulfill({
          status: 200, contentType: 'application/json', headers: CORS,
          body: JSON.stringify({
            id: 'auth-e2e-duena', email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
            app_metadata: {}, user_metadata: (req.postDataJSON()?.data ?? {}) as Record<string, unknown>, created_at: '2026-01-01T00:00:00Z',
          }),
        });
      });
      await p.route('**/api/alta/primera-clase', async (r: Route) => {
        red.publicar.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
        if (respuesta.espera) await new Promise((ok) => setTimeout(ok, respuesta.espera));
        return json(r, respuesta.body, respuesta.status);
      });
      await p.route('**/api/onboarding/puede-reservar', (r) => { red.puedeReservar++; return json(r, { estado: 'SI' }); });
      // La app del marco del paso 7: una mínima, sin montar /portal entero.
      await p.route('**/portal/studio-carmen**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>App</body></html>' }));
    },
  });
  await page.goto('/calendario?primera=1');
  return { pet, red };
}

/** Su nombre para «Yo» (la cuenta del andamio no lo tiene) y un precio. */
async function rellenar(page: Page, precio = '20') {
  await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Cómo te llamas').fill('Lucía');
  await page.getByLabel('Precio por clase').fill(precio);
}

const publicar = (page: Page) => page.getByRole('button', { name: 'Publicar mi primera clase' }).click();

test.describe('la primera clase del alta nueva', () => {
  // Cada prueba entra al panel y luego al Calendario: con el `next dev` compilando, 30 s se quedan cortos.
  test.describe.configure({ timeout: 90_000 });

  test('todo viene puesto menos el precio, sin la línea del alta y con una persona por WhatsApp', async ({ page }) => {
    await montarPrimeraClase(page);
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('etiqueta-paso')).toHaveText('Unos 5 minutos');
    await expect(page.getByTestId('linea-de-pasos')).toHaveCount(0);
    await expect(page.getByLabel('Nombre de la clase')).toHaveValue('Reformer');
    await expect(page.getByRole('radio', { name: '55 min' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('plazas')).toHaveText('8');
    await expect(page.getByRole('switch', { name: /Repetir cada semana/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/La paras desde el calendario\./)).toBeVisible();
    await expect(page.getByLabel('Precio por clase')).toHaveValue('');
    await expect(page.getByRole('link', { name: 'Escríbenos por WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
    await expect(page.getByTestId('resumen-primera-clase')).toContainText('La tarifa «Clase suelta» a falta el precio, activa');
    // La vista previa es la tarjeta de /reservar con la clase en memoria.
    const vista = page.getByTestId('vista-previa-clase').first();
    await expect(vista.locator('.reserva-slot-row')).toBeVisible();
    await expect(vista).toContainText('Reformer');
  });

  test('sin precio no publica: lo dice y no llama al servidor', async ({ page }) => {
    const { red } = await montarPrimeraClase(page);
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Cómo te llamas').fill('Lucía');
    await publicar(page);
    await expect(page.getByTestId('mensaje-precio')).toHaveText('Falta el precio: es lo único que no podemos poner por ti.');
    await expect(page.getByLabel('Precio por clase')).toBeFocused();
    expect(red.publicar).toHaveLength(0);
  });

  test('0 € sin la casilla es un error que dice qué hacer; con «Esta clase es gratis» se publica sin tarifa', async ({ page }) => {
    const { red } = await montarPrimeraClase(page);
    await rellenar(page, '0');
    await publicar(page);
    await expect(page.getByTestId('mensaje-precio')).toContainText('marca «Esta clase es gratis»');
    expect(red.publicar).toHaveLength(0);

    await page.getByLabel('Esta clase es gratis').check();
    await expect(page.getByTestId('mensaje-precio')).toContainText('tus alumnas la reservan sin pagar nada');
    await expect(page.getByTestId('resumen-primera-clase')).toContainText('Sin tarifa: la clase es gratis');
    await publicar(page);
    await expect.poll(() => red.publicar.length).toBe(1);
    expect((red.publicar[0].form as Record<string, unknown>).gratis).toBe(true);
    await expect(page.getByRole('heading', { name: '¡Listo! Tu clase «Reformer» ya está publicada' })).toBeVisible();
  });

  test('900 € avisa y deja publicar', async ({ page }) => {
    const { red } = await montarPrimeraClase(page);
    await rellenar(page, '900');
    await expect(page.getByTestId('mensaje-precio')).toHaveText('¿Seguro? 900,00 € es mucho para una clase suelta. Revisa el número.');
    await publicar(page);
    await expect.poll(() => red.publicar.length).toBe(1);
    await expect(page.getByRole('heading', { name: /¡Listo! Tu clase «Reformer» ya está publicada/ })).toBeVisible();
  });

  test('«Online, con tarjeta» sin Stripe lo avisa antes de publicar', async ({ page }) => {
    await montarPrimeraClase(page);
    await rellenar(page);
    await expect(page.getByTestId('aviso-online-sin-stripe')).toHaveCount(0);
    await page.getByRole('radio', { name: /Online, con tarjeta/ }).click();
    await expect(page.getByTestId('aviso-online-sin-stripe')).toHaveText(
      'Hasta que conectes Stripe, una alumna nueva no podrá pagar online ni reservar. Te pide tus datos y una cuenta bancaria; puedes hacerlo justo después de publicar.',
    );
    await page.getByRole('radio', { name: /En el estudio/ }).click();
    await expect(page.getByTestId('aviso-online-sin-stripe')).toHaveCount(0);
  });

  test('si el servidor falla (500), lo dice y no avanza', async ({ page }) => {
    const { red } = await montarPrimeraClase(page, {
      respuesta: { status: 500, body: { error: 'No hemos podido publicar tu clase. No se ha creado nada. Vuelve a intentarlo en un momento.' } },
    });
    await rellenar(page);
    await publicar(page);
    await expect(page.getByTestId('error-guardar')).toHaveText('No hemos podido publicar tu clase. No se ha creado nada. Vuelve a intentarlo en un momento.');
    expect(red.publicar.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /¡Listo!/ })).toHaveCount(0);
  });

  test('un solape (409) dice cuál y no avanza; reintentar lo mismo usa el mismo intento', async ({ page }) => {
    const { red } = await montarPrimeraClase(page, {
      respuesta: { status: 409, body: { error: 'A esa hora la sala ya tiene otra clase. Elige otra hora o cambia la sala. No se ha creado nada.', campo: 'hora' } },
    });
    await rellenar(page);
    await publicar(page);
    await expect(page.getByTestId('error-guardar')).toContainText('A esa hora la sala ya tiene otra clase.');
    await expect(page.getByTestId('primera-clase-en-calendario').getByLabel('Hora')).toBeFocused();
    await expect(page.getByRole('heading', { name: /¡Listo!/ })).toHaveCount(0);
    await publicar(page);
    await expect.poll(() => red.publicar.length).toBe(2);
    expect(red.publicar[1].intentoId).toBe(red.publicar[0].intentoId);
    // Cambiar algo es otro intento.
    await page.getByTestId('primera-clase-en-calendario').getByLabel('Hora').fill('19:30');
    await publicar(page);
    await expect.poll(() => red.publicar.length).toBe(3);
    expect(red.publicar[2].intentoId).not.toBe(red.publicar[0].intentoId);
  });

  test('publicada con un NO del servidor: el aviso de siempre, sin «Comprobado» ni correo', async ({ page }) => {
    const { red } = await montarPrimeraClase(page, {
      respuesta: { status: 200, body: { ...(EXITO_SI.body as object), veredicto: { estado: 'NO', motivo: 'STRIPE_SIN_CUENTA' }, correo: false } },
    });
    await rellenar(page);
    await publicar(page);
    await expect(page.getByRole('heading', { name: '¡Listo! Tu clase «Reformer» ya está publicada' })).toBeVisible();
    await expect(page.getByText(AVISO_VENTA_SIN_STRIPE)).toBeVisible();
    await expect(page.getByTestId('comprobado-reservar')).toHaveCount(0);
    await expect(page.getByTestId('aviso-correo-reservas')).toHaveCount(0);
    // La respuesta ya venía con la publicación: no se vuelve a preguntar.
    expect(red.puedeReservar).toBe(0);
  });

  test('publicada con el SÍ: «Comprobado», el correo y el QR; «Ir a mi panel» lleva al Resumen', async ({ page }) => {
    const { pet, red } = await montarPrimeraClase(page);
    await rellenar(page);
    await publicar(page);
    await expect(page.getByRole('heading', { name: '¡Listo! Tu clase «Reformer» ya está publicada' })).toBeVisible();
    await expect(page.getByTestId('comprobado-reservar')).toHaveText('Comprobado: una alumna nueva puede reservar');
    await expect(page.getByText('Tus alumnas entran con su email, sin descargarse nada, y la reservan desde el móvil. Mándales el enlace de tu app: así llega tu primera reserva.')).toBeVisible();
    // El enlace es el de la APP (no el de la página de reservas, que es para su web) y su vista previa, la app de verdad en el marco de solo mirar.
    await expect(page.getByText(/\/portal\/studio-carmen$/).first()).toBeVisible();
    await expect(page.getByText('/reservar/studio-carmen')).toHaveCount(0);
    const marco = page.locator('iframe[name="tentare-solo-mirar"]');
    await expect(marco).toHaveAttribute('src', '/portal/studio-carmen');
    await expect(page.getByTestId('aviso-correo-reservas')).toHaveText('Te lo mandamos también por correo, con el QR, para tenerlo a mano.');
    await page.getByRole('button', { name: 'Código QR' }).click();
    await expect(page.getByRole('dialog', { name: 'Código QR · App de tus alumnas' })).toBeVisible();
    await page.keyboard.press('Escape');
    expect(red.puedeReservar).toBe(0);

    // Lo que se mandó: el formulario y un intento; ni el estudio ni quién es «Yo».
    expect(red.publicar).toHaveLength(1);
    const cuerpo = red.publicar[0];
    expect(Object.keys(cuerpo).sort()).toEqual(['form', 'intentoId']);
    expect(String(cuerpo.intentoId)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(cuerpo.form).toMatchObject({ tipo: 'Reformer', nombre: 'Reformer', duracion: 55, semanal: true, quien: 'yo', plazas: 8, venta: 'suelta', precio: '20', gratis: false, cobro: 'estudio' });
    // Su nombre fue a SU cuenta, antes de publicar.
    expect(red.usuario).toEqual([expect.objectContaining({ data: { nombre: 'Lucía' } })]);

    // Del «¡Listo!» a «Pon en marcha tu estudio» del Resumen (PR-5), donde se ofrece la siguiente tarea.
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
    await page.getByRole('button', { name: 'Ir a mi panel', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test('doble clic: una sola petición, y el botón dice que está publicando', async ({ page }) => {
    const { red } = await montarPrimeraClase(page, { respuesta: { ...EXITO_SI, espera: 1200 } });
    await rellenar(page);
    await page.getByRole('button', { name: 'Publicar mi primera clase' }).dblclick();
    await expect(page.getByRole('button', { name: /Publicando/ })).toBeDisabled();
    await expect(page.getByRole('heading', { name: /¡Listo!/ })).toBeVisible();
    expect(red.publicar).toHaveLength(1);
  });

  test('«Cerrar» la cierra sin crear nada', async ({ page }) => {
    const { red } = await montarPrimeraClase(page);
    await rellenar(page);
    await page.getByRole('button', { name: 'Cerrar sin crear la clase' }).click();
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toHaveCount(0);
    expect(red.publicar).toHaveLength(0);
  });

  test('del «¡Listo!» se sale al Resumen, nunca a un Calendario vacío', async ({ page }) => {
    const { red } = await montarPrimeraClase(page);
    const capa = page.getByTestId('primera-clase-en-calendario');
    await expect(capa.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible({ timeout: 30_000 });
    await capa.getByLabel('Cómo te llamas').fill('Lucía');
    await capa.getByLabel('Precio por clase').fill('20');
    await capa.getByRole('button', { name: 'Publicar mi primera clase' }).click();
    await expect(page.getByRole('heading', { name: '¡Listo! Tu clase «Reformer» ya está publicada' })).toBeVisible();
    expect(red.publicar).toHaveLength(1);
    // Del «¡Listo!» se sale a la lista «Pon en marcha tu estudio» del Resumen (PR-5):
    // nunca a un Calendario, que es lo que el fundador vio y no quería.
    await page.getByRole('button', { name: 'Ir a mi panel', exact: true }).click();
    await expect(page.getByRole('heading', { name: /¡Listo!/ })).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});
