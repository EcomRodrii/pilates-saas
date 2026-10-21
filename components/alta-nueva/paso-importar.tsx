'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Paso 4 del alta nueva: «¿Traes alumnas de otro sitio?» (opcional, «Más tarde»
// arriba y abajo). Una pregunta, «¿Con qué lo llevas ahora?», ordena las TRES
// formas de traer datos que ya existen y marca la suya:
//
//   · Desde otro programa  → la Migración Mágica (/migracion), con lo que hay
//                            que exportar del suyo. Sin rutas de menú de cada
//                            programa (D2: no verificadas) y «reconocemos» solo
//                            donde el clasificador lo hace de verdad.
//   · Migración Mágica     → /migracion: subir, revisar el plan con ejemplos,
//                            ejecutar y deshacer.
//   · Con nuestra plantilla→ Clientas › Importar y Calendario › Importar, con
//                            sus plantillas reales (CSV).
//
// ⚠️ La revisión del plan de la Migración Mágica se hace en /migracion y se
// VUELVE al paso 5 (decisión del fundador, 21-oct): nada de «el plan te espera
// en Primeros pasos» ni de guardar el análisis. Esas tres pantallas se abren
// dentro del alta, con su barra de vuelta (marco-ruta-alta.tsx).
//
// La respuesta se guarda en `studios.onb_software_anterior`, con la grafía del
// asistente de siempre. Nada de Google Calendar, pegar filas ni captura: no se
// importa nada de Google Calendar, e IMPORTAR_PEGANDO y HORARIO_DESDE_IMAGEN
// están apagados.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Download, FileSpreadsheet, Repeat, Wand2 } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { serializeCsv } from '@/lib/csv';
import { PLANTILLA_CLIENTAS, PLANTILLA_HORARIO, type PlantillaImportar } from '@/lib/importar-plantillas';
import {
  ORIGENES, PROGRAMAS, listaReconocidos, ordenDeVias, origenDeSoftware, queExportar, softwareAnteriorDe, viaRecomendada,
  type Origen, type Via,
} from '@/lib/alta/bienvenida-nueva';
import { Baldosa } from '@/components/dashboard/vivo';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';
import { cn } from '@/lib/utils';
import { AtajoPrimeraClase, CLASE_CAMPO, CLASE_ETIQUETA, CabeceraPaso, ErrorGuardado, LineaDePasos, NavPaso } from './piezas';

function descargarPlantilla(p: PlantillaImportar) {
  const blob = new Blob(['﻿' + serializeCsv(p.cabeceras, p.ejemplo)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = p.archivo;
  a.click();
  URL.revokeObjectURL(url);
}

export function PasoImportar({ studio, onAtras, onListo, onIrA, onSaltar, saliendo }: {
  studio: Studio;
  onAtras: () => void;
  /** Sigue al paso 5. */
  onListo: () => void;
  /** Abre una de las tres pantallas de traer datos, con la vuelta al paso 5. */
  onIrA: (ruta: string) => void;
  onSaltar: () => void;
  saliendo: boolean;
}) {
  const { updateStudio } = useStudio();
  const guardado = origenDeSoftware(studio.onbSoftwareAnterior);
  const [origen, setOrigen] = useState<Origen | null>(guardado?.origen ?? null);
  const [programa, setPrograma] = useState<string>(guardado?.programa ?? PROGRAMAS[0].valor);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => { titulo.current?.focus(); }, []);

  const suya = viaRecomendada(origen);
  const ocupado = trabajando || saliendo;

  /** Guarda la respuesta si ha cambiado. `false` si falló. */
  async function guardarRespuesta(): Promise<boolean> {
    if (!origen) return true;
    const valor = softwareAnteriorDe(origen, programa);
    if (valor === studio.onbSoftwareAnterior) return true;
    const res = await updateStudio({ onbSoftwareAnterior: valor });
    if (!res.ok) setError(`No hemos podido guardar tu respuesta. ${res.error}`);
    return res.ok;
  }

  /** «Siguiente»: guarda y sigue; si no se guarda, lo dice y no avanza. */
  async function siguiente(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setTrabajando(true);
    setError(null);
    try {
      if (await guardarRespuesta()) onListo();
    } finally {
      setTrabajando(false);
    }
  }

  /** «Más tarde» y las vías: la respuesta es lo de menos, no se queda nadie aquí por ella. */
  async function seguirIgual(despues: () => void) {
    if (ocupado) return;
    setTrabajando(true);
    setError(null);
    try { await guardarRespuesta(); } finally { setTrabajando(false); }
    despues();
  }

  const nombrePrograma = PROGRAMAS.find(p => p.valor === programa)?.etiqueta ?? 'tu programa';
  const tarjeta = (via: Via) => {
    const marcada = suya === via;
    const base = (contenido: React.ReactNode) => (
      <article
        key={via}
        data-testid={`via-${via}`}
        data-recomendada={marcada}
        className={cn(
          'relative flex flex-col gap-2.5 rounded-[20px] border bg-card p-5 shadow-xs transition-shadow',
          marcada ? 'border-transparent ring-2 ring-foreground' : 'border-border',
        )}
      >
        {marcada && (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">
            <Check size={11} aria-hidden /> Para ti
          </span>
        )}
        {contenido}
      </article>
    );
    if (via === 'programa') {
      return base(<>
        <Baldosa tono="azul" Icono={Repeat} />
        <h3 className="mt-1 text-[16px] font-semibold leading-[21px] text-foreground">Desde otro programa</h3>
        <p className="text-[13.5px] leading-5 text-muted-foreground">
          Elige el tuyo y te decimos qué archivo sacar. Reconocemos las columnas de {listaReconocidos()}.
        </p>
        <div className="mt-auto grid gap-2 pt-1.5">
          <label htmlFor={`${id}-programa`} className="text-[13px] font-semibold text-foreground">Tu programa</label>
          <select id={`${id}-programa`} className={cn(CLASE_CAMPO, 'cursor-pointer')} value={programa} onChange={e => setPrograma(e.target.value)}>
            {PROGRAMAS.map(p => <option key={p.valor} value={p.valor}>{p.etiqueta}</option>)}
          </select>
          <p className="text-[12.5px] leading-[18px] text-muted-foreground" data-testid="que-exportar">{queExportar(programa)}</p>
          <button type="button" disabled={ocupado} onClick={() => void seguirIgual(() => onIrA('/migracion'))} className={cn(BOTON_BORDE, 'h-10 w-full disabled:opacity-60')}>
            Traer de {programa === PROGRAMAS[PROGRAMAS.length - 1].valor ? 'mi programa' : nombrePrograma}
          </button>
        </div>
      </>);
    }
    if (via === 'magia') {
      return base(<>
        <Baldosa tono="indigo" Icono={Wand2} />
        <h3 className="mt-1 text-[16px] font-semibold leading-[21px] text-foreground">Migración Mágica</h3>
        <p className="text-[13.5px] leading-5 text-muted-foreground">
          Sube lo que tengas, en CSV o Excel. Te enseñamos el plan con ejemplos antes de importar nada, y se puede deshacer.
        </p>
        <div className="flex flex-wrap gap-1">
          {['Alumnas', 'Bonos y cuotas', 'Clases', 'Reservas', 'Pagos', 'Recuperaciones'].map(c => (
            <span key={c} className="rounded-full bg-muted px-2 py-1 font-mono text-[11px] leading-none text-muted-foreground">{c}</span>
          ))}
        </div>
        <div className="mt-auto grid gap-2 pt-1.5">
          <button type="button" disabled={ocupado} onClick={() => void seguirIgual(() => onIrA('/migracion'))} className={cn(BOTON_BORDE, 'h-10 w-full disabled:opacity-60')}>
            Subir mi archivo
          </button>
        </div>
      </>);
    }
    return base(<>
      <Baldosa tono="verde" Icono={FileSpreadsheet} />
      <h3 className="mt-1 text-[16px] font-semibold leading-[21px] text-foreground">Con nuestra plantilla</h3>
      <p className="text-[13.5px] leading-5 text-muted-foreground">
        Descarga la plantilla, rellénala y súbela. Si una fila no vale, te decimos cuál y por qué.
      </p>
      <div className="mt-auto grid gap-2 pt-1.5">
        <div className="grid gap-1.5">
          <button type="button" onClick={() => descargarPlantilla(PLANTILLA_CLIENTAS)} className="inline-flex items-center gap-1.5 text-left text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
            <Download size={14} aria-hidden /> Plantilla de alumnas (.csv)
          </button>
          <button type="button" onClick={() => descargarPlantilla(PLANTILLA_HORARIO)} className="inline-flex items-center gap-1.5 text-left text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
            <Download size={14} aria-hidden /> Plantilla de horario (.csv)
          </button>
        </div>
        <button type="button" disabled={ocupado} onClick={() => void seguirIgual(() => onIrA('/clientas/importar'))} className={cn(BOTON_BORDE, 'h-10 w-full disabled:opacity-60')}>
          Subir la plantilla
        </button>
        <button type="button" disabled={ocupado} onClick={() => void seguirIgual(() => onIrA('/calendario/importar'))} className="text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60">
          o subir tu horario
        </button>
      </div>
    </>);
  };

  return (
    <form noValidate onSubmit={siguiente} className="mx-auto w-full max-w-[960px]">
      <LineaDePasos actual={4} />
      <CabeceraPaso
        etiqueta="Paso 4 de 7 · opcional · unos 3 minutos"
        titulo="¿Traes alumnas de otro sitio?"
        sub="Si empiezas de cero, salta este paso. Podrás importar cuando quieras desde Clientas."
        masTarde={{ onClick: () => void seguirIgual(onListo), disabled: ocupado }}
        tituloRef={titulo}
      />

      <fieldset className="mt-6 min-w-0">
        <legend id={`${id}-origen`} className={CLASE_ETIQUETA}>¿Con qué lo llevas ahora?</legend>
        <div role="radiogroup" aria-labelledby={`${id}-origen`} className="mt-2 flex flex-wrap gap-2">
          {ORIGENES.map(o => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={origen === o.id}
              onClick={() => { setError(null); setOrigen(o.id); }}
              className={cn(
                'min-h-[38px] rounded-full px-4 text-[14px] font-medium transition-colors',
                origen === o.id ? 'bg-foreground text-background' : 'ring-1 ring-inset ring-input text-foreground hover:bg-muted',
              )}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      </fieldset>

      {origen === 'cero' ? (
        <div role="status" className="mt-6 flex gap-2.5 rounded-2xl border border-success/30 bg-success/10 px-4 py-3.5">
          <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          <p className="text-[14px] leading-[21px] text-foreground">
            Empiezas de cero. Tus alumnas se darán de alta solas al reservar con tu enlace; si un día quieres traer una lista, está en Clientas › Importar.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-3" data-testid="vias">
          {ordenDeVias(origen).map(tarjeta)}
        </div>
      )}

      <p className="mt-3.5 text-[13px] leading-[18px] text-muted-foreground">Tu programa anterior puede seguir funcionando mientras tanto.</p>

      <ErrorGuardado mensaje={error} />
      <NavPaso onAtras={onAtras} trabajando={ocupado} masTarde={{ onClick: () => void seguirIgual(onListo) }} />
      <AtajoPrimeraClase onSaltar={onSaltar} disabled={ocupado} />
    </form>
  );
}

