'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Link2, List, Heading, Loader2, Send, Check, Undo2, Pencil, MailX,
  Image as IconoImagen, Minus, Quote,
} from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { CampoImagen } from '@/components/ui/campo-imagen';
import { subirPortadaCorreo, eliminarPortadaCorreo } from '@/lib/portal-storage';
import { cn } from '@/lib/utils';
import { FUENTES_EMAIL, type FuenteEmail, type PlantillaEmail, type TipoPlantillaEmail } from '@/lib/types';
import { inputCls, btnPrimary, btnSecondary, cardCls, Field, Toggle } from '@/components/configuracion/estilos';
import { EstadoAjuste } from '@/components/configuracion/shell/estado-ajuste';
import { previsualizarPlantilla, enviarPruebaPlantilla, fetchThemePublicado } from '@/lib/api-client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useNavegacionConfig } from '@/components/configuracion/shell/contexto';

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
  // Lo que pone el pie cuando ella no escribe el suyo. NO es el mismo en todas
  // mientras quedan plantillas sin pasar al diseño del estudio: enseñar aquí un
  // texto que su correo no lleva es justo lo que este campo evita.
  pieDefault: string;
  // ¿Este correo lleva foto de portada de fábrica? Decide qué dice el
  // interruptor cuando la propietaria no lo ha tocado. Va aquí y no en la
  // plantilla de correo para que la pantalla NO tenga que adivinarlo.
  portadaDeFabrica: boolean;
  // Qué se pierde la clienta si se apaga este correo. Se enseña al apagarlo y
  // mientras siga apagado: apagar un correo es una decisión legítima de la
  // propietaria, pero tiene que tomarla sabiendo qué deja de llegar. No es un
  // bloqueo ni un "¿estás segura?" — es la consecuencia, dicha una vez y en
  // cristiano.
  avisoAlApagar: string;
}[] = [
  {
    tipo: 'bienvenida', label: 'Bienvenida', cuando: 'Se envía al dar de alta a una alumna.',
    asuntoDefault: '¡Bienvenida a {estudio}!',
    introDefault: 'Hola {nombre}, estamos encantadas de tenerte en {estudio}.',
    variables: [{ token: '{nombre}', que: 'el nombre de la alumna' }, { token: '{estudio}', que: 'el nombre de tu estudio' }],
    pieDefault: '{estudio} · tu dirección',
    portadaDeFabrica: true,
    datosLabel: 'Su plan contratado',
    avisoAlApagar: 'Nadie le mandará el enlace para entrar a su portal al darla de alta.',
    botonLabel: 'Botón de acceso a su portal',
  },
  {
    tipo: 'reserva', label: 'Reserva confirmada', cuando: 'Se envía cuando una alumna reserva una clase.',
    asuntoDefault: 'Reserva confirmada — {clase}',
    introDefault: 'Hola {nombre}, tu plaza está reservada.',
    variables: [{ token: '{nombre}', que: 'el nombre de la alumna' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
    botonLabel: 'Botón para abrir su app',
    pieDefault: '{estudio} · tu dirección',
    portadaDeFabrica: true,
    avisoAlApagar: 'Solo verá la confirmación en pantalla al reservar y en su portal.',
  },
  {
    tipo: 'recordatorio', label: 'Recordatorio de clase', cuando: 'Se envía 24 h antes; si reserva más tarde, poco después de reservar (si falta más de 1 h y cuarto). Apagarlo no apaga el aviso en su app.',
    asuntoDefault: 'Recordatorio — {clase}',
    introDefault: 'Hola {nombre}, te esperamos en tu próxima clase. Aquí tienes los detalles.',
    variables: [{ token: '{nombre}', que: 'el nombre de la alumna' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
    botonLabel: 'Botón para abrir su app',
    pieDefault: '{estudio} · tu dirección',
    portadaDeFabrica: true,
    avisoAlApagar: 'No le llegará el aviso previo por correo. El de su app (24 h y 1 h antes) y el de WhatsApp, si lo tienes, siguen saliendo.',
  },
  {
    tipo: 'cancelacion', label: 'Clase cancelada', cuando: 'Se envía cuando el estudio cancela una clase.',
    asuntoDefault: 'Clase cancelada — {clase}',
    introDefault: 'Hola {nombre}, lamentamos avisarte de que esta clase ha sido cancelada. No hace falta que te presentes.',
    variables: [{ token: '{nombre}', que: 'el nombre de la alumna' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
    pieDefault: '{estudio} · tu dirección',
    portadaDeFabrica: false,
    avisoAlApagar: 'No se enterará por correo de que has anulado su clase.',
  },
  {
    tipo: 'promocion', label: 'Plaza liberada', cuando: 'Se envía al ascender a una alumna desde la lista de espera.',
    asuntoDefault: 'Se ha liberado tu plaza — {clase}',
    introDefault: 'Hola {nombre}, estabas en lista de espera y ha quedado una plaza libre.',
    variables: [{ token: '{nombre}', que: 'el nombre de la alumna' }, { token: '{clase}', que: 'el nombre de la clase' }],
    datosLabel: 'Fecha, hora, sala e instructora',
    botonLabel: 'Botón para abrir su app',
    pieDefault: '{estudio} · tu dirección',
    portadaDeFabrica: true,
    avisoAlApagar: 'No sabrá que ha entrado desde la lista de espera y puede perder la plaza.',
  },
  {
    tipo: 'impago', label: 'Pago fallido', cuando: 'Se envía cuando un cobro automático no se completa.',
    asuntoDefault: 'Problema con tu pago — {estudio}',
    introDefault: 'Hola {nombre}, hemos intentado cobrar tu cuota y el pago no se ha completado.',
    variables: [{ token: '{nombre}', que: 'el nombre de la alumna' }, { token: '{estudio}', que: 'el nombre de tu estudio' }],
    datosLabel: 'El concepto y el importe',
    pieDefault: '{estudio} · tu dirección',
    portadaDeFabrica: false,
    avisoAlApagar: 'No sabrá que su cobro ha fallado: tendrás que avisarla tú.',
  },
];

type Meta = (typeof PLANTILLAS_META)[number];

type Borrador = {
  asunto: string; intro: string; cuerpo: string; botonTexto: string; botonUrl: string;
  colorCabecera: string; colorBoton: string; logoUrl: string; fuente: string; pie: string;
  portadaUrl: string;
  // `null` = lo que decida la plantilla (la reserva lleva foto, la cancelación
  // no). Es distinto de `false`, que la apaga a propósito.
  mostrarPortada: boolean | null;
};

const VACIO: Borrador = {
  asunto: '', intro: '', cuerpo: '', botonTexto: '', botonUrl: '',
  colorCabecera: '', colorBoton: '', logoUrl: '', fuente: '', pie: '',
  portadaUrl: '', mostrarPortada: null,
};

function borradorDe(p: PlantillaEmail | undefined): Borrador {
  if (!p) return VACIO;
  return {
    asunto: p.asunto ?? '', intro: p.intro ?? '', cuerpo: p.cuerpo ?? '',
    botonTexto: p.botonTexto ?? '', botonUrl: p.botonUrl ?? '',
    colorCabecera: p.colorCabecera ?? '',
    colorBoton: p.colorBoton ?? '', logoUrl: p.logoUrl ?? '',
    fuente: p.fuente ?? '', pie: p.pie ?? '',
    portadaUrl: p.portadaUrl ?? '', mostrarPortada: p.mostrarPortada ?? null,
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
  const marca = [b.colorCabecera, b.colorBoton, b.logoUrl, b.fuente, b.pie, b.portadaUrl, b.botonUrl].some(v => v.trim())
    || b.mostrarPortada !== null;
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

// ─── Interruptor de encendido/apagado ────────────────────────────────────────
// El mismo de todo el panel (components/ui/interruptor.tsx): un <button
// role="switch"> de verdad. Mientras se guarda no se deja tocar, y el `title`
// repite el nombre para quien pasa el ratón.

function Interruptor({ on, onChange, label, ocupado, className }: {
  on: boolean; onChange: () => void; label: string; ocupado: boolean; className?: string;
}) {
  return <Toggle on={on} onChange={() => onChange()} ariaLabel={label} title={label} ocupado={ocupado} className={className} />;
}

// Dónde va la pastilla de estado en cada fila de la lista: debajo del texto en
// columna estrecha, al lado desde 32 rem (ver la rejilla de la fila).
const COLOCA_ESTADO = 'whitespace-normal @lg/config:justify-self-end';

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
  // Los tres de abajo son Markdown de toda la vida, así que no hacen falta
  // tokens nuevos ni saber nada: la aplicación escribe los símbolos.
  { icono: IconoImagen, titulo: 'Imagen', antes: '![', despues: '](https://)', ejemplo: 'qué se ve en la foto' },
  { icono: Minus, titulo: 'Separador', antes: '\n---\n', despues: '', ejemplo: '' },
  { icono: Quote, titulo: 'Cita', antes: '> ', despues: '', ejemplo: 'Lo que dijo alguien' },
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


// ─── Foto de portada de un correo ────────────────────────────────────────────
// Lo que la propietaria no podía cambiar hasta ahora: qué foto encabeza ESTE
// correo, y si lo encabeza alguna. El valor por defecto sigue siendo la portada
// de su app, así que quien no toque nada no nota nada.

function BloquePortada({
  meta, b, set, showToast,
}: {
  meta: Meta;
  b: Borrador;
  set: <K extends keyof Borrador>(k: K, v: Borrador[K]) => void;
  showToast: (m: string) => void;
}) {
  const { studio } = useStudio();
  const [subiendo, setSubiendo] = useState(false);
  // `null` = no lo ha tocado, así que manda lo que trae la plantilla.
  const lleva = b.mostrarPortada ?? meta.portadaDeFabrica;

  async function subir(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo(true);
    const r = await subirPortadaCorreo(studio.id, meta.tipo, file);
    setSubiendo(false);
    if ('error' in r) return r;
    // Subir una foto es querer verla: encenderla a mano después sería un paso
    // más para descubrir por qué no sale.
    set('mostrarPortada', true);
    return r;
  }

  async function cambiar(url: string | null) {
    if (url === null && studio) await eliminarPortadaCorreo(studio.id, meta.tipo);
    set('portadaUrl', url ?? '');
    if (url === null) showToast('Vuelve la portada de tu app');
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-foreground">Foto de portada</p>
          <p className="text-xs text-muted-foreground">
            {lleva
              ? 'Encabeza este correo. Vacía = la portada de tu app (Apariencia).'
              : 'Este correo va sin foto. Enciéndela si quieres que la lleve.'}
          </p>
        </div>
        <Toggle
          on={lleva}
          onChange={v => set('mostrarPortada', v === meta.portadaDeFabrica ? null : v)}
          ariaLabel="Este correo lleva foto de portada"
        />
      </div>

      {lleva && (
        <CampoImagen
          etiqueta="Foto de portada del correo"
          valor={b.portadaUrl || null}
          onSubir={subir}
          onCambiar={cambiar}
          ocupado={subiendo}
          clasePreview="w-24 h-14"
          textoSubir="Subir foto"
          textoCambiar="Cambiar foto"
          ayuda={
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              JPG o PNG. Se guarda en JPG a 1200 px: Outlook no pinta WEBP y dejaría un hueco.
            </p>
          }
        />
      )}
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
        botonTexto: oNulo(b.botonTexto), botonUrl: oNulo(b.botonUrl),
        colorCabecera: oNulo(b.colorCabecera),
        colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
        portadaUrl: oNulo(b.portadaUrl), mostrarPortada: b.mostrarPortada,
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
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Así lo recibe tu alumna
        </p>
        {cargando && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      {/* La línea de bandeja: el asunto es lo único que se ve antes de abrir. */}
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">En su bandeja</p>
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
      <p className="text-xs text-muted-foreground">
        Con una alumna de ejemplo (Ana García) y una clase de ejemplo.
      </p>
    </div>
  );
}

// ─── Editor de una plantilla ─────────────────────────────────────────────────

function EditorPlantilla({
  meta, plantilla, onGuardar, showToast, onCerrar, onSucio,
}: {
  meta: Meta;
  plantilla: PlantillaEmail | undefined;
  /** `null` = guardado de verdad; un texto = no se ha guardado, y por qué. */
  onGuardar: (cambios: Partial<PlantillaEmail>) => Promise<string | null>;
  showToast: (m: string) => void;
  onCerrar: () => void;
  /** Hay algo escrito que no está guardado: cerrar tiene que preguntar. */
  onSucio: (sucio: boolean) => void;
}) {
  const [b, setB] = useState<Borrador>(() => borradorDe(plantilla));
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB(prev => ({ ...prev, [k]: v }));
  const areaCuerpo = useRef<HTMLTextAreaElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  // Comparado con lo guardado, no con «ha tocado algo»: escribir y borrar lo
  // mismo no es un cambio que se pierda.
  const sucio = JSON.stringify(b) !== JSON.stringify(borradorDe(plantilla));
  useEffect(() => { onSucio(sucio); }, [sucio, onSucio]);

  // El color de la marca del estudio, para que los selectores enseñen lo que
  // sale de verdad. Del tema PUBLICADO —que sin tema cae al preset—, no de
  // `studio.colorPrimario`: esa columna guarda un índigo de alta que no eligió
  // nadie (ver lib/emails/color-marca.ts). Mientras carga, el oliva del kit.
  const [colorMarca, setColorMarca] = useState({ primario: '#343825', secundario: '#5A6142' });
  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (vivo && t) setColorMarca({ primario: t.primary, secundario: t.secondary || t.primary }); })
      // Sin tema que leer, los selectores se quedan en el del kit: el correo
      // tampoco tendría otro.
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

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
    if (guardando) return;
    // El destino del botón lo acota también un CHECK en la base (migr
    // 20260916105833), que es la cerradura de verdad. Se comprueba aquí para no
    // devolverle el error crudo de Postgres a la propietaria.
    const destino = b.botonUrl.trim();
    if (destino && !/^https?:\/\//i.test(destino)) {
      setErrorGuardar('El destino del botón tiene que empezar por https://');
      return;
    }
    setGuardando(true);
    setErrorGuardar(null);
    const oNulo = (v: string) => (v.trim() ? v.trim() : null);
    const fallo = await onGuardar({
      // Editar y guardar es querer que se aplique. Si la fila venía con
      // activa=false (del interruptor que ya no se enseña), guardar sin esto
      // dejaría el correo saliendo por defecto y parecería que no se guardó.
      activa: true,
      asunto: oNulo(b.asunto), intro: oNulo(b.intro), cuerpo: oNulo(b.cuerpo),
      botonTexto: oNulo(b.botonTexto), botonUrl: oNulo(b.botonUrl),
      colorCabecera: oNulo(b.colorCabecera),
      colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
      portadaUrl: oNulo(b.portadaUrl), mostrarPortada: b.mostrarPortada,
      pie: oNulo(b.pie), fuente: fuenteValida(b.fuente),
    });
    setGuardando(false);
    // Si no se ha guardado, el editor se queda abierto con lo escrito: cerrarlo
    // y dejar solo un aviso era perder el correo que se estaba redactando.
    if (fallo) { setErrorGuardar(fallo); return; }
    onCerrar();
  }

  async function enviarPrueba() {
    setEnviando(true);
    const oNulo = (v: string) => (v.trim() ? v.trim() : null);
    const r = await enviarPruebaPlantilla({
      tipo: meta.tipo,
      asunto: oNulo(b.asunto), intro: oNulo(b.intro), cuerpo: oNulo(b.cuerpo),
      botonTexto: oNulo(b.botonTexto), botonUrl: oNulo(b.botonUrl),
      colorCabecera: oNulo(b.colorCabecera),
      colorBoton: oNulo(b.colorBoton), logoUrl: oNulo(b.logoUrl),
      portadaUrl: oNulo(b.portadaUrl), mostrarPortada: b.mostrarPortada,
      pie: oNulo(b.pie), fuente: oNulo(b.fuente),
    });
    setEnviando(false);
    showToast('error' in r ? r.error : `Prueba enviada a ${r.enviadoA}`);
  }

  // Editar un correo apagado es legítimo (dejarlo listo para cuando se vuelva a
  // encender), pero callárselo no: sin este aviso se escribe, se guarda, sale
  // "Guardado" y no le llega a nadie — que es exactamente la clase de mentira
  // silenciosa que este panel intenta no cometer.
  const apagado = plantilla?.enviar === false;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      {/* ── Columna de edición ── */}
      <div className="space-y-5">
        {apagado && (
          <p className="rounded-xl border border-border bg-muted/60 p-3 text-[12px] text-foreground">
            <strong className="font-semibold">Ahora mismo este correo no se envía.</strong>{' '}
            Puedes editarlo y se guarda igual, pero no le llegará a nadie hasta
            que lo vuelvas a encender en la lista.
          </p>
        )}

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
            <span className="block text-xs text-muted-foreground">Con tu marca y tus colores; tú pones las palabras.</span>
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
            <span className="block text-xs text-muted-foreground">Tú decides qué va y en qué orden.</span>
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
              className={cn(inputCls, 'font-mono leading-relaxed [@media(pointer:fine)]:text-[12px]')}
              rows={14}
              value={b.cuerpo}
              onChange={e => set('cuerpo', e.target.value)}
            />

            <div className="rounded-xl border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
              <p className="mt-2 text-xs text-muted-foreground">
                Se colocan donde tengas el cursor. Puedes quitarlos: si borras
                «{meta.datosLabel.toLowerCase()}», el correo sale sin esos datos.
              </p>
            </div>
          </div>
        )}

        {/* ── Marca ── */}
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-foreground">
            Foto, colores, logo y pie
            <span className="ml-2 text-xs font-normal text-muted-foreground">opcional</span>
          </summary>
          <div className="space-y-4 border-t border-border p-4">
            <p className="text-xs text-muted-foreground">
              Si no tocas nada se usan los de tu estudio. El color del texto del botón se
              calcula solo para que se lea sobre el fondo que elijas.
            </p>
            <BloquePortada meta={meta} b={b} set={set} showToast={showToast} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Color principal" description="Tiñe el correo: la franja, las etiquetas y el fondo.">
                {/* Enseña el color que sale DE VERDAD: el que haya elegido aquí,
                    o el de su marca. Antes enseñaba un oliva fijo mientras el
                    correo salía de otro color. */}
                <input type="color" className={cn(inputCls, 'h-10 p-1')}
                  value={b.colorCabecera || colorMarca.primario}
                  onChange={e => set('colorCabecera', e.target.value)} />
              </Field>
              <Field
                label="Color del botón"
                description={b.colorBoton ? 'Distinto al principal.' : b.colorCabecera ? 'Va con el principal.' : 'El secundario de tu marca.'}
              >
                {/* Mismo orden que el correo (marcaConPersonalizacion): el suyo,
                    si no el principal que haya elegido, si no el secundario de
                    su marca. */}
                <input type="color" className={cn(inputCls, 'h-10 p-1')}
                  value={b.colorBoton || b.colorCabecera || colorMarca.secundario}
                  onChange={e => set('colorBoton', e.target.value)} />
              </Field>
            </div>
            {(b.colorCabecera || b.colorBoton) && (
              <button type="button" onClick={() => { set('colorCabecera', ''); set('colorBoton', ''); }}
                className="text-xs text-muted-foreground underline underline-offset-2">
                Volver a los colores de mi estudio
              </button>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Texto del botón" description={meta.botonLabel ?? 'Este correo no lleva botón salvo que le pongas destino.'}>
                <input className={inputCls} placeholder={meta.botonLabel ? 'El de siempre' : 'Ver el horario'}
                  value={b.botonTexto} onChange={e => set('botonTexto', e.target.value)} />
              </Field>
              <Field
                label="A dónde lleva"
                description={meta.botonLabel
                  ? 'Vacío = a su app, como siempre.'
                  : 'Con destino y texto, este correo pasa a llevar botón.'}
              >
                <input className={inputCls} type="url" inputMode="url" placeholder="https://…"
                  value={b.botonUrl} onChange={e => set('botonUrl', e.target.value)} />
              </Field>
            </div>
            {b.botonUrl.trim() !== '' && !/^https?:\/\//i.test(b.botonUrl.trim()) && (
              <p className="text-xs text-foreground">
                El destino tiene que empezar por <strong>https://</strong>. Tal cual está, el botón no
                llevaría a ninguna parte y no se guarda.
              </p>
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
              {/* El placeholder sale de la plantilla, no de una constante:
                  mientras quedan correos sin pasar al diseño del estudio, el
                  pie de fábrica no es el mismo en todos, y enseñar aquí uno que
                  su correo no lleva es exactamente lo que no puede pasar. */}
              <input className={inputCls} placeholder={meta.pieDefault}
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
        {errorGuardar && (
          <p role="alert" className="w-full text-sm font-medium text-destructive text-pretty">
            {/^no se ha guardado/i.test(errorGuardar.trim()) ? '' : 'No se ha guardado: '}
            {errorGuardar.trim().replace(/[.\s]+$/, '')}. Tus cambios siguen aquí.
          </p>
        )}
        <button
          type="button"
          onClick={() => setB(VACIO)}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground underline underline-offset-2"
        >
          <Undo2 size={14} /> Dejarlo como viene de fábrica
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
  const nav = useNavegacionConfig();
  const [abierta, setAbierta] = useState<TipoPlantillaEmail | null>(null);
  // Qué interruptor está guardando ahora mismo. Sin esto se puede pulsar dos
  // veces seguidas y la segunda escritura sale con el valor de antes.
  const [cambiando, setCambiando] = useState<TipoPlantillaEmail | null>(null);
  const metaAbierta = PLANTILLAS_META.find(m => m.tipo === abierta);

  // ── Salir con un correo a medio escribir ──────────────────────────────────
  // Cerrar el editor (Escape, la X, fuera) pregunta antes. Irse de la pantalla
  // (volver, el menú, otra sección) lo pregunta el shell, con la misma marca que
  // usan las barras de guardar; recargar o cerrar la pestaña, el navegador.
  const [sucio, setSucio] = useState(false);
  const [preguntarCerrar, setPreguntarCerrar] = useState(false);
  useEffect(() => {
    if (!sucio || !nav) return;
    return nav.marcarSinGuardar('comunicacion');
  }, [sucio, nav]);
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sucio]);

  function cerrarEditor() {
    setAbierta(null);
    setSucio(false);
    setPreguntarCerrar(false);
  }

  // Encender/apagar un correo. Al apagarlo se dice en el mismo momento qué deja
  // de recibir la clienta: es una decisión de la propietaria, pero no a ciegas.
  async function cambiarEnvio(meta: Meta, enviar: boolean) {
    setCambiando(meta.tipo);
    const res = await upsertPlantillaEmail(meta.tipo, { enviar });
    setCambiando(null);
    if (!res.ok) { showToast(res.error); return; }
    showToast(enviar
      ? `«${meta.label}» vuelve a enviarse.`
      : `«${meta.label}» ya no se envía. ${meta.avisoAlApagar}`);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-[12px] text-muted-foreground">
        Puedes cambiarles el saludo o escribirlos enteros, y los vas viendo mientras los
        editas. Los de recibo y factura no se tocan ni se apagan por su contenido fiscal.
      </p>

      <div className={cn(cardCls, 'divide-y divide-border')}>
        {PLANTILLAS_META.map(meta => {
          const p = plantillasEmail.find(x => x.tipo === meta.tipo);
          const enviar = p?.enviar ?? true;
          const r = resumen(borradorDe(p), p?.activa ?? true);
          return (
            <div key={meta.tipo} data-correo={meta.tipo} className="flex w-full items-start gap-2 pr-4 @lg/config:items-center">
              {/* El interruptor va FUERA del botón que abre el editor: un botón
                  dentro de otro botón no es HTML válido, y además apagar un
                  correo no debe abrir de paso la pantalla de edición. */}
              <button
                type="button"
                onClick={() => setAbierta(meta.tipo)}
                // En columna estrecha, todo apilado: título con su lápiz, la
                // frase entera y la pastilla debajo. En una sola fila, a 375 px
                // el título, la pastilla, el lápiz y el interruptor dejaban la
                // frase en «Se envía…» cortada. Desde 32 rem la pastilla vuelve
                // a su lado.
                className="grid min-w-0 flex-1 grid-cols-1 justify-items-start gap-y-1.5 p-4 text-left hover:bg-muted/50 @lg/config:grid-cols-[minmax(0,1fr)_auto] @lg/config:items-center @lg/config:gap-x-4"
              >
                <div className="min-w-0">
                  <p className={cn('flex items-center gap-1.5 text-[14px] font-semibold', enviar ? 'text-foreground' : 'text-muted-foreground')}>
                    {meta.label}
                    <Pencil size={14} aria-hidden className="shrink-0 text-muted-foreground" />
                  </p>
                  {/* Apagado, el hueco lo ocupa la consecuencia: mientras siga
                      así, lo que importa no es cuándo se enviaba sino qué ha
                      dejado de llegarle a la alumna. Entera: nada de cortarla. */}
                  <p data-cuando="" className="text-[12px] text-muted-foreground text-pretty">
                    {enviar ? meta.cuando : meta.avisoAlApagar}
                  </p>
                </div>
                {/* Apagado gana a personalizado: da igual lo bonito que esté
                    el correo si no sale, así que el estado que se lee de un
                    vistazo es ese. Cada uno con su icono, no solo su color; y
                    puede partirse en dos líneas para caber a 375 px. */}
                {!enviar
                  ? <EstadoAjuste tono="neutro" icono={MailX} className={COLOCA_ESTADO}>Apagado</EstadoAjuste>
                  : <EstadoAjuste tono={r.tocado ? 'personalizado' : 'neutro'} className={COLOCA_ESTADO}>{r.texto}</EstadoAjuste>}
              </button>
              <Interruptor
                on={enviar}
                ocupado={cambiando === meta.tipo}
                onChange={() => void cambiarEnvio(meta, !enviar)}
                label={enviar ? `Dejar de enviar «${meta.label}»` : `Volver a enviar «${meta.label}»`}
                className="mt-4 @lg/config:mt-0"
              />
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!metaAbierta}
        onOpenChange={open => {
          if (open) return;
          // Escape, la X o tocar fuera con un correo a medio escribir: antes, preguntar.
          if (sucio) setPreguntarCerrar(true);
          else cerrarEditor();
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
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
                onCerrar={cerrarEditor}
                onSucio={setSucio}
                onGuardar={async cambios => {
                  const res = await upsertPlantillaEmail(metaAbierta.tipo, cambios);
                  if (!res.ok) return res.error;
                  showToast('Guardado');
                  return null;
                }}
              />
              {/* Dentro del editor: un diálogo encima de otro tiene que ser su hijo. */}
              <ConfirmDialog
                open={preguntarCerrar}
                onOpenChange={v => { if (!v) setPreguntarCerrar(false); }}
                titulo="¿Salir sin guardar?"
                descripcion={`Los cambios de «${metaAbierta.label}» se perderán.`}
                textoConfirmar="Salir sin guardar"
                textoCancelar="Seguir editando"
                destructivo
                onConfirm={cerrarEditor}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
