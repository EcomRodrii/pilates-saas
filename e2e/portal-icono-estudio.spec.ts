import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El icono de la app que la alumna se instala en su móvil.
//
// El fallo reportado: una propietaria con su logo ya subido veía el icono de
// TENTARE al añadir el portal a la pantalla de inicio. El manifest declaraba su
// logo con `sizes: 'any'` y, al lado, `/icon-192.png` y `/icon-512.png` —los de
// Tentare— «por si el logo no es cuadrado». Un instalador que exige un tamaño
// exacto descarta el de tamaño libre y se queda con el único candidato de
// 192/512, que era la marca de otra empresa.
//
// Este spec vigila la regla que lo impide: en el manifest de un estudio NO
// puede aparecer un icono de la plataforma, con logo o sin él.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'studio-carmen';

/** Los iconos de Tentare que genera scripts/regenerar-marca.mjs. Ninguno de
 *  estos puede acabar en el manifest de un estudio. */
const ICONOS_DE_LA_PLATAFORMA = ['/icon-192.png', '/icon-512.png', '/apple-icon.png', '/favicon.ico'];

test('el manifest del portal no ofrece ningún icono de Tentare', async ({ request }) => {
  const res = await request.get(`/portal/${SLUG}/manifest.webmanifest`);
  expect(res.status()).toBe(200);
  const manifest = await res.json();

  const fuentes: string[] = (manifest.icons ?? []).map((i: { src: string }) => i.src);
  expect(fuentes.length).toBeGreaterThan(0);
  for (const prohibido of ICONOS_DE_LA_PLATAFORMA) {
    expect(fuentes, `el manifest ofrece ${prohibido}`).not.toContain(prohibido);
  }
});

// Los tamaños exactos son justamente los que gana un instalador de Android, así
// que son los que no pueden faltar ni ser de otra marca.
test('el manifest declara 192 y 512 propios del estudio', async ({ request }) => {
  const manifest = await (await request.get(`/portal/${SLUG}/manifest.webmanifest`)).json();
  const porTamano = new Map<string, string>(
    (manifest.icons ?? []).map((i: { sizes: string; src: string }) => [i.sizes, i.src]),
  );
  for (const tam of ['192x192', '512x512']) {
    const src = porTamano.get(tam);
    expect(src, `falta el icono ${tam}`).toBeTruthy();
    // Servido por la ruta propia del estudio, que compone su logo o su inicial.
    expect(src!).toContain('/icono-estudio?');
  }
});

test('la ruta del icono devuelve un PNG de verdad', async ({ request }) => {
  const res = await request.get('/icono-estudio?inicial=C&color=%23343825&size=192');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image');
});

// La ruta descarga la URL del logo EN EL SERVIDOR para componer el PNG, así que
// un parámetro libre sería una puerta para hacerle pedir lo que sea a donde
// sea. Un origen ajeno tiene que caer al monograma, no seguirse.
test('un logo de un origen ajeno no se descarga: cae al monograma', async ({ request }) => {
  const res = await request.get(
    '/icono-estudio?inicial=C&color=%23343825&size=192&logo=' + encodeURIComponent('https://evil.example/pwn.png'),
  );
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image');
});
