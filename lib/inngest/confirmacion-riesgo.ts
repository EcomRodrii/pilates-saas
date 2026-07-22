// Confirmación por riesgo de plantón — "opción 2" del no-show (lib/no-show.ts,
// R4). En vez de solo recordar, se pide confirmación a quien tiene riesgo ALTO
// y, si no responde a tiempo, se libera su plaza a la lista de espera. Mismo
// patrón dispatcher→fan-out→steps idempotentes que valoraciones.ts/dunning.
//
// TRES fases, dos cadencias:
//  - ASK (víspera, banda ancha 20-30h): el riesgo se calcula con el snapshot
//    completo del estudio (misma fuente que R4) — caro, así que corre poco (2x/día).
//  - RECORDATORIO (a mitad de camino, 10-14h) y CORTE (cada 30 min): ya no hay
//    nada que calcular, solo mirar si respondió — barato, y cuanto más ajustado
//    el barrido, más fiel es la ventana elegida. Van en el MISMO worker de
//    cadencia rápida porque comparten el mismo perfil (consulta directa, sin
//    snapshot). El recordatorio existe porque, probando en vivo, un solo email
//    perdido en la bandeja se convertía en una cancelación real de alguien que
//    sí pensaba venir — antes de rendirse, se vuelve a avisar (mismo principio
//    que el motor de escalado de sustituciones).
import { inngest, EVENTS } from './client';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { construirSnapshot } from '@/lib/decision/snapshot';
import { construirIndices, riesgoNoShowDeSocio } from '@/lib/decision/senales';
import {
  VENTANA_ASK_HORAS_MIN, VENTANA_ASK_HORAS_MAX, VENTANA_RECORDATORIO_HORAS_MIN, VENTANA_RECORDATORIO_HORAS_MAX,
  CUTOFF_HORAS_ANTES, horasHasta, enVentanaDeAviso, tocaRecordar, pasoElCorte,
} from '@/lib/confirmacion-riesgo/logica';
import { firmarTokenConfirmacion } from '@/lib/confirmacion-riesgo/token';
import {
  enviarEmailPedirConfirmacion, enviarEmailRecordatorioConfirmacion, enviarEmailPlazaLiberada,
} from '@/lib/confirmacion-riesgo/email';
import { ejecutarCancelacionReserva } from '@/lib/supabase-data';
import type { SupabaseClient } from '@supabase/supabase-js';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
}

function cuandoTexto(inicio: string): string {
  const d = new Date(inicio);
  const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} · ${hora}`;
}

// Datos de socia+clase+estudio para los dos emails de este módulo. Consulta
// propia (en vez de la privada de lib/supabase-data.ts) para no ensanchar el
// export surface del god-file por un helper de formato.
async function datosParaEmail(admin: SupabaseClient, studioId: string, socioId: string, sesionId: string) {
  const [{ data: socia }, { data: ses }, { data: studio }] = await Promise.all([
    admin.from('socios').select('nombre, email').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
    admin.from('sesiones').select('inicio, tipo_clase_id').eq('id', sesionId).eq('studio_id', studioId).maybeSingle(),
    admin.from('studios').select('nombre, color_primario, logo_url').eq('id', studioId).maybeSingle(),
  ]);
  if (!socia?.email || !ses) return null;
  const { data: tipo } = ses.tipo_clase_id
    ? await admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle()
    : { data: null };
  return {
    socioNombre: socia.nombre as string,
    socioEmail: socia.email as string,
    claseNombre: (tipo?.nombre as string) ?? 'Clase',
    cuando: cuandoTexto(ses.inicio as string),
    estudioNombre: (studio?.nombre as string) ?? 'Tu estudio',
    colorPrimario: (studio as { color_primario?: string | null } | null)?.color_primario,
    logoUrl: (studio as { logo_url?: string | null } | null)?.logo_url,
  };
}

// ═══ ASK — pedir confirmación (víspera de clase) ════════════════════════════

// Cron a las 06:45 y 18:45 — desplazado de decision (06:30/14:30), dunning
// (08:30) y valoraciones (:15 cada 6h) para no competir por el mismo minuto.
export const confirmacionRiesgoAskDispatcher = inngest.createFunction(
  { id: 'confirmacion-riesgo-ask-dispatcher', triggers: [{ cron: '45 6,18 * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());
    const studios = await step.run('list-studios', async () => {
      const admin = requireSupabaseAdmin();
      const { data, error } = await admin.from('studios').select('id').eq('pedir_confirmacion_riesgo', true);
      if (error) throw new Error(error.message);
      return data ?? [];
    });
    if (studios.length > 0) {
      await step.sendEvent(
        'fan-out-confirmacion-ask',
        studios.map((s: { id: string }) => ({ name: EVENTS.CONFIRMACION_RIESGO_ASK_ESTUDIO, data: { studioId: s.id, nowISO } })),
      );
    }
    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

export const procesarConfirmacionAskEstudio = inngest.createFunction(
  { id: 'confirmacion-riesgo-ask-estudio', triggers: [{ event: EVENTS.CONFIRMACION_RIESGO_ASK_ESTUDIO }], concurrency: { limit: 3 }, retries: 3 },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };
    const now = new Date(nowISO);

    // Reservas CONFIRMADA de clases cerca de la ventana de aviso, sin pedir aún.
    // El filtro SQL es un PRE-filtro amplio por eficiencia (no traer toda la
    // tabla) — la decisión real de si toca pedir confirmación la toma
    // `enVentanaDeAviso` en JS más abajo, sobre `sesion.inicio` exacto. Repetir
    // el umbral solo en SQL sin que nadie lo aplique de verdad es el mismo
    // error que tenía R4 con `noShow30d` antes del PR #210 — aquí no se repite.
    const candidatas = await step.run('candidatas', async () => {
      const admin = requireSupabaseAdmin();
      const desde = new Date(now.getTime() + (VENTANA_ASK_HORAS_MIN - 2) * 3600_000).toISOString();
      const hasta = new Date(now.getTime() + (VENTANA_ASK_HORAS_MAX + 2) * 3600_000).toISOString();
      const { data: sesiones, error: errSes } = await admin
        .from('sesiones').select('id, inicio')
        .eq('studio_id', studioId).eq('cancelada', false)
        .gte('inicio', desde).lte('inicio', hasta);
      if (errSes) throw new Error(errSes.message);
      const sesionPorId = new Map((sesiones ?? []).map(s => [s.id as string, s.inicio as string]));
      if (sesionPorId.size === 0) return [];

      const { data: reservas, error: errRes } = await admin
        .from('reservas').select('id, socio_id, sesion_id')
        .eq('studio_id', studioId).eq('estado', 'CONFIRMADA')
        .is('confirmacion_pedida_en', null)
        .in('sesion_id', Array.from(sesionPorId.keys()));
      if (errRes) throw new Error(errRes.message);

      return (reservas ?? [])
        .filter(r => r.socio_id && sesionPorId.has(r.sesion_id as string))
        .map(r => ({ ...r, sesionInicio: sesionPorId.get(r.sesion_id as string)! }))
        .filter(r => enVentanaDeAviso(horasHasta(r.sesionInicio, now))) as
        { id: string; socio_id: string; sesion_id: string; sesionInicio: string }[];
    });

    if (candidatas.length === 0) return { studioId, pedidas: 0, emailsEnviados: 0 };

    // El riesgo se calcula UNA vez por estudio con el snapshot completo (misma
    // fuente que R4/no-show.ts) — no tiene sentido recalcularlo reserva a
    // reserva. FUERA de step.run a propósito: Inngest serializa el resultado de
    // cada step a JSON para poder recuperarlo en un reintento, y eso destruye
    // los `Map` de `IndicesSenal`. No hay pérdida real: si el paso de más abajo
    // falla y reintenta, recalcular el snapshot es barato y no tiene efectos
    // secundarios (es solo lectura).
    const snapshot = await construirSnapshot(studioId, now);
    const idx = construirIndices(snapshot);

    let pedidas = 0, emailsEnviados = 0;
    for (const c of candidatas) {
      const riesgo = riesgoNoShowDeSocio(c.socio_id, idx, now);
      if (riesgo.nivel !== 'ALTO') continue;

      const r = await step.run(`pedir-${c.id}`, async () => {
        const admin = requireSupabaseAdmin();
        // Compare-and-set: marca pedida ANTES de enviar. Si otra ejecución llegó
        // antes (0 filas), no reenvía.
        const { data: marcada } = await admin
          .from('reservas').update({ confirmacion_pedida_en: new Date().toISOString() })
          .eq('id', c.id).is('confirmacion_pedida_en', null).select('id');
        if (!marcada || marcada.length === 0) return { pedida: false, emailEnviado: false };

        const datos = await datosParaEmail(admin, studioId, c.socio_id, c.sesion_id);
        if (!datos) return { pedida: true, emailEnviado: false };

        const token = firmarTokenConfirmacion(studioId, c.socio_id, c.id);
        const url = `${appUrl()}/confirmar-reserva/${token}`;
        const envio = await enviarEmailPedirConfirmacion({
          to: datos.socioEmail, toName: datos.socioNombre, estudioNombre: datos.estudioNombre,
          colorPrimario: datos.colorPrimario, logoUrl: datos.logoUrl,
          claseNombre: datos.claseNombre, cuando: datos.cuando, url,
        });
        return { pedida: true, emailEnviado: 'ok' in envio && envio.ok === true };
      });
      if (r.pedida) pedidas++;
      if (r.emailEnviado) emailsEnviados++;
    }
    return { studioId, candidatas: candidatas.length, pedidas, emailsEnviados };
  },
);

// ═══ RECORDATORIO + CORTE — mismo worker de cadencia rápida (cada 30 min) ═══

export const confirmacionRiesgoCorteDispatcher = inngest.createFunction(
  { id: 'confirmacion-riesgo-corte-dispatcher', triggers: [{ cron: '*/30 * * * *' }] },
  async ({ step }) => {
    const nowISO = await step.run('now', async () => new Date().toISOString());
    const studios = await step.run('list-studios', async () => {
      const admin = requireSupabaseAdmin();
      const { data, error } = await admin.from('studios').select('id').eq('pedir_confirmacion_riesgo', true);
      if (error) throw new Error(error.message);
      return data ?? [];
    });
    if (studios.length > 0) {
      await step.sendEvent(
        'fan-out-confirmacion-corte',
        studios.map((s: { id: string }) => ({ name: EVENTS.CONFIRMACION_RIESGO_CORTE_ESTUDIO, data: { studioId: s.id, nowISO } })),
      );
    }
    return { estudios: studios.length, ejecutadoEn: nowISO };
  },
);

export const procesarConfirmacionCorteEstudio = inngest.createFunction(
  { id: 'confirmacion-riesgo-corte-estudio', triggers: [{ event: EVENTS.CONFIRMACION_RIESGO_CORTE_ESTUDIO }], concurrency: { limit: 3 }, retries: 3 },
  async ({ event, step }) => {
    const { studioId, nowISO } = event.data as { studioId: string; nowISO: string };
    const now = new Date(nowISO);

    // Reservas a las que se les pidió confirmar, no han respondido, no se les
    // ha recordado aún, y su clase está a mitad de camino (10-14h). Mismo
    // patrón de pre-filtro SQL + decisión real en JS (`tocaRecordar`) que el
    // resto del módulo.
    const paraRecordar = await step.run('para-recordar', async () => {
      const admin = requireSupabaseAdmin();
      const desde = new Date(now.getTime() + (VENTANA_RECORDATORIO_HORAS_MIN - 1) * 3600_000).toISOString();
      const hasta = new Date(now.getTime() + (VENTANA_RECORDATORIO_HORAS_MAX + 1) * 3600_000).toISOString();
      const { data: sesiones, error: errSes } = await admin
        .from('sesiones').select('id, inicio')
        .eq('studio_id', studioId).eq('cancelada', false)
        .gte('inicio', desde).lte('inicio', hasta);
      if (errSes) throw new Error(errSes.message);
      const sesionPorId = new Map((sesiones ?? []).map(s => [s.id as string, s.inicio as string]));
      if (sesionPorId.size === 0) return [];

      const { data: reservas, error: errRes } = await admin
        .from('reservas').select('id, socio_id, sesion_id')
        .eq('studio_id', studioId).eq('estado', 'CONFIRMADA')
        .not('confirmacion_pedida_en', 'is', null)
        .is('confirmado_en', null)
        .is('recordatorio_confirmacion_en', null)
        .in('sesion_id', Array.from(sesionPorId.keys()));
      if (errRes) throw new Error(errRes.message);

      return (reservas ?? [])
        .filter(r => r.socio_id && sesionPorId.has(r.sesion_id as string))
        .map(r => ({ ...r, sesionInicio: sesionPorId.get(r.sesion_id as string)! }))
        .filter(r => tocaRecordar(horasHasta(r.sesionInicio, now))) as
        { id: string; socio_id: string; sesion_id: string; sesionInicio: string }[];
    });

    let recordadas = 0, emailsRecordatorio = 0;
    for (const c of paraRecordar) {
      const r = await step.run(`recordar-${c.id}`, async () => {
        const admin = requireSupabaseAdmin();
        // Compare-and-set: marca recordada ANTES de enviar.
        const { data: marcada } = await admin
          .from('reservas').update({ recordatorio_confirmacion_en: new Date().toISOString() })
          .eq('id', c.id).is('recordatorio_confirmacion_en', null).select('id');
        if (!marcada || marcada.length === 0) return { recordada: false, emailEnviado: false };

        const datos = await datosParaEmail(admin, studioId, c.socio_id, c.sesion_id);
        if (!datos) return { recordada: true, emailEnviado: false };

        const token = firmarTokenConfirmacion(studioId, c.socio_id, c.id);
        const url = `${appUrl()}/confirmar-reserva/${token}`;
        const envio = await enviarEmailRecordatorioConfirmacion({
          to: datos.socioEmail, toName: datos.socioNombre, estudioNombre: datos.estudioNombre,
          colorPrimario: datos.colorPrimario, logoUrl: datos.logoUrl,
          claseNombre: datos.claseNombre, cuando: datos.cuando, url,
        });
        return { recordada: true, emailEnviado: 'ok' in envio && envio.ok === true };
      });
      if (r.recordada) recordadas++;
      if (r.emailEnviado) emailsRecordatorio++;
    }

    // Reservas a las que se les pidió confirmar, no han respondido, y su clase
    // ya está dentro del corte. El filtro SQL es un pre-filtro amplio (mismo
    // motivo que el barrido de aviso, arriba): `pasoElCorte` en JS, sobre el
    // `inicio` exacto, es quien decide de verdad — nunca ha empezado la clase Y
    // faltan ≤3h, ambas condiciones que solo la función pura conoce a la vez.
    const pendientes = await step.run('pendientes', async () => {
      const admin = requireSupabaseAdmin();
      const hastaCorte = new Date(now.getTime() + (CUTOFF_HORAS_ANTES + 1) * 3600_000).toISOString();
      const { data: sesiones, error: errSes } = await admin
        .from('sesiones').select('id, inicio')
        .eq('studio_id', studioId).eq('cancelada', false)
        .gt('inicio', nowISO).lte('inicio', hastaCorte);
      if (errSes) throw new Error(errSes.message);
      const sesionPorId = new Map((sesiones ?? []).map(s => [s.id as string, s.inicio as string]));
      if (sesionPorId.size === 0) return [];

      const { data: reservas, error: errRes } = await admin
        .from('reservas').select('id, socio_id, sesion_id')
        .eq('studio_id', studioId).eq('estado', 'CONFIRMADA')
        .not('confirmacion_pedida_en', 'is', null)
        .is('confirmado_en', null)
        .in('sesion_id', Array.from(sesionPorId.keys()));
      if (errRes) throw new Error(errRes.message);

      return (reservas ?? [])
        .filter(r => r.socio_id && sesionPorId.has(r.sesion_id as string))
        .map(r => ({ ...r, sesionInicio: sesionPorId.get(r.sesion_id as string)! }))
        .filter(r => pasoElCorte(horasHasta(r.sesionInicio, now))) as
        { id: string; socio_id: string; sesion_id: string; sesionInicio: string }[];
    });

    let liberadas = 0;
    for (const p of pendientes) {
      const r = await step.run(`liberar-${p.id}`, async () => {
        const admin = requireSupabaseAdmin();
        // Doble comprobación de estado dentro del propio paso: si confirmó o la
        // reserva cambió entre el listado y aquí, cancelar_reserva_plaza ya no
        // la toca (solo actúa sobre estados "en juego"); no hace falta repetir
        // el filtro, pero SÍ evitar mandar el email si no llegó a liberarse.
        const datos = await datosParaEmail(admin, studioId, p.socio_id, p.sesion_id);
        const res = await ejecutarCancelacionReserva(admin, { studioId, reservaId: p.id, socioId: null });
        if ('error' in res) return { liberada: false };
        if (datos) {
          await enviarEmailPlazaLiberada({
            to: datos.socioEmail, toName: datos.socioNombre, estudioNombre: datos.estudioNombre,
            colorPrimario: datos.colorPrimario, logoUrl: datos.logoUrl,
            claseNombre: datos.claseNombre, cuando: datos.cuando,
          });
        }
        return { liberada: true };
      });
      if (r.liberada) liberadas++;
    }
    return {
      studioId,
      paraRecordar: paraRecordar.length, recordadas, emailsRecordatorio,
      revisadas: pendientes.length, liberadas,
    };
  },
);
