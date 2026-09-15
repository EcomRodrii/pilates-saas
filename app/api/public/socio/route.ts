import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { registrarSociaPublica, actualizarSociaPublica, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { fichaInstructoraPendiente, instructoraActivaEnEstudio } from '@/lib/auth-instructora';
import { escaparLike } from '@/lib/escapar-like';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { firmaCompleta, type FirmaMinima } from '@/lib/student/consentimiento-regla';
import { normalizarFirma } from '@/lib/datos-salud/consentimiento';
import {
  registrarAceptacionContrato, textoContratoVigente, evidenciaDePeticion,
} from '@/lib/db/aceptacion-contrato-admin';

// Operaciones de la propia socia desde el portal/reserva. SEGURIDAD: todas
// exigen sesión real de socia (JWT de Supabase Auth); la identidad se deriva del
// token, no del body. `registrar` es el alta de un walk-in ya autenticado por
// magic link: se crea su ficha vinculada a su usuario de auth.
//
// CORS: el bundle embebible manda ?studioId= en la URL (además del body).
//
// ⚠️ ACEPTACIÓN DEL CONTRATO (plan RGPD 3.17). Del navegador solo se toma la
// FIRMA tecleada. El servidor fija la fecha (`now()` de la RPC), el origen
// ('PORTAL': esta puerta es autoservicio de la socia), el texto (compuesto con
// los datos del estudio de la base, igual que el sello por compra) y apunta el
// evento con huella de la IP y user-agent (`aceptaciones_contrato_eventos`).
// El texto que traía la pantalla no se guarda: solo se anota si coincidía.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-socio', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    accion?: 'registrar' | 'actualizar';
    studioId?: string;
    id?: string;
    nombre?: string;
    telefono?: string;
    // `origen` NO se acepta del cliente: lo decide el servidor según por dónde
    // entró el alta (ver más abajo). Que el cliente pudiera declararse
    // 'MOSTRADOR' vaciaría de sentido la traza legal. Tampoco la fecha ni el
    // texto: se aceptan en el cuerpo por compatibilidad, pero no se guardan.
    aceptacion?: FirmaMinima;
    referidoPor?: string | null;
    origenLead?: string | null;
    cambios?: Record<string, unknown>;
    /** Invitada como instructora que ha pulsado «Entrar como alumna». */
    eligioAlumna?: boolean;
  } | null;

  if (!body?.studioId) return conCorsWidget(req, NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }));
  const studioId = body.studioId;

  const user = await verificarUsuarioSupabase(req);
  if (!user) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));

  /**
   * Valida la firma y compone el texto vigente. Devuelve la respuesta de error
   * si algo no cuadra, o lo necesario para sellar.
   */
  async function prepararAceptacion(ac: FirmaMinima | null | undefined) {
    // Sin firma completa no hay aceptación: fail-closed (ver `registrar`).
    if (!firmaCompleta(ac)) {
      return { respuesta: NextResponse.json({ error: 'Falta la aceptación del contrato (fecha, firma y versión)' }, { status: 400 }) };
    }
    const firma = normalizarFirma(ac.firma);
    if (!firma) {
      return { respuesta: NextResponse.json({ error: 'Escribe tu nombre para aceptar las condiciones.' }, { status: 400 }) };
    }
    const admin = getSupabaseAdmin();
    if (!admin) return { respuesta: NextResponse.json({ error: 'Servidor no configurado' }, { status: 500 }) };
    const texto = await textoContratoVigente(admin, studioId);
    if (!texto) return { respuesta: NextResponse.json({ error: 'Estudio no encontrado' }, { status: 400 }) };
    return { admin, firma, texto, textoCliente: ac.versionTexto };
  }

  try {
    // Alta de walk-in: autenticado por magic link pero aún sin ficha de socia.
    // El email lo pone el JWT (no el body) y se vincula auth_user_id.
    if (body.accion === 'registrar') {
      if (!body.id || !body.nombre) {
        return conCorsWidget(req, NextResponse.json({ error: 'Faltan datos de la socia' }, { status: 400 }));
      }

      // Una instructora del estudio NO se da de alta como alumna por esta vía
      // (la app del estudio es también la de la instructora, 14-sep-2026).
      // `acceso/verificar` lo intentaba en cuanto entraba: le firmaba el
      // consentimiento de ALUMNA y le ocupaba cupo del plan del estudio. Si
      // además quiere ser alumna, el estudio le crea la ficha y se vincula sola
      // al entrar (claim por email en `resolverSociaAutenticada`).
      //
      // Fail-CLOSED: sin cliente de administración no se puede comprobar, y un
      // fallo de la consulta lanza (→ `errorInterno`) en vez de dejar pasar el alta.
      const adminGuardia = getSupabaseAdmin();
      if (!adminGuardia) {
        return conCorsWidget(req, NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }));
      }
      if (!(await socioAutenticado(user.userId, body.studioId))) {
        const esInstructora = await instructoraActivaEnEstudio(adminGuardia, user.userId, body.studioId);
        // ⚠️ Y la que el estudio tiene dada de alta como instructora y aún no ha
        // entrado (15-sep-2026): su ficha existe pero no está unida a la cuenta,
        // así que la comprobación de arriba no la ve y se la daba de alta como
        // alumna sin preguntar. Ahora la app le deja elegir (`/acceso/elegir`),
        // y solo si ha elegido «alumna» pasa el alta. `eligioAlumna` viene del
        // cliente y está bien que así sea: solo quita ESTA pregunta, no la de
        // arriba ni ninguna otra. El correo es el del TOKEN; aquí no se une nada.
        const invitada = !esInstructora && body.eligioAlumna !== true
          && (await fichaInstructoraPendiente(adminGuardia, user.email, body.studioId)) !== null;
        if (esInstructora || invitada) {
          // Excepción: una ficha de alumna SIN VINCULAR con su email —compró como
          // invitada antes de tener cuenta—. Esa sí se deja adoptar a
          // `registrarSociaPublica`; si no, lo que pagó se quedaría huérfano.
          const { data: sinVincular, error: eSinVincular } = await adminGuardia
            .from('socios').select('id')
            .eq('studio_id', body.studioId).is('auth_user_id', null)
            .ilike('email', escaparLike(user.email.trim()))
            .limit(1);
          if (eSinVincular) throw eSinVincular;
          if (!sinVincular?.length) {
            return conCorsWidget(req, NextResponse.json(
              esInstructora
                ? { error: 'Esta cuenta es de una instructora del estudio.', code: 'ES_INSTRUCTORA' }
                : {
                  error: 'Te han invitado como instructora de este estudio. Abre el enlace del correo de invitación para entrar.',
                  code: 'INVITACION_INSTRUCTORA',
                },
              { status: 409 }));
          }
        }
      }

      // ⚠️ TRAZA LEGAL. `socios.aceptacion_origen` tiene un CHECK
      // ('PORTAL','MOSTRADOR') puesto por la migración 0109 citando el art. 7.1
      // del RGPD: hay que poder demostrar quién consintió y por qué vía.
      //
      // El origen lo fija el SERVIDOR, nunca el cliente: un alta que llega por
      // aquí es autoservicio de la propia alumna, así que es 'PORTAL'. El otro
      // valor, 'MOSTRADOR', solo lo escribe el panel.
      // Y si no viene la firma, el alta NO se hace: una traza a medias no prueba
      // nada. Es fail-closed a propósito: los tres llamantes vivos (el portal,
      // /reservar y el widget) ya la mandan.
      const prep = await prepararAceptacion(body.aceptacion);
      if ('respuesta' in prep) return conCorsWidget(req, prep.respuesta!);
      const { admin, firma, texto, textoCliente } = prep;
      // Valores del servidor desde el primer INSERT; la RPC de abajo los vuelve
      // a fijar y apunta el evento.
      const aceptacion = { fecha: new Date().toISOString(), firma, versionTexto: texto, origen: 'PORTAL' as const };

      // El tope de socias del plan lo comprueba `registrarSociaPublica`, pegado
      // al insert y DESPUÉS de su salida temprana por idempotencia.
      // ⚠️ EL REFERIDOR SE COMPRUEBA, y no es una cortesía: `socios.referido_por`
      // tiene clave foránea a `socios(id)`, así que un valor que no exista hace
      // fallar el INSERT y deja a la invitada SIN PODER DARSE DE ALTA. Se exige
      // además el MISMO estudio. Un referidor que no cuadra se descarta EN
      // SILENCIO: el alta nunca puede depender de que el enlace estuviera bien.
      let referidoPor: string | null = null;
      if (body.referidoPor) {
        const { data: quienInvita } = await admin
          .from('socios').select('id')
          .eq('id', body.referidoPor).eq('studio_id', studioId)
          .maybeSingle();
        referidoPor = quienInvita ? (quienInvita.id as string) : null;
      }

      const r = await registrarSociaPublica({
        studioId, id: body.id, nombre: body.nombre, email: user.email,
        telefono: body.telefono, authUserId: user.userId, aceptacion, referidoPor,
        origenLead: body.origenLead ?? null,
      });
      if ('error' in r) {
        // 403 para el tope de plan (lo distingue el portal), 400 para el resto.
        const status = 'code' in r && r.code === 'LIMITE_SOCIAS' ? 403 : 400;
        return conCorsWidget(req, NextResponse.json(r, { status }));
      }

      // Sello con historial. Si falla, se responde error: el reintento del
      // cliente cae en la rama idempotente de `registrarSociaPublica` y vuelve a
      // llegar aquí, así que la prueba se completa en vez de quedarse a medias.
      const socioId = ('socioId' in r && r.socioId) ? r.socioId : body.id;
      const sello = await registrarAceptacionContrato(admin, {
        studioId, socioId, origen: 'PORTAL', firma, texto, textoCliente,
        actorUid: user.userId, actorRol: 'SOCIA', evidencia: evidenciaDePeticion(req),
      });
      if (!sello.ok) {
        if (sello.causa) return conCorsWidget(req, errorInterno('public/socio:aceptacion', sello.causa, sello.error));
        return conCorsWidget(req, NextResponse.json({ error: sello.error }, { status: sello.status }));
      }
      return conCorsWidget(req, NextResponse.json(r));
    }

    // Acciones sobre una socia ya existente: su id sale del token, no del body.
    const socioId = await socioAutenticado(user.userId, studioId);
    if (!socioId) return conCorsWidget(req, NextResponse.json({ error: 'No autorizado' }, { status: 401 }));

    if (body.accion === 'actualizar') {
      const { aceptacionContrato, ...cambios } = body.cambios ?? {};

      // Firma del contrato de una socia que ya tenía ficha (/reservar,
      // `handleSignContract`). Antes `actualizarSociaPublica` guardaba la fecha
      // y el texto del navegador y dejaba el origen a NULL.
      if (aceptacionContrato != null) {
        const prep = await prepararAceptacion(aceptacionContrato as FirmaMinima);
        if ('respuesta' in prep) return conCorsWidget(req, prep.respuesta!);
        const sello = await registrarAceptacionContrato(prep.admin, {
          studioId, socioId, origen: 'PORTAL', firma: prep.firma, texto: prep.texto, textoCliente: prep.textoCliente,
          actorUid: user.userId, actorRol: 'SOCIA', evidencia: evidenciaDePeticion(req),
        });
        if (!sello.ok) {
          if (sello.causa) return conCorsWidget(req, errorInterno('public/socio:aceptacion', sello.causa, sello.error));
          return conCorsWidget(req, NextResponse.json({ error: sello.error }, { status: sello.status }));
        }
      }

      const r = await actualizarSociaPublica({ studioId, socioId, authUserId: user.userId, cambios });
      if ('error' in r) return conCorsWidget(req, NextResponse.json({ error: r.error }, { status: r.error === 'No autorizado' ? 401 : 400 }));
      return conCorsWidget(req, NextResponse.json(r));
    }
    return conCorsWidget(req, NextResponse.json({ error: 'Acción no válida' }, { status: 400 }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/socio:POST', err, 'No se ha podido procesar la operación.'));
  }
}
