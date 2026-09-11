import { Mail, Bell, Sparkles, Check, Gauge, Wrench, Calendar } from 'lucide-react';
import type { FiltroActualizaciones } from '@/lib/actualizaciones/version';

// Las previews de la sección «Actualizaciones».
//
// Son ESCENAS DE INTERFAZ dibujadas con los tokens del panel, no capturas: una
// captura envejece con cada rediseño. Si un estudio tiene su propio color de
// marca —el panel es marca blanca—, las escenas se tiñen solas con el suyo.
//
// ⚠️ **Hay UNA fotografía y solo una**, de fondo del bloque destacado. Es
// deliberado que no se repita en las filas del timeline: `imagenes-por-defecto.ts`
// ya documenta por qué («la misma foto ocho veces en una pantalla se lee como un
// error»), y ahí abajo lo que distingue una versión de otra es su categoría, que
// es justo lo que dibujan las escenas.
//
// ⚠️ Se eligen por CATEGORÍA de la versión, no por funcionalidad concreta, y es
// una limitación conocida: el dato publicado no guarda qué pinta cada
// actualización, y deducirlo del texto sería adivinar (pondría un calendario en
// una versión de cobros). Una escena de categoría describe el TIPO y por tanto
// nunca miente. Para que cada actualización tenga la suya hace falta elegirla al
// publicar — campo en la tabla + selector en /interno, segunda pasada.

type Cat = Exclude<FiltroActualizaciones, 'todas'>;

/** Una tarjetita de interfaz: icono en su pastilla de color + texto corto. */
function Fila({
  Icono, tinte, fondo, texto, pie, className = '',
}: {
  Icono: React.ElementType; tinte: string; fondo: string;
  texto: string; pie?: string; className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card px-1.5 py-1 flex items-center gap-1.5 ${className}`}>
      <span className={`w-4 h-4 rounded-[5px] ${fondo} flex items-center justify-center shrink-0`}>
        <Icono size={9} className={tinte} />
      </span>
      <span className="min-w-0">
        <span className="block text-[8.5px] font-bold text-foreground leading-none truncate">{texto}</span>
        {pie && <span className="block text-[7.5px] text-muted-foreground leading-none mt-[3px] truncate">{pie}</span>}
      </span>
    </div>
  );
}

/** Nuevas funciones — un flujo automático: la forma de lo que se añade. */
function EscenaNuevas() {
  return (
    <div className="w-full h-full px-2.5 py-2 flex flex-col justify-center gap-1">
      <Fila Icono={Mail} tinte="text-success" fondo="bg-success/12" texto="Bienvenida" />
      <Fila Icono={Bell} tinte="text-info" fondo="bg-info/12" texto="Recordatorio" className="ml-2" />
      <Fila Icono={Sparkles} tinte="text-brand" fondo="bg-brand/12" texto="Reactivación" className="ml-4" />
    </div>
  );
}

/** Mejoras — una semana del calendario, que es lo que más se mira del panel. */
function EscenaMejoras() {
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  // Alturas y colores FIJOS: una preview que cambia en cada render parpadea al
  // filtrar y no se puede comparar con la de al lado.
  const COLS: { alto: number; tono: string }[][] = [
    [{ alto: 10, tono: 'bg-brand/30' }, { alto: 6, tono: 'bg-info/25' }],
    [{ alto: 7, tono: 'bg-info/25' }],
    [{ alto: 12, tono: 'bg-brand/30' }, { alto: 7, tono: 'bg-success/25' }],
    [{ alto: 6, tono: 'bg-info/25' }, { alto: 6, tono: 'bg-brand/30' }],
    [{ alto: 16, tono: 'bg-brand/30' }],
    [{ alto: 8, tono: 'bg-success/25' }],
    [],
  ];
  return (
    <div className="w-full h-full px-2.5 py-2 flex flex-col justify-center gap-1.5">
      <div className="grid grid-cols-7 gap-[3px]">
        {DIAS.map((d) => (
          <span key={d} className="text-[7.5px] font-bold text-muted-foreground text-center leading-none">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px] items-start">
        {COLS.map((col, i) => (
          <span key={DIAS[i]} className="flex flex-col gap-[3px]">
            {col.map((b, j) => <span key={j} className={`rounded-[3px] ${b.tono}`} style={{ height: b.alto }} />)}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1 pt-0.5">
        <Gauge size={9} className="text-success shrink-0" />
        <span className="text-[7.5px] font-semibold text-muted-foreground leading-none truncate">Más rápido</span>
      </div>
    </div>
  );
}

/** Correcciones — algo que vuelve a funcionar. */
function EscenaCorrecciones() {
  return (
    <div className="w-full h-full px-2.5 py-2 flex flex-col items-center justify-center gap-1.5">
      <span className="w-7 h-7 rounded-full bg-success/12 flex items-center justify-center">
        <Check size={14} className="text-success" strokeWidth={2.75} />
      </span>
      <span className="text-[8.5px] font-bold text-success leading-tight text-center px-1">
        Funcionando<br />correctamente
      </span>
    </div>
  );
}

const ESCENA: Record<Cat, () => React.ReactElement> = {
  nuevas: EscenaNuevas,
  mejoras: EscenaMejoras,
  correcciones: EscenaCorrecciones,
};

// El tinte del fondo de la preview. `--brand` es el color del ESTUDIO (marca
// blanca), así que esto se adapta solo a cada cliente.
const TINTE: Record<Cat, string> = {
  nuevas: 'from-brand/[0.10] via-brand/[0.04]',
  mejoras: 'from-info/[0.10] via-info/[0.04]',
  correcciones: 'from-success/[0.10] via-success/[0.04]',
};

/** La preview de una fila del timeline. Decorativa: el texto ya lo dice todo. */
export function PreviewActualizacion({ categoria, className = '' }: { categoria: Cat; className?: string }) {
  const Escena = ESCENA[categoria];
  return (
    <div
      aria-hidden
      className={`overflow-hidden rounded-xl border border-border bg-gradient-to-br ${TINTE[categoria]} to-transparent ${className}`}
    >
      <Escena />
    </div>
  );
}

/**
 * La escena grande de la tarjeta destacada: una foto y unas tarjetas encima.
 *
 * ⚠️ **Vive en `public/actualizaciones/`, NO en `public/por-defecto/`**, y la
 * separación importa: las de `por-defecto` son la foto que se le presta a un
 * estudio que aún no ha subido la suya —se recortan en cinco sitios, tres van
 * bajo un velo que las tiñe, y su README prohíbe las caras justo por eso—.
 * Esta es de Tentare hablando de Tentare, se ve entera y en un solo sitio.
 * Meterla en aquella carpeta la habría dejado a un `imagenDeEstudio()` de
 * distancia de acabar siendo la portada del portal de una clienta.
 *
 * Va por `background-image` y no por `<img>` a propósito: el panel la esconde
 * en móvil (`hidden lg:block`) y el fondo de un elemento sin pintar no se
 * descarga, así que quien entra desde el teléfono no paga sus 73 KB.
 *
 * ⚠️ **Ningún texto se apoya en la foto.** Las tarjetas son opacas (`bg-card`)
 * y el titular vive en la otra columna. Es la lección de [[velo-del-heroe]]:
 * el texto sobre fotografía mide ~1,3:1 de contraste real por bien que luzca en
 * la captura. Y el motivo está a la DERECHA —la foto se eligió así—, que es por
 * donde las tarjetas no pasan.
 */
const FOTO = '/actualizaciones/estudio.webp';

/** Una tarjeta flotando sobre la foto. Opaca, con sombra: se lee siempre. */
function Flotante({
  Icono, tinte, fondo, titulo, pie, className = '',
}: {
  Icono: React.ElementType; tinte: string; fondo: string;
  titulo: string; pie: string; className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/60 bg-card px-2.5 py-2 flex items-center gap-2.5 shadow-lg shadow-black/[0.14] ${className}`}
    >
      <span className={`w-8 h-8 rounded-lg ${fondo} flex items-center justify-center shrink-0`}>
        <Icono size={15} className={tinte} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-bold text-foreground leading-tight truncate">{titulo}</span>
        <span className="block text-[10px] text-muted-foreground leading-tight truncate">{pie}</span>
      </span>
    </div>
  );
}

const FLOTANTES: Record<Cat, { Icono: React.ElementType; tinte: string; fondo: string; titulo: string; pie: string; desp: string }[]> = {
  nuevas: [
    { Icono: Mail, tinte: 'text-success', fondo: 'bg-success/12', titulo: 'Email de bienvenida', pie: 'Automático', desp: 'ml-0' },
    { Icono: Sparkles, tinte: 'text-brand', fondo: 'bg-brand/12', titulo: 'Reactivación', pie: 'Tras 30 días', desp: 'ml-4' },
  ],
  mejoras: [
    { Icono: Calendar, tinte: 'text-brand', fondo: 'bg-brand/12', titulo: 'Tu semana', pie: 'Se abre al instante', desp: 'ml-0' },
    { Icono: Gauge, tinte: 'text-success', fondo: 'bg-success/12', titulo: 'Más rápido', pie: 'En todo el panel', desp: 'ml-4' },
  ],
  correcciones: [
    { Icono: Wrench, tinte: 'text-info', fondo: 'bg-info/12', titulo: 'Ya está arreglado', pie: 'Sin hacer nada', desp: 'ml-0' },
    { Icono: Check, tinte: 'text-success', fondo: 'bg-success/12', titulo: 'Funcionando', pie: 'Como debía', desp: 'ml-4' },
  ],
};

// ⚠️ El suelo de altura va BAJO (240) a propósito. Una versión de solo arreglos
// trae un único cambio y la columna del texto mide poco; con un mínimo alto, la
// tarjeta se estiraba igual y dejaba un hueco muerto debajo del botón. A 240 la
// foto sigue teniendo presencia y el bloque no crece más de lo que tiene que
// contar.
export function EscenaDestacada({ categoria }: { categoria: Cat }) {
  return (
    <div aria-hidden className="relative w-full h-full min-h-[240px] overflow-hidden">
      <span
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${FOTO})` }}
      />
      {/* Dos velos, cada uno con su trabajo. El de la izquierda deshace la
          COSTURA con la columna del texto —sin él la foto corta a cuchillo y el
          bloque parece dos tarjetas pegadas— y se apaga al 26 %, porque un velo
          largo se come la foto, que es justo lo que se venía a poner. El de
          abajo asienta las tarjetas: van sobre el suelo y la toalla, la zona
          tranquila del encuadre, y ahí la foto es casi blanca. */}
      <span className="absolute inset-0 bg-gradient-to-r from-card from-0% to-transparent to-26%" />
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/25 to-transparent" />
      {/* ⚠️ Abajo y a la izquierda, NUNCA centradas: la figura ocupa el centro y
          la derecha del encuadre, y una tarjeta encima de ella tapa lo único
          que la foto tenía que aportar. */}
      <div className="relative h-full p-5 flex flex-col justify-end items-start gap-2">
        {FLOTANTES[categoria].map((f) => (
          <Flotante
            key={f.titulo}
            Icono={f.Icono}
            tinte={f.tinte}
            fondo={f.fondo}
            titulo={f.titulo}
            pie={f.pie}
            className={`${f.desp} w-[198px]`}
          />
        ))}
      </div>
    </div>
  );
}
