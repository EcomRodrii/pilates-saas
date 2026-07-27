import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { esTipoEditable } from '@/lib/emails/plantillas-server';
import { renderPlantillaMuestra, resolverContextoEstudio } from '@/lib/emails/plantillas-preview';

// P2-11. Vista previa de una plantilla ANTES de guardarla: la propietaria
// escribía asunto/intro a ciegas y solo sabía si sonaba bien cuando una
// clienta real recibía el email. Renderiza el borrador tal cual está en el
// formulario (sin tocar la BD) con una socia y una clase de muestra.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json() as { tipo?: string; asunto?: string | null; intro?: string | null };
  if (!body.tipo || !esTipoEditable(body.tipo)) {
    return NextResponse.json({ error: 'Tipo de plantilla desconocido' }, { status: 400 });
  }

  const { nombre, marca } = await resolverContextoEstudio(sesion.studioId);
  const { html, subject } = await renderPlantillaMuestra(body.tipo, { asunto: body.asunto, intro: body.intro }, marca, nombre);
  return NextResponse.json({ html, subject });
}
