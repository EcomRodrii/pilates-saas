import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { getValidAccessToken, listarContactosGmail } from '@/lib/gmail';
import { billingEnforced, bloqueoPorLimiteSocias } from '@/lib/billing/billing-guard';
import { uid } from '@/lib/utils';

// Trae los contactos con email de la libreta de Google del estudio y crea
// una clienta nueva por cada uno que NO coincida ya con un email existente
// — igual criterio de dedup que app/api/socios/import (case-insensitive,
// nunca sobrescribe una clienta ya existente, solo añade las que faltan).
// Un contacto de Gmail no es automáticamente "socia de pago"; se importa
// como clienta inactiva por defecto para no inflar recuentos de actividad
// con gente que solo estaba en la agenda personal.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const accessToken = await getValidAccessToken(sesion.studioId);
  if (!accessToken) {
    return NextResponse.json({ error: 'Este estudio no tiene Gmail conectado' }, { status: 400 });
  }

  let contactos;
  try {
    contactos = await listarContactosGmail(accessToken);
  } catch (err) {
    return errorInterno('gmail:sync-contacts:listar', err,
      'No se han podido leer los contactos de Gmail. Vuelve a conectar la cuenta desde Configuración → Integraciones.');
  }

  const { data: existentes, error: errLeer } = await admin
    .from('socios')
    .select('email')
    .eq('studio_id', sesion.studioId);
  if (errLeer) return errorInterno('gmail:sync-contacts:leer-socios', errLeer,
    'No se ha podido comprobar qué clientas ya existen.');

  const emailsBD = new Set((existentes ?? []).map((s) => (s.email ?? '').toLowerCase()));
  const vistos = new Set<string>();
  const ahora = new Date().toISOString();
  const paraInsertar = contactos
    .filter((c) => {
      if (emailsBD.has(c.email) || vistos.has(c.email)) return false;
      vistos.add(c.email);
      return true;
    })
    .map((c) => ({
      id: `soc-${uid()}`,
      studio_id: sesion.studioId,
      nombre: c.nombre,
      apellidos: c.apellidos,
      email: c.email,
      telefono: null,
      nif: null,
      fecha_alta: ahora,
      fecha_nacimiento: null,
      direccion: null,
      // Inactiva por defecto: viene de la agenda personal, no de un alta real
      // del estudio — que aparezca en listados de "clientas activas" sería
      // engañoso hasta que alguien la active a mano.
      activo: false,
      tags: ['gmail'],
    }));

  if (billingEnforced() && paraInsertar.length > 0) {
    const { count: activasActuales } = await admin
      .from('socios')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', sesion.studioId)
      .eq('activo', true)
      .is('borrado_en', null);
    const bloqueoLimite = await bloqueoPorLimiteSocias(sesion.studioId, activasActuales ?? 0, paraInsertar.length);
    if (bloqueoLimite) return bloqueoLimite;
  }

  let creadas = 0;
  const LOTE = 500;
  for (let i = 0; i < paraInsertar.length; i += LOTE) {
    const lote = paraInsertar.slice(i, i + LOTE);
    const { error } = await admin.from('socios').insert(lote);
    if (error) {
      return errorInterno('gmail:sync-contacts:insertar', error,
        `Se han importado ${creadas} clientas y el proceso se ha detenido ahí.`, 500, { creadas });
    }
    creadas += lote.length;
  }

  return NextResponse.json({
    ok: true,
    total: contactos.length,
    creadas,
    yaExistian: contactos.length - paraInsertar.length,
  });
}
