import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, STUDIO_ID } from './socia-completa';

// Inicio según el momento (maqueta aprobada, oct-2026):
//   · con clase HOY o MAÑANA, esa clase va lo primero, encima del buscador, y
//     la portada se hace baja;
//   · sin clase en esos dos días, Inicio queda como estaba;
//   · «¿Qué tal la clase?» tras una clase a la que asistió, y tocar una cara
//     envía UNA valoración, aunque se toque dos veces.
//   · «Volver» en una ficha a la que se llegó directa (aviso push, enlace) va a
//     la pantalla padre en vez de no hacer nada.
//
// El reloj del andamiaje son las 08:00 del 12-ago y la clase del fixture, las
// 10:00 de ese mismo día.

test.describe.configure({ timeout: 150_000 });

const INICIO = `/portal/${SLUG}`;

test('con clase hoy, la clase va lo primero, encima del buscador, y la portada es baja', async ({ page }) => {
  const a = await sembrarSociaCompleta(page, { reservada: true });
  await page.goto(INICIO);

  const clase = page.getByTestId('clase-del-momento');
  await expect(clase).toBeVisible({ timeout: 60_000 });
  await expect(clase).toContainText(/Hoy · en 2 h/i);
  await expect(clase).toContainText('Reformer');
  await expect(clase.getByRole('link', { name: 'Mi QR para entrar' })).toBeVisible();
  await expect(clase.getByRole('button', { name: 'Cómo llegar' })).toBeVisible();

  // Encima del buscador.
  const cajaClase = await clase.boundingBox();
  const cajaBuscador = await page.getByRole('searchbox', { name: 'Buscar clases o instructoras' }).boundingBox();
  expect(cajaClase && cajaBuscador && cajaClase.y < cajaBuscador.y).toBe(true);

  // La portada, baja (160 px + zona segura, que en el navegador es 0).
  const portada = page.getByTestId('portada-inicio');
  await expect(portada).toHaveAttribute('data-compacta', '');
  await expect.poll(async () => Math.round((await portada.boundingBox())?.height ?? 0), { timeout: 5_000 }).toBe(160);

  // «Tu próxima clase» no se repite abajo: es la misma reserva.
  await expect(page.getByRole('region', { name: 'Tu próxima clase' })).toHaveCount(0);
  // Lo de siempre sigue debajo.
  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible();
  expect(a.sinMockear()).toEqual([]);
});

test('sin clase hoy ni mañana, Inicio queda como estaba', async ({ page }) => {
  const a = await sembrarSociaCompleta(page, { reservada: false });
  await page.goto(INICIO);

  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('clase-del-momento')).toHaveCount(0);
  const portada = page.getByTestId('portada-inicio');
  await expect(portada).not.toHaveAttribute('data-compacta', '');
  expect(Math.round((await portada.boundingBox())?.height ?? 0)).toBe(316);
  await expect(page.getByRole('link', { name: /Reservar clase/ })).toBeVisible();
  expect(a.sinMockear()).toEqual([]);
});

test('«¿Qué tal la clase?»: la clase la dice el servidor, una cara envía UNA vez y el comentario rechazado no se da por enviado', async ({ page }) => {
  // Como el servidor real: el catálogo NO trae la clase ya terminada (solo
  // clases con `fin >= ahora`). Quien sabe que asistió a la de las 06:00 es
  // `GET /api/public/valorar-clase?pendiente=1`.
  await sembrarSociaCompleta(page, { reservada: false });

  let pidePendiente = 0;
  let envios = 0;
  const cuerpos: unknown[] = [];
  await page.route('**/api/public/valorar-clase**', async (r) => {
    if (r.request().method() === 'POST') {
      envios++;
      cuerpos.push(r.request().postDataJSON());
      // Un poco de red: el segundo toque cae mientras va el primero.
      await new Promise((res) => setTimeout(res, 300));
      // El segundo POST es el comentario, y el servidor lo rechaza.
      return envios === 1
        ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, actualizada: false }) })
        : r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Ya valoraste esta clase y ese mes está cerrado: la nota ya no se puede cambiar.' }) });
    }
    if (new URL(r.request().url()).searchParams.get('pendiente') === '1') {
      pidePendiente++;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        pendiente: { sesionId: 'ses-pasada', fin: '2026-08-12T06:50:00', clase: 'Reformer', instructora: 'Ana' },
      }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ puedeValorar: true, motivo: null, valoracion: null }) });
  });

  await page.goto(INICIO);
  const tarjeta = page.getByTestId('que-tal-la-clase');
  await expect(tarjeta).toBeVisible({ timeout: 60_000 });
  expect(pidePendiente).toBeGreaterThan(0);
  await expect(tarjeta).toContainText('¿Qué tal Reformer con Ana?');
  await expect(tarjeta).toContainText('Tu nombre y lo que escribas solo los ve tu estudio.');

  const cara = tarjeta.getByRole('button', { name: /¡Increíble!/ });
  await cara.click();
  await cara.click({ force: true, timeout: 1_000 }).catch(() => {});
  await expect(tarjeta.getByRole('status')).toContainText('¡Gracias!');
  expect(envios).toBe(1);
  // El primer toque solo CREA: si ya estuviera valorada, el servidor no pisaría nada.
  expect(cuerpos[0]).toMatchObject({ studioId: STUDIO_ID, sesionId: 'ses-pasada', puntuacion: 5, soloSiNueva: true });

  // El comentario, con la MISMA nota; el servidor dice que no.
  const campo = tarjeta.getByRole('textbox', { name: 'Comentario para tu estudio' });
  await expect(campo).toHaveAttribute('placeholder', '¿Algo que quieras contar? (opcional)');
  await campo.fill('Muy buena clase');
  await tarjeta.getByRole('button', { name: 'Enviar comentario' }).click();
  await expect.poll(() => envios, { timeout: 10_000 }).toBe(2);
  expect(cuerpos[1]).toMatchObject({ sesionId: 'ses-pasada', puntuacion: 5, comentario: 'Muy buena clase' });
  expect(cuerpos[1]).not.toHaveProperty('soloSiNueva');
  // Ni «enviado» ni el texto perdido: el aviso del servidor y el campo, con lo escrito.
  await expect(page.getByText(/la nota ya no se puede cambiar/)).toBeVisible();
  await expect(tarjeta.getByRole('status')).not.toContainText('Comentario enviado');
  await expect(campo).toHaveValue('Muy buena clase');
});

test('«Volver» en una ficha a la que se llegó directa va a la pantalla padre, y otra vez, a Inicio', async ({ page }) => {
  await sembrarSociaCompleta(page, { reservada: true, recibos: 1 });
  await page.goto(`${INICIO}/pagos/rec-1`);
  await expect(page.getByRole('heading', { name: 'Recibo' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/pagos$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Pagos' })).toBeVisible({ timeout: 30_000 });
  // La vuelta anterior SUSTITUYÓ la ficha: no hay historial falso detrás, así
  // que este «Volver» no hace un `history.back()` al vacío: va a Inicio.
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}$`), { timeout: 30_000 });
});
