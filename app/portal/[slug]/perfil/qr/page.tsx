'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getAlumna } from '@/lib/student/datos';
import { Button } from '@/components/student/ui/Button';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { CajaQr, useQrAcceso } from '@/components/student/domain/QrAcceso';

// Perfil → QR de acceso.
//
// Su QR personal y permanente: no cambia al reservar ni caduca. No lleva ningún
// dato suyo, solo un código que el estudio lee con su sesión; si puede entrar
// lo decide Tentare en ese momento, con su reserva real para esa clase.
//
// «Generar uno nuevo» existe para una captura que ha circulado o un móvil
// perdido: el anterior deja de valer en el acto.
export default function QrAccesoPage() {
  const { estudio } = useEstudio();
  const { estado, qr, reintentar, regenerar } = useQrAcceso(estudio.slug, estudio.qrAcceso === true);
  const cargarAlumna = useCallback(() => getAlumna(estudio.slug), [estudio.slug]);
  const { data: socia } = useAsync(cargarAlumna, (d) => !d);
  const [confirmar, setConfirmar] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const nombre = [socia?.nombre, socia?.apellidos].filter(Boolean).join(' ');

  const cambiar = async () => {
    setCambiando(true);
    const ok = await regenerar();
    setCambiando(false);
    setConfirmar(false);
    setAviso(ok ? 'Listo: este es tu QR nuevo. El anterior ya no funciona.' : 'No hemos podido cambiarlo. Inténtalo otra vez.');
  };

  return (
    <StudentShell>
      <PageHeader titulo="QR de acceso" back />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 14, maxWidth: 520, marginInline: 'auto' }}>
        {estado === 'apagado' ? (
          <div className="card card--pad-lg">
            <p className="t-card-title">Tu estudio no usa el acceso con QR</p>
            <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
              Al llegar, di tu nombre en recepción o a tu instructora.
            </p>
          </div>
        ) : (
          <>
            <section
              aria-label="Tu QR de acceso"
              className="a-pop"
              style={{
                background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)',
                borderRadius: 'var(--radius-hero)', padding: '22px 18px 20px', textAlign: 'center', boxShadow: 'var(--shadow-hero)',
              }}
            >
              <p className="t-label" style={{ color: 'var(--accent-deep-muted)', marginBottom: 14 }}>
                {estudio.nombre}
              </p>
              <CajaQr qr={qr} estado={estado} tamano={232} onReintentar={reintentar} />
              {nombre && (
                <p style={{ margin: '14px 0 0', fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', color: 'var(--on-dark)' }}>
                  {nombre}
                </p>
              )}
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-small)', fontWeight: 600, color: 'var(--accent-deep-muted)' }}>
                Muéstralo al llegar al estudio
              </p>
            </section>

            {aviso && (
              <p role="status" className="card" style={{ padding: '12px 14px', margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>
                {aviso}
              </p>
            )}

            <section className="card card--pad-lg">
              <p className="t-card-title">¿Para qué sirve este QR?</p>
              <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.55 }}>
                Tu QR permite al estudio comprobar rápidamente si tienes una clase reservada y si puedes acceder a ella.
                Muéstralo al llegar al estudio.
              </p>
              <p className="t-meta" style={{ marginTop: 8, lineHeight: 1.55 }}>
                Es siempre el mismo: no cambia cuando reservas. No lleva tus datos, solo un código que el estudio lee al escanearlo.
              </p>
            </section>

            <section className="card card--pad-lg">
              <p className="t-card-title">¿Has compartido una captura o has perdido el móvil?</p>
              <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.55 }}>
                Genera un QR nuevo. El de ahora dejará de funcionar en el acto.
              </p>
              <div style={{ marginTop: 12 }}>
                <Button variant="ghost" full onClick={() => { setAviso(null); setConfirmar(true); }} disabled={estado !== 'listo'}>
                  Generar un QR nuevo
                </Button>
              </div>
            </section>
          </>
        )}
      </div>

      <ConfirmationDialog
        open={confirmar}
        onClose={() => setConfirmar(false)}
        titulo="¿Generar un QR nuevo?"
        cuerpo="Tu QR actual dejará de funcionar. Si tienes una captura guardada, ya no servirá."
        confirmar="Generar QR nuevo"
        loading={cambiando}
        onConfirm={() => void cambiar()}
      />
    </StudentShell>
  );
}
