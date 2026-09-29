'use client';

// Fase 4 (Booking Engine — Mi Cuenta): saldo de bonos/membresía, compartido
// entre Modo A y Modo B. Cero lógica de negocio nueva — reutiliza
// `bonoActivo()` (lib/bonos-portal.ts), ya testeado, exactamente como hace
// PortalBonosView.
//
// F5 del rediseño de /reservar (29-sep-2026): la tarjeta de «Bonos» de la app
// de la alumna. «Te quedan» con la cifra grande y «de 8 sesiones» debajo, y
// «caduca jue 31 dic» a la derecha; las palabras las decide
// lib/reservar/mi-cuenta.ts. Debajo, la salida: reservar, o ver los bonos que
// vende el estudio (solo donde hay adónde llevar).
//
// ⚠️ Solo estilos EN LÍNEA: esto también lo compila esbuild para el widget
// nativo, que no tiene Tailwind.
import { Ticket } from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Suscripcion, PlanTarifa, TipoClase } from '@/lib/types';
import { bonoActivo } from '@/lib/bonos-portal';
import { saldoBono, type BonoDeLaSocia } from '@/lib/reservar/mi-cuenta';
import { hoyEnEstudio } from '@/lib/utils';
import { pesoTitular, sans, serif, textoSemantico } from '@/lib/reservar-publico-tokens';
import { InsigniaEstado } from './tarjeta-reserva';

/** La micro-etiqueta en versales de la app (`.t-label`). */
const ETIQUETA = {
  margin: 0, fontFamily: sans, fontSize: 11, fontWeight: 800, letterSpacing: '.1em',
  textTransform: 'uppercase',
} as const;

export function MisBonos({
  t, suscripciones, planesTarifa, tiposClase, socioId, onReservar, onVerPlanes,
}: {
  t: ModoTokens;
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  tiposClase: TipoClase[];
  socioId: string | null;
  onReservar?: () => void;
  onVerPlanes?: () => void;
}) {
  const bono = bonoActivo(suscripciones, planesTarifa, tiposClase, socioId);

  if (!bono) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center',
        padding: '32px 20px', background: t.surface, border: `1px solid ${t.line}`,
        borderRadius: 'var(--reservar-radio-tarjeta, 20px)', fontFamily: sans,
      }}>
        <span aria-hidden="true" style={{
          width: 52, height: 52, borderRadius: 999, marginBottom: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: t.surface2, color: t.muted,
        }}>
          <Ticket size={22} />
        </span>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.35, color: t.ink }}>
          No tienes ningún bono ni plan activo.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: t.muted, maxWidth: 300 }}>
          Cuando tengas uno, aquí verás cuántas sesiones te quedan y hasta cuándo.
        </p>
        {onVerPlanes && (
          <button type="button" onClick={onVerPlanes} className="reservar-foco" style={{ ...ctaPrincipal, width: 'auto', padding: '0 24px', marginTop: 12 }}>
            Ver bonos y membresías
          </button>
        )}
      </div>
    );
  }

  // El día del estudio, para saber si una caducidad ya pasó. Es el mismo reloj
  // que usa `bonoActivo` por dentro para contar los días.
  const hoy = hoyEnEstudio();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: sans }}>
      {bono.bonos.map((b, i) => (
        <TarjetaBono
          key={`${b.nombre}-${i}`}
          t={t}
          nombre={b.nombre}
          bono={b}
          hoy={hoy}
          // `urgente` es del titular (el primero, el que se consume antes): el
          // mismo umbral que ya usa el panel, sin recalcularlo aquí.
          urgente={i === 0 && bono.urgente}
          orden={i}
        />
      ))}

      {(onReservar || onVerPlanes) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 6 }}>
          {onReservar && (
            <button type="button" onClick={onReservar} className="reservar-foco" style={ctaPrincipal}>
              Reservar una clase
            </button>
          )}
          {onVerPlanes && (
            <button type="button" onClick={onVerPlanes} className="reservar-foco" style={{
              minHeight: 44, padding: '0 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: sans, fontSize: 13, fontWeight: 800,
              color: 'var(--portal-brand-texto, var(--portal-brand))',
            }}>
              Ver bonos y membresías →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** La acción principal: la del estudio, a todo el ancho, como la de la app. */
const ctaPrincipal = {
  width: '100%', minHeight: 50, padding: '0 20px', border: 'none', cursor: 'pointer',
  borderRadius: 'var(--reservar-radio-boton, 999px)',
  background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
  fontFamily: sans, fontSize: 14.5, fontWeight: 800,
  boxShadow: '0 14px 30px -14px rgba(15,15,15,.45)',
} as const;

function TarjetaBono({ t, nombre, bono, hoy, urgente, orden }: {
  t: ModoTokens;
  nombre: string;
  bono: BonoDeLaSocia;
  hoy: string;
  urgente: boolean;
  orden: number;
}) {
  const s = saldoBono(bono, hoy);
  // Ámbar solo en lo que cuenta la urgencia (la barra y la fecha), medido
  // contra la tarjeta que se ve: el `#A65A0A` fijo daba 3,1:1 en Carbón.
  const aviso = urgente ? textoSemantico('warning', t) : null;
  return (
    <article style={{
      animation: `reserva-card-in .35s cubic-bezier(.16,1,.3,1) ${Math.min(orden, 5) * 40}ms both`,
      padding: '16px 18px', background: t.surface, border: `1px solid ${t.line}`,
      borderRadius: 'var(--reservar-radio-tarjeta, 20px)', minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h3 style={{
          margin: 0, minWidth: 0, fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 15.5, lineHeight: 1.25,
          letterSpacing: '-.01em', color: t.ink, overflowWrap: 'anywhere',
        }}>
          {nombre}
        </h3>
        <InsigniaEstado t={t} texto={s.etiqueta} tono={s.etiqueta === 'Activo' ? 'reservada' : 'neutro'} />
      </div>

      {s.progreso != null && (
        // La cifra de abajo ya lo dice: la barra es solo el gesto.
        <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: t.surface2, marginTop: 12, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${s.progreso * 100}%`, borderRadius: 999,
            background: aviso ?? 'var(--portal-brand)',
          }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
        {s.cifra != null ? (
          // Una sola frase para el lector de pantalla («Te quedan 5 de 8
          // sesiones»), en tres líneas para el ojo: los espacios entre los
          // `span` en bloque son los que la mantienen legible al leerla.
          <p style={{ margin: 0, minWidth: 0 }}>
            <span style={{ ...ETIQUETA, display: 'block', color: t.muted }}>Te quedan</span>{' '}
            <span style={{
              display: 'block', marginTop: 2, fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 34,
              lineHeight: 1.02, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: t.ink,
            }}>
              {s.cifra}
            </span>{' '}
            <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, color: t.muted }}>{s.deTotal}</span>
          </p>
        ) : (
          <p style={{ margin: 0, fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 16, color: t.ink }}>
            Clases sin límite
          </p>
        )}
        <p style={{
          margin: 0, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: aviso ? 700 : 500,
          fontVariantNumeric: 'tabular-nums', color: aviso ?? t.muted,
        }}>
          {s.caduca}
        </p>
      </div>
    </article>
  );
}
