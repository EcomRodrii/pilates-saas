import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_EVENTO_WIDGET, esTipoEventoValido, fijarPegadoWidget, sessionIdWidget, silenciarEventosWidget, trackEventoWidget,
  visitaYaContada,
} from './eventos.ts';

test('los tipos de evento son únicos', () => {
  assert.equal(new Set(TIPOS_EVENTO_WIDGET).size, TIPOS_EVENTO_WIDGET.length);
});

test('esTipoEventoValido acepta cualquier tipo del catálogo', () => {
  for (const tipo of TIPOS_EVENTO_WIDGET) {
    assert.equal(esTipoEventoValido(tipo), true);
  }
});

test('esTipoEventoValido rechaza texto arbitrario del cliente', () => {
  assert.equal(esTipoEventoValido('cualquier_cosa'), false);
  assert.equal(esTipoEventoValido(''), false);
  // Ni siquiera un prefijo válido cuela — coincidencia exacta.
  assert.equal(esTipoEventoValido('widget_loaded_extra'), false);
});

// Sin DOM en node --test: confirma el fallback fail-soft, no el camino con
// sessionStorage real (eso solo se puede ver en un navegador de verdad).
test('sessionIdWidget() sin window no revienta — cadena vacía', () => {
  assert.equal(sessionIdWidget(), '');
});

test('trackEventoWidget() sin studioId no intenta nada — no revienta sin window', () => {
  assert.doesNotThrow(() => trackEventoWidget(null, 'widget_loaded'));
  assert.doesNotThrow(() => trackEventoWidget(undefined, 'widget_loaded'));
  assert.doesNotThrow(() => trackEventoWidget('studio-1', 'widget_loaded'));
});

// ── Fase C: dónde está pegado, solo en `widget_loaded` ───────────────────────
//
// Con un `window` de mentira y `fetch` capturado: lo que se comprueba es el
// CUERPO que sale, que es lo que guarda la ruta. Sin `socioId`, `enviar` llega
// al `fetch` sin esperar nada, así que el cuerpo ya está al volver.

function capturarCuerpos(fn: () => void): Record<string, unknown>[] {
  const g = globalThis as Record<string, unknown>;
  const fetchOriginal = g.fetch;
  const cuerpos: Record<string, unknown>[] = [];
  g.window = {};
  g.fetch = async (_url: string, init: { body: string }) => {
    cuerpos.push(JSON.parse(init.body) as Record<string, unknown>);
    return new Response('{"ok":true}');
  };
  try {
    fn();
  } finally {
    delete g.window;
    g.fetch = fetchOriginal;
    fijarPegadoWidget(null);
  }
  return cuerpos;
}

const PEGADO = { forma: 'incrustado', anfitrion: 'http://albapilates.example.com', firma: 'c1abc123' } as const;
const lleva = (c: Record<string, unknown>) => 'forma' in c || 'anfitrion' in c || 'firma' in c;

test('`widget_loaded` lleva forma, anfitrión y firma; el resto del embudo, ninguno', () => {
  const [cargado, visto, reserva] = capturarCuerpos(() => {
    fijarPegadoWidget(PEGADO);
    trackEventoWidget('studio-1', 'widget_loaded', { origen: 'web-horario' });
    trackEventoWidget('studio-1', 'widget_viewed', { origen: 'web-horario' });
    trackEventoWidget('studio-1', 'booking_started', { origen: 'web-horario' });
  });
  assert.equal(cargado.tipo, 'widget_loaded');
  assert.equal(cargado.forma, 'incrustado');
  assert.equal(cargado.anfitrion, 'http://albapilates.example.com');
  assert.equal(cargado.firma, 'c1abc123');
  assert.equal(visto.tipo, 'widget_viewed');
  assert.equal(reserva.tipo, 'booking_started');
  for (const otro of [visto, reserva]) assert.equal(lleva(otro), false, JSON.stringify(otro));
});

test('⚠️ sin pegado (botón, enlace, pantalla completa) `widget_loaded` sale como siempre, sin las tres claves', () => {
  const [cargado] = capturarCuerpos(() => {
    fijarPegadoWidget(null);
    trackEventoWidget('studio-1', 'widget_loaded', { origen: 'web-horario' });
  });
  assert.deepEqual(Object.keys(cargado).sort(), ['origen', 'sesionClaseId', 'sessionId', 'socioId', 'studioId', 'tipo']);
});

test('⚠️ la nativa (`baseUrl`) no lo manda aunque haya pegado: su web la pone el servidor desde `Origin`', () => {
  const [cargado] = capturarCuerpos(() => {
    fijarPegadoWidget(PEGADO);
    trackEventoWidget('studio-1', 'widget_loaded', { baseUrl: 'https://www.tentare.app', origen: 'web-horario' });
  });
  assert.equal(cargado.tipo, 'widget_loaded');
  assert.equal(lleva(cargado), false);
});

test('la vista previa silenciada no manda nada, tampoco el pegado', () => {
  const cuerpos = capturarCuerpos(() => {
    fijarPegadoWidget(PEGADO);
    silenciarEventosWidget(true);
    try {
      trackEventoWidget('studio-1', 'widget_loaded');
    } finally {
      silenciarEventosWidget(false);
    }
    // Y el contador cuenta: sin silencio, sale.
    trackEventoWidget('studio-1', 'widget_viewed');
  });
  assert.deepEqual(cuerpos.map(c => c.tipo), ['widget_viewed']);
});

// ── Fase D: la visita de la integración nativa no se cuenta dos veces ────────

test('visitaYaContada: solo la redirección de la nativa (`directo=1`), que ya contó la visita en su web', () => {
  const p = (q: string) => new URLSearchParams(q);
  assert.equal(visitaYaContada(p('sesion=s1&directo=1&ref=web-horario')), true);
  assert.equal(visitaYaContada(p('sesion=s1&directo=0&ref=web-horario')), false);
  assert.equal(visitaYaContada(p('sesion=s1&ref=web-horario')), false);
  assert.equal(visitaYaContada(p('')), false);
  // Un enlace compartido a una clase, o el widget incrustado, cuentan como siempre.
  assert.equal(visitaYaContada(p('embed=1&tab=clases&ref=web-horario')), false);
  assert.equal(visitaYaContada(p('directo=true')), false);
});

test('⚠️ visitaYaContada: con `embed=1` no es la redirección de la nativa (va siempre a pantalla completa) y cuenta', () => {
  const p = (q: string) => new URLSearchParams(q);
  assert.equal(visitaYaContada(p('embed=1&tab=clases&ref=web-horario&directo=1')), false);
  assert.equal(visitaYaContada(p('directo=1&embed=1')), false);
  // `embed` con otro valor no es el modo incrustado: la redirección sigue siendo ella.
  assert.equal(visitaYaContada(p('sesion=s1&directo=1&embed=0&ref=web-horario')), true);
});
