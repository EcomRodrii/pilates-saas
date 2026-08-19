import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverDestinoPostLogin, resolverAccesoPorProducto } from './routing-post-login.ts';

// ── resolverDestinoPostLogin: solo para /clave-nueva (identidad, sin gate) ──

test('con estudio real, siempre al dashboard — nunca al panel equivocado', () => {
  assert.equal(resolverDestinoPostLogin(true, null), '/dashboard');
  assert.equal(resolverDestinoPostLogin(true, 'published'), '/dashboard');
  assert.equal(resolverDestinoPostLogin(true, 'draft'), '/dashboard');
});

test('sin estudio, perfil de Network publicado o en revisión → inicio (el panel)', () => {
  assert.equal(resolverDestinoPostLogin(false, 'published'), '/network/inicio');
  assert.equal(resolverDestinoPostLogin(false, 'en_revision'), '/network/inicio');
});

test('sin estudio, sin perfil o con el onboarding a medias → reanudar, nunca el dashboard', () => {
  assert.equal(resolverDestinoPostLogin(false, null), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'draft'), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'hidden'), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'suspended'), '/network/reanudar');
});

// ── resolverAccesoPorProducto: la que gobierna /login y /network/acceso ────

test('cuenta SOLO Software entra por /login', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('software', { tieneEstudio: true, estadoPerfilNetwork: null }),
    { tipo: 'entra', destino: '/dashboard' },
  );
});

test('⚠️ cuenta SOLO Software intentando /network/acceso: bloqueada, no dashboard silencioso', () => {
  // TEST 6 del encargo: credenciales de Software en Network → mensaje claro,
  // nunca un acceso concedido a lo que no tiene.
  assert.deepEqual(
    resolverAccesoPorProducto('network', { tieneEstudio: true, estadoPerfilNetwork: null }),
    { tipo: 'cuenta-de-otro-producto' },
  );
});

test('cuenta SOLO Network entra por /network/acceso, a inicio si está publicado', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('network', { tieneEstudio: false, estadoPerfilNetwork: 'published' }),
    { tipo: 'entra', destino: '/network/inicio' },
  );
});

test('cuenta SOLO Network con onboarding a medias entra a reanudar, no al dashboard', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('network', { tieneEstudio: false, estadoPerfilNetwork: 'draft' }),
    { tipo: 'entra', destino: '/network/reanudar' },
  );
});

test('⚠️ cuenta SOLO Network intentando /login: bloqueada, no se le redirige en silencio a Network', () => {
  // TEST 5 del encargo. Antes esto NO se bloqueaba: destino-post-login no
  // sabía qué página había llamado y la mandaba a Network sin avisar — llegaba
  // al sitio "correcto" pero por una ruta confusa que el encargo pide evitar.
  assert.deepEqual(
    resolverAccesoPorProducto('software', { tieneEstudio: false, estadoPerfilNetwork: 'published' }),
    { tipo: 'cuenta-de-otro-producto' },
  );
  assert.deepEqual(
    resolverAccesoPorProducto('software', { tieneEstudio: false, estadoPerfilNetwork: 'draft' }),
    { tipo: 'cuenta-de-otro-producto' },
  );
});

test('⚠️ identidad DUAL (self-claim): entra a los dos, cada una por su puerta', () => {
  // El bug real encontrado auditando: una instructora con ficha de Software
  // (self-claim) Y perfil de Network, entrando por /network/acceso, acababa
  // SIEMPRE en /dashboard — porque la resolución vieja miraba "¿tiene
  // estudio?" antes que nada, sin saber que había entrado por la puerta de
  // Network. Con gate por producto, cada puerta respeta lo suyo.
  const dual = { tieneEstudio: true, estadoPerfilNetwork: 'published' };
  assert.deepEqual(resolverAccesoPorProducto('software', dual), { tipo: 'entra', destino: '/dashboard' });
  assert.deepEqual(resolverAccesoPorProducto('network', dual), { tipo: 'entra', destino: '/network/inicio' });
});

test('cuenta sin NADA en ningún producto: "cuenta-nueva" en las dos puertas', () => {
  const nueva = { tieneEstudio: false, estadoPerfilNetwork: null };
  assert.deepEqual(resolverAccesoPorProducto('software', nueva), { tipo: 'cuenta-nueva' });
  assert.deepEqual(resolverAccesoPorProducto('network', nueva), { tipo: 'cuenta-nueva' });
});

test('nunca se concede "entra" a un producto sin nada propio ahí', () => {
  // Barrido: para cualquier combinación donde el producto preguntado no tiene
  // ni estudio ni perfil, el resultado NUNCA es 'entra'.
  const estados = [null, 'draft', 'hidden', 'suspended', 'published', 'en_revision'];
  for (const estado of estados) {
    const r = resolverAccesoPorProducto('software', { tieneEstudio: false, estadoPerfilNetwork: estado });
    assert.notEqual(r.tipo, 'entra', `software sin estudio, red_perfiles=${estado}`);
  }
});
