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
    id: 'msg_x', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content,
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
  assert.equal(ultima.model, 'claude-haiku-5-5');
  assert.equal(ultima.tool_choice?.type, 'auto');
  // Haiku 5.5 piensa por defecto: se apaga explícitamente. Y rechaza (400) una temperatura distinta de 1: no se manda.
  assert.deepEqual(ultima.thinking, { type: 'disabled' });
  assert.equal('temperature' in ultima, false);
  assert.equal('top_p' in ultima, false);
  assert.equal('top_k' in ultima, false);
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
  // Haiku 5.5: un prompt de más de 100.000 tokens paga la tarifa larga (0,50 $/M): 400.000 tokens = 0,20 $.
  const m = montar([{ herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }], usage: { input_tokens: 400_000 } }]);
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

test('«Pulsa Confirmar» sin ninguna tarjeta: se avisa de que no hay nada que confirmar', async () => {
  const m = montar([{ texto: 'Propongo una clase de Secret Burn Pilates el viernes a las 20:00. Pulsa Confirmar para crearla.' }]);
  await ejecutarTurno(m.deps, m.entrada);
  assert.ok(m.eventos.some(e => e.t === 'aviso' && e.codigo === 'PROPUESTA_SIN_TARJETA'));
});

test('una respuesta normal no dispara el aviso de propuesta sin tarjeta', async () => {
  const m = montar([{ texto: 'Tienes 84 alumnas activas.' }]);
  await ejecutarTurno(m.deps, m.entrada);
  assert.ok(!m.eventos.some(e => e.t === 'aviso' && e.codigo === 'PROPUESTA_SIN_TARJETA'));
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

test('una sola propuesta por turno: la segunda proponer_* del mismo turno NO se ejecuta (caso real: sala + clase vieja)', async () => {
  const ejecutadas: string[] = [];
  const m = montar([
    { herramientas: [
      { id: 'p1', name: 'proponer_sala', input: { nombre: 'Reformer avanzado', capacidad: 8 } },
      { id: 'p2', name: 'proponer_clase', input: { tipo_clase: 'Reformer' } },
      { id: 'l1', name: 'contar_alumnas', input: {} },
    ] },
    { herramientas: [{ id: 'p3', name: 'proponer_cita', input: {} }] },
    { texto: 'Te propongo la sala; confirma.' },
  ], async (nombre) => {
    ejecutadas.push(nombre);
    return nombre.startsWith('proponer_')
      ? { contenido: '{"propuesta":"ok"}', esError: false, bloques: [{ tipo: 'propuesta', propuesta: { id: 'x', accion: 'CREAR_SALA', titulo: 't', lineas: [], avisos: [], efecto: null, expiraEn: '', destino: { href: '/', texto: '' } } }] }
      : { contenido: '{}', esError: false, bloques: [] };
  });
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.deepEqual(ejecutadas.sort(), ['contar_alumnas', 'proponer_sala']);
  assert.ok(ejecutadas.length > 0);
  const res1 = r.mensajesNuevos[2].content as Anthropic.ToolResultBlockParam[];
  assert.deepEqual(res1.map(b => b.tool_use_id), ['p1', 'p2', 'l1']);
  assert.equal(res1[1].is_error, true);
  assert.match(String(res1[1].content), /ya hay una propuesta|Ya hay una propuesta/);
  const res2 = r.mensajesNuevos[4].content as Anthropic.ToolResultBlockParam[];
  assert.equal(res2[0].is_error, true);
  assert.equal(m.eventos.filter(e => e.t === 'bloque').length, 1);
});

test('un 400 de Anthropic manda a Sentry lo estructural (status, tipo, mensaje sin valores) y nunca la pregunta', async () => {
  const cuerpo = { type: 'error', error: { type: 'invalid_request_error', message: 'tools.9.custom.input_schema: "minimum" not supported; got "¿Cuántas alumnas activas tengo?"' } };
  // Con el modelo principal, un 400 prueba antes el de respaldo; si también falla, el aviso que cuenta es el segundo.
  const m = montar([
    () => { throw Anthropic.APIError.generate(400, cuerpo, 'x', new Headers()); },
    () => { throw Anthropic.APIError.generate(400, cuerpo, 'x', new Headers()); },
  ]);
  const detalles: unknown[] = [];
  m.deps.avisar = (c, _n, d) => { if (c === 'ASISTENTE_ANTHROPIC_400') detalles.push(d); };
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'IA_NO_DISPONIBLE');
  const d = detalles[0] as Record<string, unknown>;
  assert.equal(d.status, 400);
  assert.equal(d.tipo, 'invalid_request_error');
  assert.match(String(d.mensaje), /tools\.9\.custom\.input_schema/);
  assert.doesNotMatch(JSON.stringify(d), /Cuántas alumnas/);
  assert.ok(String(d.mensaje).length <= 303);
});

test('un corte de red sin status deja pista de qué fue (antes «ASISTENTE_ANTHROPIC_RED» a secas)', async () => {
  const { detalleDeErrorAnthropic } = await import('./bucle.ts');
  const d = detalleDeErrorAnthropic({ name: 'APIConnectionError', message: 'Connection error.', cause: { code: 'ECONNRESET' } });
  assert.equal(d.clase, 'APIConnectionError');
  assert.equal(d.causa, 'ECONNRESET');
  // Con status, el detalle sigue siendo el del cuerpo y no añade clase ni causa.
  const e = detalleDeErrorAnthropic({ status: 400, error: { type: 'error', error: { type: 'invalid_request_error', message: 'x' } } });
  assert.equal(e.status, 400);
  assert.equal(e.clase, undefined);
});

// ── Respaldo de modelo ──────────────────────────────────────────────────────

const fallo404 = () => { throw new Anthropic.NotFoundError(404, { type: 'error', error: { type: 'not_found_error', message: 'model: claude-haiku-5-5' } }, 'x', new Headers()); };

test('modelo no encontrado (404): la misma vuelta se repite con Haiku 4.5, con SUS parámetros, y se avisa solo con códigos', async () => {
  const m = montar([fallo404, { texto: 'Tienes muchas alumnas activas.', usage: { input_tokens: 1_000_000, output_tokens: 0, cache_read_input_tokens: 0 } }]);
  const avisos: { c: string; d?: Record<string, unknown> }[] = [];
  m.deps.avisar = (c, _n, d) => { avisos.push({ c, d }); };
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'OK');
  assert.equal(r.conRespaldo, true);
  assert.equal(r.modelo, 'claude-haiku-4-5');
  assert.equal(m.peticiones.length, 2);
  assert.equal(m.peticiones[0].model, 'claude-haiku-5-5');
  assert.equal(m.peticiones[1].model, 'claude-haiku-4-5');
  // Haiku 4.5 acepta la temperatura y no lleva el interruptor de thinking.
  assert.equal(m.peticiones[1].temperature, 0.2);
  assert.equal('thinking' in m.peticiones[1], false);
  // La llamada fallida no cuenta: 1 llamada contada, y su coste a precios de Haiku 4.5 (1 M de entrada = 1 $).
  assert.equal(r.nLlamadas, 1);
  assert.equal(r.costeUsd, 1);
  assert.equal(textoEmitido(m.eventos), 'Tienes muchas alumnas activas.');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].c, 'ASISTENTE_MODELO_RESPALDO');
  assert.deepEqual(avisos[0].d, { status: 404, tipo: 'not_found_error', de: 'claude-haiku-5-5', a: 'claude-haiku-4-5' });
  // Nunca el texto del mensaje de error (puede citar la petición).
  assert.doesNotMatch(JSON.stringify(avisos), /model: /);
});

test('el respaldo es para el resto de la pregunta: las vueltas siguientes ya van con Haiku 4.5', async () => {
  const m = montar([fallo404, { herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }] }, { texto: 'Tienes 84 alumnas activas.' }]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.deepEqual(m.peticiones.map(p => p.model), ['claude-haiku-5-5', 'claude-haiku-4-5', 'claude-haiku-4-5']);
  assert.equal(r.nLlamadas, 2);
});

test('respaldo también con 403 (sin acceso al modelo), 400 (parámetro rechazado) y 529 (sin capacidad)', async () => {
  const caidas: (() => never)[] = [
    () => { throw new Anthropic.PermissionDeniedError(403, undefined, 'x', new Headers()); },
    () => { throw new Anthropic.BadRequestError(400, undefined, 'x', new Headers()); },
    () => { throw Anthropic.APIError.generate(529, { type: 'error', error: { type: 'overloaded_error', message: 'x' } }, 'x', new Headers()); },
  ];
  for (const caida of caidas) {
    const m = montar([caida, { texto: 'Hola.' }]);
    const r = await ejecutarTurno(m.deps, m.entrada);
    assert.equal(r.conRespaldo, true);
    assert.equal(r.motivo, 'OK');
  }
});

test('un 429, un 500, una caída de red o una clave mala NO cambian de modelo (lo reintenta el SDK o falla igual)', async () => {
  const caidas: (() => never)[] = [
    () => { throw new Anthropic.RateLimitError(429, undefined, 'x', new Headers()); },
    () => { throw new Anthropic.InternalServerError(500, undefined, 'x', new Headers()); },
    () => { throw new Anthropic.APIConnectionError({ message: 'red' }); },
    () => { throw new Anthropic.AuthenticationError(401, undefined, 'x', new Headers()); },
  ];
  for (const caida of caidas) {
    const m = montar([caida]);
    const r = await ejecutarTurno(m.deps, m.entrada);
    assert.equal(r.motivo, 'IA_NO_DISPONIBLE');
    assert.equal(r.conRespaldo, false);
    assert.equal(m.peticiones.length, 1);
  }
});

test('si el modelo ya había empezado a contestar, no se repite con otro (se duplicaría el texto)', async () => {
  const m = montar([() => {
    const buena = respuesta({ texto: 'Tienes 84 ' });
    return {
      async *[Symbol.asyncIterator]() { for await (const e of buena) yield e; throw Anthropic.APIError.generate(529, undefined, 'x', new Headers()); },
      finalMessage: buena.finalMessage,
    } as MessageStreamLike;
  }]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'IA_NO_DISPONIBLE');
  assert.equal(r.conRespaldo, false);
  assert.equal(m.peticiones.length, 1);
});

test('si el respaldo también falla: error normal, sin tercer intento, y nada se guarda de la pregunta', async () => {
  const m = montar([fallo404, fallo404]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.motivo, 'IA_NO_DISPONIBLE');
  assert.equal(m.peticiones.length, 2);
  assert.deepEqual(r.mensajesNuevos.map(x => x.role), ['user']);
});

test('el coste de la pregunta suma el de cada llamada con la tarifa de SU prompt (no la de los tokens sumados)', async () => {
  // Dos llamadas de 60.000 tokens de entrada: cada una paga la tarifa corriente (0,10 $/M); sumadas serían 120.000 (tarifa larga).
  const m = montar([
    { herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }], usage: { input_tokens: 60_000, output_tokens: 0, cache_read_input_tokens: 0 } },
    { texto: 'Tienes 84 alumnas activas.', usage: { input_tokens: 60_000, output_tokens: 0, cache_read_input_tokens: 0 } },
  ]);
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.costeUsd, 0.012);
  assert.equal(r.modelo, 'claude-haiku-5-5');
  assert.equal(r.conRespaldo, false);
});

test('con respaldo a mitad de pregunta, el coste suma cada llamada con los precios de SU modelo', async () => {
  const m = montar([
    { herramientas: [{ id: 't', name: 'contar_alumnas', input: {} }], usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 } },
    { texto: 'Hecho.', usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0 } },
  ]);
  // La 1.ª llamada va con 5.5; la 2.ª recibe un 404 con 5.5 y se repite con 4.5.
  let n = 0;
  const original = m.deps.stream;
  m.deps.stream = (params, signal) => {
    if (++n === 2) throw new Anthropic.NotFoundError(404, undefined, 'x', new Headers());
    return original(params, signal);
  };
  const r = await ejecutarTurno(m.deps, m.entrada);
  assert.equal(r.conRespaldo, true);
  // 100.000 tokens a 0,10 $/M (5.5) + 100.000 a 1 $/M (4.5).
  assert.equal(r.costeUsd, 0.01 + 0.1);
});
