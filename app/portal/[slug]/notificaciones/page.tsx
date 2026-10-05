'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useToast } from '@/components/student/ui/Toast';
import { getNotificaciones, marcarLeidas } from '@/lib/student/perfil-y-avisos';
import { getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { aceptarOfertaEspera, cancelarReserva } from '@/lib/student/reservas-acciones';
import { mensajeTrasCancelar } from '@/lib/student/cancelar-mensajes';
import { añadirAlCalendario } from '@/lib/student/enlaces-clase';
import { fechaCorta } from '@/lib/student/formato';
import { invalidarNoLeidas } from '@/lib/student/no-leidas';
import { vibrar } from '@/lib/nativo/puente';
import { hoyEnEstudio, horaEstudio } from '@/lib/utils';
import {
  FILTROS_AVISOS, accionDeAviso, agruparAvisosPorDia, filtrarAvisos, plazoDeOferta, type FiltroAvisos,
} from '@/lib/student/avisos-vista';
import type { Notificacion, Reserva } from '@/lib/student/tipos';
import { NotificationItem } from '@/components/student/domain/NotificationItem';
import { Button } from '@/components/student/ui/Button';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { TirarParaActualizar } from '@/components/student/ui/TirarParaActualizar';

// Avisos (§A.16; rediseño aprobado del 5-oct-2026, maqueta `AvisosNuevo`): por
// días, con filtros, el icono de cada tipo y, cuando el aviso pide algo, su botón.
//
// ⚠️ Los enlaces se traducen al leer (`lib/student/deep-links.ts`). El deep link
// se calcula al INSERTAR y se persiste, así que las filas ya emitidas llevan
// rutas del portal borrado: reescribir el catálogo solo arregla las nuevas.
//
// ⚠️ Los botones hacen lo MISMO que en Mis clases, por la misma vía: aceptar la
// plaza (`/api/public/aceptar-oferta-espera`), salir de la lista (cancelar, con su
// confirmación), añadir al calendario. Solo salen si la oferta sigue viva o la
// clase sigue reservada, leído de sus reservas; y lo que se dice después es lo que
// contestó el servidor.
export default function NotificacionesPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  const ahoraMs = useAhoraMs();
  const [marcando, setMarcando] = useState(false);
  const [filtro, setFiltro] = useState<FiltroAvisos>('todo');
  // Lo que ya contestó el servidor sobre una oferta (por reserva): sustituye a sus botones.
  const [resueltas, setResueltas] = useState<Record<string, string>>({});
  const [aceptando, setAceptando] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState<Reserva | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const cargar = useCallback(
    () => getNotificaciones(estudio.slug, estudio.id),
    [estudio.slug, estudio.id],
  );
  const { data, estado, reintentar, refrescar } = useAsync(cargar, undefined, `alumna:${estudio.slug}:avisos`);

  // Sus reservas y clases, para saber si un botón tiene sentido. Si no se pueden
  // leer, los avisos se ven igual, sin botones: un botón a ciegas es peor.
  const cargarContexto = useCallback(async () => {
    try {
      const [reservas, clases, instructoras] = await Promise.all([getReservas(estudio.slug), getClases(estudio.slug), getInstructoras(estudio.slug)]);
      return { reservas, clases, instructoras };
    } catch {
      return null;
    }
  }, [estudio.slug]);
  const contexto = useAsync(cargarContexto, () => false);

  const noLeidas = data?.filter((n) => !n.leida).length ?? 0;

  const marcarTodas = async () => {
    setMarcando(true);
    const ok = await marcarLeidas(estudio.id);
    setMarcando(false);
    // Solo se dice «marcadas» si el servidor lo confirma: el paquete lo canta
    // sin preguntar, y con la red caída eso es un aviso falso.
    toast(ok ? 'Marcadas como leídas ✓' : 'No hemos podido marcarlas. Inténtalo otra vez.');
    if (ok) {
      reintentar();
      // El punto de la campana vive en un caché compartido con TTL de 60 s
      // (`lib/student/no-leidas.ts`), así que sin esto seguía encendido un
      // minuto después de decirle a la socia que ya estaba todo leído.
      invalidarNoLeidas(estudio.id);
    }
  };

  async function aceptar(reservaId: string) {
    if (aceptando) return;
    setAceptando(reservaId);
    const res = await aceptarOfertaEspera(estudio.slug, estudio.id, reservaId, { online });
    setAceptando(null);
    if (!res.ok) {
      if (res.sesionCaducada) { router.push(href('/acceso/login')); return; }
      toast(res.error);
      // Un fallo NO deja las cosas como estaban (la RPC puede haber cancelado la
      // oferta y dado una recuperación): se vuelve a leer, como en Mis clases.
      if (online) void contexto.refrescar();
      return;
    }
    if (res.confirmada) void vibrar('exito');
    setResueltas((p) => ({ ...p, [reservaId]: res.confirmada ? 'Plaza confirmada.' : 'Alguien se te adelantó por segundos: te hemos dado una clase de recuperación.' }));
    void contexto.refrescar();
  }

  async function salirDeLaLista() {
    if (!saliendo || cancelando) return;
    setCancelando(true);
    const res = await cancelarReserva(estudio.slug, estudio.id, saliendo.id, { online });
    setCancelando(false);
    if (!res.ok) {
      if (res.sesionCaducada) { router.push(href('/acceso/login')); return; }
      toast(res.error);
      return;
    }
    const id = saliendo.id;
    setSaliendo(null);
    setResueltas((p) => ({ ...p, [id]: mensajeTrasCancelar(res, { esClaseFija: false, fechaCorta }) }));
    void contexto.refrescar();
  }

  // `useAhoraMs` es `null` solo en el servidor: sin reloj no se agrupa (el día de «Hoy» saldría inventado).
  const ahora = ahoraMs ?? 0;
  const hoy = ahoraMs === null ? '' : hoyEnEstudio(new Date(ahoraMs));
  const diaDe = (iso: string) => hoyEnEstudio(new Date(iso));
  const visibles = filtrarAvisos(data ?? [], filtro);
  const grupos = ahoraMs === null ? [] : agruparAvisosPorDia(visibles, hoy, diaDe);
  const ctx = contexto.data;

  /** El botón de un aviso, si lo pide y existe la vía de verdad. */
  function accionDe(n: Notificacion) {
    const tipo = accionDeAviso(n.evento);
    if (!tipo) return null;
    if (tipo === 'renovar') {
      return <div style={{ marginTop: 10 }}><Link href={href('/bonos')} className="btn btn--primary btn--sm tap">Renovar</Link></div>;
    }
    if (!ctx || !n.sesionId) return null;
    const suyas = ctx.reservas.filter((r) => r.claseId === n.sesionId);
    if (tipo === 'calendario') {
      const clase = ctx.clases.find((c) => c.id === n.sesionId);
      if (!clase || clase.fecha < hoy || !suyas.some((r) => r.estado === 'confirmada')) return null;
      return (
        <div style={{ marginTop: 10 }}>
          <Button
            variant="secondary" size="sm"
            onClick={() => añadirAlCalendario(clase, estudio.nombre, estudio.direccion, ctx.instructoras.find((i) => i.id === clase.instructoraId)?.nombre)}
          >
            Añadir al calendario
          </Button>
        </div>
      );
    }
    // La oferta de la lista de espera: la reserva EN ESPERA de esa clase con su plazo aún vivo.
    const oferta = suyas.find((r) => r.estado === 'en-espera' && !!r.ofertaExpiraEn);
    if (oferta && resueltas[oferta.id]) {
      return <p data-testid="aviso-resuelto" role="status" style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', fontWeight: 700 }}>{resueltas[oferta.id]}</p>;
    }
    const plazo = oferta?.ofertaExpiraEn ? plazoDeOferta(oferta.ofertaExpiraEn, ahora, (iso) => horaEstudio(iso)) : null;
    if (!oferta || !plazo) return null;
    return (
      <div data-testid="aviso-oferta" style={{ marginTop: 10 }}>
        <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--warning-foreground)' }}>{plazo}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Button size="sm" loading={aceptando === oferta.id} disabled={!online || !!aceptando} onClick={() => void aceptar(oferta.id)}>
            Aceptar la plaza
          </Button>
          <Button variant="secondary" size="sm" disabled={!online || !!aceptando} onClick={() => setSaliendo(oferta)}>
            No, gracias
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StudentShell>
      <TirarParaActualizar onRefrescar={() => { invalidarNoLeidas(estudio.id); void contexto.refrescar(); return refrescar(); }} />
      <PageHeader
        titulo="Avisos"
        sub={noLeidas ? `${noLeidas} sin leer` : undefined}
        back
        accion={noLeidas > 0 ? (
          <button type="button" className="btn btn--secondary btn--sm" disabled={marcando} onClick={() => void marcarTodas()}>
            {marcando ? 'Marcando…' : 'Marcar leídas'}
          </button>
        ) : undefined}
      />
      {estado === 'ready' && (
        <div role="group" aria-label="Filtrar avisos" className="px" style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto' }}>
          {FILTROS_AVISOS.map((f) => (
            <button
              key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)} className="tap"
              style={{
                whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 999, fontFamily: 'inherit', fontSize: 'var(--t-small)', fontWeight: 800,
                background: filtro === f.id ? 'var(--foreground)' : 'var(--card)',
                color: filtro === f.id ? 'var(--background)' : 'var(--foreground)',
                border: '1px solid ' + (filtro === f.id ? 'var(--foreground)' : 'var(--border)'),
              }}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>
      )}
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={78} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}
        {estado === 'empty' && (
          <EmptyState
            ilustracion="campana"
            titulo="Todo al día"
            cuerpo="Te avisaremos de plazas liberadas, recordatorios y novedades del estudio."
          />
        )}
        {estado === 'ready' && ahoraMs !== null && grupos.length === 0 && (
          <p className="t-meta" data-testid="avisos-filtro-vacio" style={{ margin: '10px 4px', textAlign: 'center' }}>
            Nada en «{FILTROS_AVISOS.find((f) => f.id === filtro)?.etiqueta}» por ahora.
          </p>
        )}
        {estado === 'ready' && grupos.map((g) => (
          <section key={g.grupo} aria-label={g.grupo} style={{ marginTop: 4 }}>
            <p className="t-label" style={{ margin: '0 4px 7px' }}>{g.grupo}</p>
            <div className="card a-up" style={{ padding: '0 14px' }}>
              {g.items.map((n, i) => (
                <NotificationItem
                  key={n.id} n={n} primera={i === 0}
                  hora={g.grupo === 'Hoy' || g.grupo === 'Ayer' ? horaEstudio(n.fecha) : fechaCorta(diaDe(n.fecha))}
                >
                  {accionDe(n)}
                </NotificationItem>
              ))}
            </div>
          </section>
        ))}
      </div>

      <ConfirmationDialog
        open={saliendo !== null}
        onClose={() => { if (!cancelando) setSaliendo(null); }}
        titulo="¿Salir de la lista de espera?"
        cuerpo="Si sales, la plaza pasa a la siguiente persona de la lista."
        confirmar="Sí, salir"
        cancelar="Seguir en la lista"
        tono="danger"
        loading={cancelando}
        onConfirm={() => void salirDeLaLista()}
      />
    </StudentShell>
  );
}
