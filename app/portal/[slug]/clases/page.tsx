'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { tieneCoberturaPlan } from '@/lib/portal-home-logic';
import { useModo } from '@/lib/portal-modo';
import { Tabs, type TabItem } from '@/components/portal/ui';
import { ReservaCalendario, type ReservaSlot } from '@/components/reserva/reserva-calendario';
import type { Reserva } from '@/lib/types';

type Tab = 'proximas' | 'mis-reservas';

const OCUPA_PLAZA: Reserva['estado'][] = ['CONFIRMADA', 'ASISTIDA'];
const RESERVA_ACTIVA: Reserva['estado'][] = ['CONFIRMADA', 'LISTA_ESPERA'];

export default function ClasesPage() {
  const { session } = usePortalAuth();
  const {
    sesiones, reservas, tiposClase, salas, instructores, spots,
    planesTarifa, suscripciones, studio, addReserva, cancelarReserva,
  } = useStudio();
  const { t } = useModo();
  const [tab, setTab] = useState<Tab>('proximas');
  const socioId = session?.socioId ?? null;

  const precioClaseSuelta = planesTarifa.find(p => p.tipo === 'PUNTUAL' && p.activo)?.precio ?? null;

  const activeSus = useMemo(() =>
    suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA') ?? null,
  [suscripciones, socioId]);
  const planActivo = activeSus ? planesTarifa.find(p => p.id === activeSus.planId) ?? null : null;
  const cubierta = tieneCoberturaPlan(activeSus, planActivo);

  // Índices en una pasada — evita recorrer `reservas` por cada sesión.
  const { ocupadasPorSesion, spotsOcupadosPorSesion, miReservaPorSesion } = useMemo(() => {
    const ocupadas = new Map<string, number>();
    const spotsOcup = new Map<string, string[]>();
    const mia = new Map<string, Reserva>();
    for (const r of reservas) {
      if (OCUPA_PLAZA.includes(r.estado)) {
        ocupadas.set(r.sesionId, (ocupadas.get(r.sesionId) ?? 0) + 1);
        if (r.spotId) {
          const arr = spotsOcup.get(r.sesionId) ?? [];
          arr.push(r.spotId);
          spotsOcup.set(r.sesionId, arr);
        }
      }
      if (socioId && r.socioId === socioId && RESERVA_ACTIVA.includes(r.estado)) {
        mia.set(r.sesionId, r);
      }
    }
    return { ocupadasPorSesion: ocupadas, spotsOcupadosPorSesion: spotsOcup, miReservaPorSesion: mia };
  }, [reservas, socioId]);

  const spotsActivosPorSala = useMemo(() => {
    const m = new Map<string, typeof spots>();
    for (const sp of spots) {
      if (!sp.activo) continue;
      const arr = m.get(sp.salaId) ?? [];
      arr.push(sp);
      m.set(sp.salaId, arr);
    }
    return m;
  }, [spots]);

  // Estable durante la vida de la página: evita recalcular `slots` en cada
  // render (Date.now() daría una dependencia nueva siempre).
  const now = useMemo(() => Date.now(), []);

  // Vista-modelo normalizado para el calendario — la lógica de reserva sigue
  // viviendo en useStudio(); aquí solo se proyectan los datos crudos.
  const slots = useMemo<ReservaSlot[]>(() => {
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > now)
      .map(s => {
        const tipo = tiposClase.find(tc => tc.id === s.tipoClaseId);
        const sala = salas.find(sl => sl.id === s.salaId);
        const instr = instructores.find(i => i.id === s.instructorId);
        const mia = miReservaPorSesion.get(s.id) ?? null;
        return {
          id: s.id,
          inicio: s.inicio,
          fin: s.fin,
          claseNombre: tipo?.nombre ?? 'Clase',
          claseColor: tipo?.color ?? 'var(--portal-brand)',
          nivel: tipo?.nivel ?? 'TODOS',
          descripcion: tipo?.descripcion ?? null,
          instructorNombre: instr?.nombre ?? null,
          instructorColor: instr?.color ?? null,
          instructorRol: instr?.rol ?? null,
          instructorFotoUrl: instr?.fotoUrl ?? null,
          salaNombre: sala?.nombre ?? null,
          aforoMaximo: s.aforoMaximo,
          ocupadas: ocupadasPorSesion.get(s.id) ?? 0,
          spots: spotsActivosPorSala.get(s.salaId) ?? [],
          spotsOcupados: spotsOcupadosPorSesion.get(s.id) ?? [],
          miReservaId: mia?.id ?? null,
          miEstado: mia ? (mia.estado as 'CONFIRMADA' | 'LISTA_ESPERA') : null,
          precio: cubierta ? null : precioClaseSuelta,
        } satisfies ReservaSlot;
      });
  }, [sesiones, now, tiposClase, salas, instructores, miReservaPorSesion, ocupadasPorSesion, spotsActivosPorSala, spotsOcupadosPorSesion, cubierta, precioClaseSuelta]);

  const misSlots = useMemo(() => slots.filter(s => s.miReservaId != null), [slots]);
  const totalConfirmadas = misSlots.filter(s => s.miEstado === 'CONFIRMADA').length;

  function handleReservar(slot: ReservaSlot, spotId: string | null) {
    if (!socioId) return;
    return addReserva(slot.id, socioId, spotId);
  }

  return (
    <div style={{ minHeight: '100%', background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 20px' }}>
        <h1 style={{ color: t.ink, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', lineHeight: 1 }}>Clases</h1>
        <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{totalConfirmadas} reservas activas</p>

        <div style={{ marginTop: 20 }}>
          <Tabs<Tab>
            items={[
              { id: 'proximas', label: 'Todas las clases' },
              { id: 'mis-reservas', label: 'Mis reservas', count: misSlots.length },
            ] as TabItem<Tab>[]}
            active={tab}
            onChange={setTab}
            scroll
          />
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: '0 16px 24px' }}>
        {tab === 'proximas' ? (
          <ReservaCalendario
            t={t}
            slots={slots}
            variant="calendario"
            onReservar={handleReservar}
            onCancelar={cancelarReserva}
            cancelacionVentanaHoras={studio?.cancelacionVentanaHoras}
          />
        ) : (
          <ReservaCalendario
            t={t}
            slots={misSlots}
            variant="lista"
            onReservar={handleReservar}
            onCancelar={cancelarReserva}
            cancelacionVentanaHoras={studio?.cancelacionVentanaHoras}
            vacio={{ titulo: 'Sin reservas activas', cuerpo: 'Reserva una clase en la pestaña anterior' }}
          />
        )}
      </div>
    </div>
  );
}
