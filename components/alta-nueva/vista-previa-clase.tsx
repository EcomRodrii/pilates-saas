'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Así la verá tu alumna · en vivo» de «Tu primera clase» (paso 6 del alta).
//
// La maqueta pide «tu app real», y eso no se puede: una clase que todavía no
// está guardada no sale en la app, y un iframe solo enseñaría el horario
// vacío. Lo que se pinta es la tarjeta de clase de la página de reservas
// (`TarjetaClaseReservar`, components/reserva/reserva-calendario.tsx) con la
// clase en memoria, el color publicado del estudio (sus variables
// `--portal-*`, `themeToCssVars`) y la paleta de día de la página. Lo de
// alrededor (el nombre del estudio, el día, qué se vende) es un marco sencillo.
// ⚠️ Es un dibujo del mismo contenido (nombre, hora, plazas, precio), no la
// tarjeta de la app: por eso el pie no dice «así es tu app», dice qué verá.
//
// Sin interacción: es una vista previa (`inert`).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type CSSProperties } from 'react';
import { TarjetaClaseReservar, type ReservaSlot } from '@/components/reserva/reserva-calendario';
import { fetchThemePublicado } from '@/lib/api-client';
import { themeToCssVars } from '@/lib/theme-runtime';
import { MODO_TOKENS } from '@/lib/portal-paleta';
import { sans } from '@/lib/reservar-publico-tokens';
import { colorPorIndice } from '@/lib/onboarding/plan-configuracion';
import { finConDuracion, instantesDe } from '@/lib/calendario/nueva-clase';
import { esHoraHHMM } from '@/lib/citas/slots';
import { etiquetaDia, lineaDeVenta, precioEnTarjeta, type FormPrimeraClase } from '@/lib/alta/primera-clase';
import { hoyEnEstudio } from '@/lib/utils';
import type { Studio } from '@/lib/types';

const T = MODO_TOKENS.dia;

/** El color publicado del estudio, como lo pinta su página. Sin red, el de serie. */
function useVarsDelPortal(): CSSProperties {
  const [vars, setVars] = useState<CSSProperties>(() => themeToCssVars(null));
  useEffect(() => {
    let vivo = true;
    fetchThemePublicado().then(t => { if (vivo) setVars(themeToCssVars(t)); }).catch(() => { /* el de serie */ });
    return () => { vivo = false; };
  }, []);
  return vars;
}

export function VistaPreviaClase({ studio, form, instructora }: {
  studio: Studio;
  form: FormPrimeraClase;
  /** Quien la da, como saldrá en la tarjeta. */
  instructora: string;
}) {
  const vars = useVarsDelPortal();
  const fin = esHoraHHMM(form.hora) ? finConDuracion(form.hora, form.duracion) : null;
  const instantes = fin && /^\d{4}-\d{2}-\d{2}$/.test(form.fecha) ? instantesDe(form.fecha, form.hora, fin) : null;
  const venta = lineaDeVenta(form);
  const direccion = [studio.ciudad?.trim(), studio.direccion?.trim()].filter(Boolean).join(' · ');
  const slot: ReservaSlot | null = instantes ? {
    id: 'vista-previa-primera-clase',
    inicio: instantes.inicio,
    fin: instantes.fin,
    tipoClaseId: null,
    claseNombre: form.nombre.trim() || 'Tu clase',
    claseColor: colorPorIndice(0),
    nivel: 'TODOS',
    instructorNombre: instructora.trim() || null,
    salaNombre: form.sala.trim() || null,
    aforoMaximo: Math.max(1, form.plazas || 1),
    ocupadas: 0,
    spots: [],
    spotsOcupados: [],
    miReservaId: null,
    miEstado: null,
    precio: precioEnTarjeta(form),
  } : null;

  return (
    <div
      className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[28px] border-[6px] border-foreground/85 shadow-xl"
      data-testid="vista-previa-clase"
      aria-hidden
      {...({ inert: true } as object)}
    >
      <div style={{ ...vars, background: T.bg, color: T.ink, fontFamily: sans, padding: '18px 14px 20px' } as CSSProperties}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-.01em' }}>{studio.nombre || 'Tu estudio'}</p>
        {direccion && <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted }}>{direccion}</p>}
        <p style={{ margin: '16px 0 8px', fontSize: 12, fontWeight: 700, color: T.muted }}>
          {/^\d{4}-\d{2}-\d{2}$/.test(form.fecha) ? etiquetaDia(form.fecha, hoyEnEstudio()) : 'Elige el día'}
          {form.semanal ? ' · cada semana' : ''}
        </p>
        {slot
          ? <TarjetaClaseReservar t={T} slot={slot} onOpen={() => {}} ocultarPrecio={false} />
          : <p style={{ margin: 0, padding: '28px 12px', textAlign: 'center', fontSize: 13, color: T.muted, border: `1px dashed ${T.line}`, borderRadius: 16 }}>Elige la hora y la verás aquí.</p>}
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
          <span style={{ fontWeight: 700 }}>{venta.tarifa}</span>
          <span style={{ color: T.muted, textAlign: 'right' }}>{venta.pago}</span>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 12, color: T.muted }}>Las demás clases saldrán aquí, por días.</p>
      </div>
    </div>
  );
}
