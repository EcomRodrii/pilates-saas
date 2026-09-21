'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Icono } from '@/components/student/ui/Icono';
import { fichar, type EstadoFichaje } from '@/lib/student/datos-fichaje';

// «Fichar»: entrada y salida de la jornada.
//
// Solo se da por hecho lo que el servidor confirma: el estado que se pinta es el
// que devuelve cada llamada, nunca una suposición local. El botón se bloquea
// mientras hay una petición en vuelo (el doble clic ya lo absorbe el servidor,
// esto evita además dos avisos).

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
const duracion = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;

export default function FichajePage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);

  const cargar = useCallback(async () => {
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    if (!esInstructora) return new Promise<never>(() => {});
    return (await fichar(estudio.slug, 'estado')).estado;
  }, [esInstructora, estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);
  const [propio, setPropio] = useState<EstadoFichaje | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState<number | null>(null);
  const actual = propio ?? data;

  useEffect(() => {
    const tick = () => setAhora(Date.now());
    const primero = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => { clearTimeout(primero); clearInterval(t); };
  }, []);

  const accion = async (a: 'entrada' | 'salida') => {
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await fichar(estudio.slug, a);
      setPropio(r.estado);
      if (a === 'entrada') toast(r.yaAbierta ? 'Ya tenías la jornada abierta' : 'Entrada registrada');
      else toast(r.yaCerrada ? 'Ya tenías la jornada cerrada' : `Salida registrada · ${duracion(r.minutos ?? 0)}`);
    } catch {
      toast('No hemos podido registrarlo. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const abierta = actual?.abierta ?? null;
  const transcurrido = abierta && ahora ? Math.max(0, Math.round((ahora - Date.parse(abierta.checkInAt)) / 60_000)) : 0;
  const cerradoHoy = actual?.hoy.minutosCerrados ?? 0;
  const jornadasHoy = actual?.hoy.jornadasCerradas ?? 0;
  const proxima = actual?.proxima ?? null;
  const minutosHasta = proxima && ahora ? Math.round((Date.parse(proxima.inicio) - ahora) / 60_000) : null;
  const recordar = !abierta && proxima && minutosHasta != null && minutosHasta <= (actual?.ventanaMinutos ?? 10);
  const revisar = Boolean(abierta?.requiereRevision);
  const pastilla = revisar
    ? { texto: 'Revisa tu salida', color: 'var(--warning)' }
    : abierta ? { texto: 'Jornada abierta', color: 'var(--success)' }
      : { texto: jornadasHoy > 0 ? 'Jornada cerrada' : 'Sin fichar', color: 'var(--subtle-foreground)' };

  return (
    <StudentShell modo="instructora">
      <PageHeader titulo="Fichar" sub={`Tu registro de jornada en ${estudio.nombre}`} back />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 14, maxWidth: 560 }}>
        {estado === 'loading' && !actual && <ListSkeleton n={2} h={96} />}
        {estado === 'error' && !actual && <ErrorState cuerpo="No hemos podido cargar tu fichaje." onRetry={reintentar} />}
        {estado === 'offline' && !actual && <OfflineState cuerpo="Para fichar necesitas conexión." />}

        {actual && (
          <>
            <div className="card" data-testid="fichaje-estado" data-abierta={abierta ? 'true' : 'false'} style={{ padding: '18px 16px 20px', textAlign: 'center' }}>
              <span data-testid="fichaje-pastilla" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 11px', borderRadius: 999, background: 'var(--muted)', fontSize: 'var(--t-small)', fontWeight: 700 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: pastilla.color }} />
                {pastilla.texto}
              </span>
              {abierta ? (
                <>
                  <p className="t-num" data-testid="fichaje-tiempo" style={{ margin: '12px 0 0', fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>{duracion(transcurrido)}</p>
                  <p className="t-meta" style={{ margin: '6px 0 0' }}>Entraste a las {hora(abierta.checkInAt)}</p>
                  {jornadasHoy > 0 && (
                    <p className="t-meta" data-testid="fichaje-hoy-total" style={{ margin: '2px 0 0' }}>Hoy llevas {duracion(cerradoHoy + transcurrido)} en total</p>
                  )}
                </>
              ) : jornadasHoy > 0 ? (
                <>
                  <p className="t-num" data-testid="fichaje-hoy-total" style={{ margin: '12px 0 0', fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>{duracion(cerradoHoy)}</p>
                  <p className="t-meta" style={{ margin: '6px 0 0' }}>
                    Trabajado hoy{jornadasHoy > 1 ? `, en ${jornadasHoy} jornadas` : ''}. Si vuelves más tarde, ficha otra entrada.
                  </p>
                </>
              ) : (
                <p className="t-body" style={{ margin: '12px 0 0', fontWeight: 700 }}>No has fichado la entrada hoy</p>
              )}
            </div>

            {revisar && (
              <p className="note note--warn" style={{ margin: 0 }} data-testid="fichaje-aviso-revisar">
                Llevas muchas horas con la jornada abierta: ¿se te olvidó fichar la salida? Si la fichas ahora, contará hasta
                este momento. Fíchala y avisa al estudio de tu hora real para que la corrija.
              </p>
            )}
            {recordar && (
              <p className="note" style={{ margin: 0 }}>Tu clase de {proxima.nombre} empieza a las {hora(proxima.inicio)}. Ficha la entrada cuando llegues.</p>
            )}

            <Button
              full
              loading={enviando}
              disabled={!online}
              onClick={() => void accion(abierta ? 'salida' : 'entrada')}
              style={{ height: 56, fontSize: 'var(--t-body)' }}
            >
              {abierta ? 'Fichar salida' : 'Fichar entrada'}
            </Button>
            {!online && <p className="t-meta" style={{ margin: 0, textAlign: 'center' }}>Sin conexión: ficha cuando vuelvas a tener cobertura.</p>}

            {proxima && (
              <div className="card" style={{ padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span aria-hidden style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icono nombre="calendario" tamano={18} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="t-meta" style={{ display: 'block' }}>Tu próxima clase</span>
                  <span className="t-body" style={{ display: 'block', marginTop: 2, fontWeight: 800 }}>{proxima.nombre} · {hora(proxima.inicio)}</span>
                </span>
              </div>
            )}

            <details className="card" data-testid="fichaje-como-funciona" style={{ overflow: 'hidden' }}>
              <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '13px 15px', fontSize: 'var(--t-small)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                ¿Cómo funciona el fichaje?<Icono nombre="mas" tamano={16} stroke="var(--accent)" style={{ flexShrink: 0 }} />
              </summary>
              <ul style={{ margin: 0, padding: '0 15px 14px 32px', fontSize: 'var(--t-small)', lineHeight: 1.55, color: 'var(--muted-foreground)', display: 'grid', gap: 6 }}>
                <li>Ficha la entrada al llegar al estudio y la salida al irte. Si trabajas mañana y tarde, ficha cada tramo: son dos jornadas.</li>
                <li>Es tu registro de jornada: {estudio.nombre} ve la hora de entrada y de salida de cada día, y lo que suma el mes.</li>
                <li>¿Te equivocaste o se te olvidó fichar? Avisa al estudio: lo corrige y queda constancia de qué cambió y por qué.</li>
                <li>Necesitas conexión para fichar. Pulsar dos veces no crea dos entradas.</li>
              </ul>
            </details>
          </>
        )}
      </div>
    </StudentShell>
  );
}
