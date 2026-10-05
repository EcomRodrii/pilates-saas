'use client';

// Tenti, la mascota de Tentare: catálogo para verla y aprobarla antes de meterla
// en ninguna pantalla de estudio. Todos sus estados, sus emociones, los tamaños
// y las dos colocaciones propuestas para el panel, con sus textos de verdad.
//
// Vive en /interno a propósito: es una maqueta para el fundador, no algo que
// vea un estudio. Por eso aquí, y solo aquí, se encienden a mano el toque, el
// sonido, el saludo al aparecer, las insignias y el nombre accesible: en el
// componente vienen apagados.

import { useEffect, useRef, useState } from 'react';
import { Tenti, type TentiControl } from '@/components/tenti/tenti';
import { EMOCIONES, ESTADOS, type EmocionTenti, type EstadoTenti } from '@/lib/tenti/motor';

const boton = 'rounded-xl border border-border bg-background px-3 py-1.5 text-[13px] font-semibold text-foreground hover:bg-muted';
const botonOn = 'rounded-xl border border-foreground bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background';
const rotulo = 'mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground';

// Lo que tarda Listo en celebrar como pronto: se lee el titular primero.
const LISTO_MADURA_MS = 1500;

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
          Así se comporta también en el panel, en todos sus sitios; abajo, las dos primeras veces de la propietaria.
        </p>
      </header>

      <section className="grid gap-6 rounded-2xl border border-border bg-card p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/40 py-6">
          <Tenti
            ref={control} estado={estado} tamano={240} sonido={sonido}
            interactivo saludaAlAparecer insignias sigueCursor titulo={`Tenti: ${ESTADOS[estado].etiqueta.toLowerCase()}`}
          />
          <p className="text-[13px] font-semibold text-foreground">{ESTADOS[estado].etiqueta}</p>
        </div>
        <div className="space-y-5">
          <div>
            <p className={rotulo}>Estados</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ESTADOS) as EstadoTenti[]).map((e) => (
                <button key={e} type="button" className={e === estado ? botonOn : boton} onClick={() => setEstado(e)}>
                  {ESTADOS[e].etiqueta}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={rotulo}>Emociones</p>
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
        <p className={rotulo}>Tamaños</p>
        <div className="flex flex-wrap items-end gap-6">
          {[40, 64, 96, 160].map((t) => (
            <div key={t} className="flex flex-col items-center gap-1">
              <Tenti estado={estado} tamano={t} interactivo insignias />
              <span className="text-[11.5px] text-muted-foreground tabular-nums">{t} px</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className={rotulo}>Las primeras veces en el panel (solo la propietaria)</p>
        <p className="mb-3 max-w-3xl text-[12.5px] text-muted-foreground">
          Sin insignia y decorativo. Suenan (el saludo, el logo guardado, la celebración) si «Sonidos de Tenti» está
          encendido en este dispositivo (Configuración › Tu panel); en el panel, además, se dejan tocar.
        </p>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <MaquetaBienvenida />
          <MaquetaListo />
        </div>
      </section>
    </div>
  );
}

// La bienvenida de la pantalla del logo. Siempre en claro: en el panel se monta
// fuera del proveedor del tema. Saluda una vez, la primera vez que se ve, y se
// alegra solo cuando el logo ha quedado guardado de verdad. Esta es la de
// escritorio; por debajo de 860 px va a 64 px a la derecha de «Montar mi
// estudio» (components/onboarding/pantallas-valor.tsx).
function MaquetaBienvenida() {
  const tenti = useRef<TentiControl>(null);
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11.5px] font-semibold text-muted-foreground">Bienvenida · el logo · 104 px (64 px junto al botón en el móvil) · reposo</p>
      <div className="mt-3 grid gap-4 rounded-xl bg-background p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)]">
        <div>
          <h3 className="text-[22px] font-bold leading-tight tracking-tight text-foreground">Ponle tu logo y ya es tuyo</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Es lo único que te pedimos ahora. Tu color y tus textos los cambias cuando quieras desde Configuración.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-muted-foreground">Saltar</span>
            <span className="rounded-full bg-brand px-4 py-2 text-[13px] font-bold text-brand-foreground">Montar mi estudio</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2.5">
          <div className="grid w-full place-items-center rounded-xl border border-dashed border-border bg-card px-3 py-6 text-[13px] font-semibold text-foreground">
            Elige tu logo
          </div>
          <div className="self-end" style={{ pointerEvents: 'none' }}>
            <Tenti ref={tenti} estado="reposo" tamano={104} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={boton} onClick={() => tenti.current?.saludar()}>Primera vez que se ve: saluda</button>
        <button type="button" className={boton} onClick={() => tenti.current?.emocion('feliz')}>Logo guardado: feliz</button>
      </div>
    </div>
  );
}

// «Tu estudio ya puede recibir reservas». Entra en reposo y celebra ('hecho')
// cuando el servidor confirma que una alumna nueva puede reservar, su página ya
// se ve en la vista previa y ha dado tiempo a leer el titular. Aquí se simula
// con el tiempo, en claro y en oscuro, que es donde la paleta se la juega.
function MaquetaListo() {
  const [estadoListo, setEstadoListo] = useState<'reposo' | 'hecho'>('reposo');
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setEstadoListo('hecho'), LISTO_MADURA_MS);
    return () => clearTimeout(t);
  }, [vuelta]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11.5px] font-semibold text-muted-foreground">Listo · tras crear la primera clase · 80 px · reposo → hecho</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(['claro', 'oscuro'] as const).map((modo) => (
          <div key={modo} className={`${modo === 'oscuro' ? 'dark ' : ''}rounded-xl border border-border bg-background px-4 py-5 text-center`}>
            <div className="mx-auto mb-2 grid size-20 place-items-center">
              <Tenti estado={estadoListo} tamano={80} sigueCursor={false} />
            </div>
            <h3 className="text-[17px] font-bold leading-tight tracking-tight text-foreground">Tu estudio ya puede recibir reservas</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Has dejado <strong className="text-foreground">1 clase</strong> programada. Tu página está abierta: cualquiera con este enlace puede reservar.
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button" className={boton}
          onClick={() => { setEstadoListo('reposo'); setVuelta((v) => v + 1); }}
        >
          Repetir la celebración
        </button>
      </div>
    </div>
  );
}
