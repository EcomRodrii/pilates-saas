'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import type { AnalisisCapacidad, NivelRiesgo } from '@/lib/opening/capacidad';

interface RespuestaApertura {
  visible: boolean;
  fechaApertura?: string | null;
  diasHastaApertura?: number | null;
  analisis?: AnalisisCapacidad;
  supuestos?: { sesionesSemanaSinTope: number; semanasBonoSinCaducidad: number; conversionLeads: number };
}

const RIESGO: Record<Exclude<NivelRiesgo, 'SIN_OFERTA'>, { clase: string; texto: string }> = {
  VERDE: { clase: 'text-success', texto: 'Hay sitio de sobra: buen momento para captar.' },
  AMARILLO: { clase: 'text-warning', texto: 'Se va llenando: vigila los horarios con más demanda.' },
  ROJO: { clase: 'text-destructive', texto: 'Vas a quedarte sin plazas: publica más horarios.' },
};

function titular(dias: number | null | undefined): string {
  if (dias === null || dias === undefined) return '¿Cuándo abres tu estudio?';
  if (dias > 1) return `Abres en ${dias} días`;
  if (dias === 1) return 'Abres mañana';
  if (dias === 0) return 'Hoy abres tu estudio';
  return `Llevas ${-dias} ${dias === -1 ? 'día' : 'días'} abierto`;
}

// Opening OS en la home. Solo se pinta mientras el estudio está abriendo: la
// API decide la visibilidad (lib/opening/visibilidad.ts) y devuelve
// `visible: false` en cualquier otro caso, incluido un rol sin permiso.
async function pedirApertura(): Promise<RespuestaApertura | null> {
  try {
    const res = await fetch('/api/opening', { headers: await authHeader() });
    if (!res.ok) return null;
    return (await res.json()) as RespuestaApertura;
  } catch {
    // Sección de ayuda: si no carga, no ocupa sitio en la home.
    return null;
  }
}

export function AperturaEstudio() {
  const [datos, setDatos] = useState<RespuestaApertura | null>(null);
  const [fecha, setFecha] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void pedirApertura().then(d => { if (vivo && d) setDatos(d); });
    return () => { vivo = false; };
  }, []);

  async function enviar(body: Record<string, unknown>) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/opening', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        setError(j?.error ?? 'No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      const d = await pedirApertura();
      if (d) setDatos(d);
    } catch {
      setError('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  if (!datos?.visible) return null;
  const { analisis, supuestos } = datos;
  const sinFecha = !datos.fechaApertura;
  const semanas = analisis ? Math.round(analisis.ventana.dias / 7) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-secondary">
          <CalendarClock size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">{titular(datos.diasHastaApertura)}</p>
          <p className="text-[11px] text-muted-foreground">
            {sinFecha ? 'Con la fecha te decimos si tus clases van a dar abasto.' : `Previsión de las próximas ${semanas} semanas`}
          </p>
        </div>
      </div>

      {sinFecha && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(ev) => { ev.preventDefault(); if (fecha) void enviar({ fechaApertura: fecha }); }}
        >
          <label htmlFor="fecha-apertura" className="sr-only">Fecha de apertura</label>
          <input
            id="fecha-apertura"
            type="date"
            value={fecha}
            onChange={(ev) => setFecha(ev.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground"
          />
          <button
            type="submit"
            disabled={!fecha || guardando}
            className="h-9 rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar fecha'}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void enviar({ yaAbierto: true })}
            className="h-9 px-2 text-[12px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          >
            Mi estudio ya está abierto
          </button>
        </form>
      )}

      {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}

      {analisis && (analisis.riesgo === 'SIN_OFERTA' ? (
        <Link
          href="/calendario"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-[12.5px] text-foreground transition-colors hover:bg-muted"
        >
          <span>Aún no hay clases publicadas en las próximas {semanas} semanas. Sin horario no se puede reservar.</span>
          <ArrowRight size={14} className="shrink-0" />
        </Link>
      ) : (
        <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] text-muted-foreground">Ocupación prevista</span>
            <span className={`text-[18px] font-semibold tabular-nums ${RIESGO[analisis.riesgo].clase}`}>
              {Math.round((analisis.ocupacionPrevista ?? 0) * 100)} %
            </span>
          </div>
          <p className={`mt-0.5 text-[12px] ${RIESGO[analisis.riesgo].clase}`}>{RIESGO[analisis.riesgo].texto}</p>
          <dl className="mt-2 space-y-1 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Plazas publicadas</dt>
              <dd className="tabular-nums text-foreground">{analisis.capacidadPublicada} en {analisis.sesionesEnVentana} clases</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Plazas que usarán tus cuotas activas</dt>
              <dd className="tabular-nums text-foreground">{analisis.demandaComprometida}</dd>
            </div>
            {analisis.leads > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Si se apunta el {Math.round((supuestos?.conversionLeads ?? 0) * 100)} % de tus {analisis.leads} interesadas</dt>
                <dd className="tabular-nums text-foreground">+{analisis.demandaPotencial}</dd>
              </div>
            )}
          </dl>
          {analisis.desglose.ESTIMADA_POR_PLAN.suscripciones > 0 && supuestos && (
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {analisis.desglose.ESTIMADA_POR_PLAN.suscripciones} de tus cuotas aún no tienen historial: las estimamos
              por su plan (las que no tienen tope, a {supuestos.sesionesSemanaSinTope} clases por semana).
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
