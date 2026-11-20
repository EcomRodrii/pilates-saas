'use client';

// La tarjeta del Resumen con la guía paso a paso: el paso que toca, explicado en una frase, con su
// botón. «Se marca solo cuando lo haces». Terminada, «Tu estudio está en marcha» (solo el primer mes).

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Flag, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { hrefPaso, RUTA_GUIA } from '@/lib/guia/ruta-puesta-en-marcha';
import { BOTON_DESTACADO, Baldosa, fondoTenido } from '@/components/dashboard/vivo';
import { cn } from '@/lib/utils';
import { useGuiaPasoAPaso } from './use-guia-paso-a-paso';
import { BarraTramos, ICONOS_PASO, TONO_PASO } from './guia-paso-a-paso-vista';

export function TarjetaGuiaResumen() {
  const { studio, updateStudio } = useStudio();
  const { ruta, ocultada, saltar } = useGuiaPasoAPaso();
  const [ocultando, setOcultando] = useState(false);
  const [fallo, setFallo] = useState(false);
  // La hora de entrar, una vez: el render no puede leer el reloj (react-hooks/purity).
  const [alMontar] = useState(() => Date.now());
  if (!studio || !ruta || ocultada) return null;

  async function ocultar() {
    if (ocultando) return;
    setOcultando(true);
    setFallo(false);
    const res = await Promise.resolve(updateStudio({ onboardingDescartadoEn: new Date().toISOString() })).catch(() => ({ ok: false }));
    if ((res as { ok?: boolean } | undefined)?.ok === false) setFallo(true);
    setOcultando(false);
  }
  const botonOcultar = (
    <button type="button" onClick={ocultar} disabled={ocultando} aria-label="Ocultar la guía"
      className="-m-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
      <X size={16} />
    </button>
  );
  const error = fallo && <p role="alert" className="mt-2 text-[12px] text-destructive">No se ha podido ocultar. Inténtalo otra vez.</p>;

  if (ruta.terminada) {
    const dias = studio.creadoEn ? (alMontar - Date.parse(studio.creadoEn)) / 86_400_000 : Infinity;
    if (!(dias <= 30)) return null;
    return (
      <section aria-labelledby="guia-resumen-titulo" data-testid="pon-en-marcha" data-terminada="" className="rounded-t-card border p-5 shadow-t-card sm:p-6" style={fondoTenido('verde', 18)}>
        <div className="flex items-start gap-3">
          <Baldosa tono="verde" Icono={Check} tamano="sm" />
          <div className="min-w-0 flex-1">
            <h2 id="guia-resumen-titulo" className="text-[16px] font-semibold leading-tight text-foreground">Tu estudio está en marcha</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Has hecho los {ruta.total} pasos. Ya recibes reservas.</p>
          </div>
          {botonOcultar}
        </div>
        {error}
      </section>
    );
  }

  const t = ruta.ahora;
  if (!t) return null;
  const Icono = ICONOS_PASO[t.icono];
  return (
    <section
      aria-labelledby="guia-resumen-titulo"
      data-testid="pon-en-marcha"
      data-guia=""
      className="rounded-t-card border p-5 shadow-t-card sm:p-6"
      style={{
        backgroundImage: 'linear-gradient(135deg, var(--card) 45%, color-mix(in srgb, var(--t-blue-500) 7%, var(--card)) 100%)',
        borderColor: 'color-mix(in srgb, var(--t-blue-500) 12%, var(--border))',
      }}
    >
      <div className="flex items-start gap-3">
        <Baldosa tono="magenta" Icono={Flag} tamano="sm" />
        <div className="min-w-0 flex-1">
          <h2 id="guia-resumen-titulo" className="text-[16px] font-semibold leading-tight text-foreground">
            <span data-recorrido="lista" className="inline-block">Pon en marcha tu estudio</span>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Te llevamos por todo, paso a paso. Se marca solo cuando lo haces.</p>
        </div>
        {botonOcultar}
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
        <b className="text-[15px] font-semibold text-foreground" data-testid="paso-de-cinco">{ruta.etiqueta}</b>
        <span>{ruta.hechos} de {ruta.total} hechos</span>
      </div>
      <div className="mt-1"><BarraTramos ruta={ruta} actual={t.id} /></div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-card p-3.5 shadow-t-card ring-1 ring-border">
        <Baldosa tono={TONO_PASO[t.icono]} Icono={Icono} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-5 text-foreground">{t.titulo}</p>
          <p className="mt-1 text-[13.5px] leading-[19px] text-muted-foreground text-pretty">{t.que}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href={hrefPaso(t.id)} className={cn(BOTON_DESTACADO, 'h-10 px-4 text-[13.5px]')}>
              Seguir con la guía<ArrowRight size={15} aria-hidden />
            </Link>
            {t.saltable && (
              <button type="button" onClick={() => saltar(t.id)} className="zona-tactil rounded-full px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                Saltar
              </button>
            )}
            <Link href={RUTA_GUIA} className="zona-tactil rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[color:var(--t-text-link)] hover:bg-muted">
              Ver los {ruta.total} pasos
            </Link>
          </div>
        </div>
      </div>
      {error}
    </section>
  );
}
