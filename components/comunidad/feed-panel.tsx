'use client';

// Feed de Comunidad — lado STAFF (panel). Compositor + tarjeta de post.
//
// Vive fuera de `app/(dashboard)/comunidad/page.tsx` porque esa página mezclaba
// 800 líneas de datos y pintura, y porque el compositor tiene bastante estado
// propio (borrador, imagen, evento, audiencia) como para no compartirlo con el
// resto de la pantalla.
//
// Todo el color sale de los tokens del panel (`bg-card`, `border-border`,
// `bg-brand`…): ni un hex suelto. La paleta de avatares (`AVATAR_COLORS`) es
// CATEGÓRICA —distingue personas, no marca— y por eso no se toca.

import { useEffect, useId, useRef, useState } from 'react';
import {
  Cake, CalendarDays, Check, Clock, CreditCard, Globe, Heart, Image as ImageIcon,
  MapPin, Megaphone, MessageCircle, Pencil, Pin, Sparkles, Ticket, Trash2, UserCheck, UserMinus,
  Users, Wallet, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SEGMENTOS_AUDIENCIA, etiquetaSegmento } from '@/lib/marketing/segmentos';
import type { DestinatariosCampana, PostComunidad } from '@/lib/types';

// ─── Paleta categórica de avatares (NO es marca: distingue personas) ────────

export const AVATAR_COLORS = [
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-green-100 text-green-700',
  'bg-amber-100 text-amber-700',
  'bg-red-100 text-red-700',
  'bg-indigo-100 text-indigo-700',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} día${days !== 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function getInitials(nombre: string): string {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const sinPunto = (s: string) => s.replace(/\.$/, '');

// `new Date('...')` no lanza pero sí pinta "Invalid Date": se comprueba una vez.
function partesFecha(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    dia: d.toLocaleDateString('es-ES', { day: 'numeric' }),
    mes: sinPunto(d.toLocaleDateString('es-ES', { month: 'short' })),
    diaSemana: sinPunto(d.toLocaleDateString('es-ES', { weekday: 'short' })),
    hora: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  };
}

// ─── Avatar ─────────────────────────────────────────────────────────────────

export function Avatar({
  initials,
  studio = false,
  colorClass,
  size = 'md',
}: {
  initials: string;
  studio?: boolean;
  colorClass?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = size === 'sm' ? 'size-7 text-[11px]' : size === 'lg' ? 'size-11 text-[14px]' : 'size-9 text-[12px]';
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center shrink-0 font-bold',
        dims,
        studio ? 'bg-brand text-brand-foreground' : colorClass ?? 'bg-muted text-foreground',
      )}
    >
      {initials}
    </div>
  );
}

// ─── Selector de audiencia ──────────────────────────────────────────────────
//
// Antes: un <select> con los nombres del enum (`BONO_CADUCA_PRONTO`). Ahora:
// una rejilla de tarjetas con icono, nombre humano y —lo que de verdad hacía
// falta— A CUÁNTAS personas llega, calculado con los datos que la pantalla ya
// tiene en memoria. Las etiquetas viven en `lib/marketing/segmentos.ts`, no
// aquí: /marketing tenía su propia lista escrita a mano y podían divergir.

const ICONO_SEGMENTO: Record<DestinatariosCampana, LucideIcon> = {
  TODAS: Globe,
  ACTIVAS: UserCheck,
  INACTIVAS: UserMinus,
  SIN_PLAN: Wallet,
  BONO: Ticket,
  VIP: Sparkles,
  BONO_CADUCA_PRONTO: Clock,
  PAGO_FALLIDO: CreditCard,
  CUMPLE_ESTE_MES: Cake,
};

export function SelectorAudiencia({
  valor,
  onChange,
  recuento,
}: {
  valor: DestinatariosCampana;
  onChange: (v: DestinatariosCampana) => void;
  /** Cuántas personas hay en cada segmento. Sale de los datos reales del
   *  estudio; si un segmento no está en el mapa no se enseña ninguna cifra —
   *  nunca un 0 inventado. */
  recuento: Partial<Record<DestinatariosCampana, number>>;
}) {
  return (
    <div role="radiogroup" aria-label="Quién verá esta publicación" className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
      {SEGMENTOS_AUDIENCIA.map(seg => {
        const Icono = ICONO_SEGMENTO[seg.id];
        const activo = valor === seg.id;
        const n = recuento[seg.id];
        return (
          <button
            key={seg.id}
            type="button"
            role="radio"
            aria-checked={activo}
            title={seg.descripcion}
            onClick={() => onChange(seg.id)}
            className={cn(
              'flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              activo
                ? 'border-brand bg-brand/10 shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                : 'border-border bg-card hover:border-foreground/25 hover:bg-muted/40',
            )}
          >
            <Icono
              size={15}
              aria-hidden
              className={cn('mt-0.5 shrink-0 transition-colors', activo ? 'text-brand-medio' : 'text-muted-foreground')}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className={cn('text-[12.5px] font-bold', activo ? 'text-foreground' : 'text-foreground/85')}>
                  {seg.etiqueta}
                </span>
                {activo && <Check size={12} className="shrink-0 text-brand-medio" aria-hidden />}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {n === undefined ? seg.descripcion : `${n} ${n === 1 ? 'clienta' : 'clientas'} · ${seg.descripcion}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Compositor ─────────────────────────────────────────────────────────────

export type BorradorEvento = { activo: boolean; fecha: string; lugar: string; aforo: string };
export const eventoDraftVacio = (): BorradorEvento => ({ activo: false, fecha: '', lugar: '', aforo: '' });

export type OpcionesPublicar = {
  audiencia: DestinatariosCampana;
  imagenUrl: string | null;
  tipo: 'TEXTO' | 'EVENTO';
  eventoFecha: string | null;
  eventoAforo: number | null;
  eventoLugar: string | null;
};

export function eventoDraftAOpts(draft: BorradorEvento): Omit<OpcionesPublicar, 'audiencia' | 'imagenUrl'> {
  if (!draft.activo || !draft.fecha) return { tipo: 'TEXTO', eventoFecha: null, eventoAforo: null, eventoLugar: null };
  const aforo = Number(draft.aforo);
  return {
    tipo: 'EVENTO',
    eventoFecha: new Date(draft.fecha).toISOString(),
    eventoAforo: draft.aforo.trim() && Number.isFinite(aforo) && aforo > 0 ? Math.floor(aforo) : null,
    eventoLugar: draft.lugar.trim() || null,
  };
}

// A partir de aquí un post deja de ser un aviso y pasa a ser un texto largo. No
// es un límite (no se bloquea nada): es un aviso amable, porque el servidor no
// impone ninguna longitud y fingir un tope sería mentir.
const TEXTO_LARGO = 320;

export function CompositorPost({
  inicialesEstudio,
  recuentoAudiencia,
  subiendoImagen,
  imagenUrl,
  onElegirImagen,
  onQuitarImagen,
  onPublicar,
  publicando,
  errorImagen,
}: {
  inicialesEstudio: string;
  recuentoAudiencia: Partial<Record<DestinatariosCampana, number>>;
  subiendoImagen: boolean;
  imagenUrl: string | null;
  onElegirImagen: (file: File) => void;
  onQuitarImagen: () => void;
  onPublicar: (texto: string, opts: OpcionesPublicar) => void;
  publicando: boolean;
  errorImagen: string | null;
}) {
  const [texto, setTexto] = useState('');
  const [evento, setEvento] = useState<BorradorEvento>(eventoDraftVacio());
  const [audiencia, setAudiencia] = useState<DestinatariosCampana>('TODAS');
  const [intento, setIntento] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  // ⚠️ `enfocado` NO puede ser lo que decide si se ve el bloque de audiencia:
  // el `blur` del textarea se dispara en el `mousedown` de cualquier chip, así
  // que el bloque se desmontaría antes de que el clic llegara a aterrizar.
  // `abiertoUnaVez` se engancha al primer foco y solo se suelta al publicar.
  const [abiertoUnaVez, setAbiertoUnaVez] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const ficheroRef = useRef<HTMLInputElement | null>(null);
  const idFecha = useId();
  const idLugar = useId();
  const idAforo = useId();

  // El cuadro crece con el texto en vez de dejar una barra de scroll de 3
  // líneas: escribir un aviso de 6 renglones en una caja fija se siente como
  // rellenar un formulario, no como publicar.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(64, el.scrollHeight)}px`;
  }, [texto]);

  const abierto = abiertoUnaVez || texto.trim().length > 0 || evento.activo || imagenUrl !== null;
  const faltaFecha = evento.activo && !evento.fecha;
  const puedePublicar = Boolean(texto.trim()) && !faltaFecha && !publicando && !subiendoImagen;

  function publicar() {
    setIntento(true);
    if (!puedePublicar) return;
    onPublicar(texto.trim(), { ...eventoDraftAOpts(evento), audiencia, imagenUrl });
    setTexto('');
    setEvento(eventoDraftVacio());
    setAudiencia('TODAS');
    setIntento(false);
    setAbiertoUnaVez(false);
    onQuitarImagen();
  }

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-4 transition-all duration-300',
        enfocado
          ? 'border-brand/60 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.35)]'
          : 'border-border shadow-[0_1px_3px_rgba(0,0,0,0.03)]',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar initials={inicialesEstudio} studio size="lg" />
        <textarea
          ref={areaRef}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onFocus={() => { setEnfocado(true); setAbiertoUnaVez(true); }}
          onBlur={() => setEnfocado(false)}
          placeholder="Comparte algo con tu comunidad…"
          aria-label="Texto de la publicación"
          className="flex-1 resize-none bg-transparent pt-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
          style={{ minHeight: 64 }}
        />
      </div>

      {imagenUrl && (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-border sm:ml-14">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage recién subida, no un asset estático */}
          <img src={imagenUrl} alt="Vista previa de la imagen de la publicación" className="block max-h-72 w-full object-cover" />
          <button
            type="button"
            onClick={onQuitarImagen}
            aria-label="Quitar la imagen"
            className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {subiendoImagen && (
        <div className="mt-3 h-40 animate-pulse rounded-xl bg-muted sm:ml-14" aria-label="Subiendo la imagen" />
      )}
      {errorImagen && <p className="mt-2 text-[12px] text-destructive sm:ml-14">{errorImagen}</p>}

      {/* Barra de herramientas: siempre visible, para que se vea que un post
          puede llevar foto o ser un evento antes de empezar a escribir. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:ml-14">
        <input
          ref={ficheroRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onElegirImagen(f);
            e.target.value = '';
          }}
        />
        <BotonHerramienta
          icono={ImageIcon}
          activo={imagenUrl !== null}
          onClick={() => ficheroRef.current?.click()}
          disabled={subiendoImagen}
        >
          Foto
        </BotonHerramienta>
        <BotonHerramienta
          icono={CalendarDays}
          activo={evento.activo}
          onClick={() => setEvento(p => ({ ...p, activo: !p.activo }))}
          aria-pressed={evento.activo}
        >
          Evento
        </BotonHerramienta>

        <span className="ml-auto text-[11.5px] text-muted-foreground">
          {texto.length > TEXTO_LARGO
            ? `${texto.length} caracteres · los avisos cortos se leen mejor`
            : texto.length > 0
              ? `${texto.length} caracteres`
              : null}
        </span>
      </div>

      {evento.activo && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-brand/25 bg-brand/[0.06] p-3 sm:ml-14 sm:grid-cols-3">
          <div>
            <Label htmlFor={idFecha} className="mb-1 text-[11.5px] font-semibold text-muted-foreground">Fecha y hora *</Label>
            <Input
              id={idFecha}
              type="datetime-local"
              value={evento.fecha}
              onChange={e => setEvento(p => ({ ...p, fecha: e.target.value }))}
              className="rounded-lg bg-card text-[13px]"
              aria-invalid={intento && faltaFecha}
              aria-describedby={intento && faltaFecha ? `${idFecha}-error` : undefined}
            />
            {intento && faltaFecha && (
              <p id={`${idFecha}-error`} className="mt-1 text-[11px] text-destructive">La fecha del evento es obligatoria.</p>
            )}
          </div>
          <div>
            <Label htmlFor={idLugar} className="mb-1 text-[11.5px] font-semibold text-muted-foreground">Lugar</Label>
            <Input
              id={idLugar}
              type="text"
              placeholder="Opcional"
              value={evento.lugar}
              onChange={e => setEvento(p => ({ ...p, lugar: e.target.value }))}
              className="rounded-lg bg-card text-[13px]"
            />
          </div>
          <div>
            <Label htmlFor={idAforo} className="mb-1 text-[11.5px] font-semibold text-muted-foreground">Aforo</Label>
            <Input
              id={idAforo}
              type="number"
              min={1}
              placeholder="Sin límite"
              value={evento.aforo}
              onChange={e => setEvento(p => ({ ...p, aforo: e.target.value }))}
              className="rounded-lg bg-card text-[13px]"
            />
          </div>
        </div>
      )}

      {/* La audiencia y el botón solo aparecen cuando hay algo que publicar:
          en reposo, el compositor es una línea limpia. */}
      {abierto && (
        <div className="contenido-anim mt-4 sm:ml-14">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quién lo verá</p>
          <SelectorAudiencia valor={audiencia} onChange={setAudiencia} recuento={recuentoAudiencia} />

          <div className="mt-4 flex items-center justify-end gap-3">
            <span className="text-[12px] text-muted-foreground">
              Se publicará para <strong className="font-semibold text-foreground">{etiquetaSegmento(audiencia).toLowerCase()}</strong>
            </span>
            <button
              type="button"
              onClick={publicar}
              disabled={!puedePublicar}
              className={cn(
                'rounded-xl px-5 py-2.5 text-[13px] font-bold transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                puedePublicar
                  ? 'bg-brand text-brand-foreground hover:brightness-95 active:scale-[.98]'
                  : 'cursor-not-allowed bg-muted text-muted-foreground',
              )}
            >
              {publicando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BotonHerramienta({
  icono: Icono,
  activo,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icono: LucideIcon; activo?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
        activo
          ? 'border-brand bg-brand/10 text-brand-medio'
          : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
        className,
      )}
      {...props}
    >
      <Icono size={14} aria-hidden />
      {children}
    </button>
  );
}

// ─── Tarjeta de post ────────────────────────────────────────────────────────

export function PostCardPanel({
  post,
  colorClass,
  liked,
  comentarios,
  expandido,
  indice,
  onLike,
  onToggleComentarios,
  onEditar,
  onBorrar,
  children,
}: {
  post: PostComunidad;
  colorClass: string;
  liked: boolean;
  comentarios: number;
  expandido: boolean;
  indice: number;
  onLike: (id: string) => void;
  onToggleComentarios: (id: string) => void;
  /** Ausentes → sin acciones de editar/borrar (p.ej. una vista de solo lectura). */
  onEditar?: (id: string, texto: string) => void;
  onBorrar?: (id: string) => void;
  /** El hilo de comentarios, que lo monta la página (tiene el estado). */
  children?: React.ReactNode;
}) {
  const esEstudio = post.autorId === null;
  const esEvento = post.tipo === 'EVENTO';
  const [editando, setEditando] = useState(false);
  const [borradorEdicion, setBorradorEdicion] = useState(post.texto);

  function guardarEdicion() {
    const texto = borradorEdicion.trim();
    if (!texto || texto === post.texto) { setEditando(false); setBorradorEdicion(post.texto); return; }
    onEditar?.(post.id, texto);
    setEditando(false);
  }

  return (
    <article
      className="contenido-anim overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-shadow duration-300 hover:shadow-[0_8px_28px_-20px_rgba(0,0,0,0.4)]"
      style={{ animationDelay: `${Math.min(indice, 6) * 45}ms` }}
    >
      {esEvento && <div aria-hidden className="h-1 bg-brand" />}

      <div className="p-4 sm:p-5">
        {post.fijado && (
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-warning">
            <Pin size={11} aria-hidden /> Fijado
          </p>
        )}

        <header className="flex items-center gap-3">
          <Avatar
            initials={esEstudio ? 'TE' : getInitials(post.autorNombre)}
            studio={esEstudio}
            colorClass={colorClass}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-foreground">{post.autorNombre}</p>
            <p className="text-[12px] text-muted-foreground">{timeAgo(post.creadoEn)}</p>
          </div>
          {/* A quién le llegó: el dato ya viajaba en el post y nunca se veía.
              Es lo primero que se pregunta al releer un aviso antiguo. */}
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground sm:inline-flex">
            <Users size={11} aria-hidden />
            {etiquetaSegmento(post.audiencia)}
          </span>
          {!editando && (onEditar || onBorrar) && (
            <div className="flex shrink-0 items-center gap-0.5">
              {onEditar && (
                <button
                  type="button"
                  onClick={() => { setBorradorEdicion(post.texto); setEditando(true); }}
                  aria-label="Editar publicación"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={14} />
                </button>
              )}
              {onBorrar && (
                <button
                  type="button"
                  onClick={() => onBorrar(post.id)}
                  aria-label="Borrar publicación"
                  className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          )}
        </header>

        {esEvento && <TicketEventoPanel post={post} />}

        {editando ? (
          <div className="mt-4 space-y-2">
            <textarea
              autoFocus
              value={borradorEdicion}
              onChange={e => setBorradorEdicion(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setEditando(false); setBorradorEdicion(post.texto); }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guardarEdicion(); }
              }}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-[15px] leading-relaxed text-foreground outline-none focus:border-brand"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditando(false); setBorradorEdicion(post.texto); }}
                className="rounded-xl px-3.5 py-2 text-[12.5px] font-bold text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEdicion}
                disabled={!borradorEdicion.trim()}
                className="rounded-xl bg-brand px-3.5 py-2 text-[12.5px] font-bold text-brand-foreground transition-opacity disabled:opacity-40"
              >
                Guardar
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
            {post.texto}
          </p>
        )}

        {post.imagenUrl && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border" style={{ aspectRatio: '4 / 3' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL pública de Storage subida por el estudio, no un asset estático */}
            <img src={post.imagenUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          </div>
        )}

        {/* Reacciones: contadores con presencia, no dos iconos de 14 px
            perdidos bajo una línea. Siguen siendo del staff (la socia no
            interactúa, alcance ya cerrado). */}
        <div className="mt-4 flex items-center gap-1 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => onLike(post.id)}
            aria-pressed={liked}
            aria-label={`Me gusta (${post.likes})`}
            className={cn(
              'group/like flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              liked ? 'text-destructive' : 'text-muted-foreground hover:bg-destructive/8 hover:text-destructive',
            )}
          >
            <Heart
              size={18}
              className={cn(
                'transition-transform duration-200 group-hover/like:scale-110 group-active/like:scale-95',
                liked && 'fill-current',
              )}
            />
            <span className="tabular-nums">{post.likes}</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleComentarios(post.id)}
            aria-expanded={expandido}
            aria-label={`Comentarios (${comentarios})`}
            className={cn(
              'group/com flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              expandido ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <MessageCircle size={18} className="transition-transform duration-200 group-hover/com:scale-110" />
            <span className="tabular-nums">{comentarios}</span>
          </button>
        </div>

        {expandido && children}
      </div>
    </article>
  );
}

// El mismo "ticket" que ve la socia, con los tokens del panel. Que las dos
// caras del producto dibujen el evento igual no es estética: es lo que permite
// a la propietaria saber qué está viendo su clienta.
function TicketEventoPanel({ post }: { post: PostComunidad }) {
  const f = partesFecha(post.eventoFecha);
  const aforo = post.eventoAforo ?? null;
  return (
    <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-brand/25 bg-brand/[0.06]">
      {f && (
        <>
          <div
            aria-hidden
            className="flex w-[78px] shrink-0 flex-col items-center justify-center gap-0.5 bg-brand py-3 text-brand-foreground"
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-85">{f.mes}</span>
            <span className="font-heading text-[28px] leading-none">{f.dia}</span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-75">{f.diaSemana}</span>
          </div>
          <div aria-hidden className="w-px border-l border-dashed border-brand/40" />
        </>
      )}
      <div className="min-w-0 flex-1 space-y-1.5 px-4 py-3">
        <span className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-brand-medio">
          <CalendarDays size={11} aria-hidden /> Evento
        </span>
        {f ? (
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <Clock size={13} className="shrink-0 text-muted-foreground" aria-hidden />
            {f.hora}
          </p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Fecha por confirmar</p>
        )}
        {post.eventoLugar && (
          <p className="flex items-center gap-1.5 text-[12.5px] text-foreground">
            <MapPin size={13} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{post.eventoLugar}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <Users size={13} className="shrink-0" aria-hidden />
          {aforo ? `Aforo de ${aforo} plazas` : 'Sin límite de aforo'}
        </p>
      </div>
    </div>
  );
}

// ─── Esqueleto y vacío ──────────────────────────────────────────────────────

export function SkeletonPostPanel({ conImagen = false }: { conImagen?: boolean }) {
  const bloque = 'rounded-md bg-muted';
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-hidden aria-busy="true">
      <div className="animate-pulse">
        <div className="flex items-center gap-3">
          <div className="size-11 shrink-0 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className={cn(bloque, 'h-3 w-32')} />
            <div className={cn(bloque, 'h-2.5 w-20')} />
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          <div className={cn(bloque, 'h-3 w-full')} />
          <div className={cn(bloque, 'h-3 w-[85%]')} />
          <div className={cn(bloque, 'h-3 w-[60%]')} />
        </div>
        {conImagen && <div className="mt-4 rounded-xl bg-muted" style={{ aspectRatio: '4 / 3' }} />}
      </div>
    </div>
  );
}

export function FeedVacio({ onEmpezar }: { onEmpezar: () => void }) {
  return (
    <div className="contenido-anim flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-brand/10">
        <Megaphone size={34} strokeWidth={1.4} className="text-brand-medio" aria-hidden />
      </div>
      <p className="mt-5 text-[17px] font-bold text-foreground">Tu tablón está en silencio</p>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
        Un aviso, una foto de la sala nueva o el evento del sábado. Lo que publiques aquí lo verán tus clientas
        en su portal, sin tener que abrir el correo.
      </p>
      <button
        type="button"
        onClick={onEmpezar}
        className="mt-6 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-brand-foreground transition-all duration-200 hover:brightness-95 active:scale-[.98] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Escribir la primera
      </button>
    </div>
  );
}
