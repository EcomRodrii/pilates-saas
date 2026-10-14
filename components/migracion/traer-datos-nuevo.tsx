'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Traer mis datos» en el panel nuevo (14-oct-2026). La pantalla de antes era
// una caja de arrastrar sola: quien llega no sabía qué podía traer ni qué
// pasaba después, y una mudanza de estudio da miedo. Aquí, como el alta guiada
// de Bonsai: la caja como protagonista, los cuatro pasos (nada se importa sin
// revisarlo y se puede deshacer) y lo que se puede traer, en baldosas.
//
// Solo pinta: el flujo, las llamadas y los estados siguen en la página. Lo que
// se puede traer sale del registro de entidades (`ENTIDADES`), con un
// `Record` por entidad: una entidad nueva no compila hasta que tenga su baldosa
// y su frase, igual que la lista del dropzone de siempre se anuncia sola.
// ─────────────────────────────────────────────────────────────────────────────

import type { ElementType, RefObject } from 'react';
import {
  CalendarCheck, CalendarDays, CircleCheck, Clock, FileQuestion, ListChecks, Receipt,
  RotateCcw, Ticket, Undo2, Upload, Users,
} from 'lucide-react';
import { Baldosa, BotonVivo, TONOS, fondoTenido, type Tono } from '@/components/dashboard/vivo';
import { ENTIDADES, type EntidadMigracion } from '@/lib/migracion/clasificador';

/** La caja de arrastrar: se suelta encima o se elige con el botón. */
export function ZonaArrastreNueva({ arrastrando, onArrastrando, onFiles, inputRef, inputId }: {
  arrastrando: boolean;
  onArrastrando: (v: boolean) => void;
  onFiles: (lista: FileList) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  inputId: string;
}) {
  const c = TONOS.azul;
  const abrir = () => inputRef.current?.click();
  return (
    // El recuadro entero abre el selector, como la caja de antes; el botón es la
    // vía del teclado y del móvil (en el móvil no se arrastra). Si el clic viene
    // del botón, ya lo abre él, y el del propio input sube hasta aquí: ninguno
    // de los dos vuelve a llamar a `click()`.
    <div
      onClick={e => {
        const t = e.target as HTMLElement;
        if (t === inputRef.current || t.closest('button')) return;
        abrir();
      }}
      onDragOver={e => { e.preventDefault(); onArrastrando(true); }}
      onDragLeave={() => onArrastrando(false)}
      onDrop={e => { e.preventDefault(); onArrastrando(false); onFiles(e.dataTransfer.files); }}
      className="flex cursor-pointer flex-col items-center rounded-t-card border-2 border-dashed px-5 py-10 text-center shadow-t-card transition-colors sm:px-8 sm:py-12"
      style={arrastrando
        ? { borderColor: c, backgroundColor: `color-mix(in srgb, ${c} 10%, var(--card))` }
        : { ...fondoTenido('azul', 9), borderColor: `color-mix(in srgb, ${c} 40%, var(--border))` }}
    >
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-[20px]"
        style={{ backgroundColor: c, color: 'var(--card)', boxShadow: `0 16px 30px -14px ${c}` }}
      >
        <Upload size={28} strokeWidth={2} />
      </span>
      <h2 className="mt-5 max-w-md text-[20px] font-bold leading-tight text-foreground text-balance sm:text-[22px]">
        {arrastrando ? 'Suéltalos aquí' : 'Arrastra aquí lo que exportes de tu programa anterior'}
      </h2>
      <p className="mt-2 max-w-md text-[14px] text-muted-foreground text-pretty">
        CSV o Excel: da igual el formato o cómo se llamen las columnas. Hasta 8 archivos a la vez.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <BotonVivo label="Elegir archivos" Icono={Upload} grande onClick={abrir} />
        <p className="text-[12.5px] text-muted-foreground">o suéltalos encima de este recuadro</p>
      </div>
      <input
        ref={inputRef} id={inputId} type="file" multiple accept=".csv,.xlsx,.xls,text/csv"
        className="hidden"
        onChange={e => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

/** Los cuatro pasos de la migración, con lo que da confianza en cada uno. */
export function PasosMigracion({ esPropietaria }: { esPropietaria: boolean }) {
  // Deshacer es solo de la propietaria (/api/migracion/deshacer): a gerencia y
  // recepción no se les promete un botón que el servidor les va a negar.
  const pasos: { tono: Tono; Icono: ElementType; titulo: string; texto: string }[] = [
    { tono: 'azul', Icono: Upload, titulo: 'Arrastras tus archivos', texto: 'Lo que puedas exportar de tu programa anterior. Analizarlos no importa nada todavía.' },
    { tono: 'indigo', Icono: ListChecks, titulo: 'Revisas el plan', texto: 'Qué es cada archivo, cuántas filas entran y cuáles no y por qué. Si algo no está bien reconocido, lo corriges tú.' },
    { tono: 'verde', Icono: CircleCheck, titulo: 'Confirmas', texto: 'Solo se importa cuando lo apruebas. Al terminar, un acta con lo que entró y lo que no.' },
    {
      tono: 'magenta', Icono: Undo2, titulo: 'Se puede deshacer',
      texto: esPropietaria
        ? 'Si algo no cuadra, un clic borra exactamente lo que creó la importación, y nada más.'
        : 'Si algo no cuadra, la propietaria lo deshace con un clic: se borra lo que creó la importación, y nada más.',
    },
  ];
  return (
    <section aria-labelledby="migracion-pasos" className="rounded-t-card border border-border bg-card p-5 shadow-t-card sm:p-6">
      <h2 id="migracion-pasos" className="text-[16px] font-semibold text-foreground">Así funciona</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="flex items-start gap-3">
            <Baldosa tono={p.tono} Icono={p.Icono} />
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-foreground/55">Paso {i + 1}</p>
              <p className="text-[14.5px] font-semibold leading-snug text-foreground">{p.titulo}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground text-pretty">{p.texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Lo que dice cada baldosa sale de los campos que de verdad lee cada importador
// (`CAMPOS_*` de lib/csv.ts) y de dónde acaba cada cosa: si un importador cambia
// lo que trae, esta frase cambia con él.
const QUE_TRAE: Record<EntidadMigracion, { tono: Tono; Icono: ElementType; texto: string }> = {
  socias: { tono: 'magenta', Icono: Users, texto: 'Con su email, teléfono, NIF, dirección y fecha de alta.' },
  membresias: { tono: 'verde', Icono: Ticket, texto: 'La tarifa de cada una, las sesiones que le quedan y sus fechas, emparejadas con tus tarifas.' },
  clases: { tono: 'azul', Icono: CalendarDays, texto: 'Tu horario, semanal o por fechas, con instructora, sala y aforo.' },
  reservas: { tono: 'indigo', Icono: CalendarCheck, texto: 'Quién va a cada clase, y si asistió o canceló.' },
  citas: { tono: 'indigo', Icono: Clock, texto: 'Las sesiones de una en una, con su servicio, su instructora y su precio.' },
  pagos: { tono: 'verde', Icono: Receipt, texto: 'Lo que cada clienta te pagó antes: queda en su ficha, aparte de lo que cobres aquí.' },
  recuperaciones: { tono: 'magenta', Icono: RotateCcw, texto: 'Las clases que le debes a cada una, con su caducidad.' },
};

/** Lo que se puede traer, en baldosas de color, y qué pasa con lo demás. */
export function QueSePuedeTraer() {
  const entidades = Object.keys(ENTIDADES) as EntidadMigracion[];
  return (
    <section aria-labelledby="migracion-que" className="rounded-t-card border border-border bg-card p-5 shadow-t-card sm:p-6">
      <h2 id="migracion-que" className="text-[16px] font-semibold text-foreground">Lo que puedes traer</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Sube solo lo que tengas: cada archivo se reconoce por sus columnas.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {entidades.map(e => {
          const q = QUE_TRAE[e];
          return (
            <li key={e} className="flex items-start gap-3 rounded-2xl border p-3.5" style={fondoTenido(q.tono, 8)}>
              <Baldosa tono={q.tono} Icono={q.Icono} tamano="sm" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-snug text-foreground">{ENTIDADES[e].etiqueta}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground text-pretty">{q.texto}</p>
              </div>
            </li>
          );
        })}
        {/* Lo mismo que dice el plan con los archivos sin clasificar. */}
        <li className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-3.5">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
            <FileQuestion size={15} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-snug text-foreground">¿Tienes otra cosa?</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground text-pretty">
              Lo que no reconozcamos no se toca. Si quieres que lo migremos nosotros, escríbenos a soporte@tentare.app con el archivo.
            </p>
          </div>
        </li>
      </ul>
    </section>
  );
}
