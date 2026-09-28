'use client';

// Escanear el QR de una alumna desde «Pasar lista», en la app del estudio.
//
// La instructora está en SU clase: la clase ya se sabe, no elige nada. Escanea →
// Tentare mira la reserva real de esa alumna para esta clase → 🟢/🟠/🔴. Si entra
// y la clase pasa lista, queda marcada y la lista de detrás se entera
// (`onAsistio`). Los textos son los mismos que ve recepción en el panel
// (lib/acceso/textos-acceso.ts); a ella no le llega ningún dato de dinero, ni la
// foto, ni «aprobar» (eso es del estudio), ni la puerta.
//
// Se monta solo con la hoja abierta: al cerrarla se desmonta y la cámara se
// apaga (useLectorQr la para al desmontar).

import { useCallback, useEffect, useState } from 'react';
import { useLectorQr } from '@/components/acceso/lector-qr';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { leerTokenQr } from '@/lib/acceso/qr-formato';
import {
  ETIQUETA_TIPO_ACCESO, TITULO_VEREDICTO, detallesAcceso, etiquetaEstadoReserva, explicacionAcceso,
} from '@/lib/acceso/textos-acceso';
import { decidirEscaneoEnClase, escanearQrEnClase } from '@/lib/student/datos-instructora';
import type { RespuestaDecision, RespuestaEscaneo } from '@/lib/acceso/escanear-servidor';

/** Un 🟢 se cierra solo para leer a la siguiente; un 🟠 o un 🔴 esperan a que lo lea. */
const CIERRE_PERMITIDO_MS = 4000;

const BANDA = {
  PERMITIDO: { fondo: 'var(--success)', icono: 'hecho' as const },
  REVISAR: { fondo: 'var(--warning-foreground)', icono: 'aviso' as const },
  DENEGADO: { fondo: 'var(--destructive-foreground)', icono: 'cerrar' as const },
};

export function EscanerQrClase({ slug, sesionId, onAsistio, onSesionCaducada }: {
  slug: string;
  sesionId: string;
  onAsistio: (reservaId: string) => void;
  onSesionCaducada: () => void;
}) {
  const [resultado, setResultado] = useState<RespuestaEscaneo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [decidiendo, setDecidiendo] = useState<'DEJAR_PASAR' | 'NO_PERMITIR' | null>(null);

  const escanear = useCallback(async (lectura: string) => {
    setEnviando(true);
    setError(null);
    const r = await escanearQrEnClase<RespuestaEscaneo>(slug, sesionId, lectura);
    setEnviando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { onSesionCaducada(); return; }
      setError(r.error);
      return;
    }
    setResultado(r.datos);
    if (r.datos.asistenciaMarcada && r.datos.reservaId) onAsistio(r.datos.reservaId);
  }, [slug, sesionId, onAsistio, onSesionCaducada]);

  const { videoRef, camara, encender, olvidarUltimo } = useLectorQr({
    pausado: resultado !== null || enviando,
    onLectura: (valor) => {
      // Solo van al servidor los QR de acceso de Tentare: el código de una caja
      // o de un cartel no es un intento de entrar.
      if (!leerTokenQr(valor)) {
        setError('Ese código no es un QR de acceso. Pídele que abra Perfil → QR de acceso en su app.');
        return;
      }
      void escanear(valor);
    },
  });

  const otra = useCallback(() => {
    setResultado(null);
    setError(null);
    olvidarUltimo();
  }, [olvidarUltimo]);

  useEffect(() => {
    if (resultado?.veredicto !== 'PERMITIDO' || resultado.motivo === 'YA_ENTRO') return;
    const id = setTimeout(otra, CIERRE_PERMITIDO_MS);
    return () => clearTimeout(id);
  }, [resultado, otra]);

  const decidir = async (decision: 'DEJAR_PASAR' | 'NO_PERMITIR') => {
    if (!resultado?.escaneoId) return;
    setDecidiendo(decision);
    setError(null);
    const r = await decidirEscaneoEnClase<RespuestaDecision>(slug, sesionId, resultado.escaneoId, decision);
    setDecidiendo(null);
    if (!r.ok) {
      if (r.sesionCaducada) { onSesionCaducada(); return; }
      setError(r.error);
      return;
    }
    const d = r.datos;
    setResultado(x => x && {
      ...x, ...d, acciones: [],
      estadoReserva: d.veredicto === 'PERMITIDO' ? (d.asistenciaMarcada ? 'ASISTIDA' : 'CONFIRMADA') : x.estadoReserva,
    });
    if (d.asistenciaMarcada && resultado.reservaId) onAsistio(resultado.reservaId);
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: 'var(--s-3)' }}>
      {resultado && <Resultado r={resultado} decidiendo={decidiendo} onDecidir={d => void decidir(d)} onOtra={otra} />}

      {error && (
        <div role="alert" className="note note--warn" style={{ margin: 0 }}>
          {error}
          <div style={{ marginTop: 8 }}>
            <Button variant="ghost" size="sm" onClick={otra}>Escanear otra</Button>
          </div>
        </div>
      )}

      <div
        style={{
          position: 'relative', width: '100%', maxWidth: 360, margin: '0 auto', aspectRatio: '1 / 1',
          borderRadius: 20, overflow: 'hidden', background: '#111',
        }}
      >
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {camara === 'activa' && !resultado && (
          <div aria-hidden style={{ position: 'absolute', inset: '18%', borderRadius: 24, border: '3px solid rgba(255,255,255,.85)' }} />
        )}
        {camara !== 'activa' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center', background: 'var(--muted)' }}>
            {camara === 'apagada' && <Button onClick={() => void encender()}>Encender la cámara</Button>}
            {camara === 'pidiendo' && <p className="t-meta">Pidiendo permiso…</p>}
            {camara === 'sin-permiso' && (
              <p className="t-meta" style={{ lineHeight: 1.5 }}>
                No hay permiso para usar la cámara. Actívalo en los ajustes del móvil, o márcala en la lista.
              </p>
            )}
          </div>
        )}
        {enviando && (
          <p style={{ position: 'absolute', left: 0, right: 0, bottom: 0, margin: 0, padding: '8px 0', textAlign: 'center', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 'var(--t-small)', fontWeight: 700 }}>
            Comprobando…
          </p>
        )}
      </div>
    </div>
  );
}

function Resultado({ r, decidiendo, onDecidir, onOtra }: {
  r: RespuestaEscaneo;
  decidiendo: 'DEJAR_PASAR' | 'NO_PERMITIR' | null;
  onDecidir: (d: 'DEJAR_PASAR' | 'NO_PERMITIR') => void;
  onOtra: () => void;
}) {
  // «Ya había entrado» se pinta en ámbar: un segundo escaneo de otra persona es
  // la pista de un QR prestado.
  const yaEntro = r.motivo === 'YA_ENTRO';
  const banda = BANDA[yaEntro ? 'REVISAR' : r.veredicto];
  const titulo = yaEntro ? 'Ya había entrado' : TITULO_VEREDICTO[r.veredicto];
  const datos = { clase: r.clase, otraClase: r.otraClase, plazaFija: r.plazaFija, yaEntroEn: r.yaEntroEn, avisos: r.avisos, claseEmpezada: r.claseEmpezada };
  const detalles = detallesAcceso(r.motivo, datos);
  const acciones = r.acciones.filter((a): a is 'DEJAR_PASAR' | 'NO_PERMITIR' => a === 'DEJAR_PASAR' || a === 'NO_PERMITIR');

  return (
    <section
      role="status"
      aria-live="assertive"
      data-testid="resultado-acceso"
      data-veredicto={r.veredicto}
      className="card"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div style={{ background: banda.fondo, color: '#fff', padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icono nombre={banda.icono} tamano={22} />
        <p style={{ margin: 0, fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.01em' }}>{titulo}</p>
      </div>
      <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)', padding: '13px 15px 15px' }}>
        {r.alumna && <p className="t-card-title" style={{ fontSize: 'var(--t-h3)' }}>{r.alumna.nombre}</p>}
        <p className="t-small" style={{ margin: 0, lineHeight: 1.5 }}>{explicacionAcceso(r.motivo, datos)}</p>
        {r.alumna && (
          <p className="t-meta" style={{ margin: 0 }}>
            {etiquetaEstadoReserva(r.estadoReserva)}
            {r.tipoAcceso ? ` · ${ETIQUETA_TIPO_ACCESO[r.tipoAcceso]}` : ''}
          </p>
        )}
        {detalles.map(d => <p key={d} className="t-small" style={{ margin: 0, fontWeight: 600 }}>{d}</p>)}
        {r.motivo === 'PENDIENTE_APROBACION' && (
          <p className="t-small t-dim" style={{ margin: 0 }}>Aprobarla es cosa del estudio: avísales si tiene que entrar.</p>
        )}
        {r.asistenciaMarcada && <p className="t-meta" style={{ margin: 0 }}>Marcada en la lista.</p>}
        {r.asistenciaAlTerminar && <p className="t-meta" style={{ margin: 0 }}>Esta clase no pasa lista: su asistencia se marca sola al terminar.</p>}
        {r.errorAsistencia && <p className="t-small" style={{ margin: 0, color: 'var(--destructive-foreground)', fontWeight: 700 }}>No se ha podido marcar: {r.errorAsistencia}</p>}

        {acciones.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {acciones.map(a => (
              <Button
                key={a}
                variant={a === 'DEJAR_PASAR' ? 'primary' : 'ghost'}
                full
                loading={decidiendo === a}
                disabled={decidiendo !== null}
                onClick={() => onDecidir(a)}
              >
                {a === 'DEJAR_PASAR' ? 'Dejar pasar' : 'No permitir acceso'}
              </Button>
            ))}
          </div>
        )}
        <Button variant={acciones.length ? 'ghost' : 'secondary'} full onClick={onOtra}>Escanear otra</Button>
      </div>
    </section>
  );
}
