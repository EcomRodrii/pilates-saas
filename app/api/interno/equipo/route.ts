import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirAlguno, exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { esPermiso, type Permiso } from '@/lib/interno/permisos';
import { puedeDarDeAlta } from '@/lib/interno/equipo-reglas';
import { leerEquipo } from '@/lib/interno/equipo-server';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// El equipo interno. Hasta ahora dar de alta a alguien era SQL escrito a mano,
// lo que significaba que en la práctica no se hacía y que `users.create` /
// `users.delete` eran permisos declarados que no cerraban ninguna puerta.
//
// Las reglas de quién puede tocar el acceso de quién están en
// `lib/interno/equipo-reglas.ts`, probadas aparte. Aquí solo se cargan los
// datos, se aplican y se audita.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Basta con uno: quien da de alta y quien da de baja necesitan la misma lista.
  const g = await exigirAlguno(req, ['users.create', 'users.delete']);
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    return NextResponse.json({ equipo: await leerEquipo(db), yo: g.admin.userId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se ha podido cargar el equipo.' },
      { status: 500 },
    );
  }
}

interface CuerpoAlta {
  email?: string;
  nombre?: string;
  cargo?: string;
  permisos?: string[];
  /**
   * Contraseña inicial. Solo se usa si ese email NO tiene cuenta todavía: crea
   * la cuenta con ella para poder entregarle las credenciales a la persona.
   *
   * ⚠️ No se guarda, no se devuelve y NO se escribe en la auditoría — solo se
   * le pasa a gotrue, que la almacena hasheada. Lo que sí queda registrado es
   * que se creó una cuenta y quién la creó.
   */
  password?: string;
}

const MIN_PASSWORD = 8;

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'users.create');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as CuerpoAlta | null;
  const email = (cuerpo?.email ?? '').trim().toLowerCase();
  const nombre = (cuerpo?.nombre ?? '').trim();
  const cargo = (cuerpo?.cargo ?? '').trim() || null;
  const brutos = cuerpo?.permisos ?? [];

  if (!email.includes('@')) return NextResponse.json({ error: 'Escribe un email válido.' }, { status: 400 });
  if (nombre.length < 2) return NextResponse.json({ error: 'Escribe el nombre de la persona.' }, { status: 400 });

  // Un permiso desconocido no se ignora en silencio: se rechaza. Un typo que se
  // traga el servidor deja a alguien con menos acceso del que crees haberle dado.
  const desconocido = brutos.find(p => !esPermiso(p));
  if (desconocido) return NextResponse.json({ error: `"${desconocido}" no es un permiso.` }, { status: 400 });
  const permisos = brutos as Permiso[];
  if (permisos.length === 0) {
    return NextResponse.json({ error: 'Dale al menos un permiso: si no, entra y no ve nada.' }, { status: 400 });
  }

  const veredicto = puedeDarDeAlta(g.admin, permisos);
  if (!veredicto.ok) return NextResponse.json({ error: veredicto.motivo }, { status: 403 });

  const password = (cuerpo?.password ?? '').trim();

  const { data: existente, error: errUid } = await db.rpc('plataforma_uid_por_email', { p_email: email });
  if (errUid) return NextResponse.json({ error: 'No se ha podido buscar esa cuenta.' }, { status: 500 });

  let uid = existente as string | null;
  // Se crea la cuenta desde aquí. Antes había que decirle a la persona que
  // entrase primero en tentare.app y volver luego, lo que para dar de alta a
  // alguien de tu propio equipo es un ida y vuelta absurdo.
  let cuentaCreada = false;
  if (!uid) {
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json({
        error: `${email} no tiene cuenta todavía. Ponle una contraseña inicial de al menos `
          + `${MIN_PASSWORD} caracteres y se la creamos aquí mismo.`,
      }, { status: 400 });
    }

    // `email_confirm: true` porque quien da de alta responde de ese correo: si
    // no, la persona recibiría un correo de confirmación que no espera y no
    // podría entrar hasta pulsarlo, que es justo lo que se quiere evitar.
    const { data: creado, error: errCrear } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errCrear || !creado?.user) {
      const m = (errCrear?.message ?? '').toLowerCase();
      if (m.includes('already') || m.includes('registered')) {
        return NextResponse.json({ error: `Ya existe una cuenta con ${email}.` }, { status: 409 });
      }
      return NextResponse.json(
        { error: errCrear?.message || 'No se ha podido crear la cuenta.' },
        { status: 500 },
      );
    }
    uid = creado.user.id;
    cuentaCreada = true;
  }

  const equipo = await leerEquipo(db);
  if (equipo.some(m => m.userId === uid)) {
    return NextResponse.json({ error: `${email} ya está en el equipo interno.` }, { status: 409 });
  }

  // Si algo falla a partir de aquí y la cuenta la acabamos de crear, se
  // deshace: dejar una cuenta suelta en `auth.users` sin ficha de equipo es
  // una credencial válida que no aparece en ninguna pantalla.
  const deshacerCuenta = async () => {
    if (cuentaCreada && uid) await db.auth.admin.deleteUser(uid);
  };

  const { error: errAlta } = await db.from('plataforma_admin')
    .insert({ auth_user_id: uid, nombre, cargo });
  if (errAlta) {
    await deshacerCuenta();
    return NextResponse.json({ error: 'No se ha podido dar de alta.' }, { status: 500 });
  }

  const { error: errPerm } = await db.from('plataforma_permiso')
    .insert(permisos.map(p => ({ auth_user_id: uid, permiso: p, concedido_por: g.admin.userId })));
  if (errPerm) {
    // La ficha ya está creada y los permisos no. Se deshace en vez de dejar a
    // alguien dado de alta sin permisos: entraría al panel y no vería nada, y
    // el siguiente intento de alta chocaría con un 409 que no se entiende.
    await db.from('plataforma_admin').delete().eq('auth_user_id', uid);
    await deshacerCuenta();
    return NextResponse.json({ error: 'No se han podido conceder los permisos.' }, { status: 500 });
  }

  await registrar(db, req, {
    actor: g.admin,
    accion: cuentaCreada ? 'equipo.alta.cuenta_creada' : 'equipo.alta',
    objetivoTipo: 'plataforma_admin', objetivoId: uid as string,
    resumen: `${nombre} (${email}) entra al equipo con: ${permisos.join(', ')}`
      + (cuentaCreada ? ' · cuenta creada con contraseña puesta por quien da de alta' : ''),
    // Nunca la contraseña, ni siquiera enmascarada: la auditoría es de solo
    // añadir y no se puede limpiar después.
    antes: null, despues: { nombre, cargo, permisos, cuentaCreada },
  });

  return NextResponse.json({ ok: true, userId: uid, cuentaCreada });
}
