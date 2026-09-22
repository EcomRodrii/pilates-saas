import { CheckCircle2, ShieldX, Building2 } from 'lucide-react';
import { buscarCertificadoPorCodigo, nombreDeEstudio } from '@/lib/certificados/certificados';
import { IconoDesenlace } from '@/components/publico/icono-desenlace';

export const dynamic = 'force-dynamic';

// Verificación pública de un certificado «Tentare Verified Studio»: sin
// sesión, un solo lookup por código (mismo patrón que
// app/confirmar-reserva/[token]/page.tsx). Un certificado que no existe y uno
// REVOKED dan el MISMO mensaje de «no válido» — nunca «verificado» para lo
// que no lo es, sea cual sea el motivo.
export default async function VerificarCertificadoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const certificado = await buscarCertificadoPorCodigo(codigo);

  if (!certificado || certificado.estado !== 'ACTIVE') {
    return (
      <Aviso
        icono={ShieldX}
        titulo="Certificado no válido"
        texto={
          certificado
            ? 'Este certificado ha sido revocado y ya no es válido.'
            : 'No encontramos ningún certificado con ese número. Comprueba el enlace o el código QR.'
        }
      />
    );
  }

  const nombre = (await nombreDeEstudio(certificado.studioId)) ?? 'Estudio Tentare';
  const fecha = new Date(certificado.emitidoEn).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <IconoDesenlace icono={CheckCircle2} tono="exito" />
        <h1 className="text-lg font-semibold text-slate-900">Certificado verificado</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tentare Verified Studio</p>

        <div className="mt-6 flex flex-col items-center gap-1 rounded-xl bg-muted px-4 py-4">
          <Building2 size={18} className="text-muted-foreground" aria-hidden />
          <p className="text-base font-semibold text-foreground">{nombre}</p>
        </div>

        <dl className="mt-6 space-y-3 text-left text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Número de certificado</dt>
            <dd className="font-medium text-foreground">{certificado.codigo}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Fecha de emisión</dt>
            <dd className="font-medium text-foreground">{fecha}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Estado</dt>
            <dd className="font-semibold text-success">VÁLIDO</dd>
          </div>
        </dl>
      </div>
    </main>
  );
}

function Aviso({ icono, titulo, texto }: { icono: typeof ShieldX; titulo: string; texto: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full rounded-2xl bg-white p-8 text-center shadow-sm">
        <IconoDesenlace icono={icono} />
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
      </div>
    </main>
  );
}
