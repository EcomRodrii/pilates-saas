import { ImageResponse } from 'next/og';
import { NextRequest, NextResponse } from 'next/server';
import { buscarCertificadoPorCodigo, nombreDeEstudio, urlVerificacion } from '@/lib/certificados/certificados';
import { certificadoJsx, CERTIFICADO_IMAGE_SIZE } from '@/lib/certificados/certificado-imagen';

export const dynamic = 'force-dynamic';

// La imagen PNG del certificado, pública (sin sesión): es lo que se descarga,
// se comparte e imprime. Solo sirve el certificado si está ACTIVO — uno
// revocado no debe poder seguir circulando como si fuera válido, aunque
// alguien ya tenga la URL guardada.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const certificado = await buscarCertificadoPorCodigo(codigo);
  if (!certificado || certificado.estado !== 'ACTIVE') {
    return NextResponse.json({ error: 'Certificado no disponible' }, { status: 404 });
  }

  const nombre = (await nombreDeEstudio(certificado.studioId)) ?? 'Estudio Tentare';

  return new ImageResponse(
    certificadoJsx({
      studioName: nombre,
      codigo: certificado.codigo,
      emitidoEnIso: certificado.emitidoEn,
      verifyUrl: urlVerificacion(certificado.codigo),
      esFounding: certificado.esFounding,
      foundingNumber: certificado.foundingNumber,
    }),
    CERTIFICADO_IMAGE_SIZE,
  );
}
