'use client';

import { useCallback, useState } from 'react';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { useToast } from '@/components/student/ui/Toast';
import { useOnline } from '@/lib/student/useOnline';
import { useAsync } from '@/lib/student/useAsync';
import { descargarMisDatos, getMisDerechos, solicitarDerecho } from '@/lib/student/derechos';
import { PLAZO_SOLICITUD_DIAS, type TipoSolicitudDerechos } from '@/lib/socios/solicitudes-derechos';
import { fechaCortaEstudio } from '@/lib/utils';

// «Tus datos» en el Perfil de la alumna: sus derechos RGPD, en su app.
//
// Dos velocidades distintas a propósito (decisión de producto cerrada):
//   · DESCARGAR es al momento: son sus datos y no hace falta pedir permiso.
//   · ELIMINAR (o limitar/oponerse) es una SOLICITUD al estudio, que es quien
//     responde de esos datos y tiene hasta 30 días. La pantalla lo dice tal
//     cual, y dice también lo que NO se borra (facturas y recibos), en vez de
//     prometer un borrado total que la ley no permite.
//
// Componente propio y no filas sueltas en `perfil/page.tsx`: la página solo lo
// monta, para que otros cambios sobre el Perfil no choquen con este.

const TITULOS: Record<TipoSolicitudDerechos, string> = {
  supresion: '¿Pedir que eliminen tus datos?',
  limitacion: '¿Pedir que limiten el uso de tus datos?',
  oposicion: '¿Oponerte al uso de tus datos?',
};

function Explicacion({ tipo, estudio }: { tipo: TipoSolicitudDerechos; estudio: string }) {
  const p = { margin: '8px 0 0', fontSize: 'var(--t-small)', color: 'var(--muted-foreground)', lineHeight: 1.5 } as const;
  return (
    <div style={{ marginTop: 4 }}>
      <p style={p}>
        Se lo pediremos a {estudio}, que es quien decide sobre tus datos. Tiene un máximo de {PLAZO_SOLICITUD_DIAS} días
        para gestionarlo, y aquí verás que tu solicitud está en curso.
      </p>
      {tipo === 'supresion' && (
        <>
          <p style={p}>
            Se borrarán tu ficha, tus datos de salud y tus documentos, se cancelarán tus reservas futuras y tu
            suscripción, y tu cuenta dejará de funcionar.
          </p>
          <p style={p}>
            Las facturas y los recibos se conservan durante el tiempo que obliga la ley fiscal, sin usarse para nada más.
            Si quieres una copia antes, usa «Descargar mis datos».
          </p>
        </>
      )}
      {tipo === 'limitacion' && (
        <p style={p}>
          El estudio conservará tus datos pero dejará de usarlos mientras se revisa algo, por ejemplo si crees que
          alguno es incorrecto.
        </p>
      )}
      {tipo === 'oposicion' && (
        <p style={p}>
          El estudio dejará de usar tus datos para un fin concreto, como comunicaciones o análisis. Si solo quieres que
          no se usen para recomendaciones automáticas, puedes hacerlo al momento en Preferencias.
        </p>
      )}
    </div>
  );
}

export function MisDatos({ slug, nombreEstudio }: { slug: string; nombreEstudio: string }) {
  const { toast } = useToast();
  const { online } = useOnline();
  const cargar = useCallback(() => getMisDerechos(slug), [slug]);
  const { data, reintentar } = useAsync(cargar, () => false);
  const [descargando, setDescargando] = useState(false);
  const [pidiendo, setPidiendo] = useState<TipoSolicitudDerechos | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const enCursoDe = (tipo: TipoSolicitudDerechos) =>
    data?.solicitudes.find(s => s.tipo === tipo && s.estado === 'pendiente') ?? null;

  const descargar = async () => {
    if (descargando) return;
    if (!online) { toast('Necesitas conexión para descargar tus datos.'); return; }
    setDescargando(true);
    const r = await descargarMisDatos(slug);
    setDescargando(false);
    toast(r.ok ? 'Tus datos se han descargado.' : r.error);
  };

  const enviar = async () => {
    if (!pidiendo || enviando) return;
    if (!online) { toast('Necesitas conexión para enviar la solicitud.'); return; }
    setEnviando(true);
    const r = await solicitarDerecho(slug, pidiendo);
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    setPidiendo(null);
    toast(r.yaExistia ? 'Ya tenías esta solicitud en curso.' : `Solicitud enviada a ${nombreEstudio}.`);
    reintentar();
  };

  const supresion = enCursoDe('supresion');
  const otraEnCurso = enCursoDe('limitacion') ?? enCursoDe('oposicion');
  const enCurso = pidiendo ? enCursoDe(pidiendo) : null;

  return (
    <>
      <ProfileSection
        titulo="Tus datos"
        items={[
          { label: descargando ? 'Preparando tus datos…' : 'Descargar mis datos', onClick: () => void descargar() },
          { label: 'Limitar u oponerme al uso de mis datos', valor: otraEnCurso ? 'En curso' : undefined, onClick: () => setEligiendo(true) },
          { label: 'Solicitar la eliminación de mis datos', valor: supresion ? 'En curso' : undefined, onClick: () => setPidiendo('supresion'), destructivo: true },
        ]}
      />

      <Sheet open={eligiendo} onClose={() => setEligiendo(false)} label="Limitar u oponerme al uso de mis datos">
        <h3 className="t-h2" style={{ textAlign: 'center', marginBottom: 14 }}>¿Qué quieres pedir?</h3>
        <ProfileSection
          titulo="Elige una opción"
          items={[
            { label: 'Limitar el uso de mis datos', valor: enCursoDe('limitacion') ? 'En curso' : undefined, onClick: () => { setEligiendo(false); setPidiendo('limitacion'); } },
            { label: 'Oponerme al uso de mis datos', valor: enCursoDe('oposicion') ? 'En curso' : undefined, onClick: () => { setEligiendo(false); setPidiendo('oposicion'); } },
          ]}
        />
        <div style={{ marginTop: 10 }}>
          <Button variant="ghost" full onClick={() => setEligiendo(false)}>Volver</Button>
        </div>
      </Sheet>

      <ConfirmationDialog
        open={pidiendo !== null}
        onClose={() => { if (!enviando) setPidiendo(null); }}
        titulo={enCurso ? 'Tu solicitud está en curso' : pidiendo ? TITULOS[pidiendo] : ''}
        cuerpo={enCurso
          ? `La enviaste el ${fechaCortaEstudio(enCurso.solicitadaEn)}. ${nombreEstudio} tiene hasta el ${fechaCortaEstudio(enCurso.plazoHasta)} para gestionarla.`
          : undefined}
        confirmar={enCurso ? 'Entendido' : 'Enviar solicitud'}
        tono={!enCurso && pidiendo === 'supresion' ? 'danger' : 'primary'}
        loading={enviando}
        onConfirm={enCurso ? () => setPidiendo(null) : () => void enviar()}
      >
        {!enCurso && pidiendo && <Explicacion tipo={pidiendo} estudio={nombreEstudio} />}
      </ConfirmationDialog>
    </>
  );
}
