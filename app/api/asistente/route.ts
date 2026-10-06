import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { tieneFeature } from '@/lib/billing/entitlements';
import { enforceRateLimit } from '@/lib/rate-limit';
import { hoyEnEstudio } from '@/lib/utils';
import { clienteAnthropic } from '@/lib/ai/cliente';
import { ejecutarTurno } from '@/lib/asistente/bucle';
import { codificarEvento, type EventoAsistente } from '@/lib/asistente/protocolo';
import { PROMPT_SISTEMA, contextoDelDia } from '@/lib/asistente/prompt';
import { marcarPersonasEnPregunta, refDeQuienEscribe, tablaReferencias } from '@/lib/asistente/referencias';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { HERRAMIENTAS_DEL_ASISTENTE, definicionDe } from '@/lib/asistente/herramientas/definiciones';
import { ejecutarHerramienta } from '@/lib/asistente/herramientas';
import { COSTE_MAX_PREGUNTA_USD, MAX_CONTEXTO_TOKENS } from '@/lib/asistente/limites';
import { MODELO_ASISTENTE } from '@/lib/asistente/modelo';
import { liquidar, validarCuerpo } from '@/lib/asistente/peticion';
import { cronometro } from '@/lib/asistente/tiempos';
import type { MessageStreamLike } from '@/lib/asistente/bucle';
import {
  asistenteEncendido, atarConsumo, cargarConversacion, cerrarConsulta, crearConversacion, guardarTurno, leerSaldo,
  nombresDeReferencias, personasDelEstudio, reservarConsulta, soltarTurno, tomarTurno, type ConversacionCargada, type SesionAsistente,
} from '@/lib/asistente/servidor';
import type { ContextoHerramienta } from '@/lib/asistente/tipos';

// POST /api/asistente — «Pregúntale a Tentare» (fase 1: solo lectura).
// Spec: bdd-artefactos/spec-asistente-fase1.md.
//
// Todo lo que puede cortar va ANTES de abrir el stream, cada cosa con su
// respuesta JSON normal: sesión (con su 2FA) → rol → interruptor → plan →
// antirráfaga → cuerpo → conversación → libro. Sin libro no hay llamada a
// Anthropic (fail-closed): un 503, nunca «gratis porque el libro no contestó».
//
// El estudio sale SOLO de la sesión. Ni el cuerpo, ni el modelo, ni ninguna
// herramienta pueden nombrar otro.
//
// Privacidad: hacia Anthropic las personas viajan como referencias
// (`[ALUMNA_3]`); los nombres se resuelven aquí y solo van al navegador (evento
// `referencias`). Ni a la Sentry ni a los logs va el texto de la pregunta o de
// la respuesta: solo códigos, ids y tokens.
//
// Tiempos (lib/asistente/tiempos.ts): `Server-Timing` con las fases de antes del
// stream y el registro `[asistente] tiempos` con todo (primer evento de cada
// llamada a Anthropic, cada herramienta, cierre). Lo que no depende entre sí va a
// la vez: las puertas (plan, antirráfaga, cuerpo), y después la lista de
// personas, la conversación y la fila del estudio.

export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

export async function POST(req: NextRequest) {
  const tiempos = cronometro();
  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return json({ error: 'No autorizado' }, 401);
  if (!puedeUsarAsistente(sesionStaff.rol)) return json({ error: 'No tienes permiso para esto', codigo: 'SIN_PERMISO' }, 403);
  if (!asistenteEncendido(sesionStaff.studioId)) return json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, 404);
  // Las tres puertas no dependen entre sí: a la vez, y se responde en el mismo orden de siempre.
  const [bloqueo, rafaga, body] = await Promise.all([
    bloqueoPorFeature(sesionStaff.studioId, 'asistente'),
    enforceRateLimit(req, 'asistente', { max: 12, windowSeconds: 60 }, sesionStaff.userId),
    req.json().catch(() => null),
  ]);
  if (bloqueo) return bloqueo;
  if (rafaga) return rafaga;
  tiempos.marcar('auth');

  const cuerpo = validarCuerpo(body);
  if (!cuerpo.ok) return json({ error: cuerpo.error }, 400);

  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: 'Servidor no configurado', codigo: 'NO_DISPONIBLE' }, 503);
  const sesion: SesionAsistente = { studioId: sesionStaff.studioId, userId: sesionStaff.userId, rol: sesionStaff.rol };

  let conversacionId = cuerpo.conversacionId;
  const [personas, cargada, studioR] = await Promise.all([
    personasDelEstudio(admin, sesion),
    conversacionId ? cargarConversacion(admin, sesion, conversacionId) : Promise.resolve(null),
    admin.from('studios').select('nombre, ciudad, plan, subscription_status, subscription_id').eq('id', sesion.studioId).maybeSingle(),
  ]);
  // Sin la lista de personas no se puede quitar un nombre de la pregunta: no se pregunta.
  if (studioR.error || !studioR.data || !personas) return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
  const fila = studioR.data as { nombre: string | null; ciudad: string | null; plan: string | null; subscription_status: string | null; subscription_id: string | null };
  const decisiones = tieneFeature({ plan: fila.plan, subscriptionStatus: fila.subscription_status }, 'decisiones');
  // La prueba LOCAL (sin tarjeta): el mismo criterio que ia_saldo_consultas.
  const estudio = { nombre: fila.nombre, ciudad: fila.ciudad, plan: fila.plan, enPrueba: fila.subscription_status === 'trialing' && !fila.subscription_id };
  tiempos.marcar('carga');

  // ── La conversación ──
  let historial: ConversacionCargada | null = null;
  if (conversacionId) {
    if (cargada === 'ERROR') return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
    if (!cargada) return json({ error: 'Conversación no encontrada' }, 404);
    historial = cargada;
    if (historial.tokensContexto > MAX_CONTEXTO_TOKENS) return json({ error: 'Conversación demasiado larga', codigo: 'CONVERSACION_LLENA' }, 409);
    if (!(await tomarTurno(admin, sesion, conversacionId))) return json({ error: 'Ya hay una pregunta en curso', codigo: 'OTRA_PREGUNTA_EN_CURSO' }, 409);
  }
  const refs = tablaReferencias(historial ? historial.referencias : {});
  // Antes de marcar la pregunta: así quien escribe tiene la misma referencia desde el primer turno.
  const quienEscribe = refDeQuienEscribe(personas, refs);
  const marcada = marcarPersonasEnPregunta(cuerpo.pregunta, personas, refs);

  // ── El libro (fail-closed) ──
  const reserva = await reservarConsulta(admin, sesion, conversacionId, MODELO_ASISTENTE, COSTE_MAX_PREGUNTA_USD);
  if (!reserva || reserva.codigo !== 'OK' || !reserva.consumoId) {
    if (conversacionId) await soltarTurno(admin, sesion, conversacionId);
    if (!reserva) return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
    return json({ error: 'Sin consultas disponibles', codigo: reserva.codigo, disponibles: reserva.disponibles }, 429);
  }
  const consumoId = reserva.consumoId;
  tiempos.marcar('libro');
  const nueva = !conversacionId;
  if (!conversacionId) {
    conversacionId = await crearConversacion(admin, sesion, marcada.texto);
    if (!conversacionId) {
      await cerrarConsulta(admin, sesion, { consumoId, estado: 'LIBERADA', input: 0, cacheRead: 0, cacheCreation: 0, output: 0, costeUsd: 0, nLlamadas: 0, nHerramientas: 0, herramientas: [], codigoError: 'SIN_CONVERSACION' });
      return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
    }
    tiempos.marcar('conversacion');
  }
  const conversacion = conversacionId;

  // ── El turno, en streaming ──
  const ahora = new Date();
  const hoy = hoyEnEstudio(ahora);
  const corte = new AbortController();
  req.signal.addEventListener('abort', () => corte.abort(), { once: true });
  const ctx: ContextoHerramienta = { admin, studioId: sesion.studioId, userId: sesion.userId, rol: sesion.rol, ahora, hoy, refs, personas, plan: { decisiones }, conversacionId: conversacion };
  const codificador = new TextEncoder();

  const cuerpoStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let abierto = true;
      const emitir = (e: EventoAsistente) => {
        if (!abierto) return;
        try { controller.enqueue(codificador.encode(codificarEvento(e))); } catch { abierto = false; }
      };
      let cerrado = false;
      try {
        emitir({ t: 'inicio', conversacionId: conversacion, disponibles: reserva.disponibles });
        // Los nombres de la pregunta y atar el consumo a la conversación nueva NO tienen
        // que esperar a Anthropic ni Anthropic a ellos: van a la vez que la primera
        // llamada, y se esperan antes de cerrar el libro. (Un nombre que llegue después
        // de su marca no rompe nada: el panel pinta el chip en cuanto le llega.)
        const usadasPregunta = refs.tomarUsadas();
        const preparacion = Promise.all([
          nombresDeReferencias(admin, sesion, refs, usadasPregunta).then(deLaPregunta => {
            const locales = Object.fromEntries(Object.entries(marcada.locales).map(([r, n]) => [r, { nombre: n, href: null }]));
            if (Object.keys(deLaPregunta).length || Object.keys(locales).length) emitir({ t: 'referencias', refs: { ...deLaPregunta, ...locales } });
          }),
          nueva ? atarConsumo(admin, sesion, consumoId, conversacion) : null,
        ]).catch(e => { Sentry.captureException(e, { tags: { area: 'asistente' }, extra: { consumoId, fase: 'preparacion' } }); });

        let nLlamada = 0;
        const herramientasMs: { nombre: string; ms: number }[] = [];
        const turno = await ejecutarTurno({
          stream: (params, signal) => {
            const n = ++nLlamada;
            const s = clienteAnthropic().messages.stream(params, { signal });
            const medido: MessageStreamLike = {
              async *[Symbol.asyncIterator]() {
                for await (const ev of s) {
                  tiempos.hito(`llamada${n}PrimerEvento`);
                  yield ev;
                }
                tiempos.hito(`llamada${n}Fin`);
              },
              finalMessage: () => s.finalMessage(),
            };
            return medido;
          },
          ejecutar: async (nombre, input) => {
            const t0 = performance.now();
            const s = await ejecutarHerramienta(nombre, input, ctx);
            herramientasMs.push({ nombre, ms: Math.round(performance.now() - t0) });
            if (s.codigo !== 'OK') console.warn('[asistente] herramienta', { nombre, codigo: s.codigo, consumoId });
            const nuevas = refs.tomarUsadas();
            if (nuevas.length) emitir({ t: 'referencias', refs: await nombresDeReferencias(admin, sesion, refs, nuevas) });
            return s;
          },
          etiqueta: (nombre, input) => {
            const d = definicionDe(nombre);
            const p = d?.zod.safeParse(input ?? {});
            return d && p?.success ? d.etiqueta(p.data, hoy) : 'Consultando tus datos…';
          },
          emitir,
          avisar: (codigo, nivel) => { Sentry.captureMessage(codigo, { level: nivel, tags: { area: 'asistente' }, extra: { consumoId } }); },
        }, {
          historial: historial ? historial.historial : [],
          pregunta: marcada.texto,
          // El mismo juego para todos los roles (una sola caché); la puerta por rol es ejecutarHerramienta.
          herramientas: [...HERRAMIENTAS_DEL_ASISTENTE],
          sistema: [
            // Herramientas + prompt: idénticos en todos los estudios y roles. TTL de una
            // hora (lib/asistente/prompt.ts): con pocas preguntas al día, se reescribe
            // muchas menos veces. Va ANTES del punto de 5 minutos del historial, como
            // exige la API (los TTL largos primero).
            { type: 'text', text: PROMPT_SISTEMA, cache_control: { type: 'ephemeral', ttl: '1h' } },
            // El estudio y quien escribe, aquí y no en el prefijo: el prefijo es el mismo para todos.
            { type: 'text', text: contextoDelDia({ hoy, rol: sesion.rol, estudio, quienEscribe }) },
          ],
          signal: corte.signal,
        });

        tiempos.marcar('turno');
        await preparacion;
        const l = liquidar(turno.motivo, turno.uso);
        // Las unidades las decide el libro: la charla (sin herramientas) no gasta,
        // hasta 50 al día por estudio (migr 20261006014513, ia_cerrar_consulta).
        const cierre = await cerrarConsulta(admin, sesion, {
          consumoId, estado: l.estado, input: turno.uso.input, cacheRead: turno.uso.cacheRead, cacheCreation: turno.uso.cacheCreation,
          output: turno.uso.output, costeUsd: l.costeUsd, nLlamadas: turno.nLlamadas, nHerramientas: turno.nHerramientas,
          herramientas: turno.herramientasUsadas, codigoError: l.codigoError,
        });
        cerrado = true;
        tiempos.marcar('cierre');
        await guardarTurno(admin, sesion, {
          conversacionId: conversacion, desdeOrden: historial ? historial.siguienteOrden : 0, mensajes: turno.mensajesNuevos,
          bloques: turno.bloques, consumoId, refs, tokensContexto: turno.tokensContexto,
        });

        // Registro de auditoría: quién, qué consultó y cuánto costó. Nunca el texto.
        console.info('[asistente]', JSON.stringify({
          studioId: sesion.studioId, userId: sesion.userId, rol: sesion.rol, conversacionId: conversacion, consumoId,
          motivo: turno.motivo, herramientas: turno.herramientasUsadas, llamadas: turno.nLlamadas,
          tokens: turno.uso, costeUsd: l.costeUsd, unidades: cierre?.unidades ?? null,
        }));
        tiempos.marcar('guardar');
        // Dónde se fue el tiempo. Solo fases, milisegundos e ids: nunca la pregunta ni la respuesta.
        console.info('[asistente] tiempos', JSON.stringify({
          consumoId, nueva, llamadas: turno.nLlamadas, herramientasMs, ...tiempos.resumen(),
        }));

        if (l.estado === 'CONSUMIDA') {
          // Si el cierre no contestó, la consulta sigue reservada en el libro (se dará por
          // fallida, 0 unidades): lo que queda lo dice el propio libro, no una cuenta aquí.
          const disponibles = cierre?.disponibles ?? (await leerSaldo(admin, sesion))?.disponibles ?? reserva.disponibles;
          emitir({
            t: 'fin', unidades: cierre?.unidades ?? 0, disponibles,
            motivo: turno.motivo === 'ACLARACION' || turno.motivo === 'DEMASIADO_AMPLIA' ? turno.motivo : 'OK',
          });
        }
      } catch (e) {
        Sentry.captureException(e, { tags: { area: 'asistente' }, extra: { consumoId } });
        emitir({ t: 'error', codigo: 'INTERNO', mensaje: 'No he podido responder ahora. No se ha descontado ninguna consulta.' });
        if (!cerrado) {
          await cerrarConsulta(admin, sesion, { consumoId, estado: 'FALLIDA', input: 0, cacheRead: 0, cacheCreation: 0, output: 0, costeUsd: COSTE_MAX_PREGUNTA_USD, nLlamadas: 0, nHerramientas: 0, herramientas: [], codigoError: 'INTERNO' });
        }
        await soltarTurno(admin, sesion, conversacion);
      } finally {
        if (abierto) {
          abierto = false;
          try { controller.close(); } catch { /* ya cerrado por el navegador */ }
        }
      }
    },
    cancel() {
      // La propietaria ha cerrado el panel: se deja de pagar a Anthropic.
      corte.abort();
    },
  });

  return new Response(cuerpoStream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'Server-Timing': tiempos.cabecera(),
    },
  });
}
