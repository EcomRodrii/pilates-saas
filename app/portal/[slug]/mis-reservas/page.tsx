'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { cancelarReserva } from '@/lib/student/reservas-acciones';
import { avisoCancelacion } from '@/lib/student/maquina-reserva';
import { etiquetaDia, fechaCorta, hoyISO } from '@/lib/student/formato';
import { urlCalendario } from '@/lib/student/enlaces-clase';
import { Badge } from '@/components/student/ui/Badge';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Mis clases (§A.9): próximas / historial, con cancelación y salida de la lista
// de espera.
//
// ⚠️ La diferencia de fondo con el paquete: allí la cancelación se da por buena
// en el cliente (`setCanceladas([...c, id])`) y el aviso de si se devuelve el
// bono lo calcula el navegador. Aquí no se toca la lista a mano: se RECARGA
// desde el servidor, y lo que se le dice a la alumna sale de `bonoDevuelto`,
// que es una columna que devuelve `cancelar_reserva_plaza`. Anunciar «sesión
// devuelta» y que no lo esté es un problema de dinero, no de UI.
export default function MisReservasPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();

  const [tab, setTab] = useState<'prox' | 'hist'>('prox');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(async () => {
    const [reservas, clases, instructoras] = await Promise.all([
      getReservas(estudio.slug), getClases(estudio.slug), getInstructoras(estudio.slug),
    ]);
    return { reservas, clases, instructoras };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const items = (data?.reservas ?? [])
    .map((r) => ({ r, c: data?.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c));

  // ⚠️ «Próximas» filtra también por FECHA, no solo por estado. El paquete solo
  // mira el estado porque sus datos de ejemplo son siempre futuros; con datos
  // reales hay reservas CONFIRMADA de meses atrás que nadie marcó como asistida
  // ni como ausencia, y sin este filtro aparecían como próximas: en la primera
  // prueba, «Lun 29 · 11:00 · Confirmada ✓» de un 29 de junio.
  //
  // Las pasadas no se pierden: caen al historial, que es donde se buscan.
  const hoy = hoyISO();
  const activa = (e: string) => e === 'confirmada' || e === 'en-espera';
  const prox = items.filter((x) => activa(x.r.estado) && x.c.fecha >= hoy);
  const hist = items.filter((x) => !activa(x.r.estado) || x.c.fecha < hoy);

  const sel = items.find((x) => x.r.id === cancelId);
  const aviso = sel ? avisoCancelacion(sel.c, estudio.politicaCancelacionHoras) : null;

  // Sin `useCallback` a propósito: cierra sobre `sel`, que se deriva en el
  // render a partir de `data`, y el compilador de React no puede preservar esa
  // memoización manual (`react-hooks/preserve-manual-memoization`). Memoizarla
  // a mano aquí no ahorra nada —el diálogo se repinta igual cuando cambia
  // `cancelando`— y sí rompe el lint.
  const confirmarCancelacion = async () => {
    if (!sel) return;
    setCancelando(true);
    const res = await cancelarReserva(estudio.slug, estudio.id, sel.r.id, { online });
    setCancelando(false);

    if (!res.ok) {
      if (res.sesionCaducada) { router.push(href('/acceso/login')); return; }
      // La reserva SIGUE ACTIVA: no se toca la lista y se deja el diálogo
      // abierto para que pueda reintentar sin volver a buscarla.
      toast(res.error);
      return;
    }

    setCancelId(null);
    // El mensaje sale de lo que dijo el SERVIDOR, no de lo que calculó el aviso
    // previo: la ventana real puede diferir (tipo de clase con la suya propia).
    toast(!res.eraConfirmada
      ? 'Has salido de la lista de espera'
      : res.bonoDevuelto
        ? 'Cancelada · sesión devuelta a tu bono ✓'
        : 'Cancelada — la sesión no se devuelve');
    // Y se recarga: la plaza vuelve al aforo y puede haber promocionado a
    // alguien de la cola. Tachar la fila a mano enseñaría un estado inventado.
    reintentar();
  };

  return (
    <StudentShell>
      <PageHeader titulo="Mis clases" />

      {/* Segmentado con píldora deslizante (§I) */}
      <div
        className="px"
        style={{ position: 'relative', display: 'flex', background: 'var(--muted)', borderRadius: 999, padding: 4, margin: '14px 18px 0' }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute', top: 4, bottom: 4, left: 4, width: 'calc(50% - 4px)',
            background: 'var(--card)', borderRadius: 999, boxShadow: '0 3px 10px rgba(26,26,26,.1)',
            transform: tab === 'hist' ? 'translateX(100%)' : 'none',
            transition: 'transform .32s var(--ease-spring)',
          }}
        />
        {(['prox', 'hist'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, position: 'relative', border: 'none', background: 'none', padding: '9px 0',
              fontSize: 12.5, fontWeight: 800,
              color: tab === t ? 'var(--foreground)' : 'var(--subtle-foreground)',
              transition: 'color .25s',
            }}
          >
            {t === 'prox' ? 'Próximas' : 'Historial'}
          </button>
        ))}
      </div>

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={110} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          tab === 'prox' ? (
            prox.length === 0 ? (
              <EmptyState
                icono="🗓"
                titulo="No tienes clases próximas"
                cuerpo="Reserva tu siguiente sesión — puede que hoy queden plazas."
                accion="Ver horario"
                href={href('/reservar')}
              />
            ) : (
              prox.map(({ r, c }) => {
                const i = data.instructoras.find((x) => x.id === c.instructoraId);
                const av = avisoCancelacion(c, estudio.politicaCancelacionHoras);
                const espera = r.estado === 'en-espera';
                return (
                  <div
                    key={r.id}
                    className="a-pop"
                    style={{
                      background: espera ? 'var(--card)' : 'var(--accent-soft)',
                      border: `1px solid ${espera ? 'var(--border)' : 'transparent'}`,
                      borderRadius: 17, padding: '13px 15px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: espera ? 'var(--foreground)' : 'var(--accent-soft-foreground)' }}>
                        {etiquetaDia(c.fecha)} · {c.hora}
                      </p>
                      <Badge tone={espera ? 'wait' : 'ok'}>
                        {espera
                          ? `Lista de espera${r.posicionEspera ? ` · ${r.posicionEspera}ª` : ''}`
                          : 'Confirmada ✓'}
                      </Badge>
                    </div>
                    <p style={{ margin: '3px 0 0', fontSize: 13.5, fontWeight: 700 }}>{c.nombre}</p>
                    <p className="t-meta" style={{ marginTop: 2 }}>
                      con {i?.nombre ?? '—'} · {c.sala}
                      {r.pagadaCon === 'bono' ? ' · con tu bono' : ''}
                    </p>
                    <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                      <Link href={href(`/mis-reservas/${r.id}`)} className="btn btn--light btn--sm" style={{ height: 34 }}>
                        Detalle
                      </Link>
                      {/* ⚠️ Faltaba. El paquete pone TRES acciones en esta
                          tarjeta —Detalle, + Calendario, Cancelar— y aquí solo
                          había dos: comparando el render del paquete contra el
                          nuestro se vio el hueco. En el paquete es un toast de
                          maqueta; aquí abre el calendario de verdad, con los
                          datos que ya trae la clase. */}
                      {!espera && (
                        <button
                          type="button"
                          className="btn btn--light btn--sm"
                          style={{ height: 34 }}
                          onClick={() => window.open(urlCalendario(c, estudio.nombre, estudio.direccion), '_blank', 'noopener')}
                        >
                          + Calendario
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        style={{ height: 34 }}
                        disabled={!online || !av.puede}
                        title={!online ? 'Necesitas conexión' : !av.puede ? 'La clase ya ha empezado' : undefined}
                        onClick={() => setCancelId(r.id)}
                      >
                        {espera ? 'Salir de la lista' : 'Cancelar'}
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            hist.length === 0 ? (
              <EmptyState icono="📖" titulo="Aún no hay historial" cuerpo="Aquí verás las clases a las que has ido." />
            ) : (
              hist.map(({ r, c }) => (
                <Link
                  key={r.id}
                  href={href(`/mis-reservas/${r.id}`)}
                  className="card card--tap"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px' }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>{c.nombre}</p>
                    <p className="t-meta" style={{ marginTop: 1 }}>{fechaCorta(c.fecha)} · {c.hora}</p>
                  </div>
                  <Badge tone={r.estado === 'asistida' ? 'ok' : r.estado === 'no-asistida' ? 'few' : 'neutral'}>
                    {r.estado === 'asistida' ? 'Asistida' : r.estado === 'no-asistida' ? 'No asistió' : 'Cancelada'}
                  </Badge>
                </Link>
              ))
            )
          )
        )}
      </div>

      <ConfirmationDialog
        open={Boolean(cancelId)}
        onClose={() => { if (!cancelando) setCancelId(null); }}
        titulo={sel?.r.estado === 'en-espera' ? '¿Salir de la lista de espera?' : '¿Cancelar esta clase?'}
        cuerpo={sel ? `${sel.c.nombre} · ${etiquetaDia(sel.c.fecha)} ${sel.c.hora}` : ''}
        confirmar={sel?.r.estado === 'en-espera'
          ? 'Sí, salir'
          : aviso?.devolveriaCredito ? 'Sí, cancelar y recuperar sesión' : 'Sí, cancelar igualmente'}
        cancelar="Mantener mi reserva"
        tono="danger"
        loading={cancelando}
        onConfirm={confirmarCancelacion}
      >
        {sel && sel.r.estado !== 'en-espera' && (
          <div
            style={{
              background: aviso?.devolveriaCredito ? 'var(--accent-soft)' : 'var(--warning-soft)',
              borderRadius: 14, padding: '11px 14px', marginTop: 13,
            }}
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: aviso?.devolveriaCredito ? 'var(--accent-soft-foreground)' : 'var(--warning-foreground)' }}>
              {aviso?.devolveriaCredito
                ? 'Estás dentro del plazo: deberías recuperar la sesión de tu bono.'
                : `Quedan menos de ${estudio.politicaCancelacionHoras} h: es probable que la sesión no se devuelva.`}
            </p>
            {/* ⚠️ «deberías» / «es probable» y no una promesa: este aviso lo
                calcula el navegador con la política del ESTUDIO, y el tipo de
                clase puede tener la suya propia. Quien decide es la base de
                datos, y lo que de verdad pasó se dice después, con su
                respuesta. */}
          </div>
        )}
      </ConfirmationDialog>
    </StudentShell>
  );
}
