import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { serializeCsv } from '@/lib/csv';
import { catalogo } from '@/lib/migracion/catalogo';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import {
  tablaConsentimientos, tablaNotasInternas, tablaNotasProgreso, tablaSalud, type SociaExportable, type TablaCsv,
} from '@/lib/exportar/estudio-salud-notas';

// Exportación completa descargable ("tus datos son tuyos") — un CSV por tabla,
// no un ZIP: no hay librería de zip en el proyecto y añadir una dependencia
// nueva solo para esto no compensa frente a cinco botones de descarga.
//
// Solo PROPIETARIO (mismo criterio que app/api/layout — configuración de
// fondo del estudio): es el conjunto más sensible de datos exportable de
// golpe (dinero + toda la cartera de clientas).
//
// Es también la DEVOLUCIÓN de los datos al terminar el contrato (art. 28.3.g
// RGPD, ciclo de baja de lib/retencion): por eso, desde el 2-oct-2026, lleva la
// ficha de salud, las notas de progreso, las notas internas y los
// consentimientos (lib/exportar/estudio-salud-notas.ts). La salud, solo de
// quien tiene el consentimiento vigente, y cada descarga queda en
// `lecturas_ficha_salud` como cualquier lectura de la ficha: sin ese registro
// no se entrega. Sin adjuntos (avatares/fotos); sin exportación programada.
export const maxDuration = 60;

const TABLAS = [
  'clientas', 'reservas', 'suscripciones', 'recibos', 'pagos_historicos',
  'salud', 'notas_progreso', 'notas_internas', 'consentimientos',
] as const;
type Tabla = (typeof TABLAS)[number];

function csvResponse(nombreArchivo: string, headers: string[], rows: string[][]) {
  const csv = '﻿' + serializeCsv(headers, rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Cache-Control': 'no-store',
    },
  });
}

const COLUMNAS_SOCIA = 'id, nombre, apellidos, email, consentimiento_salud_fecha, consentimiento_salud_revocado_en';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'exportar-mis-datos', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede exportar todos los datos del estudio' }, { status: 403 });
  }

  const tabla = req.nextUrl.searchParams.get('tabla') as Tabla | null;
  if (!tabla || !TABLAS.includes(tabla)) {
    return NextResponse.json({ error: `Tabla inválida. Usa una de: ${TABLAS.join(', ')}` }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const studioId = sesion.studioId;

  if (tabla === 'clientas') {
    const { data, error } = await catalogo<{
      nombre: string; apellidos: string; email: string; telefono: string | null;
      fecha_alta: string | null; activo: boolean;
    }>((d, h) => admin.from('socios')
      .select('nombre, apellidos, email, telefono, fecha_alta, activo')
      .eq('studio_id', studioId).is('borrado_en', null).range(d, h));
    if (error) return NextResponse.json({ error: 'No se pudo leer clientas' }, { status: 500 });
    return csvResponse('clientas.csv', ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'Fecha de alta', 'Activa'],
      (data ?? []).map(s => [s.nombre, s.apellidos, s.email, s.telefono ?? '', s.fecha_alta ?? '', s.activo ? 'Sí' : 'No']));
  }

  if (tabla === 'reservas') {
    const [{ data: reservas, error: eR }, { data: socios, error: eS }, { data: sesiones, error: eSes }, { data: tipos, error: eT }] = await Promise.all([
      catalogo<{ sesion_id: string | null; socio_id: string | null; estado: string; check_in_en: string | null }>(
        (d, h) => admin.from('reservas').select('sesion_id, socio_id, estado, check_in_en').eq('studio_id', studioId).range(d, h)),
      catalogo<{ id: string; email: string }>((d, h) => admin.from('socios').select('id, email').eq('studio_id', studioId).range(d, h)),
      catalogo<{ id: string; inicio: string; tipo_clase_id: string | null }>((d, h) => admin.from('sesiones').select('id, inicio, tipo_clase_id').eq('studio_id', studioId).range(d, h)),
      catalogo<{ id: string; nombre: string }>((d, h) => admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId).range(d, h)),
    ]);
    if (eR || eS || eSes || eT) return NextResponse.json({ error: 'No se pudo leer reservas' }, { status: 500 });
    const emailPorSocio = new Map((socios ?? []).map(s => [s.id, s.email]));
    const sesionPorId = new Map((sesiones ?? []).map(s => [s.id, s]));
    const nombrePorTipo = new Map((tipos ?? []).map(t => [t.id, t.nombre]));
    return csvResponse('reservas.csv', ['Email de la socia', 'Clase', 'Fecha de la clase', 'Estado', 'Check-in'],
      (reservas ?? []).map(r => {
        const ses = r.sesion_id ? sesionPorId.get(r.sesion_id) : undefined;
        return [
          r.socio_id ? emailPorSocio.get(r.socio_id) ?? '' : '',
          ses?.tipo_clase_id ? nombrePorTipo.get(ses.tipo_clase_id) ?? '' : '',
          ses?.inicio ?? '', r.estado, r.check_in_en ?? '',
        ];
      }));
  }

  if (tabla === 'suscripciones') {
    const [{ data: subs, error: eSub }, { data: socios, error: eS }, { data: planes, error: eP }] = await Promise.all([
      catalogo<{ socio_id: string | null; plan_id: string | null; estado: string; fecha_inicio: string; fecha_fin: string | null; sesiones_restantes: number | null }>(
        (d, h) => admin.from('suscripciones').select('socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes').eq('studio_id', studioId).range(d, h)),
      catalogo<{ id: string; email: string }>((d, h) => admin.from('socios').select('id, email').eq('studio_id', studioId).range(d, h)),
      catalogo<{ id: string; nombre: string }>((d, h) => admin.from('planes_tarifa').select('id, nombre').eq('studio_id', studioId).range(d, h)),
    ]);
    if (eSub || eS || eP) return NextResponse.json({ error: 'No se pudo leer suscripciones' }, { status: 500 });
    const emailPorSocio = new Map((socios ?? []).map(s => [s.id, s.email]));
    const nombrePorPlan = new Map((planes ?? []).map(p => [p.id, p.nombre]));
    return csvResponse('suscripciones.csv', ['Email de la socia', 'Plan', 'Estado', 'Fecha de inicio', 'Fecha de fin', 'Sesiones restantes'],
      (subs ?? []).map(s => [
        s.socio_id ? emailPorSocio.get(s.socio_id) ?? '' : '',
        s.plan_id ? nombrePorPlan.get(s.plan_id) ?? '' : '',
        s.estado, s.fecha_inicio, s.fecha_fin ?? '', s.sesiones_restantes != null ? String(s.sesiones_restantes) : '',
      ]));
  }

  if (tabla === 'recibos') {
    const [{ data: recibos, error: eRec }, { data: socios, error: eS }] = await Promise.all([
      catalogo<{ socio_id: string | null; concepto: string; importe: number; estado: string; fecha_vencimiento: string; fecha_cobro: string | null }>(
        (d, h) => admin.from('recibos').select('socio_id, concepto, importe, estado, fecha_vencimiento, fecha_cobro').eq('studio_id', studioId).range(d, h)),
      catalogo<{ id: string; email: string }>((d, h) => admin.from('socios').select('id, email').eq('studio_id', studioId).range(d, h)),
    ]);
    if (eRec || eS) return NextResponse.json({ error: 'No se pudo leer recibos' }, { status: 500 });
    const emailPorSocio = new Map((socios ?? []).map(s => [s.id, s.email]));
    return csvResponse('recibos.csv', ['Email de la socia', 'Concepto', 'Importe', 'Estado', 'Fecha de vencimiento', 'Fecha de cobro'],
      (recibos ?? []).map(r => [
        r.socio_id ? emailPorSocio.get(r.socio_id) ?? '' : '',
        r.concepto, r.importe.toFixed(2), r.estado, r.fecha_vencimiento, r.fecha_cobro ?? '',
      ]));
  }

  if (tabla === 'salud' || tabla === 'notas_progreso' || tabla === 'notas_internas' || tabla === 'consentimientos') {
    try {
      return await exportarSaludYNotas(admin, sesion, tabla);
    } catch (e) {
      return errorInterno(`exportar/mis-datos:${tabla}`, e, 'No se ha podido preparar la descarga.');
    }
  }

  // pagos_historicos
  const [{ data: pagos, error: ePag }, { data: socios, error: eS }] = await Promise.all([
    catalogo<{ socio_id: string; fecha: string; concepto: string | null; importe: number; medio_pago: string | null }>(
      (d, h) => admin.from('pagos_historicos').select('socio_id, fecha, concepto, importe, medio_pago').eq('studio_id', studioId).range(d, h)),
    catalogo<{ id: string; email: string }>((d, h) => admin.from('socios').select('id, email').eq('studio_id', studioId).range(d, h)),
  ]);
  if (ePag || eS) return NextResponse.json({ error: 'No se pudo leer pagos históricos' }, { status: 500 });
  const emailPorSocio = new Map((socios ?? []).map(s => [s.id, s.email]));
  return csvResponse('pagos-historicos.csv', ['Email de la socia', 'Fecha', 'Concepto', 'Importe', 'Medio de pago'],
    (pagos ?? []).map(p => [emailPorSocio.get(p.socio_id) ?? '', p.fecha, p.concepto ?? '', p.importe.toFixed(2), p.medio_pago ?? '']));
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type Sesion = NonNullable<Awaited<ReturnType<typeof verificarSesionStaff>>>;

/** Lee todas las filas de una tabla del estudio, ordenadas por una columna única, o lanza. */
async function todas<T>(admin: Admin, tabla: string, columnas: string, studioId: string, orden = 'id'): Promise<T[]> {
  const { data, error } = await catalogo<T>((d, h) => admin.from(tabla).select(columnas)
    .eq('studio_id', studioId).order(orden, { ascending: true }).range(d, h) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>);
  if (error) throw new Error(`leyendo ${tabla}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  return data ?? [];
}

async function exportarSaludYNotas(
  admin: Admin, sesion: Sesion, tabla: 'salud' | 'notas_progreso' | 'notas_internas' | 'consentimientos',
): Promise<NextResponse> {
  const studioId = sesion.studioId;
  const socias = await todas<SociaExportable>(admin, 'socios', COLUMNAS_SOCIA, studioId);
  let csv: TablaCsv & { socios?: string[] };

  if (tabla === 'salud') {
    const [condiciones, cuestionario, preguntas, valoraciones, trasClase] = await Promise.all([
      todas<Parameters<typeof tablaSalud>[0]['condiciones'][number]>(admin, 'condiciones_salud',
        'id, socio_id, categoria, etiqueta, zona, restricciones, severidad, estado, inicio, fin, notas', studioId),
      todas<Parameters<typeof tablaSalud>[0]['cuestionario'][number]>(admin, 'respuestas_cuestionario_salud',
        'id, socio_id, pregunta_id, respuesta, actualizado_en', studioId),
      todas<{ id: string; pregunta: string }>(admin, 'plantillas_cuestionario_salud', 'id, pregunta', studioId),
      todas<Parameters<typeof tablaSalud>[0]['valoraciones'][number]>(admin, 'valoraciones_iniciales_salud',
        'valoracion_id, socio_id, tiene_molestias, zonas, detalle, estado_cuerpo, creado_en', studioId, 'valoracion_id'),
      todas<Parameters<typeof tablaSalud>[0]['trasClase'][number]>(admin, 'respuestas_sesion',
        'id, socio_id, respuesta, nota, creado_en', studioId),
    ]);
    csv = tablaSalud({ socias, condiciones, cuestionario, preguntas, valoraciones, trasClase });
  } else if (tabla === 'notas_progreso') {
    const [notas, instructoras] = await Promise.all([
      todas<Parameters<typeof tablaNotasProgreso>[0]['notas'][number]>(admin, 'notas_progreso',
        'id, socio_id, instructor_id, progreso, alertas, plan_proxima_sesion, ejercicios_casa, texto_libre, creada_en', studioId),
      todas<{ id: string; nombre: string | null }>(admin, 'instructores', 'id, nombre', studioId),
    ]);
    csv = tablaNotasProgreso({ socias, notas, instructoras });
  } else if (tabla === 'notas_internas') {
    const notas = await todas<Parameters<typeof tablaNotasInternas>[0]['notas'][number]>(admin, 'notas_internas',
      'id, socio_id, texto, tipo, visibilidad, creado_en', studioId);
    csv = tablaNotasInternas({ socias, notas });
  } else {
    const [salud, contrato, marketing] = await Promise.all([
      todas<Parameters<typeof tablaConsentimientos>[0]['salud'][number]>(admin, 'consentimientos_salud_eventos',
        'id, socio_id, tipo, en, origen, texto', studioId),
      todas<Parameters<typeof tablaConsentimientos>[0]['contrato'][number]>(admin, 'aceptaciones_contrato_eventos',
        'id, socio_id, en, origen, texto_hash', studioId),
      todas<Parameters<typeof tablaConsentimientos>[0]['marketing'][number]>(admin, 'consentimientos_marketing_eventos',
        'id, socio_id, accion, en, origen, texto', studioId),
    ]);
    csv = tablaConsentimientos({ socias, salud, contrato, marketing });
  }

  // Datos de salud fuera del panel: una lectura de la ficha por cada clienta
  // que sale, como la descarga desde su ficha. Si no se puede registrar, no se
  // entrega (fail-closed).
  if (csv.socios && csv.socios.length > 0) {
    const { error } = await admin.from('lecturas_ficha_salud').insert(csv.socios.map(socioId => ({
      studio_id: studioId, socio_id: socioId,
      leido_por_user_id: sesion.userId, leido_por_nombre: sesion.nombre, leido_por_rol: sesion.rol,
    })));
    if (error) return errorInterno('exportar/mis-datos:lectura-salud', error, 'No se ha podido registrar el acceso a la ficha de salud. Inténtalo de nuevo.');
  }

  return csvResponse(`${tabla.replace('_', '-')}.csv`, csv.headers, csv.rows);
}
