'use client';

// Tarjeta de post del Feed de Comunidad — lado SOCIA (portal).
//
// Vive fuera de `app/portal/[slug]/comunidad/page.tsx` por dos motivos: la
// página se quedaba en 440 líneas mezclando datos y pintura, y así la tarjeta
// se puede montar en aislamiento para revisarla (mismo criterio que
// `components/portal/ui`).
//
// Lenguaje visual: `lib/portal-design.ts` — UNA curva (`EASE`), duraciones con
// nombre (`dur`), serif para la VOZ y sans para los METADATOS. No se inventa
// ningún token nuevo aquí.
//
// ⚠️ SOLO LECTURA para la socia (decisión de alcance ya cerrada): los
// contadores de likes/comentarios NUNCA son <button>. Lo único accionable es
// apuntarse/desapuntarse de un evento.
//
// ⚠️ Sin pila de avatares de asistentes a propósito: el endpoint devuelve un
// CONTEO (`totalAsistentes`), no quién viene. Dibujar caras inventadas sería
// exactamente el error que ya documenta el repo con la "Compatibilidad 87 %"
// —una cifra/ilustración sin respaldo en pantalla—, así que el aforo se cuenta
// con una barra y un número que sí salen del dato real.

import { useState } from 'react';
import { CalendarDays, Clock, Heart, MapPin, MessageCircle, Check, Users } from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import { EASE, display, dur, micro, sans, texto, transicion } from '@/lib/portal-design';
import { AforoIndicator, Badge, Button, Card } from '@/components/portal/ui';
import { selloTemporal } from '@/lib/avisos-portal';
import type { PostFeedPortal, EstadoAsistenciaEvento } from '@/lib/comunidad-portal.ts';

// Por encima de este número de caracteres el texto deja de ser una frase y pasa
// a ser un párrafo: la serif del portal es VOZ (titula, saluda, nombra), y un
// bloque largo en serif se lee peor que en sans. El corte es el que hace que un
// "mañana cerramos a las 14 h" se vea como lo que es —un mensaje del estudio— y
// no como una línea de texto administrativo más.
const LIMITE_VOZ = 120;

const marcaSuave = (pct: number) => `color-mix(in srgb, var(--portal-brand) ${pct}%, transparent)`;

type PartesFecha = { dia: string; mes: string; diaSemana: string; hora: string };

// `new Date('cualquier cosa')` no lanza, pero `toLocaleDateString` sobre una
// fecha inválida sí devuelve "Invalid Date" en pantalla. Se comprueba una vez y
// se devuelve null: quien llama decide qué pintar sin fecha.
function partesFecha(iso: string | null | undefined): PartesFecha | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sinPunto = (s: string) => s.replace(/\.$/, '');
  return {
    dia: d.toLocaleDateString('es-ES', { day: 'numeric' }),
    mes: sinPunto(d.toLocaleDateString('es-ES', { month: 'short' })),
    diaSemana: sinPunto(d.toLocaleDateString('es-ES', { weekday: 'short' })),
    hora: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function PostCardPortal({
  post,
  estado,
  procesando,
  indice,
  onApuntarse,
  onDesapuntarse,
}: {
  post: PostFeedPortal;
  estado: EstadoAsistenciaEvento | undefined;
  procesando: boolean;
  /** Solo para escalonar la entrada. Se topa a 6 para que el post nº 40 de un
   *  scroll infinito no espere 4 segundos a aparecer. */
  indice: number;
  onApuntarse: () => void;
  onDesapuntarse: () => void;
}) {
  const { t } = useModo();
  const esEvento = post.tipo === 'EVENTO';
  const voz = post.texto.trim().length <= LIMITE_VOZ;

  return (
    <Card
      style={{
        padding: 0,
        overflow: 'hidden',
        animation: `portal-rise-soft ${dur.card}ms ${EASE} both`,
        animationDelay: `${Math.min(indice, 6) * 55}ms`,
      }}
    >
      {/* Un evento se distingue ANTES de leer nada: una tira de marca en el
          canto superior de la tarjeta. Es la señal más barata posible y no
          desplaza ningún contenido. */}
      {esEvento && <div aria-hidden style={{ height: 4, background: 'var(--portal-brand)' }} />}

      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 44, height: 44, borderRadius: 999, flexShrink: 0,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...display(18),
              boxShadow: '0 8px 18px -12px rgba(34,42,30,.55)',
            }}
          >
            {post.autorInicial}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: t.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.autorNombre}
            </p>
            <p style={{ ...texto.nota, color: t.muted, marginTop: 2 }}>{selloTemporal(post.creadoEn)}</p>
          </div>
          <Badge variant="neutral">El estudio</Badge>
        </div>

        {esEvento && <TicketEvento post={post} estado={estado} />}

        {/* Texto plano SIEMPRE: React escapa por defecto, sin dangerouslySetInnerHTML. */}
        {post.texto.trim() && (
          <p
            style={{
              marginTop: 16,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: t.ink,
              ...(voz
                ? { ...display(21), lineHeight: 1.32, textWrap: 'pretty' }
                : { fontFamily: sans, fontSize: 14.5, lineHeight: 1.58 }),
            } as React.CSSProperties}
          >
            {post.texto}
          </p>
        )}

        {post.imagenUrl && <ImagenPost src={post.imagenUrl} />}

        {esEvento && (
          <AccionEvento
            post={post}
            estado={estado}
            procesando={procesando}
            onApuntarse={onApuntarse}
            onDesapuntarse={onDesapuntarse}
          />
        )}

        {(post.likes > 0 || post.comentariosCount > 0) && (
          <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.line}` }}>
            {post.likes > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...texto.meta, color: t.muted }}>
                <Heart size={14} aria-hidden style={{ color: 'var(--portal-brand)' }} />
                {post.likes} me gusta
              </span>
            )}
            {post.comentariosCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...texto.meta, color: t.muted }}>
                <MessageCircle size={14} aria-hidden />
                {post.comentariosCount} {post.comentariosCount === 1 ? 'comentario' : 'comentarios'}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Imagen ─────────────────────────────────────────────────────────────────
//
// Proporción fija (4:3) reservada ANTES de que cargue: sin ella el feed pega un
// salto cuando llega cada foto y el post que estabas leyendo se te va de la
// pantalla. Entra con un fundido en vez de aparecer de golpe.

function ImagenPost({ src }: { src: string }) {
  const { t } = useModo();
  const [cargada, setCargada] = useState(false);
  return (
    <div
      style={{
        marginTop: 16, borderRadius: 18, overflow: 'hidden',
        aspectRatio: '4 / 3', background: t.surface2,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- mismo criterio que el resto del portal (portal-clases-view.tsx, hoja-reserva.tsx): URL pública de Storage, sin optimización de next/image. */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setCargada(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          opacity: cargada ? 1 : 0,
          transform: cargada ? 'none' : 'scale(1.03)',
          transition: transicion(['opacity', 'transform'], dur.card),
        }}
      />
    </div>
  );
}

// ─── Evento: el "ticket" ────────────────────────────────────────────────────
//
// Textura propia, no un recuadro tintado más: bloque de fecha sólido a la
// izquierda (como el talón de una entrada), perforación de puntos, y a la
// derecha hora / lugar / aforo. Es lo que hace que un evento no se lea como
// "otro aviso del tablón".

function TicketEvento({ post, estado }: { post: PostFeedPortal; estado: EstadoAsistenciaEvento | undefined }) {
  const { t } = useModo();
  // El total sale del listado hasta que la socia apunta/desapunta; a partir de
  // ahí manda `estado.totalAsistentes`, que es más fresco. Ambos vienen del
  // mismo dato de servidor, así que nunca se contradicen.
  const total = estado?.totalAsistentes ?? post.totalAsistentes ?? 0;
  const aforo = post.eventoAforo ?? null;
  const f = partesFecha(post.eventoFecha);
  const libres = aforo === null ? null : Math.max(0, aforo - total);
  const pct = aforo === null || aforo === 0 ? 0 : Math.min(100, Math.round((total / aforo) * 100));
  const lleno = libres === 0;

  return (
    <div
      style={{
        marginTop: 16, display: 'flex', alignItems: 'stretch', borderRadius: 18, overflow: 'hidden',
        background: marcaSuave(7),
        border: `1px solid ${marcaSuave(20)}`,
      }}
    >
      {f && (
        <>
          <div
            aria-hidden
            style={{
              width: 78, flexShrink: 0, padding: '14px 0',
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            }}
          >
            <span style={{ ...micro(8.5, 0.24, 600), opacity: 0.85 }}>{f.mes}</span>
            <span style={{ ...display(32), lineHeight: 1 }}>{f.dia}</span>
            <span style={{ ...micro(8, 0.2, 500), opacity: 0.75 }}>{f.diaSemana}</span>
          </div>
          {/* La perforación del ticket. Decorativa, 1 px, sin ocupar caja. */}
          <div aria-hidden style={{ width: 1, borderLeft: `1px dashed ${marcaSuave(38)}` }} />
        </>
      )}

      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* ⚠️ Los acentos que son TEXTO van en `t.heroAccent` (calibrado AA en
            día y noche), NUNCA en `var(--portal-brand)`: el oliva de marca es
            un color de RELLENO, y como tinta sobre la superficie oscura del
            modo noche desaparece. La marca sigue mandando donde toca —el talón
            de la fecha, el avatar, el CTA—, que es donde va emparejada con
            `--portal-brand-foreground`. Verificado en el navegador en los dos
            modos. */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
            ...micro(8.5, 0.2, 600), color: t.heroAccent,
          }}
        >
          <CalendarDays size={11} aria-hidden /> Evento
        </span>

        {f ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: t.ink }}>
            <Clock size={13} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
            {f.hora}
          </p>
        ) : (
          <p style={{ ...texto.meta, color: t.muted }}>Fecha por confirmar</p>
        )}

        {post.eventoLugar && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, ...texto.meta, color: t.ink, minWidth: 0 }}>
            <MapPin size={13} style={{ color: t.muted, flexShrink: 0 }} aria-hidden />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.eventoLugar}</span>
          </p>
        )}

        {aforo === null ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, ...texto.nota, color: t.muted }}>
            <Users size={13} style={{ flexShrink: 0 }} aria-hidden />
            {total} apuntada{total === 1 ? '' : 's'}
          </p>
        ) : (
          <div>
            {/* `nowrap` en las dos mitades: a 375 px la columna del ticket mide
                ~225 px y "9 de 12 plazas" + "3 plazas libres" se partía en
                cuatro líneas. Medido en el navegador, no supuesto. */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5, whiteSpace: 'nowrap' }}>
              <span style={{ ...texto.nota, color: t.muted }}>{total}/{aforo}</span>
              {/* El "quedan N / completa" NO se reescribe aquí: `AforoIndicator`
                  ya es la pieza del portal que decide cuándo eso es urgente y
                  con qué ámbar (calibrado AA también en noche). */}
              <AforoIndicator libres={libres ?? 0} />
            </div>
            <div
              role="progressbar"
              aria-valuenow={total}
              aria-valuemin={0}
              aria-valuemax={aforo}
              aria-label={`Aforo del evento: ${total} de ${aforo} plazas`}
              style={{ height: 5, borderRadius: 999, background: t.bar, overflow: 'hidden' }}
            >
              <div
                style={{
                  height: '100%', borderRadius: 999, width: `${pct}%`,
                  background: lleno ? t.muted : t.heroAccent,
                  transition: transicion(['width'], dur.card),
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Evento: la acción ──────────────────────────────────────────────────────

function AccionEvento({
  post,
  estado,
  procesando,
  onApuntarse,
  onDesapuntarse,
}: {
  post: PostFeedPortal;
  estado: EstadoAsistenciaEvento | undefined;
  procesando: boolean;
  onApuntarse: () => void;
  onDesapuntarse: () => void;
}) {
  const { t } = useModo();
  const total = estado?.totalAsistentes ?? post.totalAsistentes ?? 0;
  const aforo = post.eventoAforo ?? null;
  const cargandoEstado = estado === undefined;
  const apuntada = estado?.apuntada ?? false;
  const completo = !apuntada && aforo !== null && total >= aforo;

  if (apuntada) {
    return (
      <div
        // La confirmación no es el mismo botón en otro color: es otra cosa, y
        // entra con su propia animación para que se note que algo pasó.
        style={{
          marginTop: 16, display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderRadius: 16,
          background: marcaSuave(10), border: `1px solid ${marcaSuave(24)}`,
          animation: `portal-rise-soft ${dur.control}ms ${EASE} both`,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 30, height: 30, borderRadius: 999, flexShrink: 0,
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Check size={16} strokeWidth={3} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: t.ink }}>Ya estás apuntada</p>
          <p style={{ ...texto.nota, color: t.muted, marginTop: 1 }}>Te esperamos.</p>
        </div>
        <button
          type="button"
          onClick={onDesapuntarse}
          disabled={procesando}
          aria-busy={procesando}
          style={{
            background: 'none', border: 'none', cursor: procesando ? 'default' : 'pointer',
            ...texto.nota, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3,
            color: t.muted, padding: '8px 4px', minHeight: 44, flexShrink: 0,
            opacity: procesando ? 0.5 : 1,
            transition: transicion(['opacity', 'color'], dur.color),
          }}
        >
          {procesando ? 'Procesando…' : 'Darme de baja'}
        </button>
      </div>
    );
  }

  return (
    <Button
      variant="primary"
      onClick={onApuntarse}
      disabled={cargandoEstado || completo}
      loading={procesando}
      style={{ width: '100%', marginTop: 16 }}
    >
      {completo ? 'Evento completo' : 'Apuntarme'}
    </Button>
  );
}

// ─── Esqueleto ──────────────────────────────────────────────────────────────
//
// Con la FORMA de una tarjeta real (avatar redondo, dos líneas de cabecera,
// bloque de texto), no tres rectángulos: si el hueco no se parece a lo que va a
// llegar, el salto al cargar se ve igual.

export function SkeletonPostPortal({ conImagen = false }: { conImagen?: boolean }) {
  const { t } = useModo();
  const bloque = (w: string | number, h: number, r = 8): React.CSSProperties => ({
    width: w, height: h, borderRadius: r,
    background: `linear-gradient(100deg, ${t.surface2} 40%, ${t.line} 50%, ${t.surface2} 60%)`,
    backgroundSize: '200% 100%', animation: 'widget-skeleton-shimmer 1.1s linear infinite',
  });
  return (
    <Card style={{ padding: 18 }} aria-hidden aria-busy="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={bloque(44, 44, 999)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={bloque(124, 11)} />
          <div style={bloque(72, 9)} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
        <div style={bloque('100%', 12)} />
        <div style={bloque('82%', 12)} />
      </div>
      {conImagen && <div style={{ ...bloque('100%', 0, 18), aspectRatio: '4 / 3', marginTop: 16 }} />}
    </Card>
  );
}
