'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Calendar, Clock, MapPin, User as UserIcon } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';
import { formatFechaCorta as formatFecha, formatHoraCorta as formatHora } from '@/lib/utils';
import { Card, Badge, Tabs, EmptyState, BottomSheet, Button, type BadgeVariant, type TabItem } from '@/components/portal/ui';

type Tab = 'PROXIMAS' | 'PASADAS' | 'CANCELADAS' | 'ESPERA';

const ESTADO_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  CONFIRMADA: { label: 'Confirmada', variant: 'success' },
  LISTA_ESPERA: { label: 'Lista de espera', variant: 'warning' },
  ASISTIDA: { label: 'Asistida', variant: 'neutral' },
  CANCELADA: { label: 'Cancelada', variant: 'neutral' },
  NO_ASISTIO: { label: 'No asistió', variant: 'danger' },
};

// Copy específico por pestaña — antes las 4 compartían el mismo "Nada por
// aquí todavía" sin distinguir el motivo real de cada una.
const EMPTY_COPY: Record<Tab, { title: string; body: string }> = {
  PROXIMAS: { title: 'Sin clases reservadas', body: 'Mira los horarios de esta semana y reserva tu próxima sesión.' },
  PASADAS: { title: 'Aún no has asistido a ninguna clase', body: 'Cuando asistas a una clase, aparecerá aquí tu historial.' },
  CANCELADAS: { title: 'Sin reservas canceladas', body: 'Aquí verás las clases que hayas cancelado.' },
  ESPERA: { title: 'Sin lista de espera', body: 'Si una clase está completa, podrás apuntarte para el siguiente hueco libre.' },
};

export default function MisReservasPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { session } = usePortalAuth();
  const { reservas, sesiones, tiposClase, salas, instructores, cancelarReserva } = useStudio();
  const { t } = useModo();
  const [tab, setTab] = useState<Tab>('PROXIMAS');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  const socioId = session?.socioId;
  const now = new Date();

  const misReservas = useMemo(() =>
    reservas
      .filter(r => r.socioId === socioId)
      .map(r => ({ r, s: sesiones.find(x => x.id === r.sesionId) ?? null }))
      .filter((x): x is { r: Reserva; s: Sesion } => !!x.s),
  [reservas, sesiones, socioId]);

  const porTab = useMemo(() => {
    const proximas = misReservas
      .filter(x => x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) >= now)
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    const pasadas = misReservas
      .filter(x => x.r.estado === 'ASISTIDA' || x.r.estado === 'NO_ASISTIO' || (x.r.estado === 'CONFIRMADA' && new Date(x.s.inicio) < now))
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const canceladas = misReservas
      .filter(x => x.r.estado === 'CANCELADA')
      .sort((a, b) => new Date(b.s.inicio).getTime() - new Date(a.s.inicio).getTime());
    const espera = misReservas
      .filter(x => x.r.estado === 'LISTA_ESPERA')
      .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime());
    return { PROXIMAS: proximas, PASADAS: pasadas, CANCELADAS: canceladas, ESPERA: espera };
  }, [misReservas, now]);

  const lista = porTab[tab];

  const TABS: TabItem<Tab>[] = [
    { id: 'PROXIMAS', label: 'Próximas', count: porTab.PROXIMAS.length },
    { id: 'PASADAS', label: 'Pasadas', count: porTab.PASADAS.length },
    { id: 'CANCELADAS', label: 'Canceladas', count: porTab.CANCELADAS.length },
    { id: 'ESPERA', label: 'Lista de espera', count: porTab.ESPERA.length },
  ];

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Mis reservas</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Historial completo de tus clases</p>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ marginBottom: 16, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
          <Tabs items={TABS} active={tab} onChange={setTab} scroll />
        </div>

        {lista.length === 0 ? (
          <EmptyState
            icon={<Calendar size={18} />}
            title={EMPTY_COPY[tab].title}
            body={EMPTY_COPY[tab].body}
            action={tab === 'PROXIMAS' ? { label: 'Ver horarios', onClick: () => router.push(`/portal/${slug}/clases`) } : undefined}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map(({ r, s }) => {
              const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
              const sala = salas.find(x => x.id === s.salaId);
              const instr = instructores.find(i => i.id === s.instructorId);
              const badge = ESTADO_BADGE[r.estado] ?? ESTADO_BADGE.CANCELADA;
              const puedeCancel = r.estado === 'CONFIRMADA' && new Date(s.inicio) > now;
              return (
                <Card key={r.id} style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{tipo?.nombre ?? 'Clase'}</p>
                      <p style={{ fontSize: 12, color: t.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} /> {formatFecha(s.inicio)} <Clock size={11} style={{ marginLeft: 6 }} /> {formatHora(s.inicio)}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: t.muted }}>
                    {instr && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={11} />{instr.nombre}</span>}
                    {sala && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} />{sala.nombre}</span>}
                  </div>
                  {puedeCancel && (
                    <Button variant="danger" size="small" onClick={() => setCancelando(r)} style={{ marginTop: 12, width: '100%' }}>
                      Cancelar reserva
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <BottomSheet open={!!cancelando} onClose={() => setCancelando(null)}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: t.ink }}>¿Cancelar esta clase?</h2>
        <p style={{ fontSize: 13, color: t.muted }}>
          {cancelando?.id.startsWith('res-pf-')
            ? 'Es tu plaza fija: te guardaremos una recuperación para que la uses otro día. Liberas el hueco para otra socia.'
            : 'Perderás tu plaza y liberarás el hueco para otra socia.'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setCancelando(null)} style={{ flex: 1 }}>Volver</Button>
          <Button
            variant="danger"
            onClick={() => { if (cancelando) { cancelarReserva(cancelando.id); setCancelando(null); } }}
            style={{ flex: 1 }}
          >
            Sí, cancelar
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
