import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  puedeGestionarAutomatizaciones, puedeGestionarCalendario, puedeGestionarClientas,
  puedeGestionarEquipo, puedeMoverDinero, puedeVer, puedeVerFinanzas,
} from '@/lib/permisos-reglas';
import { construirEstadoEstudio, contarConCandidatosNetwork, type ConteosEstudio } from '@/lib/estado-estudio';

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
// Coste: hasta 14 HEAD + 1 select mínimo (sustituciones agotadas) en paralelo,
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
  // Mismo corte de «hoy» que dbCountAutonomasHoy (lib/decision/db.ts), para que
  // esta cifra y la del Veredicto del Día no discrepen.
  const inicioDia = new Date(ahora); inicioDia.setUTCHours(0, 0, 0, 0);
  const inicioDiaISO = inicioDia.toISOString();
  const HEAD = { count: 'exact', head: true } as const;

  const contar = async (etiqueta: string, q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q;
    if (error) {
      console.error(`[estado-estudio:${etiqueta}]`, error);
      return null;
    }
    return count ?? 0;
  };
  const si = (permitido: boolean, f: () => Promise<number | null>) =>
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
    sustitucionesPorDecidir, sustitucionesConNetwork, reservasPorAprobar, recibosFallidos, penalizacionesPorAprobar,
    devolucionesPorRevisar, automatizacionesEsperando, canjesPorEntregar, bajasPorRevisar, seriesPorRenovar,
    plazasFijasPorDecidir,
    sustitucionesBuscando, ofertasListaEspera, cobrosEnReintento,
    sustitucionesCubiertas24h, accionesAutonomasHoy, mensajesAutomaticosHoy,
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
    // FALLIDO = el dunning agotó sus reintentos: a partir de aquí ya no lo
    // intenta nadie más que ella.
    si(verFinanzas, () => contar('recibos-fallidos', admin.from('recibos')
      .select('id', HEAD).eq('studio_id', studioId).eq('estado', 'FALLIDO'))),
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
      .eq('resuelto_por', 'AUTONOMIA').gte('resuelto_en', inicioDiaISO))),
    si(gestionaAutomatizaciones, () => contar('auto-ejecutadas', admin.from('automation_logs')
      .select('id', HEAD).eq('studio_id', studioId)
      .eq('resultado', 'EJECUTADO').gte('ejecutado_en', inicioDiaISO))),
  ]);

  const conteos: ConteosEstudio = {
    sustitucionesPorDecidir, sustitucionesConNetwork, reservasPorAprobar, recibosFallidos, penalizacionesPorAprobar,
    devolucionesPorRevisar, automatizacionesEsperando, canjesPorEntregar, bajasPorRevisar, seriesPorRenovar,
    plazasFijasPorDecidir,
    sustitucionesBuscando, ofertasListaEspera, cobrosEnReintento,
    sustitucionesCubiertas24h, accionesAutonomasHoy, mensajesAutomaticosHoy,
  };
  return NextResponse.json(construirEstadoEstudio(conteos));
}
