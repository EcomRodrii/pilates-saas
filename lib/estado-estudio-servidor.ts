import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  puedeGestionarApertura, puedeGestionarAutomatizaciones, puedeGestionarCalendario, puedeGestionarClientas,
  puedeGestionarEquipo, puedeGestionarSede, puedeMoverDinero, puedeVer, puedeVerFinanzas, rolesQuePuedeAsignar,
} from '@/lib/permisos-reglas';
import type { ConteosEstudio } from '@/lib/estado-estudio';
import { HORAS_LIMITE_POR_DEFECTO } from '@/lib/fichaje/jornadas-equipo';
import type { ModoFacturacion, Rol } from '@/lib/types';
import { emiteFacturas } from '@/lib/factura-automatica';
import { nifEmisorValido } from '@/lib/nif';
import { ambitosQueRevisa } from '@/lib/moderacion/denuncias';
import { festivosPorDecidir as leerFestivosPorDecidir } from '@/lib/festivos/por-decidir-servidor';

// Los recuentos de la bandeja única (lib/estado-estudio.ts), sacados tal cual
// de GET /api/estado-estudio para que el asistente («¿qué debería revisar
// hoy?») cuente EXACTAMENTE lo mismo que la home, con el mismo gate por rol. La
// ruta queda en: sesión → contarConteosEstudio → construirEstadoEstudio.
//
// La bandeja única de la home (lib/estado-estudio.ts):
// qué espera el visto bueno de quien mira, qué está haciendo Tentare solo y qué
// ha resuelto.
//
// Solo RECUENTOS: ni un nombre ni un importe sale de aquí. El detalle sigue
// viviendo en la pantalla de cada cosa, que es donde se actúa.
//
// ⚠️ Cliente service-role, así que la RLS NO filtra: cada recuento va acotado a
// `studio_id` (dentro de la función SQL) Y gateado con el MISMO permiso que ya
// exige la pantalla o la tarjeta donde se resuelve (mismas reglas de
// lib/permisos-reglas.ts, en `fuentesVisibles`). Un rol sin permiso recibe
// `undefined` en esa fuente — ni se enseña ni se cuenta —, no un cero: un cero
// sería afirmar que no hay nada.
//
// Sin plan de por medio, a diferencia de /api/decisiones: esto es operación del
// día (una reserva por aprobar, una clase sin cubrir), no el Decision OS.
//
// Coste: UNA llamada a la función SQL `estado_estudio_conteos` (migración
// 20261019150000) con todos los recuentos que este rol puede ver, más la lectura
// de festivos (calendario oficial por zona, lógica de TypeScript) en paralelo.
// Antes eran ~30 consultas `count: exact` por llamada, en cada apertura del panel
// y en cada vuelta de pestaña. Los filtros de cada recuento viven ahora en esa
// función; `supabase/tests/estado-estudio-conteos-paridad.test.ts` los cruza con
// las consultas de antes. Quién ve qué sigue decidiéndolo ESTE fichero.
//
// Si la función falla, todas las fuentes que el rol puede ver salen `null` (no se
// enseñan), igual que cuando fallaba una consulta suelta: nunca un cero inventado.

/** Las claves que la función SQL devuelve como número, con el mismo nombre en `ConteosEstudio`. */
const CLAVES_NUMERICAS = [
  'sustitucionesPorDecidir', 'sustitucionesConNetwork', 'reservasPorAprobar', 'recibosFallidos', 'renovacionesSinCobro',
  'penalizacionesPorAprobar', 'devolucionesPorRevisar', 'automatizacionesEsperando', 'canjesPorEntregar', 'bajasPorRevisar',
  'seriesPorRenovar', 'plazasFijasPorDecidir', 'reconciliacionesPorRevisar', 'sustitucionesBuscando', 'ofertasListaEspera',
  'cobrosEnReintento', 'sustitucionesCubiertas24h', 'accionesAutonomasHoy', 'mensajesAutomaticosHoy', 'alertasApertura',
  'jornadasPorRevisar', 'clasesNoDadasPorRevisar', 'clasesSinInstructora', 'doblesCobrosPorRevisar', 'seguimientosParaHoy',
  'denunciasPorRevisar',
] as const;
type ClaveNumerica = typeof CLAVES_NUMERICAS[number];

type Visibles = Record<ClaveNumerica | 'facturasSinNif' | 'festivos', boolean>;

/** Qué fuentes ve cada rol: los MISMOS permisos que ya exige la pantalla o la tarjeta donde se resuelve. */
function fuentesVisibles(rol: Rol): Visibles {
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
  return {
    sustitucionesPorDecidir: verSustituciones,
    sustitucionesConNetwork: verNetworkEnSustituciones,
    reservasPorAprobar: gestionaCalendario,
    recibosFallidos: verFinanzas,
    renovacionesSinCobro: verFinanzas,
    penalizacionesPorAprobar: mueveDinero,
    devolucionesPorRevisar: mueveDinero,
    automatizacionesEsperando: gestionaAutomatizaciones,
    canjesPorEntregar: gestionaClientas,
    bajasPorRevisar: gestionaEquipo,
    seriesPorRenovar: gestionaCalendario,
    // Mismos dos permisos que resolverlas (`/api/plazas-fijas/solicitudes`).
    plazasFijasPorDecidir: gestionaClientas && gestionaCalendario,
    // A-14: mismo gate que /api/terminal/reconciliaciones y /api/terminal/reconciliar.
    reconciliacionesPorRevisar: mueveDinero,
    sustitucionesBuscando: verSustituciones,
    ofertasListaEspera: gestionaCalendario,
    cobrosEnReintento: verFinanzas,
    sustitucionesCubiertas24h: verSustituciones,
    accionesAutonomasHoy: rol === 'PROPIETARIO',
    mensajesAutomaticosHoy: gestionaAutomatizaciones,
    // Opening OS: mismo gate que la tarjeta de apertura y la RLS de alertas_opening.
    alertasApertura: puedeGestionarApertura(rol),
    // Mismo gate y mismo filtro de fichas que Tiempo trabajado: una gerente no
    // cuenta las jornadas de la propietaria ni las de otra gerente.
    jornadasPorRevisar: gestionaEquipo,
    clasesNoDadasPorRevisar: gestionaEquipo,
    clasesSinInstructora: gestionaCalendario,
    doblesCobrosPorRevisar: mueveDinero,
    seguimientosParaHoy: gestionaClientas,
    facturasSinNif: rol === 'PROPIETARIO',
    denunciasPorRevisar: ambitosQueRevisa(rol).length > 0,
    festivos: puedeGestionarSede(rol),
  };
}

/** Los argumentos de `estado_estudio_conteos` para este rol. */
function argumentosConteos(
  { studioId, rol, userId, ahora }: { studioId: string; rol: Rol; userId: string; ahora: Date },
) {
  const fuentes = (Object.entries(fuentesVisibles(rol)) as [string, boolean][])
    .filter(([clave, ve]) => ve && clave !== 'festivos').map(([clave]) => clave);
  return {
    p_studio_id: studioId, p_user_id: userId, p_ahora: ahora.toISOString(), p_fuentes: fuentes,
    p_ambitos: ambitosQueRevisa(rol), p_roles_ficha: rolesQuePuedeAsignar(rol), p_horas_limite: HORAS_LIMITE_POR_DEFECTO,
  };
}

export async function contarConteosEstudio(
  admin: SupabaseClient,
  { studioId, rol, userId, ahora }: { studioId: string; rol: Rol; userId: string; ahora: Date },
): Promise<ConteosEstudio> {
  const visibles = fuentesVisibles(rol);
  const args = argumentosConteos({ studioId, rol, userId, ahora });

  const [rpc, festivosPorDecidir] = await Promise.all([
    args.p_fuentes.length === 0
      ? Promise.resolve({ data: {} as Record<string, unknown>, error: null })
      : admin.rpc('estado_estudio_conteos', args),
    // Festivos con clases sin decidir: el mismo gate que cerrar el centro
    // (`/api/cierres`). Apagado (interruptor o tabla sin migrar) = undefined:
    // ni línea ni tarjeta. Sin festivo en los próximos 21 días, una sola lectura.
    visibles.festivos
      ? leerFestivosPorDecidir(admin, { studioId, ahora, alcance: 'aviso', conReservas: false })
        .then((r): number | null | undefined => (r === null ? null : r.disponible ? r.festivos.length : undefined))
      : Promise.resolve(undefined),
  ]);

  if (rpc.error) console.error('[estado-estudio:conteos]', rpc.error);
  const datos = (rpc.error ? null : rpc.data) as Record<string, unknown> | null;

  // `undefined` = este rol no lo ve; `null` = la lectura falló (o no vino): no se enseña.
  const num = (clave: ClaveNumerica): number | null | undefined => {
    if (!visibles[clave]) return undefined;
    const v = datos?.[clave];
    return typeof v === 'number' ? v : null;
  };

  // Sin NIF no sale ninguna factura. Lo pone la propietaria (Datos fiscales). Si
  // el NIF vale lo decide `nifEmisorValido` (TypeScript): la función devuelve el
  // dato en bruto y cuántos cobros esperan su factura.
  const facturasSinNif = ((): number | null | undefined => {
    if (!visibles.facturasSinNif) return undefined;
    const f = datos?.facturasSinNif as { nif: string | null; modoFacturacion: string | null; sinSellar: number } | null | undefined;
    if (!f || typeof f.sinSellar !== 'number') return null;
    if (!emiteFacturas(f.modoFacturacion as ModoFacturacion) || nifEmisorValido(f.nif?.trim() ?? '')) return 0;
    return Math.max(1, f.sinSellar);
  })();

  const conteos: ConteosEstudio = { festivosPorDecidir, facturasSinNif };
  for (const clave of CLAVES_NUMERICAS) conteos[clave] = num(clave);
  return conteos;
}
