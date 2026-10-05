// El bucle con un stream FALSO: nunca se llama a Anthropic en las pruebas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { AVISO_LIMITE, conPuntoDeCache, ejecutarTurno, type DepsTurno, type MessageStreamLike, type SalidaHerramienta } from './bucle.ts';
import type { EventoAsistente } from './protocolo.ts';

interface Guion {
  texto?: string;
  herramientas?: { id: string; name: string; input: unknown }[];
  stop?: Anthropic.Message['stop_reason'];
  usage?: Partial<Anthropic.Usage>;
}

function respuesta(g: Guion): MessageStreamLike {
  const content: Anthropic.ContentBlock[] = [];
  if (g.texto) content.push({ type: 'text', text: g.texto, citations: null } as Anthropic.TextBlock);
  for (const h of g.herramientas ?? []) content.push({ type: 'tool_use', id: h.id, name: h.name, input: h.input } as Anthropic.ToolUseBlock);
  const eventos: Anthropic.MessageStreamEvent[] = [];
  content.forEach((b, index) => {
    if (b.type === 'text') {
      eventos.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '', citations: null } } as Anthropic.MessageStreamEvent);
      // En trozos de 7 caracteres, como llegan de verdad.
      for (let i = 0; i < b.text.length; i += 7) {
        eventos.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: b.text.slice(i, i + 7) } } as Anthropic.MessageStreamEvent);
      }
    } else if (b.type === 'tool_use') {
      eventos.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } } as Anthropic.MessageStreamEvent);
    }
  });
  const mensaje = {
    id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content,
    stop_reason: g.stop ?? (g.herramientas?.length ? 'tool_use' : 'end_turn'), stop_sequence: null,
    usage: { input_tokens: 500, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0, ...g.usage },
  } as unknown as Anthropic.Message;
  return {
    async *[Symbol.asyncIterator]() { for (const e of eventos) yield e; },
    finalMessage: async () => mensaje,
  };
}

function montar(guiones: (Guion | (() => never))[], ejecutar?: (nombre: string, input: unknown) => Promise<SalidaHerramienta>) {
  const eventos: EventoAsistente[] = [];
  const peticiones: Anthropic.MessageCreateParamsStreaming[] = [];
  const ejecutadas: string[] = [];
  const avisos: string[] = [];
  let i = 0;
  const deps: DepsTurno = {
    stream: (params) => {
      peticiones.push(structuredClone(params));
      const g = guiones[i++];
      if (!g) throw new Error('más llamadas de las previstas');
      if (typeof g === 'function') return g();
      return respuesta(g);
    },
    ejecutar: ejecutar ?? (async (nombre) => {
      ejecutadas.push(nombre);
      return { contenido: JSON.stringify({ activas: 84, dePrueba: 6 }), esError: false, bloques: [{ tipo: 'metricas', titulo: 'Tus alumnas', metricas: [] }] };
    }),
    etiqueta: (nombre) => `Mirando ${nombre}…`,
    emitir: e => eventos.push(e),
    avisar: c => avisos.push(c),
  };
  const entrada = {
    historial: [] as Anthropic.MessageParam[],
    pregunta: '¿Cuántas alumnas activas tengo?',
    herramientas: [{ name: 'contar_alumnas', description: 'x', input_schema: { type: 'object' as const, properties: {} } }],
    sistema: [{ type: 'text' as const, text: 'PROMPT', cache_control: { type: 'ephemeral' as const } }, { type: 'text' as const, text: 'Hoy es lunes 5 de octubre de 2026 (2026-10-05).' }],
    signal: new AbortController().signal,
  };
  return { deps, entrada, eventos, peticiones, ejecutadas, avisos };
}

const textoEmitido = (ev: EventoAsistente[]) => ev.filter((e): e is Extract<EventoAsistente, { t: 'texto' }> => e.t === 'texto').map(e => e.delta).join('');

test('pregunta → herramienta → respuesta: resultados en UN mensaje, tarjeta al navegador y texto filtrado', async () => {
  const m = montar([
    { herramientas: [{ id: 'tu_1', name: 'contar_alumnas', input: {} }] },
    { texto: 'Tienes 84 alumnas activas y 6 de prueba.' },
  ]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'OK');
  assert.equal(r.nLlamadas, 2);
  assert.deepEqual(r.herramientasUsadas, ['contar_alumnas']);
  assert.equal(textoEmitido(m.eventos), 'Tienes 84 alumnas activas y 6 de prueba.');
  assert.ok(m.eventos.some(e => e.t === 'bloque'));
  assert.ok(m.eventos.some(e => e.t === 'herramienta' && e.etiqueta === 'Mirando contar_alumnas…'));
  // Historial válido: pregunta, tool_use, tool_result, respuesta.
  assert.deepEqual(r.mensajesNuevos.map(x => x.role), ['user', 'assistant', 'user', 'assistant']);
  // El punto de caché va en el último bloque de la última petición, y el sistema intacto.
  const ultima = m.peticiones[1];
  const ultimoMsg = ultima.messages[ultima.messages.length - 1];
  assert.ok(Array.isArray(ultimoMsg.content) && 'cache_control' in ultimoMsg.content[ultimoMsg.content.length - 1]);
  assert.equal(ultima.model, 'claude-haiku-4-5');
  assert.equal(ultima.tool_choice?.type, 'auto');
  assert.equal('thinking' in ultima, false);
  assert.equal(r.tokensContexto, 5500);
});

test('varias herramientas a la vez: en paralelo y TODOS sus resultados en un único mensaje user', async () => {
  const m = montar([
    { herramientas: [{ id: 'a', name: 'contar_alumnas', input: {} }, { id: 'b', name: 'que_revisar_hoy', input: {} }] },
    { texto: 'Listo.' },
  ]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  const resultados = r.mensajesNuevos[2];
  assert.equal(resultados.role, 'user');
  assert.ok(Array.isArray(resultados.content));
  assert.deepEqual((resultados.content as Anthropic.ToolResultBlockParam[]).map(b => b.tool_use_id), ['a', 'b']);
});

test('tope de 5 herramientas: las sobrantes reciben is_error y la siguiente petición va con tool_choice none', async () => {
  const seis = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, name: 'contar_alumnas', input: {} }));
  const m = montar([{ herramientas: seis }, { texto: 'Con lo que tengo: 84 activas.' }]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(m.ejecutadas.length, 5);
  assert.equal(r.nHerramientas, 5);
  const res = r.mensajesNuevos[2].content as Anthropic.ToolResultBlockParam[];
  assert.equal(res.length, 6);
  assert.deepEqual(res[5], { type: 'tool_result', tool_use_id: 't5', content: AVISO_LIMITE, is_error: true });
  assert.equal(m.peticiones[1].tool_choice?.type, 'none');
  assert.ok(m.eventos.some(e => e.t === 'aviso' && e.codigo === 'LIMITE_HERRAMIENTAS'));
});

test('corte por coste: si ya va por encima de 0,15 $ y aún pide herramientas, se para sin otra llamada', async () => {
  const m = montar([{ herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }], usage: { input_tokens: 200_000 } }]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'DEMASIADO_AMPLIA');
  assert.equal(m.peticiones.length, 1);
  assert.equal(m.ejecutadas.length, 0);
  // Ningún tool_use sin su resultado en lo que se guarda.
  assert.ok(r.mensajesNuevos.every(x => typeof x.content === 'string' || !x.content.some(b => b.type === 'tool_use')));
});

test('refusal: aviso y fin, sin ejecutar nada', async () => {
  const m = montar([{ stop: 'refusal', herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }] }]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'RECHAZADA');
  assert.equal(m.ejecutadas.length, 0);
  assert.ok(m.eventos.some(e => e.t === 'aviso' && e.codigo === 'RECHAZADA'));
});

test('max_tokens con un tool_use a medias: no se ejecuta una entrada truncada', async () => {
  const m = montar([{ stop: 'max_tokens', herramientas: [{ id: 't', name: 'agenda_del_dia', input: { dia: 'fe' } }] }]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'INTERNO');
  assert.equal(m.ejecutadas.length, 0);
  assert.ok(m.eventos.some(e => e.t === 'error' && e.codigo === 'INTERNO'));
});

test('una cifra inventada no llega a la pantalla, se avisa, y no se guarda para el turno siguiente', async () => {
  const m = montar([
    { herramientas: [{ id: 'tu_1', name: 'contar_alumnas', input: {} }] },
    { texto: 'Tienes 84 activas. Son un 12 % más que en septiembre. Y 6 de prueba.' },
  ]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(textoEmitido(m.eventos), 'Tienes 84 activas. Y 6 de prueba.');
  assert.ok(m.eventos.some(e => e.t === 'aviso' && e.codigo === 'CIFRA_SIN_RESPALDO'));
  assert.doesNotMatch(JSON.stringify(r.mensajesNuevos), /12 %/);
});

test('sin herramientas y acabando en «?»: es una aclaración', async () => {
  const m = montar([{ texto: '¿De qué mes quieres saberlo?' }]);
  assert.equal((await ejecutarTurno(m.deps, m.entrada)).motivo, 'ACLARACION');
});

test('errores tipados del SDK → IA_NO_DISPONIBLE (y la clave mala, además, como fatal)', async () => {
  const caidas: [() => never, string][] = [
    [() => { throw new Anthropic.RateLimitError(429, undefined, 'x', new Headers()); }, 'error'],
    [() => { throw new Anthropic.InternalServerError(500, undefined, 'x', new Headers()); }, 'error'],
    [() => { throw new Anthropic.APIConnectionError({ message: 'red' }); }, 'error'],
    [() => { throw new Anthropic.AuthenticationError(401, undefined, 'x', new Headers()); }, 'fatal'],
  ];
  for (const [caida] of caidas) {
    const m = montar([caida]);
    const r = await ejecutarTurno(m.deps, m.entrada);
    assert.equal(r.motivo, 'IA_NO_DISPONIBLE');
    assert.ok(m.eventos.some(e => e.t === 'error' && e.codigo === 'IA_NO_DISPONIBLE'));
    assert.equal(r.nLlamadas, 0);
    assert.deepEqual(r.mensajesNuevos.map(x => x.role), ['user']);
  }
});

test('abortado (la propietaria cierra el panel): se deja de pagar y no se emite nada más', async () => {
  const c = new AbortController();
  const m = montar([() => { c.abort(); throw new Anthropic.APIUserAbortError(); }]);
  const r = await ejecutarTurno(m.deps, { ...m.entrada, signal: c.signal });
  assert.equal(r.motivo, 'ABORTADA');
  assert.ok(!m.eventos.some(e => e.t === 'error'));
});

test('una herramienta que falla va como is_error y el turno sigue', async () => {
  const m = montar(
    [{ herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }] }, { texto: 'Ahora no he podido mirarlo.' }],
    async () => ({ contenido: '{"error":"No he podido leer ese dato ahora."}', esError: true, bloques: [] }),
  );
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'OK');
  const res = r.mensajesNuevos[2].content as Anthropic.ToolResultBlockParam[];
  assert.equal(res[0].is_error, true);
});

test('conPuntoDeCache no toca el historial original', () => {
  const h: Anthropic.MessageParam[] = [{ role: 'user', content: 'hola' }];
  const c = conPuntoDeCache(h);
  assert.equal(h[0].content, 'hola');
  assert.deepEqual(c[0].content, [{ type: 'text', text: 'hola', cache_control: { type: 'ephemeral' } }]);
});

test('una cifra de una respuesta pasada (ya filtrada) está respaldada; una nueva sin respaldo, no', async () => {
  const m = montar([{ texto: 'Como te decía, tienes 84 activas. Y además 97 en espera.' }]);
  m.entrada.historial = [
    { role: 'user', content: [{ type: 'text', text: '¿Cuántas activas tengo?' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Tienes 84 alumnas activas.' }] },
  ];
  m.entrada.pregunta = '¿Y eso es mucho?';
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'OK');
  assert.equal(textoEmitido(m.eventos).trim(), 'Como te decía, tienes 84 activas.');
  assert.ok(m.eventos.some(e => e.t === 'aviso' && e.codigo === 'CIFRA_SIN_RESPALDO'));
});
