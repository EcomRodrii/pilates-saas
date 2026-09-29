'use client';

// Fase 4 (Booking Engine — Mi Cuenta): shell compartido entre Modo A/B, mismo
// criterio arquitectónico que <ReservaCalendario> — recibe todo por props,
// sin ningún hook de contexto dentro (ver docs/account-widget-diseno.md §2).
//
// `secciones` es configurable porque Modo A ya tiene una pestaña "Mis
// reservas" propia y más completa (calendario de Google, .ics, aviso de
// cancelación tardía con más detalle) — ahí "Cuenta" solo añade Bonos y
// Perfil. Modo B no tiene NADA de esto hoy, así que ahí se muestran las tres.
//
// F5 del rediseño de /reservar (29-sep-2026): el lenguaje de la app de la
// alumna. El título en negrita, como los de la app y la F4 (antes 24 px a peso
// normal), y las secciones en el segmentado de la app en vez de una fila de
// pestañas subrayadas. ⚠️ Solo estilos EN LÍNEA: esto lo compila también
// esbuild para el widget nativo, que hereda la letra de la web del estudio.
import { useState } from 'react';
import { X } from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Reserva, Sesion, TipoClase, Sala, Instructor, Suscripcion, PlanTarifa, Socio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { serif, sans, radius, pesoTitular } from '@/lib/reservar-publico-tokens';
import { MisReservasLista } from './mis-reservas-lista';
import { MisBonos } from './mis-bonos';
import { MiPerfil } from './mi-perfil';
import { Segmentado } from './segmentado';

type Seccion = 'reservas' | 'bonos' | 'perfil';
const ETIQUETA: Record<Seccion, string> = { reservas: 'Reservas', bonos: 'Bonos', perfil: 'Perfil' };

export function MiCuenta({
  t, secciones = ['reservas', 'bonos', 'perfil'],
  socio, reservas, sesiones, tiposClase, salas, instructores, suscripciones, planesTarifa,
  cancelacionVentanaHoras, ventanaPorTipo,
  onCancelar, onAceptarOferta, onActualizarPerfil, onLogout,
  onReservar, onVerPlanes,
}: {
  t: ModoTokens;
  secciones?: Seccion[];
  socio: Socio;
  reservas: Reserva[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  cancelacionVentanaHoras?: number;
  ventanaPorTipo?: Record<string, number>;
  onCancelar: (reservaId: string) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  onAceptarOferta?: (reservaId: string) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  onActualizarPerfil: (cambios: Record<string, unknown>) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  onLogout: () => void;
  /**
   * «Reservar una clase» bajo los bonos, como en la app. Solo lo pasa quien
   * tiene un horario al que llevar: la página suelta. El widget incrustado de
   * un solo propósito y el nativo no lo pasan, y el botón no sale.
   */
  onReservar?: () => void;
  /** «Ver bonos y membresías», solo si la sección de planes está en la misma página. */
  onVerPlanes?: () => void;
}) {
  const [seccion, setSeccion] = useState<Seccion>(secciones[0]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: sans, minWidth: 0 }}>
      <h2 style={{
        margin: 0, fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 26, lineHeight: 1.1,
        letterSpacing: '-.02em', color: t.ink,
      }}>
        Mi cuenta
      </h2>

      {secciones.length > 1 && (
        <Segmentado
          t={t}
          etiqueta="Secciones de tu cuenta"
          opciones={secciones.map(s => ({ id: s, label: ETIQUETA[s] }))}
          valor={seccion}
          onCambiar={setSeccion}
        />
      )}

      {/* `key`: al cambiar de sección, lo nuevo entra (`reserva-banner-in`, que
          existe en las dos hojas: globals.css y widget.css). */}
      <div key={seccion} className="reserva-banner-in" style={{ minWidth: 0 }}>
        {seccion === 'reservas' && (
          <MisReservasLista
            t={t} reservas={reservas} sesiones={sesiones} tiposClase={tiposClase} salas={salas} instructores={instructores}
            cancelacionVentanaHoras={cancelacionVentanaHoras} ventanaPorTipo={ventanaPorTipo}
            onCancelar={onCancelar} onAceptarOferta={onAceptarOferta}
          />
        )}
        {seccion === 'bonos' && (
          <MisBonos
            t={t} suscripciones={suscripciones} planesTarifa={planesTarifa} tiposClase={tiposClase} socioId={socio.id}
            onReservar={onReservar} onVerPlanes={onVerPlanes}
          />
        )}
        {seccion === 'perfil' && (
          <MiPerfil t={t} socio={socio} onActualizarPerfil={onActualizarPerfil} onLogout={onLogout} />
        )}
      </div>
    </div>
  );
}

/**
 * Hoja modal (Modo B, sin router). Mismo patrón visual que el BookingSheet de
 * <ReservaCalendario> — y, desde la auditoría de UX (2026-08-31), las MISMAS
 * dos clases de animación (`animate-sheet-backdrop-in`/`reserva-sheet-in`,
 * ya en `widget.css`/`globals.css`, ninguna nueva): antes aparecía/
 * desaparecía de golpe, la única hoja del widget sin transición.
 */
export function HojaCuentaWidget({ t, onClose, children }: { t: ModoTokens; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      className="animate-sheet-backdrop-in"
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)' }}
    >
      <div onClick={e => e.stopPropagation()} className="reserva-sheet-in" style={{
        width: '100%', background: t.bg, borderRadius: '24px 24px 0 0', padding: '10px 20px 24px',
        display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: t.line, margin: '6px auto 4px', flexShrink: 0 }} />
        {/* 44 px (medía 34): es lo que se toca con el pulgar para salir. */}
        <button type="button" onClick={onClose} aria-label="Cerrar" style={{
          alignSelf: 'flex-end', width: 44, height: 44, borderRadius: radius.navCircle, border: `1px solid ${t.line}`,
          background: t.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.ink,
          flexShrink: 0,
        }}>
          <X size={18} aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}
