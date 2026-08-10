import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conCacheCatalogo, invalidarCacheCatalogo, invalidarCatalogoPublico, claveCatalogoPublico } from './catalogo-estudio.ts';

test('primera llamada carga y cachea; la segunda no vuelve a llamar a cargar()', async () => {
  const clave = `test-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return { valor: 'a' }; };

  const r1 = await conCacheCatalogo(clave, cargar, 10_000);
  const r2 = await conCacheCatalogo(clave, cargar, 10_000);

  assert.equal(llamadas, 1);
  assert.deepEqual(r1, { valor: 'a' });
  assert.deepEqual(r2, { valor: 'a' });
});

test('tras expirar el TTL, vuelve a llamar a cargar()', async () => {
  const clave = `test-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  const r1 = await conCacheCatalogo(clave, cargar, 5);
  await new Promise((r) => setTimeout(r, 15));
  const r2 = await conCacheCatalogo(clave, cargar, 5);

  assert.equal(llamadas, 2);
  assert.equal(r1, 1);
  assert.equal(r2, 2);
});

test('claves distintas no comparten caché entre sí', async () => {
  let llamadasA = 0, llamadasB = 0;
  const a = await conCacheCatalogo(`claveA-${Math.random()}`, async () => { llamadasA++; return 'a'; }, 10_000);
  const b = await conCacheCatalogo(`claveB-${Math.random()}`, async () => { llamadasB++; return 'b'; }, 10_000);

  assert.equal(llamadasA, 1);
  assert.equal(llamadasB, 1);
  assert.equal(a, 'a');
  assert.equal(b, 'b');
});

test('invalidarCacheCatalogo fuerza una recarga aunque el TTL no haya expirado', async () => {
  const clave = `test-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  await conCacheCatalogo(clave, cargar, 10_000);
  invalidarCacheCatalogo(clave);
  const r2 = await conCacheCatalogo(clave, cargar, 10_000);

  assert.equal(llamadas, 2);
  assert.equal(r2, 2);
});

test('invalidar una clave que no existe no lanza', () => {
  assert.doesNotThrow(() => invalidarCacheCatalogo(`no-existe-${Math.random()}`));
});

// ── Invalidación al publicar ────────────────────────────────────────────────
//
// ⚠️ Regresión del fallo que reportó el fundador: "publico Noir y al entrar al
// portal sigo viendo Bloom". El tema publicado viaja DENTRO de este catálogo,
// y publicar no lo tiraba: la base de datos quedaba bien y el portal servía la
// copia vieja hasta un minuto.

test('invalidarCatalogoPublico tira las DOS variantes de un estudio', async () => {
  const studioId = `est-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  await conCacheCatalogo(claveCatalogoPublico(studioId, false), cargar, 60_000);
  await conCacheCatalogo(claveCatalogoPublico(studioId, true), cargar, 60_000);
  assert.equal(llamadas, 2, 'liviano y completo son entradas distintas');

  invalidarCatalogoPublico(studioId);

  await conCacheCatalogo(claveCatalogoPublico(studioId, false), cargar, 60_000);
  await conCacheCatalogo(claveCatalogoPublico(studioId, true), cargar, 60_000);
  // Si solo se tirara una, el widget embebible (liviano) o el portal
  // (completo) seguiría con el tema anterior — justo el síntoma reportado.
  assert.equal(llamadas, 4, 'alguna de las dos variantes ha sobrevivido a la invalidación');
});

test('invalidarCatalogoPublico no toca a los demás estudios', async () => {
  const mio = `est-${Math.random()}`;
  const ajeno = `est-${Math.random()}`;
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  await conCacheCatalogo(claveCatalogoPublico(mio, false), cargar, 60_000);
  await conCacheCatalogo(claveCatalogoPublico(ajeno, false), cargar, 60_000);
  invalidarCatalogoPublico(mio);
  await conCacheCatalogo(claveCatalogoPublico(ajeno, false), cargar, 60_000);

  assert.equal(llamadas, 2, 'publicar en un estudio ha vaciado el caché de otro');
});

test('acepta varias sedes de una vez (cadena)', async () => {
  const sedes = [`est-${Math.random()}`, `est-${Math.random()}`];
  let llamadas = 0;
  const cargar = async () => { llamadas++; return llamadas; };

  for (const s of sedes) await conCacheCatalogo(claveCatalogoPublico(s, false), cargar, 60_000);
  invalidarCatalogoPublico(...sedes);
  for (const s of sedes) await conCacheCatalogo(claveCatalogoPublico(s, false), cargar, 60_000);

  // El layout de una cadena se escribe UNA vez y afecta a todas las sedes.
  assert.equal(llamadas, 4);
});
