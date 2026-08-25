import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { buscarEstudiosPublicos, filtroEstudiosDesdeSearchParams } from '@/lib/network/publico-estudios';

// Primer endpoint público de búsqueda de Tentare Network (piezas 1a+1b de
// F3). Su hermano de instructoras (buscarPerfilesPublico,
// lib/network/publico.ts) NUNCA se sirvió sin sesión: la única versión con
// API route es app/api/network/buscar (verificarSesionStaff, panel de un
// estudio) — el marketplace público (/network/instructoras) llama a la
// función de datos DIRECTO desde el Server Component, sin pasar por fetch,
// por SEO (docs/NETWORK-AUDIT-2.md §11). Este SÍ es una API route pública
// porque no existía ninguna todavía en Network sin `verificarSesionStaff`/
// `verificarUsuarioSupabase` por delante — primitiva nueva para cualquier
// consumidor futuro (buscador con JS del lado cliente, integraciones)
// además de la SSR directa que ya usa app/network/estudios/page.tsx.
//
// Sin autenticación a propósito: mismas columnas que ya expone la ficha
// pública de estudio (lib/network/publico-estudios.ts), nada nuevo se
// filtra por quitar el guard de sesión.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const filtro = filtroEstudiosDesdeSearchParams(req.nextUrl.searchParams);
  const resultado = await buscarEstudiosPublicos(admin, filtro);
  if ('error' in resultado) return errorInterno('network:estudios:buscar-publico', resultado.error, 'No se han podido cargar los estudios.');

  return NextResponse.json({ estudios: resultado.estudios });
}
