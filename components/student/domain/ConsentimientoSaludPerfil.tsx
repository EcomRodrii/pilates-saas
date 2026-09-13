'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import {
  leerConsentimientoSalud, revocarConsentimientoSalud, type ConsentimientoSaludAlumna,
} from '@/lib/student/consentimiento-salud';

// Consentimiento de datos de salud en el Perfil de la alumna: verlo y
// retirarlo (art. 7.3 RGPD, tan fácil retirarlo como darlo).
//
// Solo aparece si alguna vez lo dio. Explica sin adornos qué pasa al retirarlo:
// el estudio deja de ver esos datos (quedan BLOQUEADOS por la base de datos),
// pero no se borran — eso es una petición aparte. ⚠️ Bloquear o borrar es
// decisión legal pendiente; este texto describe lo que el producto hace hoy.

function fechaLarga(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
}

export function ConsentimientoSaludPerfil({ studioId, nombreEstudio, hrefMensajes }: {
  studioId: string;
  nombreEstudio: string;
  hrefMensajes: string;
}) {
  const [datos, setDatos] = useState<ConsentimientoSaludAlumna | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    leerConsentimientoSalud(studioId).then(d => { if (!cancelado) setDatos(d); });
    return () => { cancelado = true; };
  }, [studioId]);

  if (!datos || datos.estado === 'NO_CONSTA') return null;

  const retirar = async () => {
    setRetirando(true);
    setError(null);
    const ok = await revocarConsentimientoSalud(studioId);
    if (!ok) {
      setRetirando(false);
      setError('No hemos podido retirarlo. Inténtalo de nuevo.');
      return;
    }
    // Lo que se pinta después es lo que dice el servidor, no una suposición.
    const nuevo = await leerConsentimientoSalud(studioId);
    setRetirando(false);
    setConfirmar(false);
    setDatos(nuevo ?? { ...datos, estado: 'REVOCADO' });
  };

  const texto: React.CSSProperties = { margin: 0, fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 };

  return (
    <section>
      <p className="t-label" style={{ margin: '0 0 7px' }}>Datos de salud</p>
      <div className="card card--pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {datos.estado === 'VIGENTE' ? (
          <>
            <p style={texto}>
              Autorizaste a {nombreEstudio} a usar lo que le cuentas sobre tu salud (molestias, lesiones…)
              para adaptar tus clases{fechaLarga(datos.fecha) ? ` el ${fechaLarga(datos.fecha)}` : ''}.
            </p>
            {/* Enlace terciario, no rojo: vive en «Privacidad y datos» y no debe
                llamar la atención. El tono de peligro se queda en la hoja de
                confirmación, que es donde se decide. */}
            <button
              type="button"
              onClick={() => setConfirmar(true)}
              style={{ alignSelf: 'flex-start', minHeight: 44, padding: 0, border: 'none', background: 'none', textAlign: 'left', fontSize: 'var(--t-small)', fontWeight: 600, color: 'var(--muted-foreground)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              Retirar consentimiento de salud
            </button>
          </>
        ) : (
          <>
            <p style={texto}>
              Retiraste este consentimiento{fechaLarga(datos.revocadoEn) ? ` el ${fechaLarga(datos.revocadoEn)}` : ''}.
              {' '}{nombreEstudio} ya no puede ver tus datos de salud: están bloqueados, pero no se han borrado.
            </p>
            <p style={texto}>
              Si quieres que se eliminen, <Link href={hrefMensajes} style={{ fontWeight: 700, color: 'var(--foreground)' }}>escríbele al estudio</Link>.
              {' '}Si cambias de idea, puedes volver a autorizarlo en el estudio.
            </p>
          </>
        )}
      </div>

      <ConfirmationDialog
        open={confirmar}
        onClose={() => { if (!retirando) { setConfirmar(false); setError(null); } }}
        titulo="¿Retirar tu consentimiento de salud?"
        cuerpo={`${nombreEstudio} dejará de ver lo que le has contado sobre tu salud y no podrá tenerlo en cuenta al adaptar tus clases. Esos datos no se borran: quedan bloqueados. Si además quieres que se eliminen, pídeselo al estudio.`}
        confirmar="Retirar consentimiento"
        tono="danger"
        loading={retirando}
        onConfirm={() => void retirar()}
      >
        {error && (
          <p role="alert" style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 'var(--t-small)', color: 'var(--destructive)' }}>{error}</p>
        )}
      </ConfirmationDialog>
    </section>
  );
}
