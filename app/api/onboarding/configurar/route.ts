import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { getThemeBorrador, getThemePublicado } from '@/lib/theme-data';
import { uid } from '@/lib/utils';
import {
  planificarConfiguracion, planVacio, HORARIO_POR_DEFECTO, type RespuestasOperativa,
} from '@/lib/onboarding/plan-configuracion';

// ─────────────────────────────────────────────────────────────────────────────
// §8 — Aplica al estudio lo que la propietaria acaba de responder en el
// asistente de bienvenida: crea sus salas con su aforo, sus tipos de clase con
// su duración, los borradores de bono/cuota/clase suelta, la franja horaria de
// su calendario, y —si da clases ella misma— su propia ficha de instructora.
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
  const studioId = sesion.studioId;

  // ── Favicon derivado del logo ─────────────────────────────────────────────
  //
  // Va ANTES del corte por plan vacío a propósito: si solo sube el logo y se
  // salta todas las preguntas, el plan es «nada que crear» y aun así queremos
  // que su pestaña deje de ser la de Tentare.
  //
  // El favicon vive en el TEMA, no en `studios` (a diferencia del logo), y
  // apunta a la MISMA URL que el logo en vez de copiar el fichero: es la
  // imagen que ella acaba de elegir, y duplicarla en `favicon-<id>` solo
  // añadiría un fichero que mantener sincronizado.
  //
  // ⚠️ Se parte de `getThemePublicado`/`getThemeBorrador` y no de un objeto
  // vacío: sin fila en `studio_theme`, esas funciones caen al preset viejo del
  // estudio (`studios.tema_portal`). Escribir `{ faviconUrl }` a secas crearía
  // la fila y ese preset dejaría de aplicarse — le cambiaríamos los colores del
  // portal por poner un favicon.
  //
  // Y solo si NO tiene ya uno: elegir un favicon a mano gana siempre.
  let faviconPuesto = false;
  try {
    const { data: filaStudio } = await admin
      .from('studios').select('logo_url').eq('id', studioId).maybeSingle();
    const logoUrl = (filaStudio?.logo_url as string | null) ?? null;
    if (logoUrl) {
      const publicado = await getThemePublicado(studioId);
      if (!publicado.faviconUrl) {
        const borrador = await getThemeBorrador(studioId);
        const ahora = new Date().toISOString();
        const { error } = await admin.from('studio_theme').upsert(
          {
            studio_id: studioId,
            config_draft: { ...borrador, faviconUrl: logoUrl },
            config_published: { ...publicado, faviconUrl: logoUrl },
            actualizado_en: ahora,
          },
          { onConflict: 'studio_id' },
        );
        if (error) console.error('[onboarding:configurar:favicon]', error);
        else faviconPuesto = true;
      }
    }
  } catch (err) {
    // Fallo suave: un favicon no justifica que el asistente diga que no ha
    // podido preparar el estudio.
    console.error('[onboarding:configurar:favicon]', err);
  }

  if (planVacio(plan)) {
    return NextResponse.json({ ok: true, salas: 0, tiposClase: 0, planes: 0, nada: true, favicon: faviconPuesto });
  }

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

    // Su propia ficha de instructora, si ha dicho que da clases.
    //
    // El nombre y el email salen de la SESIÓN, nunca del body — mismo criterio
    // que el `studio_id`: si vinieran del cuerpo, cualquiera podría darse de
    // alta con el nombre que quisiera en su propio estudio, y de paso habría
    // dos sitios distintos diciendo quién es esta persona.
    //
    // Idempotente igual que el resto, pero por `auth_user_id` y no por nombre:
    // la cerradura real es el UNIQUE(auth_user_id, studio_id) de la migración
    // 20260731003736, así que aunque dos peticiones se crucen solo puede
    // quedar una fila. Se comprueba antes para no gastar un insert que ya
    // sabemos que va a chocar, y se trata el 23505 como éxito por si se cruzan
    // de todos modos — mismo tratamiento que dbInsertInstructoraPropia.
    let instructoraCreada = false;
    if (plan.instructoraPropia) {
      const { data: yaEsta } = await admin
        .from('instructores')
        .select('id')
        .eq('studio_id', studioId)
        .eq('auth_user_id', sesion.userId)
        .maybeSingle();
      if (!yaEsta) {
        const { error } = await admin.from('instructores').insert({
          id: uid(), studio_id: studioId, auth_user_id: sesion.userId,
          nombre: sesion.nombre, email: sesion.email, rol: 'PROPIETARIO', activo: true,
        });
        // Fallo suave y NO abortar: llegados aquí sus salas, clases y bonos ya
        // están creados. Devolver un error ahora le diría que no se ha podido
        // preparar su estudio cuando lo único que falta es una ficha que el
        // checklist de primeros pasos ya le va a pedir igualmente.
        if (error && error.code !== '23505') {
          console.error('[onboarding:configurar:instructora]', error);
        } else {
          instructoraCreada = true;
        }
      }
    }

    // La franja del calendario. Es lo ÚNICO del plan que modifica algo que ya
    // existe, así que lleva su propio candado: `hora_apertura`/`hora_cierre`
    // son NOT NULL con default 08:00/22:00, y la única manera de distinguir
    // «no lo ha tocado» de «lo ha puesto a mano» es comparar contra ese
    // default. Sin esto, reenviar el asistente —doble toque, red que
    // reintenta— le pisaría un horario que ella ya hubiera ajustado, que es
    // justo lo que la idempotencia por nombre evita en el resto del plan.
    let horarioAjustado = false;
    if (plan.horario) {
      const { data: actual } = await admin
        .from('studios')
        .select('hora_apertura, hora_cierre')
        .eq('id', studioId)
        .maybeSingle();
      const sinTocar = actual
        && actual.hora_apertura === HORARIO_POR_DEFECTO.apertura
        && actual.hora_cierre === HORARIO_POR_DEFECTO.cierre;
      if (sinTocar) {
        const { error } = await admin
          .from('studios')
          .update({ hora_apertura: plan.horario.apertura, hora_cierre: plan.horario.cierre })
          .eq('id', studioId);
        // Fallo suave, mismo criterio que la ficha de instructora: llegados
        // aquí el resto ya está creado, y lo peor que pasa es que el
        // calendario se abra de 8 a 22 como hasta ahora.
        if (error) console.error('[onboarding:configurar:horario]', error);
        else horarioAjustado = true;
      }
    }

    return NextResponse.json({
      ok: true,
      salas: salasNuevas.length,
      tiposClase: tiposNuevos.length,
      planes: planesNuevos.length,
      instructora: instructoraCreada,
      horario: horarioAjustado,
      favicon: faviconPuesto,
    });
  } catch (err) {
    return errorInterno('onboarding:configurar', err,
      'No se ha podido preparar tu estudio. Puedes configurarlo a mano en Configuración.');
  }
}
