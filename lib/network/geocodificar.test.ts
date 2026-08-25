import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geocodificarDireccion } from './geocodificar.ts';

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => { globalThis.fetch = original; };
}

test('geocodificarDireccion: devuelve lat/lng cuando Nominatim encuentra un resultado', async () => {
  const restaurar = stubFetch(async (url, init) => {
    assert.match(url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
    assert.match(url, /q=Salamanca%2C\+Madrid%2C\+Espa%C3%B1a|q=Salamanca%2C%20Madrid%2C%20Espa%C3%B1a/);
    const headers = init?.headers as Record<string, string>;
    assert.match(headers['User-Agent'], /Tentare/);
    return new Response(JSON.stringify([{ lat: '40.4168', lon: '-3.7038' }]), { status: 200 });
  });
  try {
    const coords = await geocodificarDireccion('Madrid', 'Salamanca');
    assert.deepEqual(coords, { lat: 40.4168, lng: -3.7038 });
  } finally {
    restaurar();
  }
});

test('geocodificarDireccion: sin zona, la query es solo "Ciudad, España"', async () => {
  const restaurar = stubFetch(async (url) => {
    const q = new URL(url).searchParams.get('q');
    assert.equal(q, 'Bilbao, España');
    return new Response(JSON.stringify([]), { status: 200 });
  });
  try {
    await geocodificarDireccion('Bilbao');
  } finally {
    restaurar();
  }
});

test('geocodificarDireccion: null si Nominatim no encuentra nada — nunca inventa una posición', async () => {
  const restaurar = stubFetch(async () => new Response(JSON.stringify([]), { status: 200 }));
  try {
    const coords = await geocodificarDireccion('Un pueblo que no existe de verdad');
    assert.equal(coords, null);
  } finally {
    restaurar();
  }
});

test('geocodificarDireccion: null si la respuesta HTTP no es ok', async () => {
  const restaurar = stubFetch(async () => new Response('error', { status: 503 }));
  try {
    const coords = await geocodificarDireccion('Madrid');
    assert.equal(coords, null);
  } finally {
    restaurar();
  }
});

test('geocodificarDireccion: null si la petición de red falla (nunca lanza)', async () => {
  const restaurar = stubFetch(async () => { throw new Error('network down'); });
  try {
    const coords = await geocodificarDireccion('Madrid');
    assert.equal(coords, null);
  } finally {
    restaurar();
  }
});

test('geocodificarDireccion: null con ciudad vacía, sin llamar a Nominatim', async () => {
  let llamado = false;
  const restaurar = stubFetch(async () => { llamado = true; return new Response('[]'); });
  try {
    const coords = await geocodificarDireccion('   ');
    assert.equal(coords, null);
    assert.equal(llamado, false);
  } finally {
    restaurar();
  }
});
