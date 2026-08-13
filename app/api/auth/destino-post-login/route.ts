import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';

// Único punto de decisión de "a dónde mando a esta cuenta tras iniciar
// sesión" — docs/NETWORK-AUDIT-2.md §2/§11. Antes esto no existía: cada
// pantalla de auth hacía su propio redirect duro, y /login siempre mandaba a
// /dashboard sin mirar si la cuenta tenía estudio de verdad. Una cuenta de
// Tentare Network (sin studio_id, sin fila en instructores) se quedaba en un
// skeleton infinito ahí — no un bug de UI, un bug de "a quién le pregunto".
//
// verificarSesionStaff ya es la respuesta correcta a "¿esta auth_user_id
// tiene un estudio de verdad?" (instructores O studios.owner_auth_user_id,
// lib/auth-server.ts) — no se reimplementa esa consulta aquí, solo se usa su
// resultado. Sin studio real, la única pantalla que le pertenece a esta
// cuenta es su perfil de Network: no hace falta distinguir "ya tiene fila en
// red_perfiles" de "todavía no" porque /network/mi-perfil ya sabe pintar un
// formulario vacío cuando no existe (fetchMiPerfilNetwork devuelve null).
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  const destino = sesion ? '/dashboard' : '/network/mi-perfil';
  return NextResponse.json({ destino });
}
