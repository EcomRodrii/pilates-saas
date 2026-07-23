import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { billingEnforced, bloqueoPorLimiteSocias } from '@/lib/billing/billing-guard';
import { emailValido, parsearFecha } from '@/lib/csv';
import { uid } from '@/lib/utils';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';

// Una importación con miles de filas hace varios lotes secuenciales de INSERT;
// damos margen sobre el default de Vercel para que no corte a medias.
export const maxDuration = 60;

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
  // Migración: 'YYYY-MM-DD' o null (el cliente ya parsea; el servidor revalida).
  fechaAlta?: string | null;
  direccion?: string | null;
  fechaNacimiento?: string | null;
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar miembros' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaEntrada[]; batchId?: string } | null;
  const filas = body?.rows;
  // Migración Mágica: si viene batchId válido, los ids creados se registran en
  // migracion_batches para poder deshacer esta ejecución exacta con un clic.
  const batchId = typeof body?.batchId === 'string' && RE_BATCH_ID.test(body.batchId) ? body.batchId : null;
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
    // Migración: preserva la fecha de alta original (antigüedad) si viene y es
    // válida; si no, "ahora". El servidor revalida el formato (no se fía del cliente).
    const fechaAlta = parsearFecha(f.fechaAlta) ?? ahora;
    const direccion = (f.direccion ?? '').trim() || null;
    const fechaNacimiento = parsearFecha(f.fechaNacimiento);
    paraInsertar.push({
      id: `soc-${uid()}`,
      studio_id: sesion.studioId, // autoridad: el estudio del JWT, no el del body
      nombre,
      apellidos, // '' permitido (columna NOT NULL, no acepta null)
      email,
      telefono: (f.telefono ?? '') === '' ? null : String(f.telefono).trim(),
      nif: (f.nif ?? '') === '' ? null : String(f.nif).trim(),
      fecha_alta: fechaAlta,
      fecha_nacimiento: fechaNacimiento,
      direccion,
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
      // Lo YA insertado antes del fallo queda registrado igualmente: el
      // deshacer debe cubrir también una ejecución que se detuvo a medias.
      if (batchId && importadas > 0) {
        await registrarIdsBatch(admin, {
          studioId: sesion.studioId, batchId, entidad: 'socios',
          ids: paraInsertar.slice(0, importadas).map(r => r.id as string),
        });
      }
      // Se dice CUÁNTAS entraron: si no, la usuaria no sabe si repetir la
      // importación le va a duplicar media cartera de clientas.
      return errorInterno('socios:import', error,
        `Se han importado ${importadas} clientes y el proceso se ha detenido ahí. `
        + 'Suele deberse a un email repetido en el archivo. Revísalo y vuelve a subirlo: '
        + 'los que ya están importados se detectan y no se duplican.',
        500,
        { importadas, duplicadas, errores },
      );
    }
    importadas += lote.length;
  }

  // batchAviso ≠ null: la importación es válida pero NO quedó cubierta por el
  // deshacer — la UI debe decirlo, nunca prometer un undo que no existe.
  const batchAviso = batchId && importadas > 0
    ? (await registrarIdsBatch(admin, {
        studioId: sesion.studioId, batchId, entidad: 'socios',
        ids: paraInsertar.map(r => r.id as string),
      })) ? null : 'No se pudo registrar el lote para deshacer'
    : null;

  return NextResponse.json({
    batchAviso,
    total: filas.length,
    importadas,
    duplicadas,
    errores,
  });
}
