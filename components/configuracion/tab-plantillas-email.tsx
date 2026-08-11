'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Link2, List, Heading, Loader2, Send, Check, Undo2, Pencil,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import { FUENTES_EMAIL, type FuenteEmail, type PlantillaEmail, type TipoPlantillaEmail } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, cardCls, Field } from '@/app/(dashboard)/configuracion/page';
import { previsualizarPlantilla, enviarPruebaPlantilla } from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// ─── Plantillas de email transaccional ───────────────────────────────────────
//
// Rehecha tras el feedback de una propietaria: "no me entero mucho de cómo
// personalizar". No era un problema de etiquetas. Eran cuatro cosas:
//
//   1. No veía el correo mientras lo editaba. Rellenaba campos a ciegas y la
//      vista previa era un modal que había que acordarse de abrir y cerrar.
//   2. La puerta al modo libre era un enlace gris de doce píxeles que parecía
//      una nota al pie.
//   3. Se le pedía escribir Markdown. Nadie que lleve un estudio de Pilates
//      tiene por qué saber qué hacen dos asteriscos.
//   4. Seis tarjetas abiertas a la vez, sin jerarquía ni sensación de avance.
//
// Ahora la lista es un índice —qué correo es, qué tiene tocado— y personalizar
// es una pantalla enfocada con el correo REAL a la derecha, actualizándose
// mientras escribe. El formato se pone con botones; los asteriscos los mete la
// aplicación.

const PLANTILLAS_META: {
  tipo: TipoPlantillaEmail; label: string; cuando: string;
  asuntoDefault: string; introDefault: string;
  variables: { token: string; que: string }[];
  // Cómo se llama, en cristiano, lo que pinta {datos} en ESTA plantilla.
  datosLabel: string;
  // Presente solo si la plantilla tiene adónde enlazar.
  botonLabel?: string;
}[] = [
  {
    tipo: 'bienvenida', label: 'Bienvenida', cuando: 'Se envía al dar de alta a una clienta.',
    asuntoDefault: '¡Bienvenida a {estudio}!',
    introDefault: 'Hola {nombre}, estamos encantadas de tenerte en {estudio}.',
    variables: [{ token: '{nombre}', que: 'el nombre de la clienta' }, { token: '{estudio}', que: 'el nombre de tu estudio' }],
    datosLabel: 'Su plan contratado',
    botonLabel: 'Botón de acceso a su portal',
  },
  {
    tipo: 'reserva', label: 'Reserva confirmada', cuando: 'Se envía cuando una clienta reserva una clase.',
    asuntoDefault: 'Reserva confirmada — {clase}',
    introDefault: 'Hola {nombre}, tu plaza está reservada.',
    variables: [{ token: '{nombre}', que: 'el nombre de la clienta' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
  },
  {
    tipo: 'recordatorio', label: 'Recordatorio de clase', cuando: 'Se envía antes de la clase.',
    asuntoDefault: 'Recordatorio — {clase}',
    introDefault: 'Hola {nombre}, te esperamos en tu próxima clase. Aquí tienes los detalles.',
    variables: [{ token: '{nombre}', que: 'el nombre de la clienta' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
  },
  {
    tipo: 'cancelacion', label: 'Clase cancelada', cuando: 'Se envía cuando el estudio cancela una clase.',
    asuntoDefault: 'Clase cancelada — {clase}',
    introDefault: 'Hola {nombre}, lamentamos avisarte de que esta clase ha sido cancelada. No hace falta que te presentes.',
    variables: [{ token: '{nombre}', que: 'el nombre de la clienta' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
  },
  {
    tipo: 'promocion', label: 'Plaza liberada', cuando: 'Se envía al ascender a una clienta desde la lista de espera.',
    asuntoDefault: 'Se ha liberado tu plaza — {clase}',
    introDefault: 'Hola {nombre}, estabas en lista de espera y ha quedado una plaza libre.',
    variables: [{ token: '{nombre}', que: 'el nombre de la clienta' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
  },
  {
    tipo: 'impago', label: 'Pago fallido', cuando: 'Se envía cuando un cobro automático no se completa.',
    asuntoDefault: 'Problema con tu pago — {estudio}',
    introDefault: 'Hola {nombre}, hemos intentado cobrar tu cuota y el pago no se ha completado.',
    variables: [{ token: '{nombre}', que: 'el nombre de la clienta' }, { token: '{estudio}', que: 'el nombre de tu estudio' }],
    datosLabel: 'El concepto y el importe',
  },
];

type Meta = (typeof PLANTILLAS_META)[number];

type Borrador = {
  asunto: string; intro: string; cuerpo: string; botonTexto: string;
  colorCabecera: string; colorBoton: string; logoUrl: string; fuente: string; pie: string;
};

const VACIO: Borrador = {
  asunto: '', intro: '', cuerpo: '', botonTexto: '',
  colorCabecera: '', colorBoton: '', logoUrl: '', fuente: '', pie: '',
};

function borradorDe(p: PlantillaEmail | undefined): Borrador {
  if (!p) return VACIO;
  return {
    asunto: p.asunto ?? '', intro: p.intro ?? '', cuerpo: p.cuerpo ?? '',
    botonTexto: p.botonTexto ?? '', colorCabecera: p.colorCabecera ?? '',
    colorBoton: p.colorBoton ?? '', logoUrl: p.logoUrl ?? '',
    fuente: p.fuente ?? '', pie: p.pie ?? '',
  };
}

// Qué se le enseña en la lista sin tener que abrir nada. "Como viene de
// fábrica" tiene que ser reconocible de un vistazo: es el estado del que
// quiere salir.
//
// `activa: false` cuenta como de fábrica porque es lo que de verdad recibe la
// clienta: resolverPlantilla descarta la fila entera si está desactivada. Ese
// interruptor ya no se enseña —"Personalizado / Por defecto" sin más
// explicación no decía qué apagaba— pero sigue habiendo filas viejas con él a
// false, y enseñarlas como personalizadas sería mentir sobre lo que se envía.
function resumen(b: Borrador, activa: boolean): { texto: string; tocado: boolean } {
  if (!activa) return { texto: 'Como viene de fábrica', tocado: false };
  if (b.cuerpo.trim()) return { texto: 'Correo escrito por ti', tocado: true };
  const partes = [b.asunto.trim() && 'asunto', b.intro.trim() && 'apertura'].filter(Boolean);
  const marca = [b.colorCabecera, b.colorBoton, b.logoUrl, b.fuente, b.pie].some(v => v.trim());
  if (marca) partes.push('marca');
  if (partes.length === 0) return { texto: 'Como viene de fábrica', tocado: false };
  return { texto: `Con tu ${partes.join(', ')}`, tocado: true };
}

// Punto de partida del modo libre: la estructura que ya tenía el correo, pero
// escrita. Un cuadro en blanco delante hace que casi nadie lo use.
function cuerpoDePartida(meta: Meta, intro: string): string {
  const partes = [`# ${meta.label}`, '', intro.trim() || meta.introDefault, '', '{datos}'];
  if (meta.botonLabel) partes.push('', '{boton}');
  return partes.join('\n');
}

// ─── Barra de formato ────────────────────────────────────────────────────────
// Los asteriscos los pone la aplicación. Envuelve lo seleccionado, y si no hay
// nada seleccionado deja el cursor donde se escribe.

type Formato = { icono: typeof Bold; titulo: string; antes: string; despues: string; ejemplo: string };

const FORMATOS: Formato[] = [
  { icono: Bold, titulo: 'Negrita', antes: '**', despues: '**', ejemplo: 'texto en negrita' },
  { icono: Italic, titulo: 'Cursiva', antes: '_', despues: '_', ejemplo: 'texto en cursiva' },
  { icono: Heading, titulo: 'Título', antes: '## ', despues: '', ejemplo: 'Un título' },
  { icono: List, titulo: 'Lista', antes: '- ', despues: '', ejemplo: 'Un punto de la lista' },
  { icono: Link2, titulo: 'Enlace', antes: '[', despues: '](https://)', ejemplo: 'texto del enlace' },
];

function BarraFormato({ onAplicar }: { onAplicar: (f: Formato) => void }) {
  return (
    <div className="flex items-center gap-1">
      {FORMATOS.map(f => (
        <button
          key={f.titulo} type="button" title={f.titulo} aria-label={f.titulo}
          onClick={() => onAplicar(f)}
          className="rounded-lg border border-border p-1.5 hover:border-foreground hover:bg-muted"
        >
          <f.icono size={14} />
        </button>
      ))}
    </div>
  );
}

// ─── Vista previa en vivo ────────────────────────────────────────────────────
// Es la pieza que faltaba. Antes había que acordarse de abrir un modal; ahora
// el correo está siempre delante y se rehace solo al dejar de teclear.

function VistaPreviaViva({ tipo, borrador }: { tipo: TipoPlantillaEmail; borrador: Borrador }) {
  const [preview, setPreview] = useState<{ html: string; subject: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // JSON del borrador como dependencia: el objeto se recrea en cada tecla, así
  // que comparar por referencia dispararía una llamada por pulsación.
  const clave = JSON.stringify(borrador);

  useEffect(() => {
    let vigente = true;
    // Medio segundo tras la última tecla. Menos y se llama por cada letra;
    // más y parece que la pantalla se ha quedado colgada. El indicador se
    // enciende DENTRO del temporizador, no fuera: encenderlo en el cuerpo del
    // efecto es un setState en render que React 19 marca como error, y además
    // así el giro coincide con la petición de verdad y no con cada tecla.
    const t = setTimeout(async () => {
      if (!vigente) return;
      setCargando(true);
      const b = JSON.parse(clave) as Borrador;
      const oNulo = (v: string) => (v.trim() ? v.trim() : null);
      const r = await previsualizarPlantilla({
        tipo,
        asunto: oNulo(b.asunto), intro: oNulo(b.intro), cuerpo: oNulo(b.cuerpo),
        botonTexto: oNulo(b.botonTexto), colorCabecera: oNulo(b.colorCabecera),
        colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
        pie: oNulo(b.pie), fuente: oNulo(b.fuente),
      });
      if (!vigente) return;
      setCargando(false);
      if ('error' in r) { setError(r.error); return; }
      setError(null);
      setPreview(r);
    }, 500);
    return () => { vigente = false; clearTimeout(t); };
  }, [tipo, clave]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Así lo recibe tu clienta
        </p>
        {cargando && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
      </div>

      {/* La línea de bandeja: el asunto es lo único que se ve antes de abrir. */}
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">En su bandeja</p>
        <p className="truncate text-[13px] font-semibold text-foreground">
          {preview?.subject ?? '…'}
        </p>
      </div>

      <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-white">
        {error
          ? <p className="p-4 text-[12px] text-muted-foreground">{error}</p>
          : (
            <iframe
              title="Vista previa del correo"
              srcDoc={preview?.html ?? ''}
              /* sandbox="" a propósito: el cuerpo lo escribe la propietaria y,
                 aunque se sanea al renderizar, esta caja nunca ejecuta nada. */
              sandbox=""
              className={cn('h-full w-full transition-opacity', cargando && 'opacity-50')}
            />
          )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Con una clienta de ejemplo (Ana García) y una clase de ejemplo.
      </p>
    </div>
  );
}

// ─── Editor de una plantilla ─────────────────────────────────────────────────

function EditorPlantilla({
  meta, plantilla, onGuardar, showToast, onCerrar,
}: {
  meta: Meta;
  plantilla: PlantillaEmail | undefined;
  onGuardar: (cambios: Partial<PlantillaEmail>) => Promise<void>;
  showToast: (m: string) => void;
  onCerrar: () => void;
}) {
  const [b, setB] = useState<Borrador>(() => borradorDe(plantilla));
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB(prev => ({ ...prev, [k]: v }));
  const areaCuerpo = useRef<HTMLTextAreaElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const modoLibre = b.cuerpo.trim() !== '';

  const fuenteValida = (v: string): FuenteEmail | null =>
    (FUENTES_EMAIL as readonly string[]).includes(v.trim()) ? (v.trim() as FuenteEmail) : null;

  // Dónde dejar el cursor DESPUÉS de que React repinte. No se puede hacer en el
  // mismo click: el textarea es controlado, así que al cambiar su `value` React
  // lo repinta y la selección se va al final. Un requestAnimationFrame tampoco
  // basta — puede correr antes del commit. Se guarda aquí y se aplica en un
  // efecto, que sí corre después.
  //
  // Importa de verdad: sin esto, pulsar "Cursiva" sin nada seleccionado le
  // dejaba un "_texto en cursiva_" literal en el correo para borrarlo a mano.
  const [seleccionPendiente, setSeleccionPendiente] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!seleccionPendiente || !areaCuerpo.current) return;
    areaCuerpo.current.focus();
    areaCuerpo.current.setSelectionRange(seleccionPendiente[0], seleccionPendiente[1]);
    setSeleccionPendiente(null);
  }, [seleccionPendiente]);

  // Escribe en el cuerpo respetando dónde está el cursor y qué hay seleccionado.
  // Sin esto, poner una negrita en mitad de un párrafo obliga a cortar y pegar.
  const escribirEnCuerpo = useCallback((antes: string, despues: string, ejemplo: string) => {
    const area = areaCuerpo.current;
    if (!area) return;
    const ini = area.selectionStart;
    const fin = area.selectionEnd;
    const seleccion = b.cuerpo.slice(ini, fin) || ejemplo;
    setB(prev => ({
      ...prev,
      cuerpo: `${prev.cuerpo.slice(0, ini)}${antes}${seleccion}${despues}${prev.cuerpo.slice(fin)}`,
    }));
    // Deja seleccionado lo insertado: si es el texto de ejemplo, se sobrescribe
    // tecleando encima; si era suyo, se ve qué se ha marcado.
    setSeleccionPendiente([ini + antes.length, ini + antes.length + seleccion.length]);
  }, [b.cuerpo]);

  async function guardar() {
    setGuardando(true);
    const oNulo = (v: string) => (v.trim() ? v.trim() : null);
    await onGuardar({
      // Editar y guardar es querer que se aplique. Si la fila venía con
      // activa=false (del interruptor que ya no se enseña), guardar sin esto
      // dejaría el correo saliendo por defecto y parecería que no se guardó.
      activa: true,
      asunto: oNulo(b.asunto), intro: oNulo(b.intro), cuerpo: oNulo(b.cuerpo),
      botonTexto: oNulo(b.botonTexto), colorCabecera: oNulo(b.colorCabecera),
      colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
      pie: oNulo(b.pie), fuente: fuenteValida(b.fuente),
    });
    setGuardando(false);
    onCerrar();
  }

  async function enviarPrueba() {
    setEnviando(true);
    const oNulo = (v: string) => (v.trim() ? v.trim() : null);
    const r = await enviarPruebaPlantilla({
      tipo: meta.tipo,
      asunto: oNulo(b.asunto), intro: oNulo(b.intro), cuerpo: oNulo(b.cuerpo),
      botonTexto: oNulo(b.botonTexto), colorCabecera: oNulo(b.colorCabecera),
      colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
      pie: oNulo(b.pie), fuente: oNulo(b.fuente),
    });
    setEnviando(false);
    showToast('error' in r ? r.error : `Prueba enviada a ${r.enviadoA}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      {/* ── Columna de edición ── */}
      <div className="space-y-5">
        <Field label="Asunto" description="Es lo único que ve en la bandeja antes de abrirlo.">
          <input className={inputCls} placeholder={meta.asuntoDefault}
            value={b.asunto} onChange={e => set('asunto', e.target.value)} />
        </Field>

        {/* Elección de modo explícita. Antes era un enlace gris que parecía una
            nota al pie y nadie pulsaba. */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => set('cuerpo', '')}
            aria-pressed={!modoLibre}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors',
              !modoLibre ? 'border-foreground bg-muted' : 'border-border hover:border-foreground',
            )}
          >
            <span className="block text-[13px] font-semibold text-foreground">Cambiar solo el saludo</span>
            <span className="block text-[11px] text-muted-foreground">El diseño de Tentare, con tus palabras.</span>
          </button>
          <button
            type="button"
            onClick={() => { if (!modoLibre) set('cuerpo', cuerpoDePartida(meta, b.intro)); }}
            aria-pressed={modoLibre}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors',
              modoLibre ? 'border-foreground bg-muted' : 'border-border hover:border-foreground',
            )}
          >
            <span className="block text-[13px] font-semibold text-foreground">Escribir el correo entero</span>
            <span className="block text-[11px] text-muted-foreground">Tú decides qué va y en qué orden.</span>
          </button>
        </div>

        {!modoLibre ? (
          <Field label="Saludo" description="La frase con la que abre. Debajo van los datos, que se rellenan solos.">
            <textarea className={cn(inputCls, 'resize-none')} rows={3} placeholder={meta.introDefault}
              value={b.intro} onChange={e => set('intro', e.target.value)} />
          </Field>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-foreground">Contenido</span>
              <BarraFormato onAplicar={f => escribirEnCuerpo(f.antes, f.despues, f.ejemplo)} />
            </div>
            <textarea
              ref={areaCuerpo}
              className={cn(inputCls, 'font-mono text-[12px] leading-relaxed')}
              rows={14}
              value={b.cuerpo}
              onChange={e => set('cuerpo', e.target.value)}
            />

            <div className="rounded-xl border border-border p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Añadir al correo
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => escribirEnCuerpo('\n{datos}\n', '', '')}
                  className="rounded-full border border-border px-3 py-1.5 text-[12px] hover:border-foreground">
                  {meta.datosLabel}
                </button>
                {meta.botonLabel && (
                  <button type="button" onClick={() => escribirEnCuerpo('\n{boton}\n', '', '')}
                    className="rounded-full border border-border px-3 py-1.5 text-[12px] hover:border-foreground">
                    {meta.botonLabel}
                  </button>
                )}
                {meta.variables.map(v => (
                  <button key={v.token} type="button" title={`Se sustituye por ${v.que}`}
                    onClick={() => escribirEnCuerpo(v.token, '', '')}
                    className="rounded-full border border-border px-3 py-1.5 text-[12px] hover:border-foreground">
                    {v.que}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Se colocan donde tengas el cursor. Puedes quitarlos: si borras
                «{meta.datosLabel.toLowerCase()}», el correo sale sin esos datos.
              </p>
            </div>
          </div>
        )}

        {/* ── Marca ── */}
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-foreground">
            Colores, logo y pie
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">opcional</span>
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <p className="text-[11px] text-muted-foreground">
              Si no tocas nada se usan los de tu estudio. El color del texto del botón se
              calcula solo para que se lea sobre el fondo que elijas.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Color de la franja" description="La banda de arriba del correo.">
                <input type="color" className={cn(inputCls, 'h-10 p-1')}
                  value={b.colorCabecera || '#343825'}
                  onChange={e => set('colorCabecera', e.target.value)} />
              </Field>
              <Field
                label="Color del botón"
                description={b.colorBoton ? 'Distinto al de la franja.' : 'Va con el de la franja.'}
              >
                {/* Enseña lo que va a salir de verdad: si no lo ha fijado,
                    hereda de la franja. Enseñar aquí otro color sería mentir. */}
                <input type="color" className={cn(inputCls, 'h-10 p-1')}
                  value={b.colorBoton || b.colorCabecera || '#343825'}
                  onChange={e => set('colorBoton', e.target.value)} />
              </Field>
            </div>
            {(b.colorCabecera || b.colorBoton) && (
              <button type="button" onClick={() => { set('colorCabecera', ''); set('colorBoton', ''); }}
                className="text-[11px] text-muted-foreground underline underline-offset-2">
                Volver a los colores de mi estudio
              </button>
            )}
            {meta.botonLabel && (
              <Field label="Texto del botón" description="Lo que pone dentro del botón.">
                <input className={inputCls} placeholder="El de siempre"
                  value={b.botonTexto} onChange={e => set('botonTexto', e.target.value)} />
              </Field>
            )}
            <Field label="Logo solo para este correo" description="Dirección de una imagen PNG o JPG. Vacío = el logo de tu estudio.">
              <input className={inputCls} placeholder="https://…"
                value={b.logoUrl} onChange={e => set('logoUrl', e.target.value)} />
            </Field>
            <Field label="Tipografía" description="Solo las que saben pintar todos los programas de correo.">
              <select className={inputCls} value={b.fuente} onChange={e => set('fuente', e.target.value)}>
                <option value="">La de tu estudio</option>
                {FUENTES_EMAIL.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Field label="Pie del correo" description="La línea pequeña del final.">
              <input className={inputCls} placeholder="Enviado por {estudio} · Powered by Tentare"
                value={b.pie} onChange={e => set('pie', e.target.value)} />
            </Field>
          </div>
        </details>

      </div>

      {/* ── Vista previa ──
          Va DESPUÉS de los campos y ANTES de las acciones, y no hace falta
          ninguna clase `order` para conseguirlo: en móvil la rejilla es de una
          columna y los tres hermanos se apilan en este orden —campos, correo,
          botones—, que es como se revisa antes de guardar. En escritorio, con
          dos columnas, la colocación automática manda los campos a (1,1), el
          correo a (1,2) y las acciones a (2,1): siguen debajo de los campos,
          igual que antes. */}
      <div className="lg:sticky lg:top-0 lg:h-[560px]">
        <VistaPreviaViva tipo={meta.tipo} borrador={b} />
      </div>

      {/* ── Acciones ──
          `lg:col-span-2` no es decorativo: sin él, en escritorio los botones
          caen en la fila 2 de la columna izquierda, y como la fila 1 mide lo
          que mide la vista previa (560 px) queda un hueco muerto enorme entre
          los campos y los botones. Ocupando el ancho entero se leen como una
          barra de pie del diálogo, que es lo que son. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 lg:col-span-2">
        <button
          type="button"
          onClick={() => setB(VACIO)}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground underline underline-offset-2"
        >
          <Undo2 size={13} /> Dejarlo como viene de fábrica
        </button>
        <div className="flex items-center gap-2">
          <button onClick={enviarPrueba} disabled={enviando} className={cn(btnSecondary, 'disabled:opacity-50')}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviarme una prueba
          </button>
          <button onClick={guardar} disabled={guardando} className={cn(btnPrimary, 'disabled:opacity-50')}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lista ───────────────────────────────────────────────────────────────────

export function TabPlantillasEmail({ showToast }: { showToast: (m: string) => void }) {
  const { plantillasEmail, upsertPlantillaEmail } = useStudio();
  const [abierta, setAbierta] = useState<TipoPlantillaEmail | null>(null);
  const metaAbierta = PLANTILLAS_META.find(m => m.tipo === abierta);

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Estos son los correos que Tentare envía sola a tus clientas. Puedes cambiarles el
        saludo o escribirlos enteros, y los vas viendo mientras los editas. Los de recibo y
        factura no se tocan por su contenido fiscal.
      </p>

      <div className={cn(cardCls, 'divide-y divide-border')}>
        {PLANTILLAS_META.map(meta => {
          const p = plantillasEmail.find(x => x.tipo === meta.tipo);
          const r = resumen(borradorDe(p), p?.activa ?? true);
          return (
            <button
              key={meta.tipo}
              type="button"
              onClick={() => setAbierta(meta.tipo)}
              className="flex w-full items-center gap-4 p-4 text-left hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground">{meta.label}</p>
                <p className="truncate text-[12px] text-muted-foreground">{meta.cuando}</p>
              </div>
              <span className={cn(
                'shrink-0 rounded-full px-2.5 py-1 text-[11px]',
                r.tocado ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
              )}>
                {r.texto}
              </span>
              <Pencil size={14} className="shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      <Dialog open={!!metaAbierta} onOpenChange={open => { if (!open) setAbierta(null); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          {metaAbierta && (
            <>
              <DialogHeader>
                <DialogTitle>{metaAbierta.label}</DialogTitle>
                <p className="text-[12px] text-muted-foreground">{metaAbierta.cuando}</p>
              </DialogHeader>
              <EditorPlantilla
                meta={metaAbierta}
                plantilla={plantillasEmail.find(x => x.tipo === metaAbierta.tipo)}
                showToast={showToast}
                onCerrar={() => setAbierta(null)}
                onGuardar={async cambios => {
                  const res = await upsertPlantillaEmail(metaAbierta.tipo, cambios);
                  showToast(res.ok ? 'Guardado' : res.error);
                }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
