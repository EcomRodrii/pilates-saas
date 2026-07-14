import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { billingEnforced, bloqueoPorLimiteSocias } from '@/lib/billing-guard';
import { emailValido } from '@/lib/csv';
import { uid } from '@/lib/utils';

// Importación masiva de socias desde CSV. Autenticada (JWT de staff), scopeada al
// estudio de la sesión (NO se fía del body para el studio_id), con dedup contra
// los emails ya existentes del estudio. Solo PROPIETARIO y RECEPCION.

const MAX_FILAS = 5000;
const LOTE = 500;

interface FilaEntrada {
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string | null;
  nif?: string | null;
  tags?: string[];
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar miembros' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaEntrada[] } | null;
  const filas = body?.rows;
  if (!Array.isArray(filas)) {
    return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  }
  if (filas.length === 0) {
    return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  }
  if (filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });
  }

  // Emails ya existentes en el estudio (dedup case-insensitive).
  const { data: existentes, error: errLeer } = await admin
    .from('socios')
    .select('email')
    .eq('studio_id', sesion.studioId);
  if (errLeer) {
    return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });
  }
  const emailsBD = new Set((existentes ?? []).map((s) => (s.email ?? '').toLowerCase()));

  const errores: { fila: number; email: string; motivo: string }[] = [];
  const vistosEnLote = new Set<string>();
  const paraInsertar: Record<string, unknown>[] = [];
  const ahora = new Date().toISOString();
  let duplicadas = 0;

  filas.forEach((f, i) => {
    const numFila = i + 1;
    const nombre = (f.nombre ?? '').trim();
    const apellidos = (f.apellidos ?? '').trim();
    const emailRaw = (f.email ?? '').trim();
    const email = emailRaw.toLowerCase();

    if (!nombre) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'Falta el nombre' });
      return;
    }
    if (!emailRaw || !emailValido(emailRaw)) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'Email no válido' });
      return;
    }
    if (emailsBD.has(email) || vistosEnLote.has(email)) {
      duplicadas++;
      return;
    }
    vistosEnLote.add(email);

    const tags = Array.isArray(f.tags) ? f.tags.map((t) => String(t).trim()).filter(Boolean) : [];
    paraInsertar.push({
      id: `soc-${uid()}`,
      studio_id: sesion.studioId, // autoridad: el estudio del JWT, no el del body
      nombre,
      apellidos, // '' permitido (columna NOT NULL, no acepta null)
      email,
      telefono: (f.telefono ?? '') === '' ? null : String(f.telefono).trim(),
      nif: (f.nif ?? '') === '' ? null : String(f.nif).trim(),
      fecha_alta: ahora,
      activo: true,
      tags,
    });
  });

  // R7: no superar el tope de socias del plan. Solo contamos si el enforcement
  // está activo (evita un COUNT extra en el caso normal, apagado).
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

  // Inserta por lotes para no exceder límites de payload.
  let importadas = 0;
  for (let i = 0; i < paraInsertar.length; i += LOTE) {
    const lote = paraInsertar.slice(i, i + LOTE);
    const { error } = await admin.from('socios').insert(lote);
    if (error) {
      return NextResponse.json(
        {
          error: `Error al insertar (lote ${Math.floor(i / LOTE) + 1}): ${error.message}`,
          importadas, // las de lotes anteriores sí entraron
          duplicadas,
          errores,
        },
        { status: 500 },
      );
    }
    importadas += lote.length;
  }

  return NextResponse.json({
    total: filas.length,
    importadas,
    duplicadas,
    errores,
  });
}
