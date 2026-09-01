import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverDestinoPostLogin, resolverAccesoPorProducto } from './routing-post-login.ts';

// ── resolverDestinoPostLogin: solo para /clave-nueva (identidad, sin gate) ──

test('con estudio real, siempre al dashboard — nunca al panel equivocado', () => {
  assert.equal(resolverDestinoPostLogin(true, null), '/dashboard');
  assert.equal(resolverDestinoPostLogin(true, 'published'), '/dashboard');
  assert.equal(resolverDestinoPostLogin(true, 'draft'), '/dashboard');
});

test('sin estudio, perfil publicado/en revisión/oculto → inicio (el panel), nunca el wizard', () => {
  // 'hidden' es un perfil que YA estuvo completo (solo se llega ahí ocultando
  // uno published) — mandarlo al wizard de reanudar es el bug real de
  // "aunque ya tengas el perfil hecho te vuelve a pedir rellenar todo".
  assert.equal(resolverDestinoPostLogin(false, 'published'), '/network/inicio');
  assert.equal(resolverDestinoPostLogin(false, 'en_revision'), '/network/inicio');
  assert.equal(resolverDestinoPostLogin(false, 'hidden'), '/network/inicio');
});

test('sin estudio, sin perfil, con el onboarding a medias o suspendido → reanudar, nunca el dashboard', () => {
  assert.equal(resolverDestinoPostLogin(false, null), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'draft'), '/network/reanudar');
  assert.equal(resolverDestinoPostLogin(false, 'suspended'), '/network/reanudar');
});

test('F0: sin estudio ni instructora, con perfil de alumna → la vía de alumna, nunca la de instructora', () => {
  assert.equal(resolverDestinoPostLogin(false, null, 'published'), '/network/alumna/inicio');
  assert.equal(resolverDestinoPostLogin(false, null, 'draft'), '/network/alumna/reanudar');
});

test('F0: instructora manda sobre alumna cuando hay las dos y ninguna tiene estudio', () => {
  // La rama de instructora se resuelve primero — mismo orden que ya usaba el
  // código antes de F0, alumna es una tercera vía añadida, no una que compita.
  assert.equal(resolverDestinoPostLogin(false, 'published', 'published'), '/network/inicio');
});

// ── resolverAccesoPorProducto: la que gobierna /login, /network/acceso y /network/alumna/acceso ────

test('cuenta SOLO Software entra por /login', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('software', { tieneEstudio: true, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: null }),
    { tipo: 'entra', destino: '/dashboard' },
  );
});

test('⚠️ cuenta SOLO Software intentando /network/acceso: bloqueada, no dashboard silencioso', () => {
  // TEST 6 del encargo: credenciales de Software en Network → mensaje claro,
  // nunca un acceso concedido a lo que no tiene.
  assert.deepEqual(
    resolverAccesoPorProducto('network', { tieneEstudio: true, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: null }),
    { tipo: 'cuenta-de-otro-producto' },
  );
});

test('cuenta SOLO Network entra por /network/acceso, a inicio si está publicado', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('network', { tieneEstudio: false, estadoPerfilNetwork: 'published', estadoPerfilNetworkAlumna: null }),
    { tipo: 'entra', destino: '/network/inicio' },
  );
});

test('cuenta SOLO Network con onboarding a medias entra a reanudar, no al dashboard', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('network', { tieneEstudio: false, estadoPerfilNetwork: 'draft', estadoPerfilNetworkAlumna: null }),
    { tipo: 'entra', destino: '/network/reanudar' },
  );
});

test('⚠️ cuenta SOLO Network intentando /login: bloqueada, no se le redirige en silencio a Network', () => {
  // TEST 5 del encargo. Antes esto NO se bloqueaba: destino-post-login no
  // sabía qué página había llamado y la mandaba a Network sin avisar — llegaba
  // al sitio "correcto" pero por una ruta confusa que el encargo pide evitar.
  assert.deepEqual(
    resolverAccesoPorProducto('software', { tieneEstudio: false, estadoPerfilNetwork: 'published', estadoPerfilNetworkAlumna: null }),
    { tipo: 'cuenta-de-otro-producto' },
  );
  assert.deepEqual(
    resolverAccesoPorProducto('software', { tieneEstudio: false, estadoPerfilNetwork: 'draft', estadoPerfilNetworkAlumna: null }),
    { tipo: 'cuenta-de-otro-producto' },
  );
});

test('⚠️ identidad DUAL (self-claim): entra a los dos, cada una por su puerta', () => {
  // El bug real encontrado auditando: una instructora con ficha de Software
  // (self-claim) Y perfil de Network, entrando por /network/acceso, acababa
  // SIEMPRE en /dashboard — porque la resolución vieja miraba "¿tiene
  // estudio?" antes que nada, sin saber que había entrado por la puerta de
  // Network. Con gate por producto, cada puerta respeta lo suyo.
  const dual = { tieneEstudio: true, estadoPerfilNetwork: 'published', estadoPerfilNetworkAlumna: null };
  assert.deepEqual(resolverAccesoPorProducto('software', dual), { tipo: 'entra', destino: '/dashboard' });
  assert.deepEqual(resolverAccesoPorProducto('network', dual), { tipo: 'entra', destino: '/network/inicio' });
});

test('cuenta sin NADA en ningún producto: "cuenta-nueva" en las tres puertas', () => {
  const nueva = { tieneEstudio: false, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: null };
  assert.deepEqual(resolverAccesoPorProducto('software', nueva), { tipo: 'cuenta-nueva' });
  assert.deepEqual(resolverAccesoPorProducto('network', nueva), { tipo: 'cuenta-nueva' });
  assert.deepEqual(resolverAccesoPorProducto('network-alumna', nueva), { tipo: 'cuenta-nueva' });
});

test('nunca se concede "entra" a un producto sin nada propio ahí', () => {
  // Barrido: para cualquier combinación donde el producto preguntado no tiene
  // ni estudio ni perfil, el resultado NUNCA es 'entra'.
  const estados = [null, 'draft', 'hidden', 'suspended', 'published', 'en_revision'];
  for (const estado of estados) {
    const r = resolverAccesoPorProducto('software', { tieneEstudio: false, estadoPerfilNetwork: estado, estadoPerfilNetworkAlumna: null });
    assert.notEqual(r.tipo, 'entra', `software sin estudio, red_perfiles=${estado}`);
  }
});

// ── F0: la tercera vía, network-alumna — independiente de instructora ──────

test('cuenta SOLO alumna entra por /network/alumna/acceso, a inicio si está publicado', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('network-alumna', { tieneEstudio: false, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: 'published' }),
    { tipo: 'entra', destino: '/network/alumna/inicio' },
  );
});

test('cuenta SOLO alumna con onboarding a medias entra a reanudar', () => {
  for (const estado of ['draft', 'hidden', 'suspended']) {
    assert.deepEqual(
      resolverAccesoPorProducto('network-alumna', { tieneEstudio: false, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: estado }),
      { tipo: 'entra', destino: '/network/alumna/reanudar' },
    );
  }
});

test('⚠️ cuenta de instructora o de estudio intentando /network/alumna/acceso: bloqueada', () => {
  assert.deepEqual(
    resolverAccesoPorProducto('network-alumna', { tieneEstudio: true, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: null }),
    { tipo: 'cuenta-de-otro-producto' },
  );
  assert.deepEqual(
    resolverAccesoPorProducto('network-alumna', { tieneEstudio: false, estadoPerfilNetwork: 'published', estadoPerfilNetworkAlumna: null }),
    { tipo: 'cuenta-de-otro-producto' },
  );
});

test('⚠️ cuenta SOLO alumna intentando /login o /network/acceso: bloqueada en las dos', () => {
  const soloAlumna = { tieneEstudio: false, estadoPerfilNetwork: null, estadoPerfilNetworkAlumna: 'published' };
  assert.deepEqual(resolverAccesoPorProducto('software', soloAlumna), { tipo: 'cuenta-de-otro-producto' });
  assert.deepEqual(resolverAccesoPorProducto('network', soloAlumna), { tipo: 'cuenta-de-otro-producto' });
});

test('⚠️ identidad con las TRES cosas: entra a cada puerta por su propia vía', () => {
  const triple = { tieneEstudio: true, estadoPerfilNetwork: 'published', estadoPerfilNetworkAlumna: 'published' };
  assert.deepEqual(resolverAccesoPorProducto('software', triple), { tipo: 'entra', destino: '/dashboard' });
  assert.deepEqual(resolverAccesoPorProducto('network', triple), { tipo: 'entra', destino: '/network/inicio' });
  assert.deepEqual(resolverAccesoPorProducto('network-alumna', triple), { tipo: 'entra', destino: '/network/alumna/inicio' });
});
