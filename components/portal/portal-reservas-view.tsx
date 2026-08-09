'use client';

// RESERVAS — vista de presentación, desacoplada de la sesión real (Fase 4 del
// Theme Builder, mismo patrón que Home/Clases/Bonos/Perfil).
//
// `escribible = false` (solo en preview): cancelar/aceptar oferta de espera
// NO llaman a la API real — un socioId ficticio no tiene reservas propias
// (el filtro por `r.socioId === session.socioId` ya deja las listas vacías,
// mostrando los estados vacíos reales de cada pestaña), pero se guarda igual
// por si el estudio prueba con una sesión real desde otra pestaña del navegador.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { Calendar, Clock, MapPin, QrCode, User as UserIcon } from 'lucide-react';
import type { Reserva, Sesion } from '@/lib/types';
import { formatFechaCorta as formatFecha, formatHoraCorta as formatHora } from '@/lib/utils';
import { Card, Badge, Tabs, EmptyState, BottomSheet, Button, Toast, type AvisoToast, type BadgeVariant, type TabItem } from '@/components/portal/ui';
import { HojaPase, type DatosPase } from '@/components/portal/hoja-pase';
import { pedirPaseDeAcceso } from '@/lib/api-client';
import type { PortalSession } from '@/lib/portal-auth';

// Stub de "pedir pase" para preview: NO llama a la API real (socioId
// ficticio, 404/error garantizado) — mismo criterio que PortalClasesView.
async function pedirPaseDeMuestra(): Promise<DatosPase> {
  return { hayPase: true, vigente: true, yaAsistida: false, codigo: 'PREVIEW', token: null };
}

type Tab = 'PROXIMAS' | 'PASADAS' | 'CANCELADAS' | 'ESPERA';

// Valor de "ahora" hasta que el efecto de montaje fija el de verdad (render del
// servidor y primer render del cliente). Es una constante de MÓDULO, no un
// `new Date()` en el cuerpo del componente: ese daba una referencia nueva en
// cada render y `porTab` —el reparto Próximas/Pasadas, los cuatro contadores de
// las pestañas y la tarjeta del pase— se recalculaba entero cada vez, con lo
// que su useMemo no memoizaba nada. Además servidor y navegador nunca coinciden
// en "ahora", así que un valor fijo es también lo único que garantiza que los
// dos pinten el mismo HTML. Qué fecha sea da igual: los datos del estudio
// (StudioProvider los carga en un efecto) todavía están vacíos en ese instante,
// así que las cuatro listas salen vacías con cualquier valor.
const FECHA_PLACEHOLDER_SSR = new Date('2026-06-29T00:00:00Z');

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

export function PortalReservasView({
  session, escribible = true, navegar,
}: { session: PortalSession | null; escribible?: boolean; navegar: (ruta: string) => void }) {
  const { slug } = useParams<{ slug: string }>();
  const { reservas, sesiones, tiposClase, salas, instructores, cancelarReserva, aceptarOfertaEspera, studio } = useStudio();
  const { t } = useModo();
  const [tab, setTab] = useState<Tab>('PROXIMAS');
  const [cancelando, setCancelando] = useState<Reserva | null>(null);
  const [aceptandoId, setAceptandoId] = useState<string | null>(null);
  const [paseAbierto, setPaseAbierto] = useState(false);
  // Cancelar también puede fallar en el servidor. Cerrar la hoja sin mirar dejaba
  // a la socia creyendo que había cancelado, con la plaza todavía suya.
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  const socioId = session?.socioId;
  // Sin `setInterval`, a diferencia del reloj del Inicio: aquí no se pinta
  // ninguna cuenta atrás, "ahora" solo decide de qué lado del corte cae cada
  // reserva. Basta con fijarlo una vez al montar.
  const [now, setNow] = useState(FECHA_PLACEHOLDER_SSR);
  useEffect(() => {
    // Un render de más al montar, a cambio de que servidor y cliente pinten lo
    // mismo: la hora real solo se puede leer ya en el navegador, y hacerlo en
    // el cuerpo del render es justo lo que rompía la memoización de `porTab`.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leer el reloj del navegador exige estar montada; el valor inicial es la constante determinista que comparten servidor y cliente.
    setNow(new Date());
  }, []);

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
  const proximaClase = porTab.PROXIMAS[0] ?? null;

  async function aceptarOferta(reservaId: string) {
    if (!escribible) { setAviso({ texto: 'Vista previa: esto no se guarda de verdad.', error: false }); return; }
    setAceptandoId(reservaId);
    const r = await aceptarOfertaEspera(reservaId);
    setAceptandoId(null);
    if (!r.ok) setAviso({ texto: r.error, error: true });
  }

  const TABS: TabItem<Tab>[] = [
    { id: 'PROXIMAS', label: 'Próximas', count: porTab.PROXIMAS.length },
    { id: 'PASADAS', label: 'Pasadas', count: porTab.PASADAS.length },
    { id: 'CANCELADAS', label: 'Canceladas', count: porTab.CANCELADAS.length },
    { id: 'ESPERA', label: 'Lista de espera', count: porTab.ESPERA.length },
  ];

  return (
    <div style={{ minHeight: '100%', background: t.bg }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Mis reservas</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Historial completo de tus clases</p>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        {/* El pase vivía enterrado dentro de cada tarjeta de Clases — aquí, la
            pantalla dedicada a "mis reservas", no había ningún acceso a él en
            absoluto. Una tarjeta fija arriba (Fase 2, feedback de 49
            propietarias: "el pase de acceso debería destacar") en vez de una
            quinta pestaña: no es una lista más, es la acción que se repite
            cada vez que la socia entra al estudio. */}
        {proximaClase && (studio?.requiereCheckinQr ?? true) && (
          <Card style={{ padding: '16px 16px 16px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0,
              background: 'var(--portal-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <QrCode size={19} color="var(--portal-brand-foreground)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 800, color: t.ink }}>Tu pase de acceso</p>
              <p style={{ fontSize: 11.5, color: t.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tiposClase.find(tc => tc.id === proximaClase.s.tipoClaseId)?.nombre ?? 'Clase'} · {formatFecha(proximaClase.s.inicio)} {formatHora(proximaClase.s.inicio)}
              </p>
            </div>
            <Button size="small" onClick={() => setPaseAbierto(true)}>Ver</Button>
          </Card>
        )}
        <div style={{ marginBottom: 16, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
          <Tabs items={TABS} active={tab} onChange={setTab} scroll />
        </div>

        {lista.length === 0 ? (
          <EmptyState
            icon={<Calendar size={18} />}
            title={EMPTY_COPY[tab].title}
            body={EMPTY_COPY[tab].body}
            action={tab === 'PROXIMAS' ? { label: 'Ver horarios', onClick: () => navegar(`/portal/${slug}/clases`) } : undefined}
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
                  {r.estado === 'LISTA_ESPERA' && r.ofertaExpiraEn && (
                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: t.surface2 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: t.ink, marginBottom: 8 }}>
                        ¡Se ha liberado una plaza! Tienes hasta las {formatHora(r.ofertaExpiraEn)} para aceptarla.
                      </p>
                      <Button
                        variant="primary" size="small" style={{ width: '100%' }}
                        disabled={aceptandoId === r.id}
                        onClick={() => aceptarOferta(r.id)}
                      >
                        {aceptandoId === r.id ? 'Aceptando…' : 'Aceptar plaza'}
                      </Button>
                    </div>
                  )}
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
            onClick={() => {
              if (!cancelando) return;
              const id = cancelando.id;
              setCancelando(null);
              if (!escribible) { setAviso({ texto: 'Vista previa: esta cancelación no se guarda de verdad.', error: false }); return; }
              void cancelarReserva(id).then(r => { if (!r.ok) setAviso({ texto: r.error, error: true }); });
            }}
            style={{ flex: 1 }}
          >
            Sí, cancelar
          </Button>
        </div>
      </BottomSheet>

      {proximaClase && (
        <HojaPase
          abierta={paseAbierto}
          onClose={() => setPaseAbierto(false)}
          slug={slug}
          nombreEstudio={studio?.nombre ?? 'tu estudio'}
          tituloClase={tiposClase.find(tc => tc.id === proximaClase.s.tipoClaseId)?.nombre ?? 'Clase'}
          subtitulo={`${formatFecha(proximaClase.s.inicio)} · ${salas.find(s => s.id === proximaClase.s.salaId)?.nombre ?? ''}`}
          pedirPase={escribible ? pedirPaseDeAcceso : pedirPaseDeMuestra}
        />
      )}

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
