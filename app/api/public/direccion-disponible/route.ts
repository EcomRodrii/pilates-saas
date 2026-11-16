import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { baseDeDireccion, candidatasDireccion, resolverDireccion, NOMBRE_MAX_DIRECCION } from '@/lib/alta/direccion';

// ─────────────────────────────────────────────────────────────────────────────
// «¿Qué dirección le tocaría a un estudio con este nombre?» — SOLO LECTURA y
// pública: se pregunta ANTES de tener cuenta (el alta nueva, mientras se escribe
// el nombre). La cuenta de la cuenta la hace lib/alta/direccion.ts, la misma que
// `generateUniqueSlug` al crear el estudio.
//
// Qué enseña: solo la dirección que tocaría y si la base está cogida. Las
// direcciones de los estudios ya son públicas (`/portal/<slug>`), y no sale ni
// id, ni nombre, ni cuántos hay. Con límite por IP: sin él serviría para
// recorrer nombres. Cualquier fallo es `desconocido`: el alta no promete nada.
// ─────────────────────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'direccion-disponible', { max: 40, windowSeconds: 60 });
  if (limited) return limited;

  const nombre = req.nextUrl.searchParams.get('nombre') ?? '';
  if (!nombre.trim() || nombre.length > NOMBRE_MAX_DIRECCION * 2) return json({ error: 'Falta el nombre' }, 400);

  const base = baseDeDireccion(nombre);
  const admin = getSupabaseAdmin();
  if (!admin) return json(resolverDireccion(base, null));

  const { data, error } = await admin.from('studios').select('slug').in('slug', candidatasDireccion(base));
  if (error || !Array.isArray(data)) return json(resolverDireccion(base, null));
  return json(resolverDireccion(base, new Set(data.map((f) => String(f.slug)))));
}
