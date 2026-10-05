import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La propietaria LEE las conversaciones de su equipo con alumnas (decisión del
// 14-sep-2026), en «Mensajes → Equipo con alumnas», y no puede escribir en ellas:
//   · su bandeja de siempre no las mezcla (la pide sin ámbito);
//   · el hilo dice que es de solo lectura y entre quién es;
//   · no hay compositor, no se envía nada y no se marca leído en nombre de nadie.
//
// ⚠️ Los contadores de «no se hizo» van con uno de «sí se hizo» (los mensajes se
// cargaron): sin él, «no marcó leído» sería verdad también si el hilo no se abrió.
// La RLS es la cerradura real; esto comprueba la pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const PREGUNTA = '¿Mañana hacemos suelo pélvico?';

const HILO_EQUIPO = {
  id: 'conv-sup-1', studio_id: 'studio-e2e', tipo: 'ALUMNA_INSTRUCTORA', titulo: null,
  ancla_sesion_id: null, ancla_reserva_id: null,
  creado_en: '2026-09-10T10:00:00Z', ultimo_mensaje_en: '2026-09-12T08:00:00Z', mostrador_leido_hasta: null,
  conversacion_participantes: [
    { socio_id: 'soc-1', rol_en_conversacion: 'SOCIO', auth_user_id: 'auth-socia-e2e', leido_hasta: '2026-09-12T08:00:00Z' },
    { socio_id: null, rol_en_conversacion: 'STAFF', auth_user_id: 'auth-marta', leido_hasta: '2026-09-11T08:00:00Z' },
  ],
  leido_hasta: null, leido_hasta_otros: '2026-09-11T08:00:00Z',
  ultimo_cuerpo: PREGUNTA, ultimo_remitente_auth_user_id: 'auth-socia-e2e',
  solo_lectura: true,
};

test('la propietaria lee los hilos de su equipo con alumnas sin poder escribir en ellos', async ({ page }) => {
  await montar(page);
  const ambitos: string[] = [];
  const cuenta = { mensajesCargados: 0, envios: 0, leidos: 0 };

  await page.route((u) => u.pathname === '/api/mensajeria/conversaciones', (r) => {
    const ambito = new URL(r.request().url()).searchParams.get('ambito') ?? 'bandeja';
    ambitos.push(ambito);
    return r.fulfill({ json: { conversaciones: ambito === 'supervision' ? [HILO_EQUIPO] : [] } });
  });
  await page.route((u) => u.pathname === `/api/mensajeria/conversaciones/${HILO_EQUIPO.id}/mensajes`, (r) => {
    if (r.request().method() === 'POST') { cuenta.envios++; return r.fulfill({ status: 403, json: { error: 'No tienes acceso a esta conversación.' } }); }
    cuenta.mensajesCargados++;
    return r.fulfill({ json: { mensajes: [{ id: 'm1', conversacion_id: HILO_EQUIPO.id, studio_id: 'studio-e2e', remitente_auth_user_id: 'auth-socia-e2e', cuerpo: PREGUNTA, creado_en: '2026-09-12T08:00:00Z' }] } });
  });
  await page.route((u) => u.pathname === `/api/mensajeria/conversaciones/${HILO_EQUIPO.id}/leido`, (r) => {
    cuenta.leidos++;
    return r.fulfill({ status: 204 });
  });

  await ir(page, 'mensajeria');
  // `/mensajeria` abre en otra pestaña: primero «Conversaciones», luego el ámbito.
  await page.getByRole('button', { name: 'Conversaciones', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Equipo con alumnas' }).click({ timeout: 30_000 });
  await page.getByRole('listitem').filter({ hasText: PREGUNTA }).click({ timeout: 30_000 });

  const aviso = page.getByTestId('aviso-hilo');
  await expect(aviso).toContainText('Solo lectura', { timeout: 30_000 });
  await expect(aviso).toContainText('Marta Ruiz');
  await expect(page.getByText('No puedes escribir en esta conversación')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Mensaje' })).toHaveCount(0);

  expect(cuenta.mensajesCargados).toBeGreaterThan(0);
  expect(cuenta.leidos).toBe(0);
  expect(cuenta.envios).toBe(0);
  // Su bandeja de siempre se pidió sin ámbito: los hilos del equipo no se mezclan con lo suyo.
  expect(ambitos[0]).toBe('bandeja');
  expect(ambitos).toContain('supervision');
});

// El aviso de un mensaje ya no lleva el texto (guía 4.5.4 de Apple), así que
// tocarlo tiene que llevar a leerlo: su enlace es `/mensajeria?conversacion=<id>`
// y abre «Conversaciones» con ese hilo, no la pestaña de notificaciones.
const HILO_MOSTRADOR = {
  id: 'conv-mos-1', studio_id: 'studio-e2e', tipo: 'ALUMNA_MOSTRADOR', titulo: null,
  ancla_sesion_id: null, ancla_reserva_id: null,
  creado_en: '2026-09-10T10:00:00Z', ultimo_mensaje_en: '2026-09-12T08:00:00Z', mostrador_leido_hasta: null,
  conversacion_participantes: [
    { socio_id: 'soc-1', rol_en_conversacion: 'SOCIO', auth_user_id: 'auth-socia-e2e', leido_hasta: '2026-09-12T08:00:00Z' },
  ],
  leido_hasta: null, leido_hasta_otros: '2026-09-12T08:00:00Z',
  ultimo_cuerpo: PREGUNTA, ultimo_remitente_auth_user_id: 'auth-socia-e2e',
  solo_lectura: false, sin_leer: true,
};

test('el enlace del aviso de un mensaje abre ese hilo en «Conversaciones»', async ({ page }) => {
  await montar(page);
  const cuenta = { bandeja: 0, mensajesCargados: 0, leidos: 0 };

  await page.route((u) => u.pathname === '/api/mensajeria/conversaciones', (r) => {
    cuenta.bandeja++;
    return r.fulfill({ json: { conversaciones: [HILO_MOSTRADOR] } });
  });
  await page.route((u) => u.pathname === `/api/mensajeria/conversaciones/${HILO_MOSTRADOR.id}/mensajes`, (r) => {
    cuenta.mensajesCargados++;
    return r.fulfill({ json: { mensajes: [{ id: 'm1', conversacion_id: HILO_MOSTRADOR.id, studio_id: 'studio-e2e', remitente_auth_user_id: 'auth-socia-e2e', cuerpo: PREGUNTA, creado_en: '2026-09-12T08:00:00Z' }] } });
  });
  await page.route((u) => u.pathname === `/api/mensajeria/conversaciones/${HILO_MOSTRADOR.id}/leido`, (r) => {
    cuenta.leidos++;
    return r.fulfill({ status: 204 });
  });

  await ir(page, `mensajeria?conversacion=${HILO_MOSTRADOR.id}`);

  // El hilo abierto es el único sitio con compositor: la bandeja sola no lo tiene.
  await expect(page.getByRole('textbox', { name: 'Mensaje' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Conversaciones', exact: true })).toBeVisible();
  expect(cuenta.bandeja).toBeGreaterThan(0);
  await expect.poll(() => cuenta.mensajesCargados, { timeout: 15_000 }).toBeGreaterThan(0);
  // Abrirlo lo marca leído (y con él, su aviso en la campana).
  await expect.poll(() => cuenta.leidos, { timeout: 15_000 }).toBeGreaterThan(0);
  // Recargar no lo reabre: el enlace se consume.
  await expect(page).toHaveURL(/\/mensajeria$/);
});

// Y estando YA en Mensajería: Next no remonta la página si solo cambia la
// búsqueda, así que «Ver más» desde su propia pestaña de notificaciones (lo
// normal en recepción) no hacía nada, y tampoco un segundo aviso después del
// primero.
test('desde Notificaciones de Mensajería, «Ver más» abre el hilo del aviso; y otro aviso después, el suyo', async ({ page }) => {
  await montar(page);
  const hilo = (id: string, socioId: string, auth: string) => ({
    ...HILO_MOSTRADOR, id, ultimo_cuerpo: `Último de ${id}`, ultimo_remitente_auth_user_id: auth,
    conversacion_participantes: [{ socio_id: socioId, rol_en_conversacion: 'SOCIO', auth_user_id: auth, leido_hasta: '2026-09-12T08:00:00Z' }],
  });
  const HILOS = [hilo('conv-mos-a', 'soc-1', 'auth-maria'), hilo('conv-mos-b', 'soc-3', 'auth-carmen')];
  const cuenta = { mensajes: { 'conv-mos-a': 0, 'conv-mos-b': 0 } as Record<string, number> };
  const aviso = (id: string, quien: string, conv: string) => ({
    id, title: 'Nuevo mensaje', body: `${quien} te ha escrito.`, category: 'mensajeria', eventType: 'mensaje.recibido',
    priority: 'MEDIA', createdAt: '2026-09-12T08:00:00Z', readAt: '2026-09-12T08:05:00Z',
    deepLink: `/mensajeria?conversacion=${conv}`, studioId: 'studio-e2e',
  });

  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ json: {
    items: [aviso('nt-a', 'María García', 'conv-mos-a'), aviso('nt-b', 'Carmen Del Río', 'conv-mos-b')], unread: 0,
  } }));
  await page.route((u) => u.pathname === '/api/mensajeria/conversaciones', (r) => r.fulfill({ json: { conversaciones: HILOS } }));
  await page.route((u) => /^\/api\/mensajeria\/conversaciones\/conv-mos-[ab]\/mensajes$/.test(u.pathname), (r) => {
    const conv = new URL(r.request().url()).pathname.split('/')[4];
    cuenta.mensajes[conv]++;
    return r.fulfill({ json: { mensajes: [{
      id: `m-${conv}`, conversacion_id: conv, studio_id: 'studio-e2e', remitente_auth_user_id: 'auth-socia',
      cuerpo: `Mensaje del hilo ${conv}`, creado_en: '2026-09-12T08:00:00Z',
    }] } });
  });
  await page.route((u) => /\/api\/mensajeria\/conversaciones\/conv-mos-[ab]\/leido$/.test(u.pathname), (r) => r.fulfill({ status: 204 }));

  await ir(page, 'mensajeria');
  // La pestaña por defecto es Notificaciones.
  const primero = page.getByRole('listitem').filter({ hasText: 'María García te ha escrito.' });
  await primero.getByRole('link', { name: 'Ver más' }).click({ timeout: 30_000 });
  await expect(page.getByText('Mensaje del hilo conv-mos-a')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('textbox', { name: 'Mensaje' })).toBeVisible();
  expect(cuenta.mensajes['conv-mos-a']).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/mensajeria$/);

  // Vuelve a Notificaciones y toca el otro aviso: se abre el SUYO.
  await page.getByRole('button').filter({ hasText: 'Notificaciones' }).click();
  const segundo = page.getByRole('listitem').filter({ hasText: 'Carmen Del Río te ha escrito.' });
  await segundo.getByRole('link', { name: 'Ver más' }).click({ timeout: 30_000 });
  await expect(page.getByText('Mensaje del hilo conv-mos-b')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Mensaje del hilo conv-mos-a')).toHaveCount(0);
  expect(cuenta.mensajes['conv-mos-b']).toBeGreaterThan(0);
});
