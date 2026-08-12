'use client';

// Cronómetro de la sesión guiada — se llega tras reservar una clase
// (ClaseDetallePage, botón "Empezar la sesión guiada", solo con
// miReserva.estado === 'CONFIRMADA'). Pantalla propia, no un estado local de
// esa página: da botón atrás nativo gratis y permite ocultar la tab bar del
// portal (ver isFullscreen en components/portal/portal-shell.tsx) sin
// gestionar overlay/z-index a mano.
//
// 100% cliente: sin servidor, sin persistencia, sin tocar Vídeos/VOD (ver
// lib/sesion-guiada.ts) — reinicia desde el primer ejercicio cada vez que se
// entra, igual que un temporizador HIIT cualquiera.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { ChevronLeft, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { EJERCICIOS_SESION_GUIADA, esUltimoEjercicio, saltarEjercicio, progresoEjercicio } from '@/lib/sesion-guiada';
import { imagenDeClase, alFallarImagen, IMAGENES_CLASE } from '@/lib/imagenes-por-defecto';

export default function SesionGuiadaPage() {
  const router = useRouter();
  const { sesionId } = useParams<{ slug: string; sesionId: string }>();
  const { sesiones, tiposClase } = useStudio();
  const { t } = useModo();

  const ses = sesiones.find(s => s.id === sesionId);
  const tipo = ses ? tiposClase.find(x => x.id === ses.tipoClaseId) : undefined;

  const [ejercicio, setEjercicio] = useState(0);
  const [seg, setSeg] = useState(EJERCICIOS_SESION_GUIADA[0].segundos);
  const [corriendo, setCorriendo] = useState(true);

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => {
      setSeg(s => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [corriendo]);

  function saltar(delta: number) {
    const i = saltarEjercicio(ejercicio, delta);
    setEjercicio(i);
    setSeg(EJERCICIOS_SESION_GUIADA[i].segundos);
  }

  const actual = EJERCICIOS_SESION_GUIADA[ejercicio];
  const esUltimo = esUltimoEjercicio(ejercicio);

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: t.bg }}>
      <div style={{ position: 'relative', height: 260, flexShrink: 0, overflow: 'hidden', background: t.surface2 }}>
        {/* Misma foto que la cabecera del detalle: la del tipo de clase, o la
            de su familia si la propietaria no ha subido ninguna. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagenDeClase(tipo)}
          alt=""
          onError={alFallarImagen(IMAGENES_CLASE.generica)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.15) 40%, rgba(0,0,0,.55))' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 0' }}>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Salir de la sesión guiada"
            style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
          >
            <ChevronLeft size={18} style={{ color: '#fff' }} />
          </button>
          <p style={{ color: '#fff', fontSize: 14, fontWeight: 800, textAlign: 'center' }}>{tipo?.nombre ?? 'Sesión guiada'}</p>
          <span style={{ width: 36 }} aria-hidden />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: t.muted }}>
          Ejercicio {ejercicio + 1} de {EJERCICIOS_SESION_GUIADA.length}
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 8 }}>{actual.nombre}</h1>
        <p style={{ fontSize: 40, fontWeight: 800, color: t.ink, marginTop: 18, letterSpacing: '-0.03em' }}>
          00:{String(seg).padStart(2, '0')}
        </p>
        <div style={{ marginTop: 14, height: 6, width: '100%', maxWidth: 280, borderRadius: 999, background: t.line, overflow: 'hidden' }}>
          <span
            aria-hidden
            style={{ display: 'block', width: `${progresoEjercicio(ejercicio, seg)}%`, height: '100%', borderRadius: 999, background: 'var(--portal-brand)', transition: 'width 1s linear' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 32 }}>
          <button
            type="button"
            onClick={() => saltar(-1)}
            disabled={ejercicio === 0}
            aria-label="Ejercicio anterior"
            style={{ width: 48, height: 48, borderRadius: 999, background: t.surface2, color: t.ink, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: ejercicio === 0 ? 0.4 : 1 }}
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            type="button"
            onClick={() => setCorriendo(c => !c)}
            aria-label={corriendo ? 'Pausar' : 'Reanudar'}
            style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {corriendo ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          {esUltimo ? (
            <button
              type="button"
              onClick={() => router.back()}
              style={{ height: 48, padding: '0 20px', borderRadius: 999, background: t.surface2, color: t.ink, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
            >
              Terminar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => saltar(1)}
              aria-label="Siguiente ejercicio"
              style={{ width: 48, height: 48, borderRadius: 999, background: t.surface2, color: t.ink, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
