import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La ficha de una clienta como CRM: apuntar un contacto, las notas del equipo y
// los recordatorios («Recuérdamelo»).
//
// Lo que se fija aquí es lo que la pantalla PROMETE:
//   · solo dice «apuntado» / «guardado» cuando el servidor (o la base de datos)
//     devuelve lo guardado; si dice que no —400, 500, sin red, 0 filas de la
//     RLS—, lo cuenta y no pierde lo escrito;
//   · cada camino de fallo lleva su contador de «sí se intentó»: sin él, «no
//     mintió» sería verdad también si la pantalla no hubiera llamado a nada
//     (`.claude/tentare-os.md`);
//   · la autora de una nota la pone la base de datos, nunca el navegador.
//
// Andamiaje: `panel-sembrado.ts` (María García = soc-1). Los `page.route`
// propios van SIEMPRE después de `montar()`: si no, el comodín los tapa.
// La RLS y los grants son la cerradura real (ensayados aparte); esto mira la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const UID = 'auth-e2e-duena';
const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fecha = (n: number) => {
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function abrirFicha(page: Page, pestana?: string) {
  await ir(page, `clientas/soc-1${pestana ? `?pestana=${pestana}` : ''}`);
  await expect(page.getByRole('heading', { name: /María García Fernández/ }).first()).toBeVisible({ timeout: 30_000 });
}

async function menu(page: Page) {
  await page.getByRole('button', { name: 'Más acciones' }).click();
  return page.getByRole('menu', { name: 'Más acciones' });
}

// ─── Contactos ───────────────────────────────────────────────────────────────

test.describe('Ficha · apuntar un contacto', () => {
  test('va al servidor con lo elegido, se cierra cuando lo guarda y queda en su historia', async ({ page }) => {
    await montar(page);
    const envios: Record<string, unknown>[] = [];
    let guardado = false;
    await page.route((u) => u.pathname === '/api/socios/soc-1/contactos', (r) => {
      envios.push(r.request().postDataJSON());
      guardado = true;
      return json(r, { id: 'k-1', en: new Date().toISOString() }, 201);
    });
    await page.route((u) => u.pathname === '/api/socios/soc-1/comunicaciones', (r) => json(r, guardado ? [{
      id: 'k-1', tipo: 'contacto', asunto: 'WhatsApp', estado: 'ENVIADO', error: null, creadoEn: new Date().toISOString(),
      creadoPorNombre: 'Cloe', creadoPor: UID, canal: 'WHATSAPP', resultado: 'VA_A_VOLVER', nota: 'Vuelve la semana que viene.',
    }] : []));

    await abrirFicha(page, 'historia');
    await page.getByRole('button', { name: 'Apuntar contacto' }).click();
    const dialogo = page.getByRole('dialog', { name: '¿Cómo ha ido con María?' });
    const apuntar = dialogo.getByRole('button', { name: 'Apuntarlo' });
    // Sin decir cómo fue, no se puede: y no sale nada.
    await expect(apuntar).toBeDisabled();
    expect(envios).toEqual([]);

    await dialogo.getByRole('button', { name: 'WhatsApp' }).click();
    await dialogo.getByRole('button', { name: 'Va a volver' }).click();
    await dialogo.getByRole('textbox').fill('Vuelve la semana que viene.');
    await apuntar.click();

    await expect.poll(() => envios.length).toBe(1);
    expect(envios[0]).toMatchObject({ canal: 'WHATSAPP', resultado: 'VA_A_VOLVER', nota: 'Vuelve la semana que viene.', en: null });
    await expect(dialogo).toBeHidden();
    await expect(page.getByText('Apuntado: whatsapp · va a volver')).toBeVisible();
    // Y queda en su historia, con quién y qué dijo.
    await expect(page.getByText('Le escribió por WhatsApp · va a volver')).toBeVisible();
    await expect(page.getByText('«Vuelve la semana que viene.»')).toBeVisible();
  });

  for (const [caso, responder, mensaje] of [
    ['el servidor lo rechaza (400)', (r: Route) => json(r, { error: 'La fecha no puede ser de hace más de 7 días.' }, 400), 'La fecha no puede ser de hace más de 7 días.'],
    ['el servidor falla (500)', (r: Route) => json(r, { error: 'No se ha podido apuntar. Vuelve a intentarlo.' }, 500), 'No se ha podido apuntar. Vuelve a intentarlo.'],
    ['no hay conexión', (r: Route) => r.abort('failed'), 'Sin conexión'],
  ] as const) {
    test(`⚠️ si ${caso}, lo dice y no se cierra`, async ({ page }) => {
      await montar(page);
      let intentos = 0;
      await page.route((u) => u.pathname === '/api/socios/soc-1/contactos', (r) => { intentos++; return responder(r); });

      await abrirFicha(page);
      await (await menu(page)).getByRole('menuitem', { name: 'Apuntar un contacto' }).click();
      const dialogo = page.getByRole('dialog', { name: '¿Cómo ha ido con María?' });
      await dialogo.getByRole('button', { name: 'Llamada' }).click();
      await dialogo.getByRole('button', { name: 'Apuntarlo' }).click();

      await expect(dialogo.getByRole('alert')).toContainText(mensaje);
      expect(intentos).toBeGreaterThan(0);
      await expect(dialogo).toBeVisible();
      await expect(page.getByText(/^Apuntado:/)).toHaveCount(0);
    });
  }
});

// ─── Notas del equipo ────────────────────────────────────────────────────────

const NOTA_DE_ANA = {
  id: 'nota-ana', studio_id: 'studio-test', socio_id: 'soc-1', texto: 'Prefiere las clases de tarde.', tipo: 'NOTA',
  creado_en: '2026-09-20T10:00:00+02:00', autor_uid: 'auth-ana', visibilidad: 'EQUIPO', fijada: false, editada_en: null,
};
const MI_NOTA = {
  id: 'nota-mia', studio_id: 'studio-test', socio_id: 'soc-1', texto: 'Viene con su hermana.', tipo: 'NOTA',
  creado_en: '2026-09-25T10:00:00+02:00', autor_uid: UID, visibilidad: 'EQUIPO', fijada: false, editada_en: null,
};

/** `notas_internas` en memoria: lo que la «base de datos» acepta, se queda. */
async function notasEnMemoria(page: Page, o: { patch?: 'cero-filas' } = {}) {
  let notas: Record<string, unknown>[] = [NOTA_DE_ANA, MI_NOTA];
  const altas: Record<string, unknown>[] = [];
  const cambios: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/notas_internas**', (r) => {
    const req = r.request();
    if (req.method() === 'GET') return json(r, notas);
    if (req.method() === 'POST') {
      const cuerpo = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
      altas.push(cuerpo);
      // La autora la pone la base de datos (trigger), no lo que mande el navegador.
      const fila = { ...cuerpo, autor_uid: UID, editada_en: null };
      notas = [fila, ...notas];
      return json(r, [fila], 201);
    }
    if (req.method() === 'PATCH') {
      const cuerpo = JSON.parse(req.postData() ?? '{}') as Record<string, unknown>;
      cambios.push(cuerpo);
      if (o.patch === 'cero-filas') return json(r, []);
      const id = new URL(req.url()).searchParams.get('id')?.replace(/^eq\./, '');
      notas = notas.map((n) => (n.id === id ? { ...n, ...cuerpo, editada_en: cuerpo.texto ? new Date().toISOString() : n.editada_en } : n));
      return json(r, notas.filter((n) => n.id === id));
    }
    return json(r, []);
  });
  return { altas, cambios };
}

test.describe('Ficha · notas del equipo', () => {
  test('una nota nueva va con para quién es, y la autora la pone la base de datos', async ({ page }) => {
    await montar(page);
    const db = await notasEnMemoria(page);
    await abrirFicha(page);

    const tarjeta = page.locator('section', { has: page.getByRole('heading', { name: 'Notas del equipo' }) });
    await expect(tarjeta.getByText('Prefiere las clases de tarde.')).toBeVisible();
    await expect(tarjeta.getByText(/Ana · recepción/)).toBeVisible();

    await tarjeta.getByRole('textbox', { name: 'Nueva nota sobre ella' }).fill('No le gusta que la corrijan delante de otras.');
    await tarjeta.getByRole('radio', { name: 'Solo propietarias' }).click();
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => db.altas.length).toBe(1);
    expect(db.altas[0]).toMatchObject({ socio_id: 'soc-1', texto: 'No le gusta que la corrijan delante de otras.', visibilidad: 'PRIVADA', fijada: false });
    expect(db.altas[0]).not.toHaveProperty('autor_uid');
    const nueva = tarjeta.getByRole('listitem').filter({ hasText: 'No le gusta que la corrijan delante de otras.' });
    await expect(nueva).toContainText('Tú');
    await expect(nueva).toContainText('privada');
  });

  test('la nota de otra persona no se puede editar desde aquí; la mía sí, y fijarla la sube a la cabecera', async ({ page }) => {
    await montar(page);
    const db = await notasEnMemoria(page);
    await abrirFicha(page);

    const tarjeta = page.locator('section', { has: page.getByRole('heading', { name: 'Notas del equipo' }) });
    const deAna = tarjeta.getByRole('listitem').filter({ hasText: 'Prefiere las clases de tarde.' });
    const mia = tarjeta.getByRole('listitem').filter({ hasText: 'Viene con su hermana.' });
    // Editarla es de la autora; la propietaria solo puede borrarla.
    await expect(deAna.getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await expect(deAna.getByRole('button', { name: 'Borrar' })).toBeVisible();

    await mia.getByRole('button', { name: 'Fijar arriba' }).click();
    await expect.poll(() => db.cambios.length).toBe(1);
    expect(db.cambios[0]).toEqual({ fijada: true });
    await expect(page.getByText('Fijada arriba de su ficha')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Quién es' }).getByText('Viene con su hermana.')).toBeVisible();
  });

  test('⚠️ si la base de datos no deja cambiarla (0 filas), lo dice y no se pierde lo escrito', async ({ page }) => {
    await montar(page);
    const db = await notasEnMemoria(page, { patch: 'cero-filas' });
    await abrirFicha(page);

    const tarjeta = page.locator('section', { has: page.getByRole('heading', { name: 'Notas del equipo' }) });
    await tarjeta.getByRole('listitem').filter({ hasText: 'Viene con su hermana.' }).getByRole('button', { name: 'Editar' }).click();
    const editor = tarjeta.getByRole('textbox', { name: 'Editar la nota' });
    await editor.fill('Viene con su hermana los martes.');
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Esta nota no se puede cambiar: solo la cambia quien la escribió.')).toBeVisible();
    expect(db.cambios.length).toBeGreaterThan(0);
    // Lo escrito sigue en el cuadro, para reintentar o copiarlo.
    await expect(editor).toHaveValue('Viene con su hermana los martes.');
  });
});

// ─── Recordatorios («Recuérdamelo») ─────────────────────────────────────────

async function tareasEnMemoria(page: Page, o: { alta?: 'falla' } = {}) {
  let tareas: Record<string, unknown>[] = [];
  const altas: Record<string, unknown>[] = [];
  const cambios: { id: string; cuerpo: Record<string, unknown> }[] = [];
  await page.route('**/rest/v1/tareas**', (r) => json(r, tareas));
  await page.route((u) => u.pathname === '/api/seguimientos', (r) => {
    const cuerpo = r.request().postDataJSON() as Record<string, unknown>;
    altas.push(cuerpo);
    if (o.alta === 'falla') return json(r, { error: 'No se ha podido crear el seguimiento.' }, 500);
    tareas = [{
      id: 't-1', socio_id: cuerpo.socioId, titulo: cuerpo.titulo, estado: 'PENDIENTE', vence_el: cuerpo.venceEl,
      asignada_a: cuerpo.asignadaA ?? null, creada_por: UID, hecha_por: null, completado_en: null,
      creado_en: new Date().toISOString(), recomendacion_id: null,
    }];
    return json(r, { id: 't-1' }, 201);
  });
  await page.route((u) => u.pathname.startsWith('/api/seguimientos/'), (r) => {
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split('/').pop() ?? '');
    const cuerpo = (r.request().postDataJSON() ?? {}) as Record<string, unknown>;
    cambios.push({ id, cuerpo });
    if (cuerpo.hecha === true) {
      tareas = tareas.map((t) => (t.id === id ? { ...t, estado: 'HECHA', hecha_por: UID, completado_en: new Date().toISOString() } : t));
    }
    return json(r, { ok: true });
  });
  return { altas, cambios };
}

test.describe('Ficha · recordatorios', () => {
  test('«Recuérdamelo» guarda para mañana y para mí, sale en su ficha y se marca hecho', async ({ page }) => {
    await montar(page);
    const api = await tareasEnMemoria(page);
    await abrirFicha(page);

    const tarjeta = page.locator('section', { has: page.getByRole('heading', { name: 'Seguimiento' }) });
    await expect(tarjeta).toContainText('Nada pendiente con ella. Si quedaste en llamarla');
    await tarjeta.getByRole('button', { name: 'Recuérdamelo' }).click();

    const dialogo = page.getByRole('dialog', { name: 'Recordar algo de María' });
    await expect(dialogo.getByRole('button', { name: 'Mañana' })).toHaveAttribute('aria-pressed', 'true');
    await dialogo.getByRole('textbox', { name: 'Qué hay que hacer' }).fill('Llamarla para ver si vuelve');
    await dialogo.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => api.altas.length).toBe(1);
    expect(api.altas[0]).toMatchObject({ socioId: 'soc-1', titulo: 'Llamarla para ver si vuelve', venceEl: fecha(1), asignadaA: UID });
    await expect(dialogo).toBeHidden();
    await expect(page.getByText('Te lo recordamos mañana')).toBeVisible();
    await expect(tarjeta.getByText('Llamarla para ver si vuelve')).toBeVisible();
    await expect(tarjeta).toContainText('te toca a ti');

    await tarjeta.getByRole('checkbox', { name: 'Marcar hecho: Llamarla para ver si vuelve' }).click();
    await expect.poll(() => api.cambios.length).toBe(1);
    expect(api.cambios[0]).toEqual({ id: 't-1', cuerpo: { hecha: true } });
    await expect(tarjeta.getByRole('button', { name: 'Hechos (1)' })).toBeVisible();
  });

  test('⚠️ si el servidor no lo guarda, lo dice y el diálogo sigue abierto', async ({ page }) => {
    await montar(page);
    const api = await tareasEnMemoria(page, { alta: 'falla' });
    await abrirFicha(page);

    const tarjeta = page.locator('section', { has: page.getByRole('heading', { name: 'Seguimiento' }) });
    await tarjeta.getByRole('button', { name: 'Recuérdamelo' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Recordar algo de María' });
    await dialogo.getByRole('button', { name: 'Guardar' }).click();

    await expect(dialogo.getByRole('alert')).toContainText('No se ha podido crear el seguimiento.');
    expect(api.altas.length).toBeGreaterThan(0);
    await expect(dialogo).toBeVisible();
    await expect(page.getByText(/^Te lo recordamos/)).toHaveCount(0);
  });
});

// ─── Cabecera ────────────────────────────────────────────────────────────────

test.describe('Ficha · cabecera', () => {
  // «Pendiente de cobro» es lo que DEBE, como en Cobros (docs/cifras-financieras.md):
  // por cobrar + impagado. Antes sumaba solo lo pendiente, y una clienta con un
  // cobro fallido salía con «Nada» justo encima de «Tiene un pago fallido».
  // Bea Ortega (soc-4) tiene un recibo FALLIDO de 89 € y nada más pendiente.
  test('un cobro fallido cuenta en «Pendiente de cobro», no sale «Nada»', async ({ page }) => {
    await montar(page);
    await ir(page, 'clientas/soc-4');
    const valor = page.locator('dt:has-text("Pendiente de cobro") + dd');
    await expect(valor).toContainText('89,00 €', { timeout: 30_000 });
    await expect(valor).toContainText('1 pago fallido');
    await expect(valor).not.toContainText('Nada');
  });
});

// ─── Verificación en dos pasos de su cuenta ─────────────────────────────────

test.describe('Ficha · quitar la verificación en dos pasos', () => {
  test('pregunta al abrir (no al abrir la ficha), y solo dice «quitada» cuando el servidor la quita', async ({ page }) => {
    await montar(page);
    let consultas = 0;
    let quitas = 0;
    await page.route((u) => u.pathname === '/api/socios/soc-1/doble-factor', (r) => {
      if (r.request().method() === 'DELETE') { quitas++; return json(r, { ok: true, avisada: true }); }
      consultas++;
      return json(r, { activa: true, sePuedeQuitar: true, motivo: null });
    });

    await abrirFicha(page);
    expect(consultas).toBe(0);
    await (await menu(page)).getByRole('menuitem', { name: 'Verificación en dos pasos' }).click();
    const dialogo = page.getByTestId('dialogo-doble-factor');
    await expect(dialogo.getByText(/la tiene activada/)).toBeVisible();
    expect(consultas).toBe(1);
    await dialogo.getByRole('button', { name: 'Quitar la verificación' }).click();
    await expect(page.getByText('Verificación quitada. Le hemos avisado por correo a María.')).toBeVisible();
    expect(quitas).toBe(1);
    await expect(dialogo).toBeHidden();
  });

  test('si el servidor dice que no (409), lo cuenta y no dice «quitada»', async ({ page }) => {
    await montar(page);
    let quitas = 0;
    await page.route((u) => u.pathname === '/api/socios/soc-1/doble-factor', (r) => {
      if (r.request().method() === 'DELETE') {
        quitas++;
        return json(r, { error: 'Su cuenta no se puede gestionar desde tu estudio, así que no se la puedes quitar desde aquí.' }, 409);
      }
      return json(r, { activa: true, sePuedeQuitar: true, motivo: null });
    });

    await abrirFicha(page);
    await (await menu(page)).getByRole('menuitem', { name: 'Verificación en dos pasos' }).click();
    const dialogo = page.getByTestId('dialogo-doble-factor');
    await dialogo.getByRole('button', { name: 'Quitar la verificación' }).click();
    await expect(dialogo.getByRole('alert')).toContainText('no se puede gestionar desde tu estudio');
    expect(quitas).toBeGreaterThan(0);
    await expect(page.getByText(/Verificación quitada/)).toHaveCount(0);
  });

  test('sin permiso para quitarla (recepción): se ve el motivo y no hay botón', async ({ page }) => {
    await montar(page);
    await page.route((u) => u.pathname === '/api/socios/soc-1/doble-factor', (r) =>
      json(r, { activa: true, sePuedeQuitar: false, motivo: 'Solo la propietaria o la gerencia del estudio pueden quitársela. Pídeselo a ellas.' }));
    await abrirFicha(page);
    await (await menu(page)).getByRole('menuitem', { name: 'Verificación en dos pasos' }).click();
    const dialogo = page.getByTestId('dialogo-doble-factor');
    await expect(dialogo.getByText(/Solo la propietaria o la gerencia/)).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Quitar la verificación' })).toHaveCount(0);
  });
});
