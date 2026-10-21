import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { hoyEnEstudio } from '@/lib/utils';
import { desdeDeLaConsulta, filaDesdeBd, resumirActivacion, type FilaEmbudo } from '@/lib/alta/embudo';

// Activación de estudios nuevos: el embudo del alta y sus cohortes por semana
// (lib/alta/embudo.ts). `growth.read` («funnels de producto»), como las altas
// sin terminar; la puerta de /interno exige además el segundo factor (aal2).
//
// La RPC devuelve una fila por estudio, y de aquí solo sale el RESUMEN: ni ids,
// ni nombres, ni correos. Si la lectura falla se dice (500), nunca se pinta un
// cero: la pantalla enseña «Faltan datos».
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'growth.read');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const hoy = hoyEnEstudio(new Date());
  const { data, error } = await db.rpc('embudo_activacion_detalle', {
    p_desde: desdeDeLaConsulta(hoy),
    p_incluir_pruebas: false,
  });
  if (error || !Array.isArray(data)) {
    return NextResponse.json({ error: 'No se ha podido leer el embudo del alta' }, { status: 500 });
  }

  const filas = (data as unknown[]).map(filaDesdeBd).filter((f): f is FilaEmbudo => f !== null);
  return NextResponse.json(resumirActivacion(filas, hoy));
}
