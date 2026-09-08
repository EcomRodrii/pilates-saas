import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverDestinatarios } from './recipients.ts';
import type { NotificationEvent } from './types.ts';

// Regresión de la 27ª pasada (8 sep 2026), C-1.
//
// `propietaria()` leía SOLO `studios.email` —el email PÚBLICO de contacto del
// estudio, vacío en 6 de los 9 estudios activos de producción—, así que el
// canal EMAIL de la dueña no existía: las 4 únicas entregas EMAIL de la
// historia de `notification_delivery` acabaron SKIPPED «destinatario sin
// email», y con ellas los avisos CRITICA que no tienen otra vía para llegar a
// quien no está mirando el panel (SISTEMA_STRIPE_DESCONECTADO, TRIAL_EXPIRADO).
//
// El test comprueba las DOS direcciones a propósito: que se cae a la cuenta
// cuando falta el email del estudio, y que NO se pisa el del estudio cuando sí
// está. Un fallback que gane siempre sería otro fallo.

function adminFalso(studio: Record<string, unknown>, emailDeCuenta: string | null) {
  let pedidoAAuth = 0;
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: studio }) }) }),
    }),
    auth: {
      admin: {
        getUserById: async () => {
          pedidoAAuth++;
          return { data: { user: emailDeCuenta ? { email: emailDeCuenta } : null } };
        },
      },
    },
  };
  return { client: client as unknown as SupabaseClient, vecesQueSePidioLaCuenta: () => pedidoAAuth };
}

const EVENTO: NotificationEvent = { type: 'sistema.trial_expirado', studioId: 'studio-1', data: {} };

test('propietaria sin email de contacto: se le escribe al email de su cuenta', async () => {
  const { client, vecesQueSePidioLaCuenta } = adminFalso(
    { nombre: 'Sereno', owner_auth_user_id: 'auth-1', email: null, telefono: null },
    'marco@ejemplo.com',
  );
  const [dest] = await resolverDestinatarios(client, 'propietaria', EVENTO);
  assert.equal(dest.email, 'marco@ejemplo.com');
  assert.equal(vecesQueSePidioLaCuenta(), 1);
});

test('email de contacto vacío o con espacios cuenta como que no hay', async () => {
  const { client } = adminFalso(
    { nombre: 'Sereno', owner_auth_user_id: 'auth-1', email: '   ', telefono: null },
    'marco@ejemplo.com',
  );
  const [dest] = await resolverDestinatarios(client, 'propietaria', EVENTO);
  assert.equal(dest.email, 'marco@ejemplo.com');
});

test('con email de contacto puesto, manda ese y NO se consulta la cuenta', async () => {
  const { client, vecesQueSePidioLaCuenta } = adminFalso(
    { nombre: 'Sereno', owner_auth_user_id: 'auth-1', email: 'hola@sereno.es', telefono: '600' },
    'marco@ejemplo.com',
  );
  const [dest] = await resolverDestinatarios(client, 'propietaria', EVENTO);
  assert.equal(dest.email, 'hola@sereno.es');
  assert.equal(vecesQueSePidioLaCuenta(), 0);
});

test('sin email en ninguno de los dos sitios, el destinatario sigue existiendo para in-app/push', async () => {
  const { client } = adminFalso(
    { nombre: 'Sereno', owner_auth_user_id: 'auth-1', email: null, telefono: null },
    null,
  );
  const [dest] = await resolverDestinatarios(client, 'propietaria', EVENTO);
  assert.equal(dest.email, null);
  assert.equal(dest.userId, 'auth-1');
});

test('si la consulta a auth falla, el aviso NO se pierde: destinatario sin email pero con userId', async () => {
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { nombre: 'Sereno', owner_auth_user_id: 'auth-1', email: null, telefono: null },
    }) }) }) }),
    auth: { admin: { getUserById: async () => { throw new Error('auth caída'); } } },
  } as unknown as SupabaseClient;
  const [dest] = await resolverDestinatarios(client, 'propietaria', EVENTO);
  assert.equal(dest.email, null);
  assert.equal(dest.userId, 'auth-1'); // in-app y push siguen llegando
});
