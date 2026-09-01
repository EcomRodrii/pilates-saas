'use client';

// Tarjeta de post del Feed de Comunidad — lado SOCIA (portal).
//
// Vive fuera de `app/portal/[slug]/comunidad/page.tsx` por dos motivos: la
// página se quedaba en 440 líneas mezclando datos y pintura, y así la tarjeta
// se puede montar en aislamiento para revisarla (mismo criterio que
// `components/portal/ui`).
//
// Valores literales del kit real ("Tentare Studio App",
// docs/diseno-referencia-portal/): `--ap-*`/hex en vez de
// `useModo()`/`display()`/`micro()`/`texto.*`, mismo idioma que ya usa
// `components/portal/mensajeria-piezas.tsx` tras su conversión. ⚠️ SIN
// captura de referencia directa para este componente (el paquete de capturas
// no cubre Comunidad) — el tratamiento de abajo es EXTRAPOLADO por
// consistencia con el resto del portal ya convertido, no un calco 1:1 de un
// diseño visto. `<Card>` (components/portal/ui) se sustituye por
// className="ap-card" directo, mismo patrón que portal-clases-view.tsx tras
// su conversión.
//
// `var(--portal-brand)` se mantiene SOLO donde ya vivía y es identidad real
// del estudio (el avatar del autor —todo post es "el estudio"— y el botón
// primario "Apuntarme", que ya vive dentro de <Button> sin tocar aquí): el
// portal sigue siendo white-label. El resto de acentos decorativos (tira de
// evento, ticket, confirmación de apuntada) pasan al verde literal del kit
// (`#3E6B4A`/`#4F8A5B`/`#EAF0E7`), mismo criterio que ya aplicó
// `mensajeria-piezas.tsx` al acento de "sin leer".
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
import { dur, sans, transicion } from '@/lib/portal-design';
import { AforoIndicator, Badge, Button } from '@/components/portal/ui';
import { selloTemporal } from '@/lib/avisos-portal';
import type { PostFeedPortal, EstadoAsistenciaEvento } from '@/lib/comunidad-portal.ts';

// Por encima de este número de caracteres el texto deja de ser una frase y pasa
// a ser un párrafo: por debajo, se destaca (sans grande/negrita) como un mensaje
// del estudio; por encima, se lee como texto informativo normal. El corte es el
// que hace que un "mañana cerramos a las 14 h" se distinga de un párrafo largo.
const LIMITE_VOZ = 120;

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
  const esEvento = post.tipo === 'EVENTO';
  const voz = post.texto.trim().length <= LIMITE_VOZ;

  return (
    <div
      className="ap-card ap-anim-up"
      style={{
        padding: 0,
        overflow: 'hidden',
        animationDelay: `${Math.min(indice, 6) * 55}ms`,
      }}
    >
      {/* Un evento se distingue ANTES de leer nada: una tira de acento en el
          canto superior de la tarjeta. Es la señal más barata posible y no
          desplaza ningún contenido. */}
      {esEvento && <div aria-hidden style={{ height: 4, background: '#3E6B4A' }} />}

      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 44, height: 44, borderRadius: 999, flexShrink: 0,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: sans, fontSize: 17, fontWeight: 800,
              boxShadow: '0 8px 18px -12px rgba(34,42,30,.55)',
            }}
          >
            {post.autorInicial}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', color: '#1A1A1A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.autorNombre}
            </p>
            <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 2 }}>{selloTemporal(post.creadoEn)}</p>
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
              color: '#1A1A1A',
              ...(voz
                ? { fontFamily: sans, fontSize: 19, fontWeight: 700, letterSpacing: '-.015em', lineHeight: 1.32 }
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
          <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: '1px solid #E5E3DA' }}>
            {post.likes > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: sans, fontSize: 12.5, color: '#5A5A52' }}>
                <Heart size={14} aria-hidden style={{ color: '#3E6B4A' }} />
                {post.likes} me gusta
              </span>
            )}
            {post.comentariosCount > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: sans, fontSize: 12.5, color: '#5A5A52' }}>
                <MessageCircle size={14} aria-hidden />
                {post.comentariosCount} {post.comentariosCount === 1 ? 'comentario' : 'comentarios'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Imagen ─────────────────────────────────────────────────────────────────
//
// Proporción fija (4:3) reservada ANTES de que cargue: sin ella el feed pega un
// salto cuando llega cada foto y el post que estabas leyendo se te va de la
// pantalla. Entra con un fundido en vez de aparecer de golpe.

function ImagenPost({ src }: { src: string }) {
  const [cargada, setCargada] = useState(false);
  return (
    <div
      style={{
        marginTop: 16, borderRadius: 18, overflow: 'hidden',
        aspectRatio: '4 / 3', background: '#EFEDE4',
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
        background: '#EAF0E7',
        border: '1px solid #CFE0D2',
      }}
    >
      {f && (
        <>
          <div
            aria-hidden
            style={{
              width: 78, flexShrink: 0, padding: '14px 0',
              background: '#3E6B4A', color: '#F1ECE1',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
            }}
          >
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 8.5, letterSpacing: '.24em', paddingLeft: '.24em', textTransform: 'uppercase', fontWeight: 600, opacity: 0.85 }}>{f.mes}</span>
            <span style={{ fontFamily: sans, fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{f.dia}</span>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 8, letterSpacing: '.2em', paddingLeft: '.2em', textTransform: 'uppercase', fontWeight: 500, opacity: 0.75 }}>{f.diaSemana}</span>
          </div>
          {/* La perforación del ticket. Decorativa, 1 px, sin ocupar caja. */}
          <div aria-hidden style={{ width: 1, borderLeft: '1px dashed rgba(62,107,74,.35)' }} />
        </>
      )}

      <div style={{ flex: 1, minWidth: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
            fontFamily: 'ui-monospace, monospace', fontSize: 8.5, letterSpacing: '.2em', paddingLeft: '.2em', textTransform: 'uppercase', fontWeight: 600,
            color: '#3E6B4A',
          }}
        >
          <CalendarDays size={11} aria-hidden /> Evento
        </span>

        {f ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: '#1A1A1A' }}>
            <Clock size={13} style={{ color: '#5A5A52', flexShrink: 0 }} aria-hidden />
            {f.hora}
          </p>
        ) : (
          <p style={{ fontFamily: sans, fontSize: 12.5, color: '#5A5A52' }}>Fecha por confirmar</p>
        )}

        {post.eventoLugar && (
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: sans, fontSize: 12.5, color: '#1A1A1A', minWidth: 0 }}>
            <MapPin size={13} style={{ color: '#5A5A52', flexShrink: 0 }} aria-hidden />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.eventoLugar}</span>
          </p>
        )}

        {aforo === null ? (
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>
            <Users size={13} style={{ flexShrink: 0 }} aria-hidden />
            {total} apuntada{total === 1 ? '' : 's'}
          </p>
        ) : (
          <div>
            {/* `nowrap` en las dos mitades: a 375 px la columna del ticket mide
                ~225 px y "9 de 12 plazas" + "3 plazas libres" se partía en
                cuatro líneas. Medido en el navegador, no supuesto. */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5, whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>{total}/{aforo}</span>
              {/* El "quedan N / completa" NO se reescribe aquí: `AforoIndicator`
                  ya es la pieza compartida del portal que decide cuándo eso es
                  urgente. Fuera de alcance de esta conversión (sigue viviendo
                  en `useModo()` por dentro). */}
              <AforoIndicator libres={libres ?? 0} />
            </div>
            <div
              role="progressbar"
              aria-valuenow={total}
              aria-valuemin={0}
              aria-valuemax={aforo}
              aria-label={`Aforo del evento: ${total} de ${aforo} plazas`}
              style={{ height: 5, borderRadius: 999, background: '#EFEDE4', overflow: 'hidden' }}
            >
              <div
                style={{
                  height: '100%', borderRadius: 999, width: `${pct}%`,
                  background: lleno ? '#5A5A52' : '#4F8A5B',
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
        className="ap-anim-up"
        style={{
          marginTop: 16, display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 14px', borderRadius: 16,
          background: '#EAF0E7', border: '1px solid #CFE0D2',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 30, height: 30, borderRadius: 999, flexShrink: 0,
            background: '#4F8A5B', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Check size={16} strokeWidth={3} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: '#1A1A1A' }}>Ya estás apuntada</p>
          <p style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 1 }}>Te esperamos.</p>
        </div>
        <button
          type="button"
          onClick={onDesapuntarse}
          disabled={procesando}
          aria-busy={procesando}
          style={{
            background: 'none', border: 'none', cursor: procesando ? 'default' : 'pointer',
            fontFamily: sans, fontSize: 11, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 3,
            color: '#5A5A52', padding: '8px 4px', minHeight: 44, flexShrink: 0,
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
  const bloque = (w: string | number, h: number, r = 8): React.CSSProperties => ({
    width: w, height: h, borderRadius: r,
    background: 'linear-gradient(100deg, #EFEDE4 40%, #E5E3DA 50%, #EFEDE4 60%)',
    backgroundSize: '200% 100%', animation: 'widget-skeleton-shimmer 1.1s linear infinite',
  });
  return (
    <div className="ap-card" style={{ padding: 18 }} aria-hidden aria-busy="true">
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
    </div>
  );
}
