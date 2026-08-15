'use client';

// Fase 4 (Booking Engine — Mi Cuenta): shell compartido entre Modo A/B, mismo
// criterio arquitectónico que <ReservaCalendario> — recibe todo por props,
// sin ningún hook de contexto dentro (ver docs/account-widget-diseno.md §2).
//
// `secciones` es configurable porque Modo A ya tiene una pestaña "Mis
// reservas" propia y más completa (calendario de Google, .ics, aviso de
// cancelación tardía con más detalle) — ahí "Cuenta" solo añade Bonos y
// Perfil. Modo B no tiene NADA de esto hoy, así que ahí se muestran las tres.
import { useState } from 'react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Reserva, Sesion, TipoClase, Sala, Instructor, Suscripcion, PlanTarifa, Socio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
import { serif, sans, radius } from '@/lib/reservar-publico-tokens';
import { MisReservasLista } from './mis-reservas-lista';
import { MisBonos } from './mis-bonos';
import { MiPerfil } from './mi-perfil';

type Seccion = 'reservas' | 'bonos' | 'perfil';
const ETIQUETA: Record<Seccion, string> = { reservas: 'Reservas', bonos: 'Bonos', perfil: 'Perfil' };

export function MiCuenta({
  t, secciones = ['reservas', 'bonos', 'perfil'],
  socio, reservas, sesiones, tiposClase, salas, instructores, suscripciones, planesTarifa,
  cancelacionVentanaHoras, ventanaPorTipo,
  onCancelar, onAceptarOferta, onActualizarPerfil, onLogout,
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
}) {
  const [seccion, setSeccion] = useState<Seccion>(secciones[0]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, fontFamily: sans }}>
      <h2 style={{ fontFamily: serif, fontSize: 24, color: t.ink }}>Mi cuenta</h2>

      {secciones.length > 1 && (
        <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${t.line}` }}>
          {secciones.map(s => (
            <button key={s} type="button" onClick={() => setSeccion(s)} style={{
              fontSize: 12.5, fontWeight: 800, padding: '10px 4px', marginRight: 14, background: 'none', border: 'none',
              borderBottom: seccion === s ? '2px solid var(--portal-brand)' : '2px solid transparent',
              color: seccion === s ? t.ink : t.muted, cursor: 'pointer',
            }}>
              {ETIQUETA[s]}
            </button>
          ))}
        </div>
      )}

      {seccion === 'reservas' && (
        <MisReservasLista
          t={t} reservas={reservas} sesiones={sesiones} tiposClase={tiposClase} salas={salas} instructores={instructores}
          cancelacionVentanaHoras={cancelacionVentanaHoras} ventanaPorTipo={ventanaPorTipo}
          onCancelar={onCancelar} onAceptarOferta={onAceptarOferta}
        />
      )}
      {seccion === 'bonos' && (
        <MisBonos t={t} suscripciones={suscripciones} planesTarifa={planesTarifa} tiposClase={tiposClase} socioId={socio.id} />
      )}
      {seccion === 'perfil' && (
        <MiPerfil t={t} socio={socio} onActualizarPerfil={onActualizarPerfil} onLogout={onLogout} />
      )}
    </div>
  );
}

/** Hoja modal (Modo B, sin router). Mismo patrón visual que el BookingSheet de <ReservaCalendario>. */
export function HojaCuentaWidget({ t, onClose, children }: { t: ModoTokens; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)' }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', background: t.bg, borderRadius: '24px 24px 0 0', padding: '10px 20px 24px',
        display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: t.line, margin: '6px auto 4px', flexShrink: 0 }} />
        <button type="button" onClick={onClose} aria-label="Cerrar" style={{
          alignSelf: 'flex-end', width: 34, height: 34, borderRadius: radius.navCircle, border: `1px solid ${t.line}`,
          background: t.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.ink,
        }}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
