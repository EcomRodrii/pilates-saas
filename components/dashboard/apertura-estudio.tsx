'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import type { AnalisisCapacidad, NivelRiesgo } from '@/lib/opening/capacidad';
import { notaEstimacion } from '@/lib/opening/textos';
import { EtapasLanzamiento } from './etapas-lanzamiento';
import { AjustesAperturaForm } from './ajustes-apertura';
import { OnboardingApertura } from './onboarding-apertura';
import { AperturaSuave, type EstadoAperturaSuave } from './apertura-suave';
import { EconomiaApertura } from './economia-apertura';
import type { AjustesApertura } from '@/lib/opening/ajustes';
import { ANCLA_DECIDIR } from '@/lib/estado-estudio-cliente';
import { ANCLA_LISTO, type Comprobacion } from '@/lib/opening/listo';

interface RespuestaApertura {
  visible: boolean;
  fechaApertura?: string | null;
  diasHastaApertura?: number | null;
  analisis?: AnalisisCapacidad;
  supuestos?: { sesionesSemanaSinTope: number; semanasBonoSinCaducidad: number; conversionLeads: number };
  ajustes?: AjustesApertura;
  onboarding?: { completado: true; puntos: string[]; objetivos: string[]; fechaAproximada: boolean } | null;
  recomendaciones?: { id: string; titulo: string; motivo: string; href: string }[];
  listo?: Comprobacion[];
  aperturaSuave?: EstadoAperturaSuave;
  alertas?: { tipo: string; severidad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'; titulo: string; descripcion: string; href: string }[];
}

const COLOR_ALERTA = {
  CRITICA: 'border-destructive/30 bg-destructive/10',
  ALTA: 'border-warning/30 bg-warning/10',
  MEDIA: 'border-border bg-background',
  BAJA: 'border-border bg-background',
} as const;

const RIESGO: Record<Exclude<NivelRiesgo, 'SIN_OFERTA'>, { clase: string; texto: string }> = {
  VERDE: { clase: 'text-success', texto: 'Hay sitio de sobra: buen momento para captar.' },
  AMARILLO: { clase: 'text-warning', texto: 'Se va llenando: vigila los horarios con más demanda.' },
  ROJO: { clase: 'text-destructive', texto: 'Vas a quedarte sin plazas: publica más horarios.' },
};

function titular(d: RespuestaApertura): string {
  const dias = d.diasHastaApertura;
  if (!d.fechaApertura || dias === null || dias === undefined) return d.onboarding ? 'Preparando tu apertura' : 'Preparemos tu apertura';
  // Aproximada: «hacia noviembre», nunca una cuenta atrás de días que no es real.
  if (d.onboarding?.fechaAproximada && dias > 0) {
    const mes = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d.fechaApertura}T00:00:00Z`));
    return `Abres hacia ${mes}`;
  }
  if (dias > 1) return `Abres en ${dias} días`;
  if (dias === 1) return 'Abres mañana';
  if (dias === 0) return 'Hoy abres tu estudio';
  return `Llevas ${-dias} ${dias === -1 ? 'día' : 'días'} abierto`;
}

async function pedirApertura(): Promise<RespuestaApertura | null> {
  try {
    const res = await fetch('/api/opening', { headers: await authHeader() });
    if (!res.ok) return null;
    const d = (await res.json()) as RespuestaApertura | null;
    // Sin dar por hecha la forma: un cuerpo inesperado no puede tumbar la home.
    if (!d || typeof d.visible !== 'boolean') return null;
    if (d.alertas !== undefined && !Array.isArray(d.alertas)) return null;
    if (d.recomendaciones !== undefined && !Array.isArray(d.recomendaciones)) return null;
    if (d.listo !== undefined && !Array.isArray(d.listo)) return null;
    if (d.visible && d.analisis && (typeof d.analisis.capacidadPublicada !== 'number'
      || !d.analisis.desglose?.ESTIMADA_POR_PLAN || !d.analisis.estimadasPorMotivo)) return null;
    return d;
  } catch {
    // Sección de ayuda: si no carga, no ocupa sitio en la home.
    return null;
  }
}

// Opening OS en la home. Solo se pinta mientras el estudio está abriendo: la
// API decide la visibilidad (lib/opening/visibilidad.ts) y devuelve
// `visible: false` en cualquier otro caso, incluido un rol sin permiso.
const ETIQUETA_ESTADO = {
  FALTA: (c: Comprobacion) => (c.bloquea ? 'Imprescindible' : 'Recomendado'),
  SIN_COMPROBAR: () => 'Sin comprobar',
} as const;

// «¿Lista para abrir?»: solo se enumera lo que falla, imprescindible primero.
// Lo que pasa se resume en una cifra. Nunca «todo listo» con algo sin comprobar.
function ListaParaAbrir({ listo, onComprobar, comprobando }: { listo: Comprobacion[]; onComprobar: () => void; comprobando: boolean }) {
  const ok = listo.filter(c => c.estado === 'OK').length;
  const fallan = listo.filter(c => c.estado !== 'OK')
    .sort((a, b) => Number(b.bloquea) - Number(a.bloquea));
  const todo = fallan.length === 0;
  return (
    <div id={ANCLA_LISTO} tabIndex={-1} className="mt-3 scroll-mt-4 rounded-xl border border-border bg-background px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-foreground">
          ¿Lista para abrir? <span className="tabular-nums text-muted-foreground">{ok} de {listo.length}</span>
        </p>
        <button type="button" onClick={onComprobar} disabled={comprobando}
          className="flex items-center gap-1 text-[12px] font-medium text-brand-secondary hover:underline disabled:opacity-60">
          <RefreshCw size={12} className={comprobando ? 'animate-spin' : ''} />
          {comprobando ? 'Comprobando…' : 'Comprobar'}
        </button>
      </div>
      {todo ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-success">
          <CheckCircle2 size={14} /> Todo lo imprescindible está listo: se puede reservar, comprar y facturar.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {fallan.map(c => {
            const cuerpo = (
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-foreground">{c.titulo}</span>
                  <span className={`rounded-full px-1.5 py-px text-[10.5px] font-medium ${
                    c.estado === 'SIN_COMPROBAR' ? 'bg-muted text-muted-foreground'
                      : c.bloquea ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning'}`}>
                    {c.estado === 'FALTA' ? ETIQUETA_ESTADO.FALTA(c) : ETIQUETA_ESTADO.SIN_COMPROBAR()}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
                  {c.detalle}{c.href ? '' : ' Lo resuelve la propietaria.'}
                </span>
              </span>
            );
            return (
              <li key={c.id}>
                {c.href ? (
                  <Link href={c.href} className="flex items-start justify-between gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-muted">
                    {cuerpo}
                    <ArrowRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                  </Link>
                ) : <div className="px-1 py-1">{cuerpo}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {!todo && ok > 0 && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{ok === 1 ? '1 punto comprobado' : `${ok} puntos comprobados`} ahora mismo y en orden.</p>
      )}
    </div>
  );
}

export function AperturaEstudio({ onVisible, verEconomia = false }: { onVisible?: (visible: boolean) => void; verEconomia?: boolean } = {}) {
  const [datos, setDatos] = useState<RespuestaApertura | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void pedirApertura().then(d => { if (vivo && d) setDatos(d); });
    return () => { vivo = false; };
  }, []);

  // La home esconde «Primeros pasos» mientras esta tarjeta manda: una diría que
  // Stripe está hecho (hay cuenta) y la otra que aún no cobra.
  const visible = !!datos?.visible;
  useEffect(() => { onVisible?.(visible); }, [visible, onVisible]);

  async function comprobar() {
    setComprobando(true);
    const d = await pedirApertura();
    if (d) setDatos(d);
    setComprobando(false);
  }

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

  async function patch(body: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch('/api/opening', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null;
        return j?.error ?? 'No se pudo guardar. Inténtalo de nuevo.';
      }
      const d = await pedirApertura();
      if (d) setDatos(d);
      return null;
    } catch {
      return 'Sin conexión. Inténtalo de nuevo.';
    }
  }

  async function guardarAjustes(cambios: { fechaApertura: string; ajustes: AjustesApertura }): Promise<string | null> {
    const err = await patch(cambios);
    if (!err) setAjustando(false);
    return err;
  }

  async function guardarOnboarding(onboarding: Record<string, unknown>): Promise<string | null> {
    setGuardando(true);
    const err = await patch({ onboarding });
    setGuardando(false);
    return err;
  }

  if (!datos?.visible) return null;
  const { analisis, supuestos } = datos;
  const sinFecha = !datos.fechaApertura;
  // El asistente solo para quien no lo ha hecho y tampoco tiene fecha: un
  // estudio que ya puso fecha antes de que existiera no lo repite.
  const mostrarOnboarding = !datos.onboarding && sinFecha;
  const semanas = analisis ? Math.round(analisis.ventana.dias / 7) : 0;
  // Su aviso vive en el propio bloque de «¿Lista para abrir?».
  const alertas = (datos.alertas ?? []).filter(a => a.tipo !== 'APERTURA_NO_LISTA');

  return (
    <div id={ANCLA_DECIDIR.alertasApertura} tabIndex={-1} className="scroll-mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-secondary">
          <CalendarClock size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{titular(datos)}</p>
          <p className="text-[11px] text-muted-foreground">
            {mostrarOnboarding ? 'Tres preguntas y te decimos por dónde empezar.'
              : sinFecha ? 'Cuando tengas fecha, te decimos si tus clases van a dar abasto.'
              : `Previsión de las próximas ${semanas} semanas`}
          </p>
        </div>
        {!mostrarOnboarding && datos.ajustes && !ajustando && (
          <button type="button" onClick={() => setAjustando(true)} className="shrink-0 text-[12px] font-medium text-brand-secondary hover:underline">
            {sinFecha ? 'Poner fecha' : 'Ajustar previsión'}
          </button>
        )}
      </div>

      {ajustando && datos.ajustes && (
        <AjustesAperturaForm
          fechaApertura={datos.fechaApertura ?? null}
          ajustes={datos.ajustes}
          onGuardar={guardarAjustes}
          onCancelar={() => setAjustando(false)}
        />
      )}

      {alertas.length > 0 && (
        <ul className="mt-3 space-y-2">
          {alertas.map(a => (
            <li key={a.tipo}>
              <Link href={a.href} className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors hover:opacity-90 ${COLOR_ALERTA[a.severidad] ?? COLOR_ALERTA.MEDIA}`}>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-foreground">{a.titulo}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{a.descripcion}</span>
                </span>
                <ArrowRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {mostrarOnboarding && (
        <OnboardingApertura onGuardar={guardarOnboarding} onYaAbierto={() => void enviar({ yaAbierto: true })} guardando={guardando} />
      )}

      {!mostrarOnboarding && (datos.listo?.length ?? 0) > 0 && (
        <ListaParaAbrir listo={datos.listo!} onComprobar={() => void comprobar()} comprobando={comprobando} />
      )}

      {!mostrarOnboarding && datos.aperturaSuave && typeof datos.aperturaSuave.activa === 'boolean' && (
        <AperturaSuave estado={datos.aperturaSuave} fechaApertura={datos.fechaApertura ?? null} onGuardar={patch} />
      )}

      {!mostrarOnboarding && (datos.recomendaciones?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="text-[11.5px] font-medium text-muted-foreground">Tu siguiente paso</p>
          <ul className="mt-1.5 space-y-1.5">
            {datos.recomendaciones!.map(r => (
              <li key={r.id}>
                <Link href={r.href} className="flex items-start justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted">
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-foreground">{r.titulo}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{r.motivo}</span>
                  </span>
                  <ArrowRight size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}

      {!mostrarOnboarding && analisis && (analisis.riesgo === 'SIN_OFERTA' ? (datos.alertas?.some(a => a.tipo === 'SIN_HORARIO') ? null : (
        <Link
          href="/calendario"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-[12.5px] text-foreground transition-colors hover:bg-muted"
        >
          <span>Aún no hay clases publicadas en las próximas {semanas} semanas. Sin horario no se puede reservar.</span>
          <ArrowRight size={14} className="shrink-0" />
        </Link>
      )) : (
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
              {notaEstimacion(analisis, supuestos.sesionesSemanaSinTope)}
            </p>
          )}
        </div>
      ))}

      {!mostrarOnboarding && verEconomia && <EconomiaApertura />}

      {!mostrarOnboarding && <EtapasLanzamiento onCambio={() => void pedirApertura().then(d => { if (d) setDatos(d); })} />}
    </div>
  );
}
