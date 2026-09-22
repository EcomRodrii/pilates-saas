'use client';

import { useEffect, useState } from 'react';
import { Award, Download, ExternalLink, Loader2, ShieldOff } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { btnPrimary, btnSecondary } from '@/components/configuracion/estilos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BotonCopiar, useOrigen } from '@/components/configuracion/tab-estudio-enlaces';

// El cajón «Certificado Tentare Verified Studio»: generarlo, descargar su
// imagen, copiar el enlace de verificación pública y revocarlo. Un estudio
// solo tiene un certificado activo a la vez (lo garantiza también la base de
// datos, no solo esta pantalla) — «generar» de nuevo con uno ya activo
// simplemente lo vuelve a mostrar, no crea uno segundo.

interface CertificadoApi {
  codigo: string;
  estado: 'ACTIVE' | 'REVOKED';
  emitidoEn: string;
  urlVerificacion: string;
}

export function FormCertificado({ showToast }: { showToast: (m: string) => void }) {
  const origen = useOrigen();
  const [certificado, setCertificado] = useState<CertificadoApi | null | undefined>(undefined);
  const [generando, setGenerando] = useState(false);
  const [revocando, setRevocando] = useState(false);
  const [confirmarRevocar, setConfirmarRevocar] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const res = await fetch('/api/certificados', { headers: await authHeader() });
      const data = await res.json().catch(() => null);
      if (vivo) setCertificado(res.ok ? (data?.certificado ?? null) : null);
    })();
    return () => { vivo = false; };
  }, []);

  async function generar() {
    setGenerando(true);
    try {
      const res = await fetch('/api/certificados', { method: 'POST', headers: await authHeader() });
      const data = await res.json().catch(() => null);
      if (!res.ok) { showToast(data?.error ?? 'No se ha podido generar el certificado'); return; }
      setCertificado(data.certificado);
      showToast('Certificado generado');
    } finally {
      setGenerando(false);
    }
  }

  async function revocar() {
    if (!certificado) return;
    setRevocando(true);
    try {
      const res = await fetch(`/api/certificados/${encodeURIComponent(certificado.codigo)}/revocar`, {
        method: 'POST',
        headers: await authHeader(),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { showToast(data?.error ?? 'No se ha podido revocar el certificado'); return; }
      setCertificado(prev => (prev ? { ...prev, estado: 'REVOKED' } : prev));
      showToast('Certificado revocado');
    } finally {
      setRevocando(false);
      setConfirmarRevocar(false);
    }
  }

  if (certificado === undefined) {
    return <p className="pb-6 text-sm text-muted-foreground">Cargando…</p>;
  }

  const activo = certificado?.estado === 'ACTIVE';
  const imagenUrl = certificado ? `/api/certificados/${encodeURIComponent(certificado.codigo)}/imagen` : null;

  return (
    <div className="flex flex-col gap-6 pb-6">
      {!certificado && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Award size={28} className="text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground text-pretty">
            Genera el certificado oficial que acredita que tu estudio está digitalizado y operativo en Tentare. Podrás
            descargarlo, imprimirlo y compartirlo.
          </p>
          <button type="button" onClick={() => void generar()} disabled={generando} className={btnPrimary}>
            {generando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Award size={16} aria-hidden />}
            Generar certificado
          </button>
        </div>
      )}

      {certificado && (
        <div className="flex flex-col gap-4">
          {imagenUrl && activo && (
            // eslint-disable-next-line @next/next/no-img-element -- imagen generada dinámicamente (ImageResponse), no un asset estático de Next.
            <img
              src={imagenUrl}
              alt={`Certificado Tentare Verified Studio, número ${certificado.codigo}`}
              className="w-full rounded-xl border border-border"
            />
          )}

          <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border px-4 py-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Certificado nº</dt>
              <dd className="font-medium text-foreground">{certificado.codigo}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Estado</dt>
              <dd className={activo ? 'font-medium text-success' : 'font-medium text-muted-foreground'}>
                {activo ? 'Activo' : 'Revocado'}
              </dd>
            </div>
          </dl>

          {activo ? (
            <>
              <div className="flex flex-wrap gap-2">
                <a href={imagenUrl ?? '#'} download={`${certificado.codigo}.png`} className={btnSecondary}>
                  <Download size={14} aria-hidden /> Descargar imagen
                </a>
                <BotonCopiar texto={certificado.urlVerificacion} que="El enlace de verificación" showToast={showToast} />
                <a href={certificado.urlVerificacion} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                  Ver verificación <ExternalLink size={14} aria-hidden />
                </a>
              </div>
              <button
                type="button"
                onClick={() => setConfirmarRevocar(true)}
                className="inline-flex w-fit items-center gap-1.5 text-sm text-destructive hover:underline"
              >
                <ShieldOff size={14} aria-hidden /> Revocar certificado
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-pretty">
              Este certificado ya no es válido. La página de verificación ({origen}/verify/{certificado.codigo}) lo
              muestra como no válido.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmarRevocar}
        onOpenChange={setConfirmarRevocar}
        titulo="¿Revocar el certificado?"
        descripcion="Dejará de ser válido de inmediato: quien compruebe el enlace o el QR verá «Certificado no válido». No se puede deshacer."
        textoConfirmar={revocando ? 'Revocando…' : 'Revocar'}
        destructivo
        onConfirm={() => void revocar()}
      />
    </div>
  );
}
