import { NextRequest, NextResponse } from 'next/server';
import { hoyEnEstudio } from '@/lib/utils';
import { inicioDeHoyEnEstudio } from '@/lib/decision/mensaje-del-dia';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  puedeGestionarApertura, puedeGestionarAutomatizaciones, puedeGestionarCalendario, puedeGestionarClientas,
  puedeGestionarEquipo, puedeMoverDinero, puedeVer, puedeVerFinanzas,
} from '@/lib/permisos-reglas';
import { construirEstadoEstudio, contarConCandidatosNetwork, type ConteosEstudio } from '@/lib/estado-estudio';
import { situacionRecibo } from '@/lib/billing/situacion-recibo';
import { HORAS_LIMITE_POR_DEFECTO, instructorasGestionables } from '@/lib/fichaje/jornadas-equipo';
import type { ModoFacturacion, Rol } from '@/lib/types';
import { emiteFacturas } from '@/lib/factura-automatica';
import { nifEmisorValido } from '@/lib/nif';

// GET /api/estado-estudio — la bandeja única de la home (lib/estado-estudio.ts):
// qué espera el visto bueno de quien mira, qué está haciendo Tentare solo y qué
// ha resuelto.
//
// Solo RECUENTOS (`head: true`): ni un nombre ni un importe sale de aquí. El
// detalle sigue viviendo en la pantalla de cada cosa, que es donde se actúa.
//
// ⚠️ Cliente service-role, así que la RLS NO filtra: cada recuento va acotado a
// `studio_id` Y gateado con el MISMO permiso que ya exige la pantalla o la
// tarjeta donde se resuelve (mismas reglas de lib/permisos-reglas.ts). Un rol
// sin permiso recibe `undefined` en esa fuente — ni se enseña ni se cuenta —,
// no un cero: un cero sería afirmar que no hay nada.
//
// Sin plan de por medio, a diferencia de /api/decisiones: esto es operación del
// día (una reserva por aprobar, una clase sin cubrir), no el Decision OS.
//
// Coste: hasta 15 HEAD + 1 select mínimo (sustituciones agotadas) en paralelo,
// una vez por carga de la home y compartidos con el contador del menú
// (lib/estado-estudio-cliente.ts). Si algún día pesa
// —el proyecto ya ha visto 504 por ráfagas—, el siguiente paso es una única RPC
// de recuentos, con sus REVOKE/GRANT explícitos; no más polling.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = requireSupabaseAdmin();
  const { studioId, rol } = sesion;
  const ahora = new Date();
  const ahoraISO = ahora.toISOString();
  const hace24hISO = new Date(ahora.getTime() - 24 * 3600_000).toISOString();
  // «Hoy» es el día de Madrid, el mismo corte que dbCountAutonomasHoy
  // (lib/decision/db.ts), para que esta cifra y la del Veredicto del Día no
  // discrepen. Con el día UTC, de 00:00 a 02:00 de Madrid contaba lo de ayer.
  const inicioDiaISO = inicioDeHoyEnEstudio(ahora);
  const HEAD = { count: 'exact', head: true } as const;

  const contar = async (etiqueta: string, q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q;
    if (error) {
      console.error(`[estado-estudio:${etiqueta}]`, error);
      return null;
    }
    return count ?? 0;
  };
  const si = <T = number | null>(permitido: boolean, f: () => Promise<T>): Promise<T | undefined> =>
    permitido ? f() : Promise.resolve(undefined);

  const verSustituciones = puedeVer(rol, '/sustituciones');
  // Los candidatos de Network se ven en /sustituciones, pero son la herramienta
  // de contratación (/network/buscar): hacen falta las dos pantallas.
  const verNetworkEnSustituciones = verSustituciones && puedeVer(rol, '/network/buscar');
  const gestionaCalendario = puedeGestionarCalendario(rol);
  const mueveDinero = puedeMoverDinero(rol);
  const verFinanzas = puedeVerFinanzas(rol);
  const gestionaAutomatizaciones = puedeGestionarAutomatizaciones(rol) && puedeVer(rol, '/automatizaciones');
  const gestionaClientas = puedeGestionarClientas(rol);
  // El motivo de una baja puede ser salud: la revisa quien gestiona el equipo,
  // nunca recepción (mismo gate que la tarjeta y /api/equipo/bajas-instructora).
  const gestionaEquipo = puedeGestionarEquipo(rol);

  const [
    sustitucionesPorDecidir, sustitucionesConNetwork, reservasPorAprobar, recibosFallidos, renovacionesSinCobro, penalizacionesPorAprobar,
    devolucionesPorRevisar, automatizacionesEsperando, canjesPorEntregar, bajasPorRevisar, seriesPorRenovar,
    plazasFijasPorDecidir, reconciliacionesPorRevisar,
    sustitucionesBuscando, ofertasListaEspera, cobrosEnReintento,
    sustitucionesCubiertas24h, accionesAutonomasHoy, mensajesAutomaticosHoy,
    alertasApertura, equipoPorRevisar, clasesSinInstructora, doblesCobrosPorRevisar,
    seguimientosParaHoy, facturasSinNif,
  ] = await Promise.all([
    // ── Decidir ──
    // Solo clases que aún no han empezado: una que ya pasó sin cubrir la cierra
    // el cron (cerrar-vencidas) y ya no hay nada que decidir a tiempo.
    si(verSustituciones, () => contar('sust-decidir', admin.from('sustituciones')
      .select('id, sesiones!inner(inicio)', HEAD).eq('studio_id', studioId)
      .in('estado', ['pendiente_aprobacion', 'agotada']).gt('sesiones.inicio', ahoraISO))),
    // De esas, las 'agotada' a las que Tentare Network tiene a quién proponer.
    // Sufijo de la línea de arriba, no una línea ni un sumando del contador.
    // No es un HEAD: no hemos podido comprobar contra la API real un filtro
    // PostgREST de «array jsonb no vacío» (`neq.[]`), y un filtro que no filtra
    // diría «te proponemos» donde no hay nadie. Se cuenta aquí sobre filas que
    // son pocas (clases futuras sin cubrir de un estudio); el jsonb no sale de
    // esta función, solo el número.
    si(verNetworkEnSustituciones, async () => {
      const { data, error } = await admin.from('sustituciones')
        .select('candidatos_network, sesiones!inner(inicio)').eq('studio_id', studioId)
        .eq('estado', 'agotada').gt('sesiones.inicio', ahoraISO).limit(200);
      if (error) {
        console.error('[estado-estudio:sust-network]', error);
        return null;
      }
      return contarConCandidatosNetwork(data ?? []);
    }),
    si(gestionaCalendario, () => contar('reservas-aprobar', admin.from('reservas')
      .select('id, sesiones!inner(inicio)', HEAD).eq('studio_id', studioId)
      .eq('estado', 'PENDIENTE_APROBACION').gt('sesiones.inicio', ahoraISO))),
    // Impagados (lib/billing/situacion-recibo.ts): FALLIDO —el dunning agotó
    // sus reintentos, ya no lo intenta nadie más que ella— y DEVUELTO POR EL
    // BANCO, que es deuda otra vez y ya bloqueaba las reservas por impago
    // (`socio_tiene_impago`) sin salir en este contador. No es un HEAD: un
    // DEVUELTO también puede ser un reembolso, y eso solo se distingue con las
    // columnas del reembolso. Son pocas filas por estudio.
    si(verFinanzas, async () => {
      const { data, error } = await admin.from('recibos')
        .select('estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en')
        .eq('studio_id', studioId).in('estado', ['FALLIDO', 'DEVUELTO']).limit(2000);
      if (error) {
        console.error('[estado-estudio:recibos-impagados]', error);
        return null;
      }
      return (data ?? []).filter(r => situacionRecibo({
        estado: r.estado, importe: r.importe, importeDevuelto: r.importe_devuelto,
        reembolsoStripeId: r.reembolso_stripe_id, reembolsoSolicitadoEn: r.reembolso_solicitado_en,
      }) === 'IMPAGADO').length;
    }),
    // Misma definición que `esRenovacionSinCobroAutomatico`: renovación PENDIENTE
    // sin reintento programado (nadie la va a cobrar sola).
    si(verFinanzas, () => contar('renovaciones-sin-cobro', admin.from('recibos')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
      .eq('es_renovacion', true).is('proximo_reintento', null))),
    // I-9 (auditoría 15-sep): una penalización FALLIDA con su recibo huérfano
    // (PENDIENTE, sin `proximo_reintento`) está fuera del dunning por diseño y
    // sin estado FALLIDO propio, así que `recibos-fallidos` de arriba tampoco
    // la cuenta — deuda real que no aparecía en ningún contador. Mismo bucket
    // que PENDIENTE_APROBACION: las dos son "penalizaciones que esperan tu
    // decisión para cobrarse" desde el punto de vista de la propietaria.
    si(mueveDinero, async () => {
      const [pendientes, falladasHuerfanas] = await Promise.all([
        contar('penalizaciones-pendientes', admin.from('penalizaciones')
          .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE_APROBACION')),
        contar('penalizaciones-falladas-huerfanas', admin.from('penalizaciones')
          .select('id, recibos!inner(estado, proximo_reintento)', HEAD).eq('studio_id', studioId)
          .eq('estado', 'FALLIDA').eq('recibos.estado', 'PENDIENTE').is('recibos.proximo_reintento', null)),
      ]);
      if (pendientes === null || falladasHuerfanas === null) return null;
      return pendientes + falladasHuerfanas;
    }),
    si(mueveDinero, () => contar('devoluciones', admin.from('devoluciones')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE_REVISION'))),
    si(gestionaAutomatizaciones, () => contar('auto-esperando', admin.from('automation_logs')
      .select('id', HEAD).eq('studio_id', studioId).eq('resultado', 'PENDIENTE_ADMIN'))),
    si(gestionaClientas, () => contar('canjes', admin.from('reward_redemptions')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE'))),
    // Sin la suya propia (una gerente que da clases): no la puede revisar, y
    // contarla dejaría una línea que lleva a una tarjeta vacía.
    si(gestionaEquipo, async () => {
      const { data: ficha, error } = await admin.from('instructores').select('id')
        .eq('studio_id', studioId).eq('auth_user_id', sesion.userId).limit(1);
      if (error) {
        console.error('[estado-estudio:bajas-revisar-ficha]', error);
        return null;
      }
      const propia = (ficha?.[0]?.id as string | undefined) ?? null;
      let pendientes = admin.from('bajas_instructora')
        .select('id', HEAD).eq('studio_id', studioId).eq('revision', 'PENDIENTE');
      if (propia) pendientes = pendientes.neq('instructor_id', propia);
      return contar('bajas-revisar', pendientes);
    }),
    // Clases que se repiten y se acaban sin renovar: el mismo gate que
    // renovarlas. La RPC ya descarta «no renovar», la cola cancelada a propósito
    // y la que continúa en otra serie; aquí solo se cuentan.
    si(gestionaCalendario, async () => {
      const { data, error } = await admin.rpc('series_por_renovar', { p_studio_id: studioId, p_dias: 30 });
      if (error) {
        console.error('[estado-estudio:series-renovar]', error);
        return null;
      }
      return Array.isArray(data) ? data.length : null;
    }),
    // Mismos dos permisos que resolverlas (`/api/plazas-fijas/solicitudes`).
    si(gestionaClientas && gestionaCalendario, () => contar('plazas-fijas-decidir', admin.from('solicitudes_plaza_fija')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE'))),
    // A-14: mismo gate que /api/terminal/reconciliaciones y /api/terminal/reconciliar.
    si(mueveDinero, () => contar('reconciliaciones-pendientes', admin.from('reconciliaciones_pos')
      .select('payment_intent_id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE'))),

    // ── En marcha ──
    si(verSustituciones, () => contar('sust-buscando', admin.from('sustituciones')
      .select('id, sesiones!inner(inicio)', HEAD).eq('studio_id', studioId)
      .eq('estado', 'contactando').gt('sesiones.inicio', ahoraISO))),
    si(gestionaCalendario, () => contar('ofertas-espera', admin.from('reservas')
      .select('id', HEAD).eq('studio_id', studioId)
      .eq('estado', 'LISTA_ESPERA').gt('oferta_expira_en', ahoraISO))),
    // `intentos_reintento > 0` y no solo `proximo_reintento`: renovaciones
    // también programa `proximo_reintento` para el PRIMER cobro de quien tiene
    // tarjeta guardada, y eso no es «un cobro que falló».
    si(verFinanzas, () => contar('cobros-reintento', admin.from('recibos')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
      .gt('intentos_reintento', 0).not('proximo_reintento', 'is', null))),

    // ── Resuelto ──
    si(verSustituciones, () => contar('sust-cubiertas', admin.from('sustituciones')
      .select('id', HEAD).eq('studio_id', studioId)
      .eq('estado', 'confirmada').gte('resuelto_en', hace24hISO))),
    si(rol === 'PROPIETARIO', () => contar('autonomas', admin.from('recomendaciones')
      .select('id', HEAD).eq('studio_id', studioId)
      // Solo las que salieron (EJECUTADA), como el veredicto: una APROBADA aún
      // no ha hecho nada y una FALLIDA no salió.
      .eq('resuelto_por', 'AUTONOMIA').eq('estado', 'EJECUTADA').gte('resuelto_en', inicioDiaISO))),
    si(gestionaAutomatizaciones, () => contar('auto-ejecutadas', admin.from('automation_logs')
      .select('id', HEAD).eq('studio_id', studioId)
      .eq('resultado', 'EJECUTADO').gte('ejecutado_en', inicioDiaISO))),
    // Opening OS: mismo gate que la tarjeta de apertura y la RLS de alertas_opening.
    si(puedeGestionarApertura(rol), () => contar('alertas-apertura', admin.from('alertas_opening')
      .select('id', HEAD).eq('studio_id', studioId).is('resuelta_en', null))),
    // Mismo gate y mismo filtro de fichas que Tiempo trabajado: una gerente no
    // cuenta las jornadas de la propietaria ni las de otra gerente.
    si(gestionaEquipo, async (): Promise<{ jornadas: number | null; clases: number | null } | null> => {
      const [equipo, config] = await Promise.all([
        admin.from('instructores').select('id, rol').eq('studio_id', studioId),
        admin.from('studio_config_tiempo').select('open_session_limit_hours').eq('studio_id', studioId).maybeSingle(),
      ]);
      // Sin saber de quién son las fichas no se puede contar: null, nunca un 0.
      if (equipo.error || config.error) {
        console.error('[estado-estudio:jornadas]', equipo.error ?? config.error);
        return null;
      }
      const roles = new Map(((equipo.data ?? []) as { id: string; rol: Rol }[]).map((f) => [f.id, f.rol]));
      const ids = instructorasGestionables(rol, roles);
      if (ids.length === 0) return { jornadas: 0, clases: 0 };
      const horas = (config.data as { open_session_limit_hours: number } | null)?.open_session_limit_hours ?? HORAS_LIMITE_POR_DEFECTO;
      const corte = new Date(ahora.getTime() - horas * 3600_000).toISOString();
      // Dos recuentos simples y no un `.or(...)`: son estados excluyentes, así que
      // sumarlos no cuenta nada dos veces.
      const [marcadas, olvidadas, noDadas] = await Promise.all([
        contar('jornadas-marcadas', admin.from('instructor_work_sessions')
          .select('id', HEAD).eq('studio_id', studioId).in('instructor_id', ids).eq('status', 'PENDING_REVIEW')),
        contar('jornadas-olvidadas', admin.from('instructor_work_sessions')
          .select('id', HEAD).eq('studio_id', studioId).in('instructor_id', ids)
          .eq('status', 'OPEN').lt('check_in_at', corte)),
        // Una clase que la instructora dijo no dar: no se le paga, y alguien tiene
        // que mirar quién la dio. Deja de contar al marcarla revisada o corregirla.
        contar('clases-no-dadas', admin.from('clases_impartidas')
          .select('sesion_id', HEAD).eq('studio_id', studioId).in('instructor_id', ids)
          .eq('estado', 'NO_DADA').is('revisada_en', null)),
      ]);
      return {
        jornadas: marcadas === null || olvidadas === null ? null : marcadas + olvidadas,
        clases: noDadas,
      };
    }),
    // RES-8: clases futuras sin cancelar de alguien dado de baja. Una clase con
    // alumnas apuntadas que nadie va a dar no se cancela sola: decide el estudio.
    si(gestionaCalendario, () => contar('clases-sin-instructora', admin.from('sesiones')
      .select('id, instructores!inner(activo)', HEAD).eq('studio_id', studioId)
      .eq('cancelada', false).gt('inicio', ahoraISO).eq('instructores.activo', false))),
    // PAY-5: detecciones abiertas del detector de dobles cobros (solo de servidor).
    si(mueveDinero, () => contar('dobles-cobros', admin.from('dobles_cobros_detectados')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'DETECTADA'))),
    // Seguimientos de clientas para hoy o atrasados: los de quien mira y los de
    // nadie (si la persona a la que se asignó ya no está), no los de otra.
    si(gestionaClientas, () => contar('seguimientos-hoy', admin.from('tareas')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'PENDIENTE')
      .not('socio_id', 'is', null).lte('vence_el', hoyEnEstudio(ahora))
      .or(`asignada_a.is.null,asignada_a.eq.${sesion.userId}`))),
    // Sin NIF no sale ninguna factura. Lo pone la propietaria (Datos fiscales).
    si(rol === 'PROPIETARIO', async () => {
      const { data: s, error } = await admin.from('studios').select('nif, modo_facturacion').eq('id', studioId).maybeSingle();
      if (error || !s) return null;
      if (!emiteFacturas(s.modo_facturacion as ModoFacturacion) || nifEmisorValido((s.nif as string | null)?.trim() ?? '')) return 0;
      const n = await contar('facturas-sin-nif', admin.from('recibos')
        .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'COBRADO').eq('factura_pendiente_sellar', true));
      return n === null ? null : Math.max(1, n);
    }),
  ]);

  const jornadasPorRevisar = equipoPorRevisar === undefined ? undefined : (equipoPorRevisar?.jornadas ?? null);
  const clasesNoDadasPorRevisar = equipoPorRevisar === undefined ? undefined : (equipoPorRevisar?.clases ?? null);
  const conteos: ConteosEstudio = {
    sustitucionesPorDecidir, sustitucionesConNetwork, reservasPorAprobar, clasesSinInstructora, recibosFallidos, renovacionesSinCobro, penalizacionesPorAprobar,
    devolucionesPorRevisar, automatizacionesEsperando, canjesPorEntregar, bajasPorRevisar, seriesPorRenovar,
    plazasFijasPorDecidir, reconciliacionesPorRevisar, doblesCobrosPorRevisar, seguimientosParaHoy,
    sustitucionesBuscando, ofertasListaEspera, cobrosEnReintento,
    sustitucionesCubiertas24h, accionesAutonomasHoy, mensajesAutomaticosHoy,
    alertasApertura, jornadasPorRevisar, clasesNoDadasPorRevisar, facturasSinNif,
  };
  return NextResponse.json(construirEstadoEstudio(conteos));
}
