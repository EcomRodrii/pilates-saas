import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { crearInApp } from './inapp.ts';
import { EVENTOS } from './catalog.ts';

// El texto que escribe el estudio llega a SUS ALUMNAS; la instructora y el
// mostrador, en el mismo evento, siguen con el suyo. Y si la plantilla guardada
// no vale, sale la de fábrica: nunca un aviso roto.

function fakeAdmin(plantilla: { title_tpl: string; body_tpl: string } | null) {
  const notifs: Record<string, unknown>[] = [];
  const lecturasPlantilla: string[] = [];
  const cadena = (tabla: string) => {
    const filtros: string[] = [];
    const c: Record<string, unknown> = {
      select: () => c,
      eq: (col: string, v: string) => { filtros.push(`${col}=${v}`); return c; },
      maybeSingle: async () => {
        if (tabla !== 'notification_template') return { data: null, error: null };
        lecturasPlantilla.push(filtros.join('&'));
        return { data: plantilla, error: null };
      },
      insert: async (row: Record<string, unknown> | Record<string, unknown>[]) => {
        if (tabla === 'notification') notifs.push(...(Array.isArray(row) ? row : [row]));
        return { error: null };
      },
    };
    return c;
  };
  return { admin: { from: cadena } as unknown as SupabaseClient, notifs, lecturasPlantilla };
}

const clase = (recipients: { role: 'SOCIA' | 'INSTRUCTOR'; userId: string }[]) => ({
  type: EVENTOS.CLASE_CANCELADA, studioId: 'st-1',
  data: { clase: 'Reformer', cuando: 'jueves a las 18:30', slug: 'luz' },
  recipients, dedupKey: `clase-cancelada:${recipients.map(r => r.userId).join(',')}`,
});

test('la alumna recibe el texto del estudio; la instructora, el suyo', async () => {
  const { admin, notifs, lecturasPlantilla } = fakeAdmin({
    title_tpl: 'Hoy no hay {clase}', body_tpl: 'Lo sentimos: la de {cuando} no se da. Te devolvemos la sesión.',
  });
  await crearInApp(admin, clase([{ role: 'SOCIA', userId: 'u-a' }, { role: 'INSTRUCTOR', userId: 'u-i' }]));

  const deLa = (rol: string) => notifs.find(n => n.recipient_role === rol)!;
  assert.equal(deLa('SOCIA').title, 'Hoy no hay Reformer');
  assert.match(deLa('SOCIA').body as string, /la de jueves a las 18:30 no se da/);
  assert.equal(deLa('INSTRUCTOR').title, 'Se ha cancelado tu clase');
  assert.deepEqual(lecturasPlantilla, ['studio_id=st-1&event_type=clase.cancelada&locale=es'], 'una lectura por evento, no por persona');
});

test('una plantilla guardada con una variable que el evento no trae: sale la de fábrica', async () => {
  const { admin, notifs } = fakeAdmin({ title_tpl: 'Hola {nombre}', body_tpl: '{clase} cancelada' });
  await crearInApp(admin, clase([{ role: 'SOCIA', userId: 'u-a' }]));
  assert.equal(notifs[0].title, 'Clase cancelada');
});

test('sin alumnas entre los destinatarios ni se lee la plantilla', async () => {
  const { admin, lecturasPlantilla } = fakeAdmin(null);
  await crearInApp(admin, clase([{ role: 'INSTRUCTOR', userId: 'u-i' }]));
  assert.equal(lecturasPlantilla.length, 0);
});
