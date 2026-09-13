'use client';

import { useCallback, useState } from 'react';
import { ProfileSection } from '@/components/student/domain/ProfileSection';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { Input } from '@/components/student/ui/Input';
import { useToast } from '@/components/student/ui/Toast';
import { useOnline } from '@/lib/student/useOnline';
import { useAsync } from '@/lib/student/useAsync';
import { descargarMisDatos, getMisDerechos, solicitarDerecho } from '@/lib/student/derechos';
import { coincideFraseEliminacion, FRASE_CONFIRMACION_ELIMINACION } from '@/lib/student/confirmacion-eliminacion';
import { PLAZO_SOLICITUD_DIAS, type TipoSolicitudDerechos } from '@/lib/socios/solicitudes-derechos';
import { fechaCortaEstudio } from '@/lib/utils';

// Derechos RGPD de la alumna, en «Perfil → Privacidad y datos».
//
// Dos velocidades distintas a propósito (decisión de producto cerrada):
//   · DESCARGAR es al momento: son sus datos y no hace falta pedir permiso.
//   · ELIMINAR (o limitar/oponerse) es una SOLICITUD al estudio, que es quien
//     responde de esos datos y tiene hasta 30 días. La pantalla lo dice tal
//     cual, y dice también lo que NO se borra (facturas y recibos), en vez de
//     prometer un borrado total que la ley no permite.
//
// Dos componentes y no uno: la descarga va PRIMERO y a la vista, y las
// solicitudes van después, como enlaces discretos, con el consentimiento de
// salud en medio. Ya no se pintan en el Perfil: estaban demasiado a mano para
// algo que no se hace nunca por accidente — y eliminar pide además escribir la
// frase de confirmación.

const TITULOS: Record<TipoSolicitudDerechos, string> = {
  supresion: '¿Pedir que eliminen tus datos?',
  limitacion: '¿Pedir que limiten el uso de tus datos?',
  oposicion: '¿Oponerte al uso de tus datos?',
};

/** Enlace terciario: ni color primario ni destructivo, pero 44 px de zona táctil. */
const TERCIARIO: React.CSSProperties = {
  minHeight: 44, padding: 0, border: 'none', background: 'none', textAlign: 'left',
  fontSize: 'var(--t-small)', fontWeight: 600, color: 'var(--muted-foreground)',
  textDecoration: 'underline', textUnderlineOffset: 3,
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

export function DescargarMisDatos({ slug, nombreEstudio }: { slug: string; nombreEstudio: string }) {
  const { toast } = useToast();
  const { online } = useOnline();
  const [descargando, setDescargando] = useState(false);

  const descargar = async () => {
    if (descargando) return;
    if (!online) { toast('Necesitas conexión para descargar tus datos.'); return; }
    setDescargando(true);
    const r = await descargarMisDatos(slug);
    setDescargando(false);
    toast(r.ok ? 'Tus datos se han descargado.' : r.error);
  };

  return (
    <div>
      <ProfileSection
        titulo="Tus datos"
        items={[{ label: descargando ? 'Preparando tus datos…' : 'Descargar mis datos', onClick: () => void descargar() }]}
      />
      <p className="t-meta" style={{ margin: '7px 2px 0', lineHeight: 1.5 }}>
        Una copia de tus datos en {nombreEstudio}, al momento y en un archivo.
      </p>
    </div>
  );
}

export function SolicitudesDerechos({ slug, nombreEstudio }: { slug: string; nombreEstudio: string }) {
  const { toast } = useToast();
  const { online } = useOnline();
  const cargar = useCallback(() => getMisDerechos(slug), [slug]);
  const { data, reintentar } = useAsync(cargar, () => false);
  const [pidiendo, setPidiendo] = useState<TipoSolicitudDerechos | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [frase, setFrase] = useState('');

  const enCursoDe = (tipo: TipoSolicitudDerechos) =>
    data?.solicitudes.find(s => s.tipo === tipo && s.estado === 'pendiente') ?? null;

  // La frase se vacía al abrir y al cerrar: volver a la hoja no puede
  // encontrársela ya escrita y el botón ya activo.
  const abrir = (tipo: TipoSolicitudDerechos) => { setFrase(''); setPidiendo(tipo); };
  const cerrar = () => { setPidiendo(null); setFrase(''); };

  const supresion = enCursoDe('supresion');
  const otraEnCurso = enCursoDe('limitacion') ?? enCursoDe('oposicion');
  const enCurso = pidiendo ? enCursoDe(pidiendo) : null;
  const pideFrase = !enCurso && pidiendo === 'supresion';
  const fraseOk = coincideFraseEliminacion(frase);

  const enviar = async () => {
    if (!pidiendo || enviando) return;
    if (pideFrase && !fraseOk) return;
    if (!online) { toast('Necesitas conexión para enviar la solicitud.'); return; }
    setEnviando(true);
    const r = await solicitarDerecho(slug, pidiendo, pidiendo === 'supresion' ? frase : undefined);
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    cerrar();
    toast(r.yaExistia ? 'Ya tenías esta solicitud en curso.' : `Solicitud enviada a ${nombreEstudio}.`);
    reintentar();
  };

  return (
    <section>
      <p className="t-label" style={{ margin: '0 0 7px' }}>Otras solicitudes</p>
      <p className="t-meta" style={{ margin: 0, lineHeight: 1.5 }}>
        Se las enviamos a {nombreEstudio}, que tiene hasta {PLAZO_SOLICITUD_DIAS} días para gestionarlas.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop: 4 }}>
        <button type="button" style={TERCIARIO} onClick={() => setEligiendo(true)}>
          Limitar u oponerme al uso de mis datos{otraEnCurso ? ' · En curso' : ''}
        </button>
        <button type="button" style={TERCIARIO} onClick={() => abrir('supresion')}>
          Solicitar la eliminación de mis datos{supresion ? ' · En curso' : ''}
        </button>
      </div>

      <Sheet open={eligiendo} onClose={() => setEligiendo(false)} label="Limitar u oponerme al uso de mis datos">
        <h3 className="t-h2" style={{ textAlign: 'center', marginBottom: 14 }}>¿Qué quieres pedir?</h3>
        <ProfileSection
          titulo="Elige una opción"
          items={[
            { label: 'Limitar el uso de mis datos', valor: enCursoDe('limitacion') ? 'En curso' : undefined, onClick: () => { setEligiendo(false); abrir('limitacion'); } },
            { label: 'Oponerme al uso de mis datos', valor: enCursoDe('oposicion') ? 'En curso' : undefined, onClick: () => { setEligiendo(false); abrir('oposicion'); } },
          ]}
        />
        <div style={{ marginTop: 10 }}>
          <Button variant="ghost" full onClick={() => setEligiendo(false)}>Volver</Button>
        </div>
      </Sheet>

      <ConfirmationDialog
        open={pidiendo !== null}
        onClose={() => { if (!enviando) cerrar(); }}
        titulo={enCurso ? 'Tu solicitud está en curso' : pidiendo ? TITULOS[pidiendo] : ''}
        cuerpo={enCurso
          ? `La enviaste el ${fechaCortaEstudio(enCurso.solicitadaEn)}. ${nombreEstudio} tiene hasta el ${fechaCortaEstudio(enCurso.plazoHasta)} para gestionarla.`
          : undefined}
        confirmar={enCurso ? 'Entendido' : 'Enviar solicitud'}
        tono={pideFrase ? 'danger' : 'primary'}
        loading={enviando}
        deshabilitado={pideFrase && !fraseOk}
        onConfirm={enCurso ? cerrar : () => void enviar()}
      >
        {!enCurso && pidiendo && <Explicacion tipo={pidiendo} estudio={nombreEstudio} />}
        {pideFrase && (
          <div style={{ marginTop: 14 }}>
            <Input
              label={`Escribe «${FRASE_CONFIRMACION_ELIMINACION}» para confirmar`}
              hint="Da igual con o sin tildes."
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
            />
          </div>
        )}
      </ConfirmationDialog>
    </section>
  );
}
