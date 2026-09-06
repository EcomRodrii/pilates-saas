'use client';

import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { SpotMap } from '@/components/spots/spot-map';
import { ListaClientas, type ListaClientasProps } from './lista-clientas';
import { HistorialSesion } from './historial-sesion';
import { PINTA, type EstadoSesion } from '@/lib/calendario-estado';
import { cn, horaEstudio } from '@/lib/utils';
import type { EventoHistorial } from '@/lib/calendario-historial';
import type { Reserva, Socio, Spot } from '@/lib/types';

// Rediseño del Calendario — punto 5: panel lateral (no modal), 3 pestañas.
// Plazas reutiliza SpotMap tal cual (mismo componente que ya usan otras
// pantallas); Clientas y Historial son piezas nuevas de este rediseño.
export type PestanaSesion = 'clientas' | 'plazas' | 'historial';

export interface PanelSesionProps {
  abierto: boolean;
  onCerrar: () => void;
  pestana: PestanaSesion;
  onCambiarPestana: (p: PestanaSesion) => void;

  titulo: string;
  horaTexto: string;
  /**
   * Quién la da y dónde. El panel decía «Pilates Reformer · 09:00–09:50 ·
   * Programada» y nada más: con 9 instructoras y 2 salas, la propietaria tenía
   * que abrir «Editar» para saber a quién estaba sustituyendo o en qué sala
   * caía la clase que acababa de abrir. `null` = dato desconocido.
   */
  instructoraNombre?: string | null;
  salaNombre?: string | null;
  estado: EstadoSesion;
  /** 0..1 — barra de ocupación bajo la cabecera. null la oculta (p.ej. sesión aún no resuelta). */
  ocupacion: { confirmadas: number; aforoMaximo: number } | null;
  /** Editar/Cubrir con.../No puedo asistir/Cancelar/Eliminar — la propia
   *  pantalla decide qué botones hay según rol/esPropiaClase, este panel solo
   *  les da un sitio fijo bajo la cabecera (independiente de la pestaña activa). */
  accionesCabecera?: React.ReactNode;

  clientas: ListaClientasProps;
  /** Alertas pre-clase / preparación IA / buscador "añadir clienta" — contenido
   *  que no cambia con el rediseño, solo con dónde vive (antes de la lista). */
  extraClientas?: React.ReactNode;
  eventosHistorial: EventoHistorial[];

  // Plazas — null cuando la sala no tiene mapa de spots configurado.
  spots: Spot[] | null;
  reservasConSocio: (Reserva & { socio: Socio; spot: Spot | null })[];
  socios: Socio[];
  onCheckinSpot?: (reservaId: string) => void;
  onLiberarSpot?: (reservaId: string) => void;
  onAsignarSpot?: (spotId: string, socioId: string) => void;
}

// "Sustituciones", no "Historial" (pilar 6, hallazgo de UX): el contenido de
// esta pestaña está acotado a cobertura/instructora — nunca fue ni pretende
// ser un historial general de asistencia de la clase (ver el comentario de
// lib/calendario-historial.ts). El nombre viejo prometía más de lo que había.
const PESTANAS: { id: PestanaSesion; label: string }[] = [
  { id: 'clientas', label: 'Clientas' },
  { id: 'plazas', label: 'Plazas' },
  { id: 'historial', label: 'Sustituciones' },
];

export function PanelSesion({
  abierto, onCerrar, pestana, onCambiarPestana, titulo, horaTexto, estado, ocupacion, accionesCabecera,
  instructoraNombre = null, salaNombre = null,
  clientas, extraClientas, eventosHistorial, spots, reservasConSocio, socios,
  onCheckinSpot, onLiberarSpot, onAsignarSpot,
}: PanelSesionProps) {
  const p = PINTA[estado];
  const ratio = ocupacion && ocupacion.aforoMaximo > 0 ? ocupacion.confirmadas / ocupacion.aforoMaximo : 0;
  const pct = Math.round(ratio * 100);
  // El badge de cabecera (p.label) es pequeño y se pierde entre hora/ocupación —
  // esta clase ya empezó (o terminó) es lo bastante importante como para no
  // depender solo de leer el color del badge. Mismos tres estados que ya
  // implican `ahora >= inicio` en estadoSesion().
  const yaEmpezada = estado === 'EN_CURSO' || estado === 'FINALIZADA' || estado === 'SIN_PASAR_LISTA';

  return (
    <DashboardDrawer open={abierto} onClose={onCerrar} label={titulo}>
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground truncate">{titulo}</p>
            <p className="text-[12px] text-muted-foreground">
              {horaTexto} · <span style={{ color: p.tinta }}>{p.label}</span>
            </p>
            {(instructoraNombre || salaNombre) && (
              <p className="text-[12px] text-muted-foreground truncate">
                {instructoraNombre ? `Con ${instructoraNombre}` : 'Sin instructora'}
                {salaNombre ? ` · ${salaNombre}` : ''}
              </p>
            )}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            ✕
          </button>
        </div>
        {ocupacion && (
          <div className="mt-2.5 space-y-1">
            <div className="flex justify-between text-[11px] font-semibold">
              <span className="text-muted-foreground">Ocupación</span>
              <span style={{ color: p.tinta }}>{pct}% · {ocupacion.confirmadas}/{ocupacion.aforoMaximo}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: p.tinta }} />
            </div>
          </div>
        )}
        {yaEmpezada && (
          <p
            className="mt-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
            style={{ background: PINTA.SIN_INSTRUCTORA.fondo, color: PINTA.SIN_INSTRUCTORA.tinta }}
          >
            {estado === 'EN_CURSO' ? 'Esta clase ya ha empezado' : 'Esta clase ya ha terminado'} — no se puede editar ni reasignar instructora.
          </p>
        )}
      </div>

      {accionesCabecera && (
        // ⚠️ `flex-wrap`, no `nowrap`. Con nowrap esta barra pedía 555 px en un
        // panel de 420 y el desbordamiento no se veía: se comía «Cancelar»
        // —dejando a la vista solo la × de su icono, que parecía un botón de
        // cerrar suelto— y «Eliminar» entero. Dos acciones inalcanzables, no un
        // recorte estético. Envolver es mejor que un scroll horizontal aquí:
        // nadie descubre que una barra de botones se desplaza.
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          {accionesCabecera}
        </div>
      )}

      <div className="flex flex-none border-b border-border px-2">
        {PESTANAS.map(t => (
          <button
            key={t.id}
            onClick={() => onCambiarPestana(t.id)}
            className={cn(
              'px-3.5 py-2.5 text-[12.5px] font-bold border-b-2 -mb-px transition-colors',
              pestana === t.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {pestana === 'clientas' && (
          <>
            {extraClientas}
            <ListaClientas {...clientas} />
          </>
        )}
        {pestana === 'plazas' && (
          spots && spots.length > 0 ? (
            <SpotMap
              spots={spots}
              reservas={reservasConSocio}
              socios={socios}
              onCheckin={onCheckinSpot}
              onQuitarSpot={onLiberarSpot}
              onAsignarSpot={onAsignarSpot}
            />
          ) : (
            <div className="flex items-center justify-center h-32 rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground">
              Sala sin mapa de spots
            </div>
          )
        )}
        {pestana === 'historial' && <HistorialSesion eventos={eventosHistorial} />}
      </div>
    </DashboardDrawer>
  );
}

// Solo para que quien componga (Etapa 9) formatee la cabecera igual en todos
// los sitios que abran este panel.
export function horaTextoSesion(inicio: string, fin: string): string {
  return `${horaEstudio(inicio)} – ${horaEstudio(fin)}`;
}
