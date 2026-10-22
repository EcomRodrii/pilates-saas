import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  LECTURAS_POR_POST, MOTIVO_SOLO_MIRAR, NOMBRE_MARCO_SOLO_MIRAR, SCRIPT_SOLO_MIRAR, enMarcoSoloMirar, instalarSoloMirar,
  type VentanaSoloMirar,
} from './solo-mirar.ts';

// La app de la alumna dentro del marco del alta nueva se toca pero no escribe
// (lib/student/solo-mirar.ts). Aquí, la cerradura contra una ventana de mentira:
// qué deja pasar, qué no, y que el script en línea es la misma función.

const ORIGEN = 'https://www.tentare.app';
const SUPABASE = 'https://proyecto.supabase.co';

function ventana({ enMarco = true, nombre = NOMBRE_MARCO_SOLO_MIRAR } = {}) {
  const llamadas: { entrada: unknown; metodo: string }[] = [];
  const top = {};
  const atributos: Record<string, string> = {};
  const w: VentanaSoloMirar & { beacons: number } = {
    name: nombre,
    self: enMarco ? {} : top,
    top,
    location: { href: `${ORIGEN}/portal/estudio-alba`, origin: ORIGEN },
    fetch: async (entrada, opciones) => {
      llamadas.push({ entrada, metodo: opciones?.method ?? (entrada as { method?: string })?.method ?? 'GET' });
      return { ok: true };
    },
    navigator: { sendBeacon: () => { w.beacons++; return true; } },
    document: { documentElement: { setAttribute: (n, v) => { atributos[n] = v; } } },
    beacons: 0,
  };
  return { w, llamadas, atributos };
}

const CFG = { nombre: NOMBRE_MARCO_SOLO_MIRAR, lecturas: LECTURAS_POR_POST, motivo: MOTIVO_SOLO_MIRAR };

test('fuera del marco del alta (pestaña normal o la vista previa de Apariencia) no toca nada', async () => {
  for (const opciones of [{ enMarco: false }, { nombre: '' }, { nombre: 'otro-marco' }]) {
    const { w, llamadas } = ventana(opciones);
    const original = w.fetch;
    assert.equal(instalarSoloMirar(w, CFG), false);
    assert.equal(w.fetch, original);
    await w.fetch(`${ORIGEN}/api/public/reserva`, { method: 'POST' });
    assert.equal(llamadas.length, 1, 'una escritura de verdad sigue saliendo');
  }
});

test('en el marco: lo que lee pasa, lo que escribe no sale', async () => {
  const { w, llamadas, atributos } = ventana();
  assert.equal(instalarSoloMirar(w, CFG), true);
  assert.equal(atributos['data-solo-mirar'], '');

  await w.fetch(`${ORIGEN}/api/public/aforo?slug=x`);
  await w.fetch(`${ORIGEN}/api/public/aforo?slug=x`, { method: 'HEAD' });
  // El catálogo y la racha se LEEN con POST.
  await w.fetch('/api/public/studio-data', { method: 'POST' });
  await w.fetch(new URL('/api/public/racha', ORIGEN), { method: 'post' });
  assert.equal(llamadas.length, 4);

  const escrituras: [unknown, { method?: string } | undefined][] = [
    [`${ORIGEN}/api/public/reserva`, { method: 'POST' }],
    [`${SUPABASE}/auth/v1/otp`, { method: 'POST' }],
    [`${SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST' }],
    // En el marco no se usa ninguna sesión: ni se resuelve (puede vincular una ficha) ni se renueva.
    [`${ORIGEN}/api/public/session?slug=x`, { method: 'POST' }],
    [`${SUPABASE}/auth/v1/token?grant_type=refresh_token`, { method: 'POST' }],
    [`${ORIGEN}/api/auth/otp/verificar`, { method: 'POST' }],
    [`${SUPABASE}/rest/v1/reservas?id=eq.1`, { method: 'PATCH' }],
    // Un `Request` con su método dentro.
    [{ url: `${ORIGEN}/api/public/socio`, method: 'DELETE' }, undefined],
    // Una ruta de lectura por POST, pero de OTRO origen: no vale.
    ['https://otro.example/api/public/studio-data', { method: 'POST' }],
  ];
  for (const [entrada, opciones] of escrituras) {
    await assert.rejects(w.fetch(entrada, opciones), (e: Error) => e instanceof TypeError && e.message === MOTIVO_SOLO_MIRAR, JSON.stringify(entrada));
  }
  assert.equal(llamadas.length, 4, 'ninguna escritura llegó a salir');

  assert.equal(w.navigator?.sendBeacon?.('x'), false);
  assert.equal(w.beacons, 0);
});

test('el script en línea del layout es la misma cerradura, y corre solo', async () => {
  const { w, llamadas } = ventana();
  vm.runInNewContext(SCRIPT_SOLO_MIRAR, { window: w, URL, TypeError, Promise, String });
  await assert.rejects(w.fetch(`${ORIGEN}/api/public/reserva`, { method: 'POST' }));
  await w.fetch('/api/public/studio-data', { method: 'POST' });
  assert.equal(llamadas.length, 1);
  // Y no se puede colar otro nombre de marco por la configuración.
  assert.ok(SCRIPT_SOLO_MIRAR.includes(JSON.stringify(NOMBRE_MARCO_SOLO_MIRAR)));
});

test('¿marco de solo mirar?: enmarcada, con su nombre y con la cerradura puesta', () => {
  const top = {};
  const conCerradura = { documentElement: { hasAttribute: (n: string) => n === 'data-solo-mirar' } };
  const sinCerradura = { documentElement: { hasAttribute: () => false } };
  assert.equal(enMarcoSoloMirar({ name: NOMBRE_MARCO_SOLO_MIRAR, self: {}, top, document: conCerradura }), true);
  assert.equal(enMarcoSoloMirar({ name: NOMBRE_MARCO_SOLO_MIRAR, self: {}, top, document: sinCerradura }), false, 'sin la cerradura, la interfaz no se abre');
  assert.equal(enMarcoSoloMirar({ name: NOMBRE_MARCO_SOLO_MIRAR, self: top, top, document: conCerradura }), false);
  assert.equal(enMarcoSoloMirar({ name: '', self: {}, top, document: conCerradura }), false);
  assert.equal(enMarcoSoloMirar(null), false);
});
