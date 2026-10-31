import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { enviarCorreoAlta, enviarRecordatorioAlta } from '@/lib/emails/embudo-alta-server';
import { correoAltaSinTerminar } from '@/lib/emails/tentare/embudo-alta';
import { correoEmpuje, correoPrimeraClase } from '@/lib/emails/tentare/alta';
import { puedeReservarEnServidor } from '@/lib/onboarding/puede-reservar-servidor';
import type { RespuestaPuedeReservar } from '@/lib/onboarding/puede-reservar';
import { LEGAL } from '@/lib/legal-info';
import { foundingGratisEnAltas } from '@/lib/alta/founding-gratis-alta';
import {
  altaDesdeFila,
  claveIdempotenciaRecordatorio,
  contenidoRecordatorio,
  decidirRecordatorio,
  MAX_INTENTOS_RECORDATORIO,
  versionDeFila,
} from './abandono.ts';
import {
  claveCorreoPrimeraClase, decidirCorreoPrimeraClase, HORAS_DESDE_CORREO_PRIMERA_CLASE, HORAS_HASTA_CORREO_PRIMERA_CLASE,
  varianteCorreoPrimeraClase,
} from './correo-primera-clase.ts';
import {
  claveCorreoEmpuje, correosEmpujeActivos, decidirCorreoEmpuje, PASO_EMPUJE, type VarianteEmpuje,
} from './correo-empuje.ts';
import { apuntarPaso } from './embudo-servidor.ts';
import { ENTRADA_PRIMERA_CLASE } from './bienvenida-nueva.ts';
import { VALORES_DE_SERIE } from './primera-clase.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El recordatorio de las 24 h a quien dejó el alta de estudio a medias. Lo
// dispara pg_cron cada hora (app/api/cron/altas-sin-terminar).
//
// UN correo por persona, aunque el cron corra dos veces a la vez o muera a
// mitad:
//   1. `decidirRecordatorio` (pura) descarta a quien ya lo tiene, ya terminó,
//      es del equipo de un estudio o está fuera de plazo.
//   2. Compare-and-set sobre `recordatorio_reclamado_en`: solo la pasada que
//      consigue poner la marca (de NULL a ahora) envía. La otra ve 0 filas.
//   3. Resend con clave de idempotencia por persona: si el envío salió y la
//      escritura de `enviado_en` no, la repetición no manda un segundo correo.
// Un envío fallido suelta el cerrojo para la pasada siguiente, hasta 3 veces.
// Si el proceso muere entre reclamar y apuntar, la fila se queda reclamada y no
// se reintenta: preferimos un correo de menos que uno repetido.
//
// Sustituye al barrido diario que colgaba de reviewBoostDispatcher (Inngest):
// quien ya recibió aquel aviso (`embudo_alta_avisado_en`) no recibe este.
// ─────────────────────────────────────────────────────────────────────────────

const POR_PASADA = 50;

export interface ResumenRecordatorios {
  revisadas: number;
  enviados: number;
  descartadas: number;
  fallidos: number;
  esperando: number;
}

export async function enviarRecordatoriosAltas(admin: SupabaseClient, ahoraMs = Date.now()): Promise<ResumenRecordatorios> {
  const { data, error } = await admin.rpc('altas_estudio_detalle', { p_solo_pendientes: true, p_limite: POR_PASADA });
  if (error) throw new Error(`altas_estudio_detalle: ${error.message}`);

  const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
  const resumen: ResumenRecordatorios = { revisadas: 0, enviados: 0, descartadas: 0, fallidos: 0, esperando: 0 };

  for (const fila of (data ?? []) as Record<string, unknown>[]) {
    resumen.revisadas += 1;
    const alta = altaDesdeFila(fila);
    const decision = decidirRecordatorio(alta, ahoraMs);

    if (!decision.enviar) {
      if (!decision.definitivo) { resumen.esperando += 1; continue; }
      await admin.from('altas_estudio')
        .update({ recordatorio_descartado: decision.motivo, actualizado_en: new Date().toISOString() })
        .eq('auth_user_id', alta.authUserId)
        .is('recordatorio_descartado', null)
        .is('recordatorio_enviado_en', null);
      resumen.descartadas += 1;
      continue;
    }

    // El cerrojo. Sin filas de vuelta = otra pasada se la ha quedado.
    const reclamadoEn = new Date().toISOString();
    const { data: reclamada, error: errReclamo } = await admin.from('altas_estudio')
      .update({ recordatorio_reclamado_en: reclamadoEn, actualizado_en: reclamadoEn })
      .eq('auth_user_id', alta.authUserId)
      .is('recordatorio_reclamado_en', null)
      .is('recordatorio_enviado_en', null)
      .is('recordatorio_descartado', null)
      // `version` sale de la propia fila (`altas_estudio_detalle()` no la
      // devuelve): el alta nueva no tiene «elegir plan» y su correo no lo dice.
      .select('auth_user_id, version');
    if (errReclamo || !reclamada?.length) continue;

    const version = versionDeFila((reclamada[0] as { version?: unknown }).version ?? alta.version);
    const contenido = contenidoRecordatorio(decision.paso, { ...alta, version }, base, { foundingGratis: foundingGratisEnAltas() });
    const res = await enviarRecordatorioAlta({
      to: alta.email!,
      asunto: contenido.asunto,
      html: correoAltaSinTerminar(contenido),
      idempotencyKey: claveIdempotenciaRecordatorio(alta.authUserId),
    });

    if (res.ok) {
      const { error: errApunte } = await admin.from('altas_estudio')
        .update({
          recordatorio_enviado_en: new Date().toISOString(),
          recordatorio_paso: decision.paso,
          recordatorio_error: null,
          actualizado_en: new Date().toISOString(),
        })
        .eq('auth_user_id', alta.authUserId);
      // El correo YA salió: la fila se queda reclamada, así que no se repite
      // aunque esta escritura falle. Solo se pierde la fecha exacta en /interno.
      if (errApunte) Sentry.captureMessage('[altas-sin-terminar] enviado pero sin apuntar', { level: 'warning' });
      resumen.enviados += 1;
      continue;
    }

    // Resend sin configurar (preview, local): nada salió, se suelta sin gastar intento.
    if (res.skipped) {
      await soltar(admin, alta.authUserId, alta.recordatorioIntentos, null, null);
      resumen.esperando += 1;
      continue;
    }

    const intentos = alta.recordatorioIntentos + 1;
    const definitivo = res.permanente || intentos >= MAX_INTENTOS_RECORDATORIO;
    await soltar(admin, alta.authUserId, intentos, res.error, definitivo ? 'envio_fallido' : null);
    resumen.fallidos += 1;
  }

  return resumen;
}

// ─────────────────────────────────────────────────────────────────────────────
// «Tu primera clase en Tentare, en 5 minutos» (correo 3 del alta nueva, PR-5):
// a las 24 h de crear el estudio, si una alumna nueva todavía no puede
// reservar. Cuándo y a quién, en lib/alta/correo-primera-clase.ts.
//
// Va en este mismo cron horario (decisión C8 del plan), sin uno nuevo: su guarda
// de pg_cron (migración 20261021160000) llama también cuando hay un estudio así.
// UNA vez por estudio: la marca `correo_primera_clase` del embudo, que solo se
// escribe con el envío hecho, más la clave de idempotencia de Resend para dos
// pasadas a la vez. Un envío que falla se reintenta en la pasada siguiente
// mientras dure la ventana (72 h); pasada, ya no es «al día siguiente».
// ─────────────────────────────────────────────────────────────────────────────

/** Pocos por pasada: cada uno pregunta a `puedeReservarEnServidor` (y quizá a Stripe). */
const PRIMERA_CLASE_POR_PASADA = 20;

export interface ResumenPrimeraClase {
  revisados: number;
  enviados: number;
  yaReservable: number;
  descartados: number;
  fallidos: number;
}

export async function enviarCorreosPrimeraClase(
  admin: SupabaseClient,
  ahoraMs = Date.now(),
  preguntar: (admin: SupabaseClient, studioId: string, ahora: Date) => Promise<RespuestaPuedeReservar> = puedeReservarEnServidor,
): Promise<ResumenPrimeraClase> {
  const resumen: ResumenPrimeraClase = { revisados: 0, enviados: 0, yaReservable: 0, descartados: 0, fallidos: 0 };
  const desde = new Date(ahoraMs - HORAS_HASTA_CORREO_PRIMERA_CLASE * 3_600_000).toISOString();
  const hasta = new Date(ahoraMs - HORAS_DESDE_CORREO_PRIMERA_CLASE * 3_600_000).toISOString();

  // Los estudios en la ventana. Que sea del alta nueva se mira después (la
  // versión es de la cuenta de su dueña, en otra tabla).
  const { data: estudios, error } = await admin.from('studios')
    .select('id, nombre, creado_en, owner_auth_user_id, cadena_id, es_demo, suspendido_en')
    .gt('creado_en', desde).lte('creado_en', hasta)
    .is('cadena_id', null)
    .order('creado_en', { ascending: true })
    .limit(PRIMERA_CLASE_POR_PASADA * 5);
  if (error) throw new Error(`studios: ${error.message}`);
  const filas = (estudios ?? []) as {
    id: string; nombre: string | null; creado_en: string; owner_auth_user_id: string | null;
    cadena_id: string | null; es_demo: boolean | null; suspendido_en: string | null;
  }[];
  if (filas.length === 0) return resumen;

  const duenas = [...new Set(filas.map(f => f.owner_auth_user_id).filter((x): x is string => !!x))];
  const ids = filas.map(f => f.id);
  const [altas, embudo] = await Promise.all([
    duenas.length ? admin.from('altas_estudio').select('auth_user_id, version').in('auth_user_id', duenas) : Promise.resolve({ data: [], error: null }),
    admin.from('embudo_alta').select('studio_id, paso').in('studio_id', ids).in('paso', ['clase_reservable', 'correo_primera_clase']),
  ]);
  if (altas.error) throw new Error(`altas_estudio: ${altas.error.message}`);
  if (embudo.error) throw new Error(`embudo_alta: ${embudo.error.message}`);
  const versionDe = new Map((altas.data ?? []).map(a => [a.auth_user_id as string, a.version as string]));
  const pasosDe = new Map<string, Set<string>>();
  for (const e of embudo.data ?? []) {
    const s = pasosDe.get(e.studio_id as string) ?? new Set<string>();
    s.add(e.paso as string);
    pasosDe.set(e.studio_id as string, s);
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || LEGAL.url).replace(/\/+$/, '');
  for (const f of filas) {
    if (resumen.revisados >= PRIMERA_CLASE_POR_PASADA) break;
    const pasos = pasosDe.get(f.id) ?? new Set<string>();
    // Lo barato primero: sin la cuenta no se sabe ni a quién mandarlo.
    const previa = decidirCorreoPrimeraClase({
      version: f.owner_auth_user_id ? versionDe.get(f.owner_auth_user_id) : null,
      cadenaId: f.cadena_id, esDemo: f.es_demo === true, suspendido: !!f.suspendido_en,
      creadoEn: f.creado_en, yaEnviado: pasos.has('correo_primera_clase'), claseReservable: pasos.has('clase_reservable'),
      ahoraMs,
    });
    if (!previa.enviar) { resumen.descartados += 1; continue; }
    resumen.revisados += 1;

    try {
      // ¿Qué le falta de verdad? Sin ninguna clase (ni pasada ni por venir), la
      // maqueta; con clase, el mismo motor que la reserva dice si se puede.
      const { data: unaSesion, error: errSesion } = await admin.from('sesiones').select('id')
        .eq('studio_id', f.id).not('cancelada', 'is', true).limit(1);
      if (errSesion) throw new Error(errSesion.message);
      const haySesiones = (unaSesion ?? []).length > 0;
      const veredicto = haySesiones
        ? await preguntar(admin, f.id, new Date(ahoraMs)).catch((): null => null)
        : null;
      const variante = varianteCorreoPrimeraClase({ haySesiones, veredicto });
      if (variante.tipo === 'reservable') {
        // Ya puede reservar: el hito, y nada que mandar.
        await apuntarPaso(admin, f.id, 'clase_reservable', { creadoEn: f.creado_en });
        resumen.yaReservable += 1;
        continue;
      }
      if (variante.tipo === 'sin_saber') { resumen.fallidos += 1; continue; }

      const { data: cuenta, error: errCuenta } = await admin.auth.admin.getUserById(f.owner_auth_user_id!);
      if (errCuenta) throw new Error(errCuenta.message);
      const email = cuenta.user?.email ?? null;
      if (!email) { resumen.descartados += 1; continue; }
      const nombre = typeof cuenta.user?.user_metadata?.nombre === 'string' ? cuenta.user.user_metadata.nombre : null;

      const correo = correoPrimeraClase({
        estudioNombre: f.nombre ?? '',
        nombre,
        variante: variante.tipo === 'sin_clase'
          ? { tipo: 'sin_clase', ejemplo: { clase: VALORES_DE_SERIE.tipo, minutos: VALORES_DE_SERIE.duracion, plazas: VALORES_DE_SERIE.plazas } }
          : { tipo: 'no_reservable', aviso: variante.aviso.texto },
        urlBoton: `${base}${variante.tipo === 'sin_clase' ? ENTRADA_PRIMERA_CLASE : variante.aviso.href}`,
      });
      const res = await enviarCorreoAlta({ to: email, asunto: correo.asunto, html: correo.html, idempotencyKey: claveCorreoPrimeraClase(f.id) });
      if (res.ok) {
        await apuntarPaso(admin, f.id, 'correo_primera_clase', { creadoEn: f.creado_en });
        resumen.enviados += 1;
      } else if (res.skipped || res.permanente) {
        // Resend sin configurar (preview, local) o un destinatario de ejemplo: nada que reintentar.
        resumen.descartados += 1;
      } else {
        resumen.fallidos += 1;
        Sentry.captureMessage('[altas-sin-terminar] no salió «Tu primera clase»', { level: 'warning', tags: { area: 'alta', error: res.error } });
      }
    } catch (e) {
      resumen.fallidos += 1;
      console.warn('[altas-sin-terminar:primera-clase]', e instanceof Error ? e.message : 'error desconocido');
    }
  }
  return resumen;
}

// ─────────────────────────────────────────────────────────────────────────────
// Los dos correos de «después de la primera clase» (31-oct-2026): «Tu clase está
// lista: falta que lo sepan tus alumnas» y «Ya compartiste tu enlace: las
// primeras reservas». Cuándo y a quién, en lib/alta/correo-empuje.ts.
//
// Van en este mismo cron horario, sin uno nuevo, y APAGADOS de serie: solo
// salen con ALTA_EMPUJE=on. UNA vez por estudio y variante: la marca
// `correo_empuje_*` del embudo, que solo se escribe con el envío hecho, más la
// clave de idempotencia de Resend. Un envío que falla se reintenta en la pasada
// siguiente mientras dure la ventana.
// ─────────────────────────────────────────────────────────────────────────────

/** Pocos por pasada: cada uno lee la cuenta de su dueña (y, el de las alumnas, sus reservas). */
const EMPUJE_POR_PASADA = 15;
/** Hasta dónde se mira atrás en el embudo: la ventana más larga (10 días) con margen para el enlace compartido antes de la clase. */
const EMPUJE_MIRA_DIAS = 30;

export interface ResumenEmpuje {
  activo: boolean;
  revisados: number;
  enviados: number;
  descartados: number;
  fallidos: number;
}

export async function enviarCorreosEmpuje(
  admin: SupabaseClient,
  ahoraMs = Date.now(),
  activo = correosEmpujeActivos(process.env.ALTA_EMPUJE),
): Promise<ResumenEmpuje> {
  const resumen: ResumenEmpuje = { activo, revisados: 0, enviados: 0, descartados: 0, fallidos: 0 };
  if (!activo) return resumen;

  const desde = new Date(ahoraMs - EMPUJE_MIRA_DIAS * 86_400_000).toISOString();
  const { data: filasEmbudo, error: errEmbudo } = await admin.from('embudo_alta')
    .select('studio_id, paso, ocurrido_en')
    .in('paso', ['clase_reservable', 'enlace_compartido', PASO_EMPUJE.compartir, PASO_EMPUJE.alumnas])
    .gt('ocurrido_en', desde)
    .limit(2000);
  if (errEmbudo) throw new Error(`embudo_alta: ${errEmbudo.message}`);

  // Primer instante de cada paso, por estudio.
  const pasosDe = new Map<string, Map<string, string>>();
  for (const e of (filasEmbudo ?? []) as { studio_id: string; paso: string; ocurrido_en: string }[]) {
    const m = pasosDe.get(e.studio_id) ?? new Map<string, string>();
    const previo = m.get(e.paso);
    if (!previo || e.ocurrido_en < previo) m.set(e.paso, e.ocurrido_en);
    pasosDe.set(e.studio_id, m);
  }
  const ids = [...pasosDe.keys()];
  if (ids.length === 0) return resumen;

  const { data: estudios, error: errEstudios } = await admin.from('studios')
    .select('id, nombre, creado_en, owner_auth_user_id, cadena_id, es_demo, suspendido_en')
    .in('id', ids);
  if (errEstudios) throw new Error(`studios: ${errEstudios.message}`);
  const filas = (estudios ?? []) as {
    id: string; nombre: string | null; creado_en: string; owner_auth_user_id: string | null;
    cadena_id: string | null; es_demo: boolean | null; suspendido_en: string | null;
  }[];
  const duenas = [...new Set(filas.map(f => f.owner_auth_user_id).filter((x): x is string => !!x))];
  const { data: altas, error: errAltas } = duenas.length
    ? await admin.from('altas_estudio').select('auth_user_id, version').in('auth_user_id', duenas)
    : { data: [], error: null };
  if (errAltas) throw new Error(`altas_estudio: ${errAltas.message}`);
  const versionDe = new Map((altas ?? []).map(a => [a.auth_user_id as string, a.version as string]));

  const base = (process.env.NEXT_PUBLIC_APP_URL || LEGAL.url).replace(/\/+$/, '');
  for (const f of filas) {
    const pasos = pasosDe.get(f.id) ?? new Map<string, string>();
    const compartido = pasos.has('enlace_compartido');
    // Los dos son excluyentes (uno pide enlace sin compartir, el otro compartido).
    const variante: VarianteEmpuje = compartido ? 'alumnas' : 'compartir';
    const hitoEn = pasos.get(compartido ? 'enlace_compartido' : 'clase_reservable') ?? null;
    const comun = {
      variante, version: f.owner_auth_user_id ? versionDe.get(f.owner_auth_user_id) : null,
      cadenaId: f.cadena_id, esDemo: f.es_demo === true, suspendido: !!f.suspendido_en,
      hitoEn, yaEnviado: pasos.has(PASO_EMPUJE[variante]), enlaceCompartido: compartido, ahoraMs,
    };
    // Lo barato primero: sin leer reservas ni la cuenta.
    if (!decidirCorreoEmpuje(comun).enviar) { resumen.descartados += 1; continue; }
    if (resumen.revisados >= EMPUJE_POR_PASADA) break;
    resumen.revisados += 1;

    try {
      let hayReservas = false;
      if (variante === 'alumnas') {
        const { data: unaReserva, error: errReserva } = await admin.from('reservas').select('id').eq('studio_id', f.id).limit(1);
        if (errReserva) throw new Error(errReserva.message);
        hayReservas = (unaReserva ?? []).length > 0;
        if (hayReservas) { resumen.descartados += 1; continue; }
      }
      const { data: cuenta, error: errCuenta } = await admin.auth.admin.getUserById(f.owner_auth_user_id!);
      if (errCuenta) throw new Error(errCuenta.message);
      const email = cuenta.user?.email ?? null;
      if (!decidirCorreoEmpuje({ ...comun, hayReservas, email }).enviar) { resumen.descartados += 1; continue; }
      const nombre = typeof cuenta.user?.user_metadata?.nombre === 'string' ? cuenta.user.user_metadata.nombre : null;

      const correo = correoEmpuje({
        variante, estudioNombre: f.nombre ?? '', nombre, urlBoton: `${base}/dashboard?compartir=1`,
      });
      const res = await enviarCorreoAlta({ to: email!, asunto: correo.asunto, html: correo.html, idempotencyKey: claveCorreoEmpuje(variante, f.id) });
      if (res.ok) {
        await apuntarPaso(admin, f.id, PASO_EMPUJE[variante], { creadoEn: f.creado_en });
        resumen.enviados += 1;
      } else if (res.skipped || res.permanente) {
        resumen.descartados += 1;
      } else {
        resumen.fallidos += 1;
        Sentry.captureMessage('[altas-sin-terminar] no salió el correo de empuje', { level: 'warning', tags: { area: 'alta', variante, error: res.error } });
      }
    } catch (e) {
      resumen.fallidos += 1;
      console.warn('[altas-sin-terminar:empuje]', e instanceof Error ? e.message : 'error desconocido');
    }
  }
  return resumen;
}

async function soltar(
  admin: SupabaseClient, authUserId: string, intentos: number, error: string | null, descartado: string | null,
) {
  await admin.from('altas_estudio')
    .update({
      recordatorio_reclamado_en: null,
      recordatorio_intentos: intentos,
      recordatorio_error: error ? error.slice(0, 80) : null,
      recordatorio_descartado: descartado,
      actualizado_en: new Date().toISOString(),
    })
    .eq('auth_user_id', authUserId)
    .is('recordatorio_enviado_en', null);
}
