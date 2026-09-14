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
