import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { conectarLector, desconectarLector, leerLector, renombrarLector } from './datafono-servidor.ts';
import { MENSAJE_CODIGO_MAL_ESCRITO, MENSAJE_CODIGO_NO_VALE } from './datafono.ts';

// Conectar el datáfono contra un Stripe y un Supabase de mentira. Lo que se fija:
// todo va a la cuenta Connect del ESTUDIO, la dirección es la del estudio (nunca
// una inventada), el viejo se da de baja DESPUÉS de guardar el nuevo, y un código
// mal escrito no gasta una llamada a Stripe.

const errorStripe = (raw: { code?: string; param?: string; message: string }) =>
  Stripe.errors.StripeError.generate({ type: 'invalid_request_error', ...raw });

type Llamada = { que: string; args: unknown[]; opciones?: unknown };

function fakeStripe(o: {
  crearLector?: () => unknown; leerLector?: () => unknown; borrarLector?: () => unknown;
  actualizarUbicacion?: () => unknown;
} = {}) {
  const llamadas: Llamada[] = [];
  const reg = (que: string) => (...args: unknown[]) => {
    llamadas.push({ que, args: args.slice(0, -1), opciones: args.at(-1) });
  };
  const stripe = {
    terminal: {
      readers: {
        create: async (...a: unknown[]) => { reg('readers.create')(...a); if (o.crearLector) return o.crearLector(); return { id: 'tmr_nuevo', label: (a[0] as { label: string }).label, device_type: 'stripe_s700', status: 'online' }; },
        retrieve: async (...a: unknown[]) => { reg('readers.retrieve')(...a); if (o.leerLector) return o.leerLector(); return { id: 'tmr_1', label: 'Mostrador', device_type: 'bbpos_wisepos_e', status: 'offline' }; },
        update: async (...a: unknown[]) => { reg('readers.update')(...a); return { id: 'tmr_1', label: (a[1] as { label: string }).label, device_type: 'stripe_s700', status: 'online' }; },
        del: async (...a: unknown[]) => { reg('readers.del')(...a); if (o.borrarLector) return o.borrarLector(); return { id: a[0], deleted: true }; },
      },
      locations: {
        create: async (...a: unknown[]) => { reg('locations.create')(...a); return { id: 'tml_nueva' }; },
        update: async (...a: unknown[]) => { reg('locations.update')(...a); if (o.actualizarUbicacion) return o.actualizarUbicacion(); return { id: a[0] }; },
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, llamadas };
}

const ESTUDIO = {
  nombre: 'Pilates Centro', direccion: 'Calle de Ejemplo 12', ciudad: 'Madrid', codigo_postal: '28010',
  stripe_terminal_reader_id: null as string | null, stripe_terminal_location_id: null as string | null,
};

function fakeAdmin(fila: Partial<typeof ESTUDIO> = {}, o: { falloAlGuardarLector?: boolean } = {}) {
  const updates: { cambios: Record<string, unknown>; filtros: [string, unknown][] }[] = [];
  const admin = {
    from(tabla: string) {
      assert.equal(tabla, 'studios');
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...ESTUDIO, ...fila }, error: null }) }) }),
        update(cambios: Record<string, unknown>) {
          const u = { cambios, filtros: [] as [string, unknown][] };
          updates.push(u);
          const falla = o.falloAlGuardarLector && 'stripe_terminal_reader_id' in cambios && cambios.stripe_terminal_reader_id !== null;
          const cadena = {
            eq(col: string, v: unknown) { u.filtros.push([col, v]); return cadena; },
            then(res: (r: { error: { message: string } | null }) => unknown) { return Promise.resolve({ error: falla ? { message: 'boom' } : null }).then(res); },
          };
          return cadena;
        },
      };
    },
  };
  return { admin: admin as never, updates };
}

const ctx = (stripe: Stripe, esTest = false) => ({ stripe, stripeAccount: 'acct_estudio', studioId: 'studio-1', esTest });
const CUENTA = { stripeAccount: 'acct_estudio' };

test('conectar: ubicación con la dirección DEL ESTUDIO y el lector en su cuenta Connect', async () => {
  const { stripe, llamadas } = fakeStripe();
  const { admin, updates } = fakeAdmin();
  const r = await conectarLector(ctx(stripe), admin, { codigo: 'Sepia Cerulean Aqua', nombre: '  Sala  ', direccion: undefined });
  assert.deepEqual(r, { ok: true, lector: { etiqueta: 'Sala', modelo: 'Stripe Reader S700', estado: 'online' } });

  const ubic = llamadas.find(l => l.que === 'locations.create')!;
  assert.deepEqual(ubic.args[0], {
    display_name: 'Pilates Centro',
    address: { line1: 'Calle de Ejemplo 12', city: 'Madrid', postal_code: '28010', country: 'ES' },
  });
  const lector = llamadas.find(l => l.que === 'readers.create')!;
  assert.deepEqual(lector.args[0], { registration_code: 'sepia-cerulean-aqua', location: 'tml_nueva', label: 'Sala' });
  for (const l of llamadas) assert.deepEqual(l.opciones, CUENTA, `${l.que} va a la cuenta del estudio`);

  const guardado = updates.find(u => u.cambios.stripe_terminal_reader_id === 'tmr_nuevo')!;
  assert.deepEqual(guardado.filtros, [['id', 'studio-1']]);
  assert.equal(guardado.cambios.sumup_reader_id, null, 'un datáfono por sede: el SumUp Solo se olvida en el mismo UPDATE');
  assert.equal(updates.some(u => 'direccion' in u.cambios), false, 'la dirección del estudio no se toca');
});

test('conectar: un código mal escrito no llega a Stripe', async () => {
  const { stripe, llamadas } = fakeStripe();
  const r = await conectarLector(ctx(stripe), fakeAdmin().admin, { codigo: 'hola', nombre: '', direccion: undefined });
  assert.deepEqual(r, { ok: false, status: 400, error: MENSAJE_CODIGO_MAL_ESCRITO, falta: 'codigo' });
  assert.equal(llamadas.length, 0);
});

test('conectar: en el modo de prueba de Stripe se registra un datáfono simulado', async () => {
  const { stripe, llamadas } = fakeStripe();
  await conectarLector(ctx(stripe, true), fakeAdmin().admin, { codigo: '', nombre: '', direccion: undefined });
  assert.equal((llamadas.find(l => l.que === 'readers.create')!.args[0] as { registration_code: string }).registration_code, 'simulated-wpe');
});

test('conectar: sin dirección en el estudio ni escrita, no se registra nada', async () => {
  const { stripe, llamadas } = fakeStripe();
  const { admin } = fakeAdmin({ direccion: null as unknown as string, ciudad: null as unknown as string, codigo_postal: null as unknown as string });
  const r = await conectarLector(ctx(stripe), admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion: undefined });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.falta, 'direccion');
  assert.equal(llamadas.length, 0);
});

test('conectar: la dirección escrita se usa, y se guarda en el estudio SOLO si le faltaba', async () => {
  const sin = { direccion: null as unknown as string, ciudad: null as unknown as string, codigo_postal: null as unknown as string };
  const { stripe } = fakeStripe();
  const { admin, updates } = fakeAdmin(sin);
  const direccion = { linea: 'Calle Nueva 3', codigoPostal: '41001', ciudad: 'Sevilla' };
  const r = await conectarLector(ctx(stripe), admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion });
  assert.equal(r.ok, true);
  assert.ok(updates.some(u => u.cambios.direccion === 'Calle Nueva 3' && u.cambios.codigo_postal === '41001' && u.cambios.ciudad === 'Sevilla'));

  const otro = fakeAdmin();
  await conectarLector(ctx(fakeStripe().stripe), otro.admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion });
  assert.equal(otro.updates.some(u => 'direccion' in u.cambios), false, 'con dirección ya puesta, no se pisa');
});

test('conectar: el código que Stripe rechaza se dice como tal, y la ubicación queda guardada para el reintento', async () => {
  const { stripe } = fakeStripe({ crearLector: () => { throw errorStripe({ param: 'registration_code', message: 'Invalid registration code' }); } });
  const { admin, updates } = fakeAdmin();
  const r = await conectarLector(ctx(stripe), admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion: undefined });
  assert.deepEqual(r, { ok: false, status: 400, error: MENSAJE_CODIGO_NO_VALE, falta: 'codigo' });
  assert.ok(updates.some(u => u.cambios.stripe_terminal_location_id === 'tml_nueva' && !('stripe_terminal_reader_id' in u.cambios)));
});

test('cambiar de datáfono: el viejo se da de baja DESPUÉS de guardar el nuevo, y se reutiliza la ubicación', async () => {
  const { stripe, llamadas } = fakeStripe();
  const { admin, updates } = fakeAdmin({ stripe_terminal_reader_id: 'tmr_viejo', stripe_terminal_location_id: 'tml_1' });
  const r = await conectarLector(ctx(stripe), admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion: undefined });
  assert.equal(r.ok, true);
  assert.equal(llamadas.some(l => l.que === 'locations.create'), false);
  assert.equal(llamadas.find(l => l.que === 'locations.update')!.args[0], 'tml_1');
  const orden = llamadas.map(l => l.que);
  assert.ok(orden.indexOf('readers.create') < orden.indexOf('readers.del'));
  assert.equal(llamadas.find(l => l.que === 'readers.del')!.args[0], 'tmr_viejo');
  assert.ok(updates.some(u => u.cambios.stripe_terminal_reader_id === 'tmr_nuevo'));
});

test('cambiar de datáfono: si no se puede guardar el nuevo, se da de baja el nuevo y el viejo se queda', async () => {
  const { stripe, llamadas } = fakeStripe();
  const { admin } = fakeAdmin({ stripe_terminal_reader_id: 'tmr_viejo', stripe_terminal_location_id: 'tml_1' }, { falloAlGuardarLector: true });
  const r = await conectarLector(ctx(stripe), admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion: undefined });
  assert.equal(r.ok, false);
  const bajas = llamadas.filter(l => l.que === 'readers.del').map(l => l.args[0]);
  assert.deepEqual(bajas, ['tmr_nuevo'], 'el viejo sigue funcionando');
});

test('ubicación borrada en Stripe: se crea otra; cualquier otro fallo no registra el lector', async () => {
  const borrada = fakeStripe({ actualizarUbicacion: () => { throw errorStripe({ code: 'resource_missing', message: 'No such location' }); } });
  const r1 = await conectarLector(ctx(borrada.stripe), fakeAdmin({ stripe_terminal_location_id: 'tml_1' }).admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion: undefined });
  assert.equal(r1.ok, true);
  assert.ok(borrada.llamadas.some(l => l.que === 'locations.create'));

  const caida = fakeStripe({ actualizarUbicacion: () => { throw errorStripe({ code: 'api_error', message: 'boom' }); } });
  const r2 = await conectarLector(ctx(caida.stripe), fakeAdmin({ stripe_terminal_location_id: 'tml_1' }).admin, { codigo: 'sepia-cerulean-aqua', nombre: '', direccion: undefined });
  assert.equal(r2.ok, false);
  assert.equal(caida.llamadas.some(l => l.que === 'readers.create'), false);
});

test('leer: borrado en Stripe es «no hay»; Stripe caído es «no se sabe», nunca «desconectado»', async () => {
  const { stripe } = fakeStripe();
  assert.deepEqual(await leerLector(ctx(stripe), 'tmr_1'), { etiqueta: 'Mostrador', modelo: 'BBPOS WisePOS E', estado: 'offline' });
  const borrado = fakeStripe({ leerLector: () => ({ id: 'tmr_1', deleted: true }) });
  assert.equal(await leerLector(ctx(borrado.stripe), 'tmr_1'), null);
  const noExiste = fakeStripe({ leerLector: () => { throw errorStripe({ code: 'resource_missing', message: 'x' }); } });
  assert.equal(await leerLector(ctx(noExiste.stripe), 'tmr_1'), null);
  const caido = fakeStripe({ leerLector: () => { throw errorStripe({ code: 'api_error', message: 'x' }); } });
  assert.equal(await leerLector(ctx(caido.stripe), 'tmr_1'), undefined);
});

test('renombrar y desconectar: en su cuenta, y desconectar solo olvida ESE lector', async () => {
  const { stripe, llamadas } = fakeStripe();
  const r = await renombrarLector(ctx(stripe), 'tmr_1', '  Recepción ');
  assert.equal(r.ok && r.lector.etiqueta, 'Recepción');
  assert.deepEqual(llamadas[0].args, ['tmr_1', { label: 'Recepción' }]);

  const { admin, updates } = fakeAdmin();
  assert.deepEqual(await desconectarLector(ctx(stripe), admin, 'tmr_1'), { ok: true });
  assert.deepEqual(updates[0], { cambios: { stripe_terminal_reader_id: null }, filtros: [['id', 'studio-1'], ['stripe_terminal_reader_id', 'tmr_1']] });

  // Ya borrado en Stripe: se olvida igual.
  const borrado = fakeStripe({ borrarLector: () => { throw errorStripe({ code: 'resource_missing', message: 'x' }); } });
  assert.deepEqual(await desconectarLector(ctx(borrado.stripe), fakeAdmin().admin, 'tmr_1'), { ok: true });
  // Stripe caído: no se olvida (seguiría registrado allí).
  const caido = fakeStripe({ borrarLector: () => { throw errorStripe({ code: 'api_error', message: 'x' }); } });
  const f = fakeAdmin();
  const r2 = await desconectarLector(ctx(caido.stripe), f.admin, 'tmr_1');
  assert.equal(r2.ok, false);
  assert.equal(f.updates.length, 0);
});
