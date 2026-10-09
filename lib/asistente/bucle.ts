// ─────────────────────────────────────────────────────────────────────────────
// El bucle de una pregunta: Anthropic ↔ herramientas, a mano.
//
// Manual y no el Tool Runner (beta) porque en cada vuelta hace falta lo que el
// runner esconde: emitir eventos propios al navegador (la línea «Mirando…», las
// tarjetas, que NO van a Anthropic), contar el coste y cortar, el tope duro de
// herramientas, el filtro de cifras frase a frase y dejar de pagar si la
// propietaria cierra el panel.
//
// Todo lo de fuera entra inyectado (`deps`): así se prueba con un stream falso,
// sin red y sin base de datos (bucle.test.ts). Nunca se llama a la API real en
// las pruebas.
//
// Reglas (spec §1.4):
//   - Hasta MAX_LLAMADAS peticiones y MAX_HERRAMIENTAS ejecuciones. Las de una
//     misma respuesta van en paralelo y sus resultados en UN solo mensaje `user`
//     (partirlos enseña al modelo a no pedir en paralelo). Las que no caben
//     reciben `is_error` y la siguiente petición va con `tool_choice: none`.
//   - Pasado el tope de coste, si aún pide herramientas, se para sin otra llamada.
//   - `max_tokens` con un `tool_use` a medias: no se ejecuta una entrada truncada.
//   - Errores tipados del SDK, nunca por el texto del mensaje.
//   - El historial que se devuelve para guardar es siempre VÁLIDO: un `tool_use`
//     sin su `tool_result` no se guarda nunca (rompería el turno siguiente).
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from '@anthropic-ai/sdk';
import { COSTE_MAX_PREGUNTA_USD, MAX_HERRAMIENTAS, MAX_LLAMADAS } from './limites.ts';
import { MAX_TOKENS_RESPUESTA, MODELO_ASISTENTE, TEMPERATURA } from './modelo.ts';
import { costeUsd, sumarUso, USO_CERO, type UsoAcumulado } from './coste.ts';
import { filtroDeCifras } from './cifras.ts';
import type { EventoAsistente, MotivoFin } from './protocolo.ts';
import type { BloqueAsistente, NombreHerramienta } from './tipos.ts';

/** Lo que se usa de un `MessageStream` del SDK: sus eventos y el mensaje final. */
export interface MessageStreamLike extends AsyncIterable<Anthropic.MessageStreamEvent> {
  finalMessage(): Promise<Anthropic.Message>;
}

export interface SalidaHerramienta {
  contenido: string;
  esError: boolean;
  bloques: BloqueAsistente[];
}

export interface DepsTurno {
  stream: (params: Anthropic.MessageCreateParamsStreaming, signal: AbortSignal) => MessageStreamLike;
  /** Ya acotada al estudio y al rol (lib/asistente/herramientas/index.ts). */
  ejecutar: (nombre: string, input: unknown) => Promise<SalidaHerramienta>;
  /** «Mirando la agenda del martes 6…», con la entrada ya conocida. */
  etiqueta: (nombre: string, input: unknown) => string;
  emitir: (e: EventoAsistente) => void;
  /** Para la Sentry: solo códigos, nunca el texto de la pregunta ni de la respuesta. */
  avisar?: (codigo: string, nivel: 'error' | 'fatal', detalle?: Record<string, string | number | undefined>) => void;
}

export interface EntradaTurno {
  historial: Anthropic.MessageParam[];
  /** Ya seudonimizada. */
  pregunta: string;
  herramientas: Anthropic.Tool[];
  sistema: Anthropic.TextBlockParam[];
  signal: AbortSignal;
}

export type MotivoTurno = MotivoFin | 'IA_NO_DISPONIBLE' | 'INTERNO' | 'ABORTADA' | 'RECHAZADA';

export interface ResultadoTurno {
  /** Lo que se añade al historial: la pregunta y lo que vino después, siempre válido. */
  mensajesNuevos: Anthropic.MessageParam[];
  bloques: BloqueAsistente[];
  uso: UsoAcumulado;
  /** input + cache_read + cache_creation de la última llamada: el tamaño real del contexto. */
  tokensContexto: number;
  nLlamadas: number;
  nHerramientas: number;
  /** Nombres de las herramientas ejecutadas, para el registro de auditoría. */
  herramientasUsadas: NombreHerramienta[];
  motivo: MotivoTurno;
  /** El texto que llegó a la pantalla (ya filtrado). */
  texto: string;
}

export const AVISO_UNA_PROPUESTA = 'Ya hay una propuesta en este turno; espera a que la confirme o la cancele. No propongas nada más: responde en una frase.';
/**
 * Lo estructural de un error de Anthropic para Sentry: status, tipo y mensaje recortado.
 * Los 400 citan la ruta («tools.3.custom.input_schema: …») y a veces el valor: se quitan
 * los textos entre comillas y se corta, para que nunca viaje lo que escribió la persona.
 */
export function detalleDeErrorAnthropic(e: { status?: number; error?: unknown; name?: string; message?: string; cause?: unknown }): Record<string, string | number | undefined> {
  const cuerpo = (e.error ?? {}) as { type?: string; error?: { type?: string; message?: string } };
  const msg = cuerpo.error?.message;
  // Sin `status` (un corte de red o un tiempo agotado) el cuerpo no existe: lo único que dice
  // qué pasó es la clase del error y la causa (`ECONNRESET`, `UND_ERR_SOCKET`, `AbortError`…).
  // Antes salía «ASISTENTE_ANTHROPIC_RED» sin una pista y no había por dónde empezar.
  const causa = e.cause as { code?: string; name?: string } | undefined;
  return {
    status: e.status,
    tipo: cuerpo.error?.type ?? cuerpo.type,
    mensaje: typeof msg === 'string' ? msg.replace(/(["'«“`]).*?\1/g, '$1…$1').slice(0, 300) : undefined,
    ...(e.status === undefined ? { clase: e.name, causa: causa?.code ?? causa?.name } : {}),
  };
}

export const AVISO_LIMITE = 'Límite de 5 consultas por pregunta: responde con lo que ya tienes.';

/**
 * El texto de todo lo que vino de los datos o de la propietaria: la base de las
 * cifras permitidas. Con `respuestasPasadas`, también lo que se le respondió en
 * turnos anteriores: el historial llega compactado (lib/asistente/historial.ts,
 * sin los resultados de herramientas de antes) y ese texto ya pasó este mismo
 * filtro, así que repetir una cifra suya («como te decía, 84») está respaldado.
 */
function textosDeConfianza(mensajes: readonly Anthropic.MessageParam[], respuestasPasadas = false): string[] {
  const out: string[] = [];
  for (const m of mensajes) {
    if (m.role !== 'user') {
      if (!respuestasPasadas) continue;
      if (typeof m.content === 'string') out.push(m.content);
      else for (const b of m.content) if (b.type === 'text') out.push(b.text);
      continue;
    }
    if (typeof m.content === 'string') { out.push(m.content); continue; }
    for (const b of m.content) {
      if (b.type === 'text') out.push(b.text);
      else if (b.type === 'tool_result') {
        if (typeof b.content === 'string') out.push(b.content);
        else for (const c of b.content ?? []) if (c.type === 'text') out.push(c.text);
      }
    }
  }
  return out;
}

/** Copia con el segundo punto de caché en el último bloque del último mensaje (el historial y las vueltas del bucle se leen de caché). */
export function conPuntoDeCache(mensajes: readonly Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (mensajes.length === 0) return [];
  const copia = mensajes.slice(0, -1);
  const ultimo = mensajes[mensajes.length - 1];
  const bloques: Anthropic.ContentBlockParam[] = typeof ultimo.content === 'string'
    ? [{ type: 'text', text: ultimo.content }]
    : [...ultimo.content];
  const i = bloques.length - 1;
  bloques[i] = { ...bloques[i], cache_control: { type: 'ephemeral' } } as Anthropic.ContentBlockParam;
  copia.push({ role: ultimo.role, content: bloques });
  return copia;
}

/**
 * Lo que se guarda (y se reenvía) de una respuesta: el texto que de verdad vio
 * la propietaria —ya filtrado, sin las frases con cifras sin respaldo— y los
 * `tool_use` tal cual. Así el modelo no vuelve a leer, en el turno siguiente, una
 * cifra que se le quitó.
 */
function aParam(textoVisto: string, content: readonly Anthropic.ContentBlock[]): Anthropic.ContentBlockParam[] {
  const out: Anthropic.ContentBlockParam[] = [];
  if (textoVisto.trim()) out.push({ type: 'text', text: textoVisto.trim() });
  for (const b of content) {
    if (b.type === 'tool_use') out.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input });
  }
  return out;
}

export async function ejecutarTurno(deps: DepsTurno, entrada: EntradaTurno): Promise<ResultadoTurno> {
  const preguntaMsg: Anthropic.MessageParam = { role: 'user', content: [{ type: 'text', text: entrada.pregunta }] };
  const mensajes: Anthropic.MessageParam[] = [...entrada.historial, preguntaMsg];
  const nuevos: Anthropic.MessageParam[] = [preguntaMsg];
  const bloques: BloqueAsistente[] = [];
  const usadas: NombreHerramienta[] = [];
  const filtro = filtroDeCifras([
    ...entrada.sistema.slice(1).map(s => s.text), // el contexto del día (fecha); el prompt estático no
    ...textosDeConfianza(entrada.historial, true),
    ...textosDeConfianza([preguntaMsg]),
  ]);
  let uso: UsoAcumulado = USO_CERO;
  let tokensContexto = 0;
  let nLlamadas = 0;
  let nHerramientas = 0;
  let sinHerramientas = false;
  let hayPropuesta = false;
  let texto = '';
  let avisadoCifras = false;
  // Entre el texto de una vuelta y el de la siguiente («Voy a mirarlo.» + «Tienes…»).
  let separar = false;
  let textoVuelta = '';

  const emitirTexto = (trozo: string) => {
    if (!trozo) return;
    let t = trozo;
    if (separar && t.trim()) {
      separar = false;
      if (texto && !/\s$/.test(texto) && !/^\s/.test(t)) t = ` ${t}`;
    }
    texto += t;
    textoVuelta += t;
    deps.emitir({ t: 'texto', delta: t });
    if (!avisadoCifras && filtro.quitadas() > 0) {
      avisadoCifras = true;
      deps.emitir({ t: 'aviso', codigo: 'CIFRA_SIN_RESPALDO' });
    }
  };
  const cerrarTexto = () => {
    emitirTexto(filtro.terminar());
    if (!avisadoCifras && filtro.quitadas() > 0) {
      avisadoCifras = true;
      deps.emitir({ t: 'aviso', codigo: 'CIFRA_SIN_RESPALDO' });
    }
  };
  const fin = (motivo: MotivoTurno): ResultadoTurno => ({
    mensajesNuevos: nuevos, bloques, uso, tokensContexto, nLlamadas, nHerramientas, herramientasUsadas: usadas, motivo, texto,
  });

  try {
    while (nLlamadas < MAX_LLAMADAS) {
      const params: Anthropic.MessageCreateParamsStreaming = {
        model: MODELO_ASISTENTE,
        max_tokens: MAX_TOKENS_RESPUESTA,
        temperature: TEMPERATURA,
        system: entrada.sistema,
        tools: entrada.herramientas,
        tool_choice: sinHerramientas ? { type: 'none' } : { type: 'auto' },
        messages: conPuntoDeCache(mensajes),
        stream: true,
      };
      textoVuelta = '';
      const stream = deps.stream(params, entrada.signal);
      for await (const ev of stream) {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'tool_use') {
          deps.emitir({ t: 'herramienta', id: ev.content_block.id, nombre: ev.content_block.name as NombreHerramienta, etiqueta: deps.etiqueta(ev.content_block.name, null) });
        } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          emitirTexto(filtro.empujar(ev.delta.text));
        }
      }
      const msg = await stream.finalMessage();
      nLlamadas++;
      uso = sumarUso(uso, msg.usage);
      tokensContexto = (msg.usage.input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
      cerrarTexto();
      separar = true;

      const contenido = aParam(textoVuelta, msg.content);
      const pedidas = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const soloTexto = contenido.filter(b => b.type === 'text');

      if (msg.stop_reason === 'refusal') {
        if (soloTexto.length) nuevos.push({ role: 'assistant', content: soloTexto });
        deps.emitir({ t: 'aviso', codigo: 'RECHAZADA' });
        return fin('RECHAZADA');
      }
      if (msg.stop_reason === 'max_tokens' && pedidas.length > 0) {
        // Una entrada de herramienta cortada a medias puede parecer válida: no se ejecuta.
        if (soloTexto.length) nuevos.push({ role: 'assistant', content: soloTexto });
        deps.avisar?.('ASISTENTE_TOOL_USE_TRUNCADO', 'error');
        deps.emitir({ t: 'error', codigo: 'INTERNO', mensaje: 'No he podido terminar la respuesta.' });
        return fin('INTERNO');
      }
      if (msg.stop_reason !== 'tool_use' || pedidas.length === 0) {
        if (soloTexto.length) nuevos.push({ role: 'assistant', content: soloTexto });
        const aclara = usadas.length === 0 && texto.trim().endsWith('?');
        return fin(aclara ? 'ACLARACION' : 'OK');
      }

      // Pide herramientas. ¿Queda presupuesto para seguir?
      if (costeUsd(uso) > COSTE_MAX_PREGUNTA_USD) {
        if (soloTexto.length) nuevos.push({ role: 'assistant', content: soloTexto });
        deps.emitir({ t: 'aviso', codigo: 'DEMASIADO_AMPLIA' });
        return fin('DEMASIADO_AMPLIA');
      }

      const quedan = MAX_HERRAMIENTAS - nHerramientas;
      const aEjecutar = pedidas.slice(0, Math.max(0, quedan));
      const sobrantes = pedidas.slice(aEjecutar.length);
      // Una sola propuesta por turno de la persona: la primera que llegue a tarjeta. Las demás
      // `proponer_*` no se ejecutan (Haiku retoma peticiones viejas y rellena lo que no sabe).
      const esPropuesta = (n: string) => n.startsWith('proponer_');
      const una = async (t: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> => {
        deps.emitir({ t: 'herramienta', id: t.id, nombre: t.name as NombreHerramienta, etiqueta: deps.etiqueta(t.name, t.input) });
        const s = await deps.ejecutar(t.name, t.input);
        s.bloques.forEach((b, i) => {
          bloques.push(b);
          deps.emitir({ t: 'bloque', id: `${t.id}-${i}`, bloque: b });
          if (b.tipo === 'propuesta') hayPropuesta = true;
        });
        filtro.permitir(s.contenido);
        return { type: 'tool_result', tool_use_id: t.id, content: s.contenido, ...(s.esError ? { is_error: true } : {}) };
      };
      const rechazada = (t: Anthropic.ToolUseBlock): Anthropic.ToolResultBlockParam =>
        ({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify({ error: AVISO_UNA_PROPUESTA }), is_error: true });
      const lecturas = Promise.all(aEjecutar.filter(t => !esPropuesta(t.name)).map(una));
      const porId = new Map<string, Anthropic.ToolResultBlockParam>();
      for (const t of aEjecutar.filter(t => esPropuesta(t.name))) porId.set(t.id, hayPropuesta ? rechazada(t) : await una(t));
      const porLectura = new Map((await lecturas).map(r => [r.tool_use_id, r]));
      const resultados = aEjecutar.map(t => (porLectura.get(t.id) ?? porId.get(t.id)) as Anthropic.ToolResultBlockParam);
      nHerramientas += aEjecutar.length;
      usadas.push(...aEjecutar.map(t => t.name as NombreHerramienta));
      for (const t of sobrantes) resultados.push({ type: 'tool_result', tool_use_id: t.id, content: AVISO_LIMITE, is_error: true });
      if (sobrantes.length > 0) deps.emitir({ t: 'aviso', codigo: 'LIMITE_HERRAMIENTAS' });
      if (nHerramientas >= MAX_HERRAMIENTAS) sinHerramientas = true;

      // La pareja entera, o nada: así el historial guardado siempre es válido.
      const asistente: Anthropic.MessageParam = { role: 'assistant', content: contenido };
      const respuestas: Anthropic.MessageParam = { role: 'user', content: resultados };
      mensajes.push(asistente, respuestas);
      nuevos.push(asistente, respuestas);
    }
    // Agotadas las llamadas sin una respuesta final.
    deps.emitir({ t: 'aviso', codigo: 'DEMASIADO_AMPLIA' });
    return fin('DEMASIADO_AMPLIA');
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError || entrada.signal.aborted) return fin('ABORTADA');
    if (e instanceof Anthropic.APIError) {
      // APIConnectionError, RateLimitError, InternalServerError, AuthenticationError… todos lo son.
      const fatal = e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError;
      deps.avisar?.(`ASISTENTE_ANTHROPIC_${e.status ?? 'RED'}`, fatal ? 'fatal' : 'error', detalleDeErrorAnthropic(e));
      deps.emitir({ t: 'error', codigo: 'IA_NO_DISPONIBLE', mensaje: 'No he podido responder ahora. No se ha descontado ninguna consulta.' });
      return fin('IA_NO_DISPONIBLE');
    }
    deps.avisar?.('ASISTENTE_INTERNO', 'error');
    deps.emitir({ t: 'error', codigo: 'INTERNO', mensaje: 'No he podido responder ahora. No se ha descontado ninguna consulta.' });
    return fin('INTERNO');
  }
}
