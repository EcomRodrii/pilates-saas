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
import { marcarPersonasEnPregunta, tablaReferencias } from '@/lib/asistente/referencias';
import { puedeUsarAsistente } from '@/lib/asistente/roles';
import { aHerramientasAnthropic, definicionDe, herramientasDelRol } from '@/lib/asistente/herramientas/definiciones';
import { ejecutarHerramienta } from '@/lib/asistente/herramientas';
import { COSTE_MAX_PREGUNTA_USD, MAX_CONTEXTO_TOKENS } from '@/lib/asistente/limites';
import { MODELO_ASISTENTE } from '@/lib/asistente/modelo';
import { costeUsd, unidadesDe } from '@/lib/asistente/coste';
import { liquidar, validarCuerpo } from '@/lib/asistente/peticion';
import {
  asistenteEncendido, atarConsumo, cargarConversacion, cerrarConsulta, crearConversacion, guardarTurno,
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

export const runtime = 'nodejs';
export const maxDuration = 60;

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

export async function POST(req: NextRequest) {
  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return json({ error: 'No autorizado' }, 401);
  if (!puedeUsarAsistente(sesionStaff.rol)) return json({ error: 'No tienes permiso para esto', codigo: 'SIN_PERMISO' }, 403);
  if (!asistenteEncendido()) return json({ error: 'El asistente no está disponible', codigo: 'NO_DISPONIBLE' }, 404);
  const bloqueo = await bloqueoPorFeature(sesionStaff.studioId, 'asistente');
  if (bloqueo) return bloqueo;
  const rafaga = await enforceRateLimit(req, 'asistente', { max: 12, windowSeconds: 60 }, sesionStaff.userId);
  if (rafaga) return rafaga;

  const cuerpo = validarCuerpo(await req.json().catch(() => null));
  if (!cuerpo.ok) return json({ error: cuerpo.error }, 400);

  const admin = getSupabaseAdmin();
  if (!admin) return json({ error: 'Servidor no configurado', codigo: 'NO_DISPONIBLE' }, 503);
  const sesion: SesionAsistente = { studioId: sesionStaff.studioId, userId: sesionStaff.userId, rol: sesionStaff.rol };

  const [studioR, personas] = await Promise.all([
    admin.from('studios').select('plan, subscription_status').eq('id', sesion.studioId).maybeSingle(),
    personasDelEstudio(admin, sesion),
  ]);
  // Sin la lista de personas no se puede quitar un nombre de la pregunta: no se pregunta.
  if (studioR.error || !studioR.data || !personas) return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
  const decisiones = tieneFeature({ plan: studioR.data.plan as string | null, subscriptionStatus: studioR.data.subscription_status as string | null }, 'decisiones');

  // ── La conversación ──
  let conversacionId = cuerpo.conversacionId;
  let historial: ConversacionCargada | null = null;
  if (conversacionId) {
    const cargada = await cargarConversacion(admin, sesion, conversacionId);
    if (cargada === 'ERROR') return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
    if (!cargada) return json({ error: 'Conversación no encontrada' }, 404);
    historial = cargada;
    if (historial.tokensContexto > MAX_CONTEXTO_TOKENS) return json({ error: 'Conversación demasiado larga', codigo: 'CONVERSACION_LLENA' }, 409);
    if (!(await tomarTurno(admin, sesion, conversacionId))) return json({ error: 'Ya hay una pregunta en curso', codigo: 'OTRA_PREGUNTA_EN_CURSO' }, 409);
  }
  const refs = tablaReferencias(historial ? historial.referencias : {});
  const marcada = marcarPersonasEnPregunta(cuerpo.pregunta, personas, refs);

  // ── El libro (fail-closed) ──
  const reserva = await reservarConsulta(admin, sesion, conversacionId, MODELO_ASISTENTE, COSTE_MAX_PREGUNTA_USD);
  if (!reserva || reserva.codigo !== 'OK' || !reserva.consumoId) {
    if (conversacionId) await soltarTurno(admin, sesion, conversacionId);
    if (!reserva) return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
    return json({ error: 'Sin consultas disponibles', codigo: reserva.codigo, disponibles: reserva.disponibles }, 429);
  }
  const consumoId = reserva.consumoId;
  if (!conversacionId) {
    conversacionId = await crearConversacion(admin, sesion, marcada.texto);
    if (!conversacionId) {
      await cerrarConsulta(admin, sesion, { consumoId, estado: 'LIBERADA', input: 0, cacheRead: 0, cacheCreation: 0, output: 0, costeUsd: 0, nLlamadas: 0, nHerramientas: 0, herramientas: [], codigoError: 'SIN_CONVERSACION' });
      return json({ error: 'No disponible ahora', codigo: 'NO_DISPONIBLE' }, 503);
    }
    await atarConsumo(admin, sesion, consumoId, conversacionId);
  }
  const conversacion = conversacionId;

  // ── El turno, en streaming ──
  const ahora = new Date();
  const hoy = hoyEnEstudio(ahora);
  const corte = new AbortController();
  req.signal.addEventListener('abort', () => corte.abort(), { once: true });
  const ctx: ContextoHerramienta = { admin, studioId: sesion.studioId, userId: sesion.userId, rol: sesion.rol, ahora, hoy, refs, plan: { decisiones } };
  const herramientas = herramientasDelRol(sesion.rol);
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
        const deLaPregunta = await nombresDeReferencias(admin, sesion, refs, refs.tomarUsadas());
        const locales = Object.fromEntries(Object.entries(marcada.locales).map(([r, n]) => [r, { nombre: n, href: null }]));
        if (Object.keys(deLaPregunta).length || Object.keys(locales).length) emitir({ t: 'referencias', refs: { ...deLaPregunta, ...locales } });

        const turno = await ejecutarTurno({
          stream: (params, signal) => clienteAnthropic().messages.stream(params, { signal }),
          ejecutar: async (nombre, input) => {
            const s = await ejecutarHerramienta(nombre, input, ctx);
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
          herramientas: aHerramientasAnthropic(herramientas),
          sistema: [
            { type: 'text', text: PROMPT_SISTEMA, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: contextoDelDia({ hoy, rol: sesion.rol }) },
          ],
          signal: corte.signal,
        });

        const l = liquidar(turno.motivo, turno.uso);
        const cierre = await cerrarConsulta(admin, sesion, {
          consumoId, estado: l.estado, input: turno.uso.input, cacheRead: turno.uso.cacheRead, cacheCreation: turno.uso.cacheCreation,
          output: turno.uso.output, costeUsd: l.costeUsd, nLlamadas: turno.nLlamadas, nHerramientas: turno.nHerramientas,
          herramientas: turno.herramientasUsadas, codigoError: l.codigoError,
        });
        cerrado = true;
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

        if (l.estado === 'CONSUMIDA') {
          const unidades = cierre?.unidades ?? unidadesDe(costeUsd(turno.uso));
          emitir({
            t: 'fin', unidades,
            disponibles: cierre?.disponibles ?? Math.max(0, reserva.disponibles - unidades),
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
    },
  });
}
