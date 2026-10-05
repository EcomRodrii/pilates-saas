'use client';

// Tenti, la mascota de Tentare: catálogo para verla y aprobarla antes de meterla
// en ninguna pantalla de estudio. Todos sus estados, sus emociones, los tamaños
// en los que viviría y tres ejemplos de dónde podría aparecer.
//
// Vive en /interno a propósito: es una maqueta para el fundador, no algo que
// vea un estudio.

import { useRef, useState } from 'react';
import { Tenti, type TentiControl } from '@/components/tenti/tenti';
import { EMOCIONES, ESTADOS, type EmocionTenti, type EstadoTenti } from '@/lib/tenti/motor';

const boton = 'rounded-xl border border-border bg-background px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-muted';
const botonOn = 'rounded-xl border border-foreground bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background';

export default function TentiPagina() {
  const [estado, setEstado] = useState<EstadoTenti>('reposo');
  const [sonido, setSonido] = useState(false);
  const control = useRef<TentiControl>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[22px] font-bold text-foreground">Tenti</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-muted-foreground">
          La mascota de Tentare. Mueve los ojos hacia el cursor, parpadea sola, se aplasta si la tocas y se marea si insistes.
          Todavía no aparece en ningún estudio: esto es para verla y decidir dónde va.
        </p>
      </header>

      <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/40 py-6">
          <Tenti ref={control} estado={estado} tamano={240} sonido={sonido} saludaAlAparecer />
          <p className="text-[13px] font-semibold text-foreground">{ESTADOS[estado].etiqueta}</p>
        </div>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Estados</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ESTADOS) as EstadoTenti[]).map((e) => (
                <button key={e} type="button" className={e === estado ? botonOn : boton} onClick={() => setEstado(e)}>
                  {ESTADOS[e].etiqueta}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Emociones</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EMOCIONES) as EmocionTenti[]).map((e) => (
                <button key={e} type="button" className={boton} onClick={() => control.current?.emocion(e)}>{EMOCIONES[e].etiqueta}</button>
              ))}
              <button type="button" className={boton} onClick={() => control.current?.saludar()}>Saludar</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <input type="checkbox" checked={sonido} onChange={(e) => setSonido(e.target.checked)} />
            Con sonido
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tamaños</p>
        <div className="flex flex-wrap items-end gap-6">
          {[40, 64, 96, 160].map((t) => (
            <div key={t} className="flex flex-col items-center gap-1">
              <Tenti estado={estado} tamano={t} />
              <span className="text-[11.5px] text-muted-foreground tabular-nums">{t} px</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dónde podría vivir (maquetas)</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Tenti estado="esperaTuOk" tamano={72} />
            <div>
              <p className="text-[14px] font-bold text-foreground">3 cosas esperan tu visto bueno</p>
              <p className="text-[12.5px] text-muted-foreground">Una sustitución, dos reservas por aprobar.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <Tenti estado="hecho" tamano={72} />
            <div>
              <p className="text-[14px] font-bold text-foreground">¡Primera reserva!</p>
              <p className="text-[12.5px] text-muted-foreground">Una alumna acaba de reservar desde tu app.</p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-5 text-center">
            <Tenti estado="dormido" tamano={88} />
            <p className="text-[14px] font-bold text-foreground">Hoy no hay clases</p>
            <p className="text-[12.5px] text-muted-foreground">Aprovecha para preparar la semana.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
