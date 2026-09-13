import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { CaptureResult } from 'posthog-js';
import {
  PREFIJOS_EXCLUIDOS_DE_ANALITICA,
  debeCargarseAnalitica,
  esVistaIncrustada,
  rutaExcluidaDeAnalitica,
  sanearEventoPosthog,
  sanearUrl,
} from './posthog-privacidad.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Qué sale hacia PostHog y desde dónde.
//
// No se prueba que el SDK cargue —eso se ve mirando— sino lo que puede salir
// caro: una URL con la sesión de Supabase en el fragmento, un token de
// invitación en la query, el correo de una socia en la ruta, o un evento
// capturado en la app de la alumna tras una navegación blanda.
// ─────────────────────────────────────────────────────────────────────────────

function evento(event: string, properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}): CaptureResult {
  return { uuid: 'evento-de-prueba', event, properties, ...extra } as CaptureResult;
}

function props(resultado: CaptureResult | null): Record<string, unknown> {
  assert.ok(resultado, 'el evento no debería descartarse');
  return resultado.properties as Record<string, unknown>;
}

test('el fragmento se cae entero: ahí vuelve la sesión tras un enlace mágico u OAuth', () => {
  assert.equal(
    sanearUrl('https://tentare.app/mi-perfil#access_token=eyJhbGciOi.abc&refresh_token=r1&expires_in=3600&type=magiclink'),
    'https://tentare.app/mi-perfil',
  );
  assert.equal(sanearUrl('/dashboard#refresh_token=otro'), '/dashboard');
  assert.equal(
    sanearUrl('https://tentare.app/portal/estudio/acceso#access_token=x&refresh_token=y'),
    'https://tentare.app/portal',
  );
});

test('de la query solo sobreviven los utm_*', () => {
  const salida = sanearUrl(
    'https://tentare.app/configuracion?token=inv-123&t=abc&email=ana%40correo.es&firma=f1&code=c0de'
      + '&utm_source=boletin&utm_medium=newsletter&utm_campaign=otono&utm_term=pilates&utm_content=boton',
  );
  assert.equal(
    salida,
    'https://tentare.app/configuracion?utm_source=boletin&utm_medium=newsletter&utm_campaign=otono&utm_term=pilates&utm_content=boton',
  );
  assert.doesNotMatch(salida, /[?&](token|t|email|firma|code)=/);
  assert.doesNotMatch(salida, /ana|correo|inv-123|c0de/);

  assert.equal(sanearUrl('/login?token=abc'), '/login');
  assert.equal(sanearUrl('/invitacion?token=abc&email=ana%40correo.es'), '/invitacion');
  assert.equal(sanearUrl('https://tentare.app/portal/estudio/acceso/verificar?email=ana%40correo.es'), 'https://tentare.app/portal');
  assert.equal(sanearUrl('/dashboard?gclid=abc&fbclid=def'), '/dashboard');
  // Un utm con un correo dentro tampoco pasa.
  assert.equal(sanearUrl('/precios?utm_content=ana%40correo.es'), '/precios');
});

test('los ids de la ruta se reducen a :id y los slugs legibles se quedan', () => {
  const casos: Array<[string, string]> = [
    ['/clientas/soc-mfk3x9a2-1-k2j4p', '/clientas/:id'],
    ['/clientas/soc-mfkqxzab-b-kqjpz', '/clientas/:id'], // un uid() sin un solo dígito
    ['/socios/soc-1', '/socios/:id'],
    ['/network/9b2c4e1a-3f5d-4c6b-8a7e-1d2f3a4b5c6d', '/network/:id'],
    ['/network/vacantes/9b2c4e1a-3f5d-4c6b-8a7e-1d2f3a4b5c6d', '/network/vacantes/:id'],
    ['/network/oportunidades/redvac-mfk3x9a2-2-a1b2c', '/network/oportunidades/:id'],
    ['/equipo/12345', '/equipo/:id'],
    ['https://tentare.app/clientas/ana%40correo.es', 'https://tentare.app/clientas/:id'],
    ['/comparativa/tentare-vs-bsport', '/comparativa/tentare-vs-bsport'],
    ['/recursos/widget-vs-iframe-reservas-pilates', '/recursos/widget-vs-iframe-reservas-pilates'],
    ['/funcionalidades/app-para-alumnas', '/funcionalidades/app-para-alumnas'],
    ['/primeros-pasos/configura-tu-estudio', '/primeros-pasos/configura-tu-estudio'],
    ['/', '/'],
    ['https://tentare.app', 'https://tentare.app/'],
  ];
  for (const [entrada, esperada] of casos) assert.equal(sanearUrl(entrada), esperada, entrada);
});

test('rutas excluidas: coincidencia por segmento completo, nunca por trozo de palabra', () => {
  for (const prefijo of PREFIJOS_EXCLUIDOS_DE_ANALITICA) {
    assert.equal(rutaExcluidaDeAnalitica(prefijo), true, prefijo);
    assert.equal(rutaExcluidaDeAnalitica(`${prefijo}/lo-que-sea`), true, `${prefijo}/…`);
  }
  for (const ruta of [
    '/portal/estudio/perfil', '/portal/', '/PORTAL/estudio', '//portal/estudio', '/reservar/estudio?embed=1',
    '/i/maria', '/interno/estudios/9b2c4e1a-3f5d-4c6b-8a7e-1d2f3a4b5c6d', '/network/acceso',
    '/network/alumna/inicio', '/network/referencia/token', '/valorar/token', '/tema-publicado/estudio/index.html',
  ]) {
    assert.equal(rutaExcluidaDeAnalitica(ruta), true, ruta);
  }
  for (const ruta of [
    '/', '/precios', '/dashboard', '/clientas/soc-1', '/crear-estudio', '/network', '/network/instructoras/maria',
    '/network/mi-perfil', '/internos-x', '/interno-x', '/portales', '/ideas', '/login-equipo', '/reservaria',
  ]) {
    assert.equal(rutaExcluidaDeAnalitica(ruta), false, ruta);
  }
});

test('un evento en ruta excluida no sale, tampoco tras una navegación blanda desde la landing', () => {
  assert.equal(
    sanearEventoPosthog(evento('$pageview', {
      $current_url: 'https://tentare.app/portal/estudio', $pathname: '/portal/estudio',
    })),
    null,
  );
  // El SDK se cargó en la landing y la SPA navegó a la app de la alumna: basta
  // con que UNA de las dos propiedades apunte a una ruta excluida.
  assert.equal(
    sanearEventoPosthog(evento('$pageview', {
      $pathname: '/portal/estudio/reservar', $current_url: 'https://tentare.app/', $referrer: 'https://tentare.app/',
    })),
    null,
  );
  assert.equal(
    sanearEventoPosthog(evento('reserva_iniciada', { $current_url: 'https://tentare.app/reservar/estudio?embed=1' })),
    null,
  );
  assert.equal(sanearEventoPosthog(evento('x', { $current_url: 'http://[::1/interno/estudios?token=1' })), null);
  assert.notEqual(
    sanearEventoPosthog(evento('$pageview', { $current_url: 'https://tentare.app/precios', $pathname: '/precios' })),
    null,
  );
});

test('los eventos que llevan texto del DOM o errores no salen nunca', () => {
  for (const nombre of ['$dead_click', '$rageclick', '$heatmap', '$$heatmap', '$exception', '$autocapture', '$copy_autocapture']) {
    assert.equal(
      sanearEventoPosthog(evento(nombre, { $current_url: 'https://tentare.app/precios', $pathname: '/precios' })),
      null,
      nombre,
    );
  }
});

test('fuera el texto y la estructura del DOM y los ids de clic de anuncios', () => {
  const original = {
    $current_url: 'https://tentare.app/network/instructoras/maria?gclid=abc',
    $el_text: 'Ana López',
    $elements_chain: 'button:text="ana@correo.es"',
    $elements: [{ $el_text: 'Ana López' }],
    gclid: 'abc',
    $initial_fbclid: 'def',
    $session_entry_gclid: 'ghi',
    plan: 'pro',
  };
  const p = props(sanearEventoPosthog(evento('network_contactar', original)));
  assert.deepEqual(Object.keys(p).sort(), ['$current_url', 'plan']);
  assert.equal(p.$current_url, 'https://tentare.app/network/instructoras/maria');
  // No muta lo que recibe.
  assert.equal(original.$el_text, 'Ana López');
  assert.equal(original.$current_url, 'https://tentare.app/network/instructoras/maria?gclid=abc');
});

test('$set_once y $set: las URLs iniciales y de sesión también se sanean', () => {
  const resultado = sanearEventoPosthog(evento(
    '$identify',
    {
      $current_url: 'https://tentare.app/dashboard',
      $session_entry_url: 'https://tentare.app/dashboard?token=abc#access_token=x',
      $set_once: {
        $initial_current_url: 'https://tentare.app/mi-perfil#access_token=a&refresh_token=b',
        $initial_referrer: 'https://tentare.app/valorar/eyJzIjoxfQ.firma_Abc123',
        $initial_pathname: '/clientas/soc-1',
        $initial_gclid: 'x',
      },
    },
    {
      $set_once: {
        $initial_current_url: 'https://tentare.app/configuracion?token=abc',
        $initial_person_info: { r: 'https://www.google.com/search?q=ana+lopez', u: 'https://tentare.app/dashboard?email=a%40b.es' },
      },
      $set: { $current_url: 'https://tentare.app/equipo#access_token=1' },
    },
  ));
  const p = props(resultado);
  assert.equal(p.$session_entry_url, 'https://tentare.app/dashboard');
  assert.deepEqual(p.$set_once, {
    $initial_current_url: 'https://tentare.app/mi-perfil',
    $initial_referrer: 'https://tentare.app/valorar',
    $initial_pathname: '/clientas/:id',
  });
  assert.deepEqual(resultado?.$set_once, {
    $initial_current_url: 'https://tentare.app/configuracion',
    $initial_person_info: { r: 'https://www.google.com/search', u: 'https://tentare.app/dashboard' },
  });
  assert.deepEqual(resultado?.$set, { $current_url: 'https://tentare.app/equipo' });
});

test('$referrer: `$direct` se respeta y un enlace firmado se reduce a su prefijo', () => {
  assert.equal(
    props(sanearEventoPosthog(evento('$pageview', { $current_url: 'https://tentare.app/', $referrer: '$direct' }))).$referrer,
    '$direct',
  );
  assert.equal(
    props(sanearEventoPosthog(evento('$pageview', {
      $current_url: 'https://tentare.app/',
      $referrer: 'https://tentare.app/aceptar-sustitucion/eyJpZCI6MX0.AbC_dEf',
      $prev_pageview_pathname: '/portal/estudio/perfil',
    }))).$referrer,
    'https://tentare.app/aceptar-sustitucion',
  );
});

test('las entradas raras no lanzan ni devuelven lo que venía tras ? o #', () => {
  for (const raro of [
    'http://[::1/login?token=abc#access_token=x',
    'https://tentare.app:99999/x?token=a',
    '%E0%A4%A?email=a',
    '?token=abc',
    '#access_token=abc',
    'javascript:alert(1)?token=x',
    '/%/?t=1#x',
    'http://usuario:clave@tentare.app/x?token=1',
    '   ',
    '',
  ]) {
    const salida = sanearUrl(raro);
    assert.equal(typeof salida, 'string', raro);
    assert.doesNotMatch(salida, /[?#]/, raro);
    assert.doesNotMatch(salida, /token|clave|email/, raro);
  }
  assert.equal(sanearUrl(null as unknown as string), '');
  assert.equal(sanearUrl(42 as unknown as string), '');
  assert.equal(sanearEventoPosthog(null), null);
  assert.doesNotThrow(() => sanearEventoPosthog({ uuid: 'u', event: 'x' } as CaptureResult));
  assert.doesNotThrow(() => sanearEventoPosthog(evento('x', { $current_url: 12, $set: 'no-objeto' })));
});

test('solo se carga fuera de rutas excluidas y fuera de vistas incrustadas', () => {
  assert.equal(debeCargarseAnalitica('/precios', false), true);
  assert.equal(debeCargarseAnalitica('/precios', true), false);
  assert.equal(debeCargarseAnalitica('/portal/estudio', false), false);

  const ventana = {};
  assert.equal(esVistaIncrustada(undefined), false); // Node: no hay `window`
  assert.equal(esVistaIncrustada({ self: ventana, top: ventana, location: { search: '' } }), false);
  assert.equal(esVistaIncrustada({ self: ventana, top: {}, location: { search: '' } }), true);
  assert.equal(esVistaIncrustada({ self: ventana, top: ventana, location: { search: '?embed=1' } }), true);
  assert.equal(
    esVistaIncrustada({
      self: ventana,
      get top(): unknown { throw new Error('SecurityError'); },
      location: { search: '' },
    }),
    true,
  );
});

test('contrato: posthog-cliente no guarda nada en el dispositivo y deja apagado lo que lee el DOM', () => {
  const fuente = readFileSync(new URL('./posthog-cliente.ts', import.meta.url), 'utf8');
  const sinComentarios = fuente.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');

  const inicio = sinComentarios.indexOf('instancia.init(');
  assert.notEqual(inicio, -1, 'no encuentro la llamada a init');
  const config = sinComentarios.slice(inicio, sinComentarios.indexOf('});', inicio));
  for (const opcion of [
    "persistence: 'memory'",
    'autocapture: false',
    'capture_dead_clicks: false',
    'capture_heatmaps: false',
    'capture_exceptions: false',
    'rageclick: false',
    'disable_session_recording: true',
    'advanced_disable_flags: true',
    'disable_external_dependency_loading: true',
    'before_send: sanearEventoPosthog',
  ]) {
    assert.ok(config.includes(opcion), `falta \`${opcion}\` en init`);
  }

  // La puerta de ruta se pregunta al programar la carga, al cargar y al encolar.
  assert.ok((sinComentarios.match(/!analiticaPermitidaAqui\(\)/g) ?? []).length >= 3, 'falta la puerta de ruta');
  assert.doesNotMatch(sinComentarios, /startSessionRecording|stopSessionRecording/);
});
