import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import {
  planificarConfiguracion, planVacio, type RespuestasOperativa,
} from '@/lib/onboarding/plan-configuracion';

// ─────────────────────────────────────────────────────────────────────────────
// §8 — Aplica al estudio lo que la propietaria acaba de responder en el
// asistente de bienvenida: crea sus salas con su aforo, sus tipos de clase con
// su duración, y los borradores de bono/cuota.
//
// Deliberadamente tonto: TODA la decisión de qué crear vive en la función pura
// `planificarConfiguracion` (con 17 tests). Aquí solo se aplica el plan. Es lo
// que permite probar el criterio sin base de datos y que este fichero no tenga
// más reglas que las de escritura.
//
// **Idempotente por nombre**, mismo criterio que `aplicarCatalogoCadena`:
// inserta lo que falte, nunca sobrescribe ni borra lo que ya haya. Importa más
// de lo que parece — el asistente puede reenviar (doble toque, red que
// reintenta, la propietaria que vuelve a pasar por el wizard), y la alternativa
// es un estudio con "Sala 1" cuatro veces. Es también la razón de que el plan
// sea determinista.
//
// El `studio_id` sale SIEMPRE de la sesión, nunca del body: si no, cualquier
// propietaria podría sembrar salas en el estudio de otra.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Solo la propietaria: montar el estudio (salas, catálogo de clases, planes
  // de precio) es una decisión de negocio de la sede, no algo que competa a
  // RECEPCION/INSTRUCTOR. Mismo criterio que el resto de Configuración. La
  // cerradura real es que aquí se escribe con service-role, así que este
  // chequeo NO es una barrera de UI: es la única que hay en este camino.
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria puede configurar el estudio' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as RespuestasOperativa | null;
  if (!body) return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 });

  // El plan solo sale de la lista cerrada de tipos de clase y de números dentro
  // de rango (ver plan-configuracion.ts), así que un body manipulado no puede
  // crear filas con nombres arbitrarios ni 999 salas.
  const plan = planificarConfiguracion(body);
  if (planVacio(plan)) {
    return NextResponse.json({ ok: true, salas: 0, tiposClase: 0, planes: 0, nada: true });
  }

  const studioId = sesion.studioId;

  try {
    const [{ data: salasExist }, { data: tiposExist }, { data: planesExist }] = await Promise.all([
      admin.from('salas').select('nombre').eq('studio_id', studioId),
      admin.from('tipos_clase').select('nombre').eq('studio_id', studioId),
      admin.from('planes_tarifa').select('nombre').eq('studio_id', studioId),
    ]);

    const yaHay = (filas: { nombre: unknown }[] | null) =>
      new Set((filas ?? []).map(f => String(f.nombre).trim().toLowerCase()));
    const nombresSalas = yaHay(salasExist);
    const nombresTipos = yaHay(tiposExist);
    const nombresPlanes = yaHay(planesExist);

    const salasNuevas = plan.salas
      .filter(s => !nombresSalas.has(s.nombre.toLowerCase()))
      .map(s => ({
        id: `sala-${uid()}`, studio_id: studioId,
        nombre: s.nombre, capacidad: s.capacidad, color: s.color,
      }));

    const tiposNuevos = plan.tiposClase
      .filter(t => !nombresTipos.has(t.nombre.toLowerCase()))
      .map(t => ({
        id: `tc-${uid()}`, studio_id: studioId,
        nombre: t.nombre, color: t.color,
        duracion_minutos: t.duracionMinutos, nivel: t.nivel,
      }));

    const planesNuevos = plan.planes
      .filter(p => !nombresPlanes.has(p.nombre.toLowerCase()))
      .map(p => ({
        id: `plan-${uid()}`, studio_id: studioId,
        nombre: p.nombre, precio: p.precio, tipo: p.tipo,
        sesiones: p.sesiones,
        // Borrador: `/api/stripe/checkout` rechaza un plan inactivo, así que
        // esto no puede cobrarle a nadie hasta que la propietaria le ponga
        // precio y lo active. Ver la regla 1 de plan-configuracion.ts.
        activo: false,
      }));

    // Secuencial y no `Promise.all`: si falla el segundo insert queremos saber
    // cuál fue y devolver un error honesto, no un rechazo agregado que oculta
    // qué se creó y qué no. Son 3 escrituras de un puñado de filas, una vez en
    // la vida del estudio: la latencia no es el problema aquí.
    if (salasNuevas.length) {
      const { error } = await admin.from('salas').insert(salasNuevas);
      if (error) return errorInterno('onboarding:configurar:salas', error,
        'No se han podido crear tus salas. Puedes crearlas en Configuración → Salas.');
    }
    if (tiposNuevos.length) {
      const { error } = await admin.from('tipos_clase').insert(tiposNuevos);
      if (error) return errorInterno('onboarding:configurar:tipos', error,
        'No se han podido crear tus tipos de clase. Puedes crearlos en Configuración → Clases.');
    }
    if (planesNuevos.length) {
      const { error } = await admin.from('planes_tarifa').insert(planesNuevos);
      if (error) return errorInterno('onboarding:configurar:planes', error,
        'No se han podido crear tus bonos. Puedes crearlos en Configuración → Bonos y membresías.');
    }

    return NextResponse.json({
      ok: true,
      salas: salasNuevas.length,
      tiposClase: tiposNuevos.length,
      planes: planesNuevos.length,
    });
  } catch (err) {
    return errorInterno('onboarding:configurar', err,
      'No se ha podido preparar tu estudio. Puedes configurarlo a mano en Configuración.');
  }
}
