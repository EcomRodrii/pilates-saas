import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { comprobarAdminInterno, respuestaSinAccesoInterno } from '@/lib/interno/auth';
import { tienePermiso, type Permiso } from '@/lib/interno/permisos';
import { leerFacturacion } from '@/lib/interno/facturacion-servidor';
import { esDePago } from '@/lib/interno/salud-estudio';
import { saludDe } from '@/lib/interno/salud-estudio-servidor';
import { corteTurnoTentare } from '@/lib/moderacion/denuncias';
import { altaDesdeFila, pasoDeAlta } from '@/lib/alta/abandono';
import { esEstadoApp, type EstadoApp } from '@/lib/app-nativa/pedir-app';
import { esPlanGratis } from '@/lib/billing/plan-gratis';
import { hoyEnEstudio } from '@/lib/utils';
import {
  cifrasDelNegocio, estadosGratisPorEstudio, estudiosAMirar, movimientoSuscripciones, pendientesPorSeccion, tareasDeHoy,
  type EntradaCifras, type EntradaEstudioDePago, type EntradaEstudioGratis, type FuentesTareas, type Hoy,
} from '@/lib/interno/hoy';

export const runtime = 'nodejs';
// Habla con Stripe: nunca cacheado (mismo motivo que /api/interno/facturacion).
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// /interno → Hoy, y los contadores del menú.
//
// Cada bloque se lee SOLO si quien pregunta tiene el permiso de la pantalla de
// la que sale (el mismo que exige su propia ruta), así que esto no enseña nada
// que no pudiera ver ya entrando en esa pantalla. Y enseña MENOS: recuentos y
// nombres de estudio, nunca un teléfono, un email o lo que dice una denuncia.
// Por eso, a diferencia de /llamadas y /denuncias, leer esto no deja rastro en
// la auditoría: no se abre ningún dato personal.
//
// Cruza inquilinos con service-role: solo es legítimo porque
// `comprobarAdminInterno` ya ha comprobado que es del equipo (y su `aal2`).
// ─────────────────────────────────────────────────────────────────────────────

const IMPAGO = new Set(['past_due', 'unpaid', 'incomplete']);
const DIA = 86_400_000;

/** De 10 en 10: una ráfaga de cientos de consultas a la vez ya ha dado 504 en esta base (ver /kpis). */
async function porTandas<T, R>(items: readonly T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += 10) out.push(...await Promise.all(items.slice(i, i + 10).map(f)));
  return out;
}

export async function GET(req: NextRequest) {
  const r = await comprobarAdminInterno(req);
  if (!('admin' in r)) return respuestaSinAccesoInterno(r.motivo);
  const puede = (p: Permiso) => tienePermiso(r.admin.permisos, p);

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const ahora = new Date();
  const noLeidos: string[] = [];
  const sinPermiso: string[] = [];
  const iso = (msAtras: number) => new Date(ahora.getTime() - msAtras).toISOString();

  // ── Dinero (billing.read) ────────────────────────────────────────────────
  const facturacion = async () => {
    if (!puede('billing.read')) { sinPermiso.push('cobros'); return null; }
    const f = await leerFacturacion(db);
    if (!f) { noLeidos.push('cobros'); return null; }
    if (f.avisoStripe) noLeidos.push('Stripe');
    return f;
  };

  // ── Denuncias (app.moderate): solo cuántas y desde cuándo, nunca qué dicen ──
  const denuncias = async (): Promise<FuentesTareas['denuncias']> => {
    if (!puede('app.moderate')) { sinPermiso.push('denuncias'); return null; }
    const { data, count, error } = await db.from('denuncias').select('creada_en', { count: 'exact' })
      .eq('estado', 'PENDIENTE')
      .or(`destino.eq.TENTARE,creada_en.lte.${corteTurnoTentare(ahora)}`)
      .order('creada_en', { ascending: true }).limit(1);
    if (error) { noLeidos.push('denuncias'); return null; }
    return { n: count ?? 0, masAntigua: (data?.[0]?.creada_en as string | undefined) ?? null };
  };

  // ── Llamadas pedidas (crm.update): sin el teléfono ───────────────────────
  const llamadas = async (): Promise<FuentesTareas['llamadas']> => {
    if (!puede('crm.update')) { sinPermiso.push('llamadas'); return null; }
    const { data, count, error } = await db.from('solicitudes_llamada').select('creada_en', { count: 'exact' })
      .eq('estado', 'pendiente').order('creada_en', { ascending: true }).limit(1);
    if (error) { noLeidos.push('llamadas'); return null; }
    return { n: count ?? 0, masAntigua: (data?.[0]?.creada_en as string | undefined) ?? null };
  };

  // ── Apps de estudio (studios.read) ───────────────────────────────────────
  const apps = async (): Promise<FuentesTareas['apps']> => {
    if (!puede('studios.read')) { sinPermiso.push('apps'); return null; }
    const [filas, cupos] = await Promise.all([
      db.from('apps_estudio').select('estado, bundle_id, studios!inner(nombre, slug)'),
      db.from('apps_estudio_cupos').select('bundle_id'),
    ]);
    if (filas.error) { noLeidos.push('apps'); return null; }
    // Sin la tabla del lote no se sabe si tiene hueco: no se da por hecho que no.
    const delLote = cupos.error ? null : new Set(((cupos.data ?? []) as { bundle_id: string }[]).map(c => c.bundle_id));
    type Fila = { estado: string; bundle_id: string; studios: { nombre: string | null; slug: string | null } | null };
    return ((filas.data ?? []) as unknown as Fila[])
      .filter(f => esEstadoApp(f.estado))
      .map(f => ({
        estudio: f.studios?.nombre ?? f.studios?.slug ?? 'Un estudio',
        estado: f.estado as EstadoApp,
        sinHueco: delLote !== null && !delLote.has(f.bundle_id),
      }));
  };

  // ── Altas a medias (growth.read): sin el email ───────────────────────────
  const altas = async (): Promise<FuentesTareas['altas']> => {
    if (!puede('growth.read')) { sinPermiso.push('altas'); return null; }
    const { data, error } = await db.rpc('altas_estudio_detalle', { p_solo_pendientes: false, p_limite: 200 });
    if (error) { noLeidos.push('altas'); return null; }
    const desde = iso(7 * DIA);
    const aMedias = ((data ?? []) as Record<string, unknown>[]).map(altaDesdeFila)
      // Quien ya trabaja en un estudio no se está dando de alta: no es una alta perdida.
      .filter(a => !a.esEquipo && a.iniciadaEn >= desde)
      .map(a => ({ a, paso: pasoDeAlta(a).paso }))
      .filter(x => x.paso !== 'terminada');
    return {
      n: aMedias.length,
      fallidas: aMedias.filter(x => x.paso === 'error_estudio').length,
      masAntigua: aMedias.map(x => x.a.iniciadaEn).sort()[0] ?? null,
    };
  };

  // ── Estudios y uso (studios.read) ────────────────────────────────────────
  const estudios = async () => {
    if (!puede('studios.read')) { sinPermiso.push('estudios'); return null; }
    const { data, error } = await db.from('studios')
      .select('id, nombre, slug, plan, subscription_id, subscription_status, owner_auth_user_id');
    if (error) { noLeidos.push('estudios'); return null; }
    type Estudio = { id: string; nombre: string | null; slug: string; plan: string | null; subscription_id: string | null; subscription_status: string | null; owner_auth_user_id: string | null };
    const lista = (data ?? []) as Estudio[];
    const nombre = (e: Estudio) => e.nombre ?? e.slug;

    const [r7, r7antes, actividad, gratis, pago] = await Promise.all([
      db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', iso(7 * DIA)),
      db.from('reservas').select('id', { count: 'exact', head: true }).gte('creado_en', iso(14 * DIA)).lt('creado_en', iso(7 * DIA)),
      // «Usándolo» = al menos una reserva hecha en la ventana. Con `limit(1)`
      // por estudio: basta saber si hay UNA (mismo patrón que /kpis).
      porTandas(lista, async e => {
        const [a, b] = await Promise.all([
          db.from('reservas').select('id').eq('studio_id', e.id).gte('creado_en', iso(30 * DIA)).limit(1),
          db.from('reservas').select('id').eq('studio_id', e.id).gte('creado_en', iso(60 * DIA)).lt('creado_en', iso(30 * DIA)).limit(1),
        ]);
        return { error: Boolean(a.error || b.error), ahora: (a.data?.length ?? 0) > 0, antes: (b.data?.length ?? 0) > 0 };
      }),
      (async () => {
        const ids = lista.filter(e => esPlanGratis(e.subscription_status)).map(e => e.id);
        if (ids.length === 0) return [] as EntradaEstudioGratis[];
        const { data: usos, error: errUso } = await db.from('uso_plan_gratis')
          .select('studio_id, alumnas_activas, reservas_30_dias, excedido_desde, medido_en').in('studio_id', ids);
        if (errUso) { noLeidos.push('plan gratis'); return [] as EntradaEstudioGratis[]; }
        const porId = new Map(((usos ?? []) as { studio_id: string; alumnas_activas: number | null; reservas_30_dias: number | null; excedido_desde: string | null; medido_en: string | null }[]).map(u => [u.studio_id, u]));
        const estados = estadosGratisPorEstudio(lista.filter(e => ids.includes(e.id)).map(e => {
          const u = porId.get(e.id);
          return {
            studioId: e.id, ownerId: e.owner_auth_user_id,
            alumnasActivas: u?.alumnas_activas ?? null, reservas30Dias: u?.reservas_30_dias ?? null,
            excedidoDesde: u?.excedido_desde ?? null, medidoEn: u?.medido_en ?? null,
          };
        }), hoyEnEstudio(ahora));
        return lista.filter(e => estados.has(e.id)).map(e => ({ id: e.id, nombre: nombre(e), estado: estados.get(e.id)! }));
      })(),
      // Los de pago son pocos y son los que importan: su salud entera, y la
      // semana anterior para saber si «0 reservas» es una caída o lo de siempre.
      porTandas(lista.filter(e => esDePago(e.subscription_id)), async e => {
        const [salud, antes] = await Promise.all([
          saludDe(db, { id: e.id, owner_auth_user_id: e.owner_auth_user_id, subscription_status: e.subscription_status }, ahora),
          db.from('reservas').select('id', { count: 'exact', head: true }).eq('studio_id', e.id)
            .gte('creado_en', iso(14 * DIA)).lt('creado_en', iso(7 * DIA)),
        ]);
        return { e, salud, semanaAnterior: antes.error ? null : antes.count ?? 0 };
      }),
    ]);

    const actividadLeida = !actividad.some(a => a.error);
    if (!actividadLeida) noLeidos.push('estudios con actividad');
    if (r7.error || r7antes.error) noLeidos.push('reservas');
    return {
      reservas: r7.error || r7antes.error ? null : { ultimos7: r7.count ?? 0, anteriores7: r7antes.count ?? 0 },
      actividad: actividadLeida
        ? { ahora: actividad.filter(a => a.ahora).length, antes: actividad.filter(a => a.antes).length }
        : null,
      gratis,
      pago,
    };
  };

  const [f, den, lla, app, alt, est] = await Promise.all([facturacion(), denuncias(), llamadas(), apps(), altas(), estudios()]);

  const stripeOk = f !== null && f.avisoStripe === null;
  const impagosStripe = new Set(stripeOk ? f.resultado.lineas.filter(l => l.estado === 'impago').map(l => l.id) : []);

  const fuentes: FuentesTareas = {
    facturacion: stripeOk ? {
      impagos: f.resultado.lineas.filter(l => l.estado === 'impago').map(l => ({ nombre: l.nombre })),
      descuadres: f.resultado.lineas.filter(l => l.estado === 'descuadre').map(l => ({ nombre: l.nombre, motivo: l.motivoDescuadre })),
    } : null,
    denuncias: den,
    llamadas: lla,
    apps: app,
    altas: alt,
    sinReservas: est
      ? est.pago.filter(p => p.salud.senales.reservas7d === 0)
        .map(p => ({ id: p.e.id, nombre: p.e.nombre ?? p.e.slug, semanaAnterior: p.semanaAnterior }))
      : null,
  };
  const tareas = tareasDeHoy(fuentes, ahora);

  const sinPermisoDinero = 'No tienes permiso para ver la facturación.';
  const sinPermisoEstudios = 'No tienes permiso para ver los estudios.';
  const entradaCifras: EntradaCifras = {
    dinero: !puede('billing.read') ? { motivo: sinPermisoDinero }
      : !f ? { motivo: 'No se ha podido leer la facturación.' }
      : f.avisoStripe ? { motivo: `Sin respuesta de Stripe: ${f.avisoStripe}` }
      : { mrrEuros: f.resultado.mrrEuros, pagando: f.resultado.pagando, movimiento: movimientoSuscripciones(f.subs, ahora) },
    actividad: !puede('studios.read') ? { motivo: sinPermisoEstudios }
      : est?.actividad ?? { motivo: 'No se han podido leer las reservas por estudio.' },
    reservas: !puede('studios.read') ? { motivo: sinPermisoEstudios }
      : est?.reservas ?? { motivo: 'No se han podido contar las reservas.' },
  };

  const pagoAMirar: EntradaEstudioDePago[] = (est?.pago ?? []).map(({ e, salud, semanaAnterior }) => ({
    id: e.id, nombre: e.nombre ?? e.slug, plan: e.plan,
    impago: impagosStripe.has(e.id) || IMPAGO.has(e.subscription_status ?? ''),
    reservas7d: salud.senales.reservas7d, semanaAnterior,
    nivel: salud.nivel, primerAviso: salud.avisos[0] ?? null,
  }));

  const respuesta: Hoy = {
    tareas,
    pendientes: pendientesPorSeccion(tareas),
    cifras: cifrasDelNegocio(entradaCifras),
    estudios: est ? estudiosAMirar(pagoAMirar, est.gratis) : null,
    noLeidos,
    sinPermiso,
  };
  return NextResponse.json(respuesta);
}
