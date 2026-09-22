'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useOnline } from '@/lib/student/useOnline';
import { getListaClase, marcarAsistenciaEnLista } from '@/lib/student/datos-instructora';
import {
  horaEnZona, puedePasarLista, resumenLista, ventanaLista,
  type AlumnaEnLista, type EstadoEnLista,
} from '@/lib/student/agenda-instructora';
import { etiquetaDia } from '@/lib/student/formato';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { Badge } from '@/components/student/ui/Badge';
import { Icono } from '@/components/student/ui/Icono';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Pasar lista de una clase que imparte la instructora.
//
// ⚠️ Solo «Asistió» (decisión del 14-sep-2026). «No vino» dispara una
// penalización de dinero a la alumna, así que lo decide el estudio: aquí no hay
// ningún botón que lo marque. Si el estudio ya lo marcó, se enseña tal cual.
//
// Nada optimista: cada toque espera al servidor, y lo que se pinta es el estado
// que él devuelve. Un «Asistió» que no se ha guardado es exactamente el bug que
// este repo ya ha pagado en otras pantallas.

export default function PasarListaPage() {
  const { sesionId } = useParams<{ sesionId: string }>();
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const ahoraMs = useAhoraMs();

  // Lo que el servidor ha confirmado en esta visita, encima de lo cargado.
  const [confirmados, setConfirmados] = useState<Record<string, EstadoEnLista>>({});
  const [enCurso, setEnCurso] = useState<Record<string, true>>({});
  const [errorFila, setErrorFila] = useState<{ id: string; texto: string } | null>(null);

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getListaClase(estudio.slug, sesionId) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug, sesionId],
  );
  const { data, estado, reintentar } = useAsync(cargar, (d) => !d);

  const alternar = async (alumna: AlumnaEnLista) => {
    if (enCurso[alumna.reservaId] || alumna.estado === 'no-vino') return;
    const accion = alumna.estado === 'asistio' ? 'deshacer' : 'asistio';
    setEnCurso((p) => ({ ...p, [alumna.reservaId]: true }));
    setErrorFila(null);
    const r = await marcarAsistenciaEnLista(estudio.slug, sesionId, alumna.reservaId, accion);
    setEnCurso((p) => {
      const siguiente = { ...p };
      delete siguiente[alumna.reservaId];
      return siguiente;
    });
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setErrorFila({ id: alumna.reservaId, texto: r.error });
      return;
    }
    setConfirmados((p) => ({ ...p, [alumna.reservaId]: r.estado }));
  };

  if (estado === 'loading') {
    return (
      <StudentShell modo="instructora">
        <PageHeader back titulo="Pasar lista" />
        <div className="px" style={{ marginTop: 14 }}><ListSkeleton n={4} h={60} /></div>
      </StudentShell>
    );
  }

  if (estado === 'error' || estado === 'empty' || !data) {
    return (
      <StudentShell modo="instructora">
        <PageHeader back titulo="Pasar lista" />
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState
            titulo="No encontramos esta clase"
            cuerpo="Puede que ya no esté a tu nombre."
            onRetry={reintentar}
          />
        </div>
      </StudentShell>
    );
  }

  const { clase } = data;
  const alumnas = data.alumnas.map((a) => ({ ...a, estado: confirmados[a.reservaId] ?? a.estado }));
  const { vinieron, total } = resumenLista(alumnas);
  const abierta = ahoraMs != null && puedePasarLista(clase, ahoraMs);
  const aviso = ahoraMs == null || abierta ? null
    : clase.cancelada ? 'Esta clase está cancelada.'
    : ahoraMs < ventanaLista(clase).abreMs
      ? `La lista se abre a las ${horaEnZona(new Date(ventanaLista(clase).abreMs).toISOString())}, una hora antes de la clase.`
      : 'La lista de esta clase ya está cerrada. Si falta alguien por marcar, díselo al estudio.';
  const hayNoVino = alumnas.some((a) => a.estado === 'no-vino');

  // El número grande y la barra son solo para la vista; lo que leen un lector de
  // pantalla y los tests es `resumen-lista`.
  const porcentaje = total > 0 ? Math.round((vinieron / total) * 100) : 0;
  const tenue = 'color-mix(in srgb, var(--accent-deep-foreground) 80%, transparent)';

  return (
    <StudentShell modo="instructora">
      <PageHeader back titulo="Pasar lista" />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-3)', marginTop: 14, paddingBottom: 24 }}>
        {/* La clase y cuántas han venido, en la tarjeta verde noche de «Tu próxima
            clase»: es lo que mira de un vistazo con la sala llenándose. Antes era
            una línea de subtítulo y una etiqueta pequeña encima de la lista. */}
        <section
          aria-label={`Lista de ${clase.tipo}`}
          data-testid="cabecera-lista"
          style={{ borderRadius: 'var(--radius-hero)', background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', padding: '14px 15px 15px', boxShadow: 'var(--shadow-hero)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <p className="t-label" style={{ color: abierta ? 'var(--on-dark)' : 'var(--accent-deep-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: abierta ? '#FAF9F5' : 'var(--accent-deep-muted)', animation: abierta ? 'apPulse 1.6s infinite' : undefined }} />
              {abierta ? 'Lista abierta' : clase.cancelada ? 'Clase cancelada' : 'Lista cerrada'}
            </p>
            <span className="t-num" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--accent-deep-muted)', whiteSpace: 'nowrap' }}>
              {etiquetaDia(clase.fecha)} · {clase.hora}–{clase.horaFin}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.02em', color: 'var(--on-dark)' }}>{clase.tipo}</p>
          {total > 0 && (
            <>
              <p aria-hidden style={{ margin: '12px 0 0', display: 'flex', alignItems: 'baseline', gap: 6, color: 'var(--on-dark)' }}>
                <span className="t-num" style={{ fontSize: 34, fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1 }}>{vinieron}</span>
                <span style={{ fontSize: 'var(--t-body)', fontWeight: 600, color: tenue }}>de {total}</span>
              </p>
              <div aria-hidden style={{ marginTop: 8, height: 6, borderRadius: 99, background: 'color-mix(in srgb, var(--accent-deep-foreground) 18%, transparent)', overflow: 'hidden' }}>
                <div style={{ width: `${porcentaje}%`, height: '100%', borderRadius: 99, background: 'var(--on-dark)', transition: 'width .3s' }} />
              </div>
              <p aria-live="polite" data-testid="resumen-lista" style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', fontWeight: 600, color: tenue }}>
                {vinieron} de {total} {total === 1 ? 'ha venido' : 'han venido'}
              </p>
            </>
          )}
        </section>

        {aviso && (
          <p role="status" data-testid="aviso-lista" className="note note--warn" style={{ margin: 0 }}>{aviso}</p>
        )}
        {!online && <OfflineState cuerpo="Para marcar asistencia necesitas conexión." />}

        {total === 0 ? (
          <EmptyState
            ilustracion="calendario"
            titulo="Nadie ha reservado esta clase"
            cuerpo="Si llega alguien sin reserva, díselo al estudio."
          />
        ) : (
          <>
            <p className="t-small t-dim" style={{ margin: 0 }}>
              Toca «Asistió» cuando llegue cada una. Si alguien no viene, no hagas nada: lo gestiona el estudio.
            </p>
            <ul className="stack" style={{ ['--gap' as string]: 'var(--s-2)', listStyle: 'none', margin: 0, padding: 0 }}>
              {alumnas.map((a) => {
                const asistio = a.estado === 'asistio';
                const esperando = Boolean(enCurso[a.reservaId]);
                return (
                  <li
                    key={a.reservaId}
                    className="card"
                    data-testid="alumna-en-lista"
                    style={{
                      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12,
                      // La fila de quien ya ha venido se tiñe: se ve de un vistazo quién falta.
                      background: asistio ? 'var(--accent-soft)' : undefined,
                      borderColor: asistio ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : undefined,
                      transition: 'background .2s, border-color .2s',
                    }}
                  >
                    <AvatarSocia nombre={a.nombre} size={42} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="t-card-title trunc">{a.nombre}</p>
                      <p className="t-meta" style={{ marginTop: 1 }}>
                        {a.estado === 'no-vino' ? 'Lo marcó el estudio' : asistio ? 'Ha venido' : 'Por marcar'}
                      </p>
                      {errorFila?.id === a.reservaId && (
                        <p role="alert" className="t-small" style={{ color: 'var(--destructive-foreground)', fontWeight: 700, marginTop: 2 }}>
                          {errorFila.texto}
                        </p>
                      )}
                    </div>
                    {a.estado === 'no-vino' ? (
                      <Badge tone="neutral">No vino</Badge>
                    ) : (
                      <button
                        type="button"
                        aria-pressed={asistio}
                        aria-busy={esperando || undefined}
                        disabled={!abierta || !online || esperando}
                        onClick={() => void alternar(a)}
                        className="tap"
                        style={{
                          minHeight: 44, minWidth: 108, padding: '0 14px', borderRadius: 999,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          border: `1px solid ${asistio ? 'var(--primary)' : 'var(--border-strong)'}`,
                          background: asistio ? 'var(--primary)' : 'var(--card)',
                          color: asistio ? 'var(--primary-foreground)' : 'var(--foreground)',
                          fontFamily: 'inherit', fontSize: 'var(--t-small)', fontWeight: 700,
                          opacity: !abierta || !online ? 0.5 : 1,
                        }}
                      >
                        {asistio && !esperando && <Icono nombre="hecho" tamano={16} />}
                        {esperando ? 'Un momento…' : 'Asistió'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {hayNoVino && (
              <p className="t-meta">Si alguien marcada como «No vino» sí ha venido, díselo al estudio.</p>
            )}
          </>
        )}
      </div>
    </StudentShell>
  );
}
