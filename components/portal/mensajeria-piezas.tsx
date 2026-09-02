'use client';

// Las PIEZAS visuales de Mensajes en el portal de la clienta.
//
// Separadas de las dos pantallas (`app/portal/[slug]/mensajes/…`) por el mismo
// motivo que en el panel: aquellas solo viven dentro de StudioProvider +
// PortalAuthProvider + sesión de socia, y así el aspecto se puede mirar en un
// navegador de verdad en vez de darlo por bueno leyendo el JSX. Todo el
// movimiento usa la ÚNICA curva del portal (`EASE`) y las duraciones con
// nombre de `lib/portal-design`. `cuerpo` va siempre como texto plano.
//
// Valores literales del kit real ("Tentare Studio App", docs/diseno-
// referencia-portal/ — hilo de conversación con Studio Alma), mismo idioma que
// ya usa `app/portal/[slug]/compras/page.tsx`: `--ap-*`/hex en vez de
// `useModo()`/`display()`/`micro()`/`texto.*`. `var(--portal-brand)` se
// mantiene SOLO donde ya vivía — burbuja propia y botón de enviar activo—,
// porque el portal sigue siendo white-label (`.claude/tentare-os.md`) y esos
// dos son los únicos elementos realmente "de marca" de esta pantalla; el
// resto (fondo, bordes, texto, burbuja recibida) es el mismo cream/tinta para
// cualquier estudio, así que va literal. El acento de "sin leer"/leído usa el
// verde literal del kit (`--ap-verde`), no la marca: mismo criterio que ya
// documentaba la versión anterior sobre `t.heroAccent` — un oliva oscuro de
// marca sobre un fondo oscuro se volvía casi invisible, y aquí no hace falta
// ese cálculo porque el verde del kit ya está medido para AA sobre crema.
//
// `<Card>` (components/portal/ui) se sustituye por `className="ap-card"`
// directo — mismo patrón que ya usan portal-clases-view.tsx/portal-perfil-
// view.tsx tras su conversión: `<Card>` sigue viviendo en `useModo()` por
// dentro (es un componente compartido, fuera de alcance aquí) y arrastraría
// el sistema antiguo si se mantuviera.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ArrowUp, Check, CheckCheck } from 'lucide-react';
import { sans, EASE, dur } from '@/lib/portal-design';
import { agruparHilo, estadoEntrega, horaCorta, selloLista, unaLinea } from '@/lib/mensajeria/presentacion';
import type { RowMensajes } from '@/lib/db-types';

export const LIMITE_CUERPO = 4000;

// ── Fila de la bandeja ──────────────────────────────────────────────────────

export function FilaConversacionPortal({
  avatar, nombre, contexto, ultimoCuerpo, ultimoMensajeEn, sinLeer, mio, indice, onClick,
}: {
  avatar: ReactNode;
  nombre: string;
  contexto: string;
  ultimoCuerpo: string | null;
  ultimoMensajeEn: string;
  sinLeer: boolean;
  mio: boolean;
  indice: number;
  onClick: () => void;
}) {
  const preview = unaLinea(ultimoCuerpo, 74);
  return (
    <button
      type="button"
      onClick={onClick}
      className="ap-card ap-anim-up"
      style={{
        display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 13,
        border: '1px solid #E5E3DA', background: '#FFFFFF', padding: 14, cursor: 'pointer',
        // Entrada escalonada, mismo delay (55ms/fila) que ya usa la lista de
        // clases de Horario (portal-clases-view.tsx) tras su conversión.
        animationDelay: `${Math.min(indice, 8) * 55}ms`,
      }}
      aria-label={`Abrir conversación con ${nombre}${sinLeer ? ', con mensajes sin leer' : ''}`}
    >
      {avatar}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <p style={{
            fontFamily: sans, fontSize: 15, fontWeight: sinLeer ? 800 : 700, color: '#1A1A1A',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {nombre}
          </p>
          <span style={{
            fontFamily: sans, fontSize: 11, flexShrink: 0,
            color: sinLeer ? '#3E6B4A' : '#5A5A52',
            fontWeight: sinLeer ? 700 : 400,
          }}>
            {selloLista(ultimoMensajeEn)}
          </span>
        </div>
        <p style={{
          fontFamily: 'ui-monospace, monospace', fontSize: 8.5, fontWeight: 700,
          letterSpacing: '.2em', paddingLeft: '.2em', textTransform: 'uppercase',
          color: '#98A093', marginTop: 3,
        } as React.CSSProperties}>
          {contexto}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <p style={{
            fontFamily: sans, fontSize: 12.5, flex: 1, minWidth: 0,
            color: sinLeer ? '#1A1A1A' : '#5A5A52',
            fontWeight: sinLeer ? 500 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {preview ? (mio ? `Tú: ${preview}` : preview) : 'Sin mensajes todavía'}
          </p>
          {sinLeer && (
            <span
              aria-hidden
              style={{ width: 9, height: 9, borderRadius: 999, background: '#3E6B4A', flexShrink: 0 }}
            />
          )}
        </div>
      </div>
    </button>
  );
}

// ── Cuerpo del hilo ─────────────────────────────────────────────────────────

export function HiloMensajes({ mensajes, authUserId, leidoHastaOtros }: {
  mensajes: RowMensajes[];
  authUserId: string | null;
  leidoHastaOtros: string | null | undefined;
}) {
  const dias = useMemo(() => agruparHilo(mensajes), [mensajes]);

  // El ✓/✓✓ va SOLO en el último mensaje propio: en todos, el hilo se
  // convierte en un tablero de checks.
  const idUltimoMio = [...mensajes].reverse()
    .find(m => m.remitente_auth_user_id === authUserId)?.id ?? null;

  return (
    <>
      {dias.map(dia => (
        <div key={dia.etiqueta}>
          {/* Separador de día como pastilla, no como texto suelto. */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 12px' }}>
            <span
              style={{
                fontFamily: 'ui-monospace, monospace', fontSize: 9, fontWeight: 700,
                letterSpacing: '.16em', paddingLeft: '.16em', textTransform: 'uppercase',
                color: '#5A5A52', background: '#EFEDE4',
                padding: '5px 12px', borderRadius: 999, border: '1px solid #E5E3DA',
              } as React.CSSProperties}
            >
              {dia.etiqueta}
            </span>
          </div>

          {dia.bloques.map(bloque => {
            const mio = bloque.remitenteAuthUserId === authUserId;
            const ultimo = bloque.items[bloque.items.length - 1];
            // La burbuja propia lleva el color de marca del estudio (portal
            // white-label); la recibida es blanca con borde fino — el
            // tratamiento exacto de la captura de referencia (burbujas del
            // estudio, blancas y redondeadas, con un borde sutil).
            const fondo = mio ? 'var(--ap-tinta, #1A1A1A)' : '#FFFFFF';
            return (
              <div key={bloque.items[0].id} style={{ marginBottom: 12 }}>
                {bloque.items.map(m => {
                  const cola = m.id === ultimo.id;
                  return (
                    <div
                      key={m.id}
                      className="ap-anim-up"
                      style={{
                        display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start',
                        marginBottom: cola ? 0 : 3,
                      }}
                    >
                      <div style={{ position: 'relative', maxWidth: '80%' }}>
                        <div
                          style={{
                            padding: '10px 15px', borderRadius: 20,
                            borderBottomRightRadius: mio && cola ? 6 : 20,
                            borderBottomLeftRadius: !mio && cola ? 6 : 20,
                            background: fondo,
                            color: mio ? '#F1ECE1' : '#1A1A1A',
                            border: mio ? '1px solid transparent' : '1px solid #E5E3DA',
                          }}
                        >
                          <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.42, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m.cuerpo}
                          </p>
                        </div>
                        {/* Cola con `border`, no `clip-path`: WebKit de iOS es
                            el navegador real de esta pantalla. */}
                        {cola && (
                          <span
                            aria-hidden
                            style={mio
                              ? { position: 'absolute', bottom: 0, right: -5, width: 0, height: 0, borderLeft: `7px solid ${fondo}`, borderBottom: '7px solid transparent' }
                              : { position: 'absolute', bottom: 0, left: -5, width: 0, height: 0, borderRight: `7px solid ${fondo}`, borderBottom: '7px solid transparent' }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Hora (y estado de entrega) UNA vez por bloque. */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 5,
                    justifyContent: mio ? 'flex-end' : 'flex-start', color: '#5A5A52',
                  }}
                >
                  <span style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52' }}>{horaCorta(ultimo.creado_en)}</span>
                  {ultimo.id === idUltimoMio && (
                    estadoEntrega(ultimo.creado_en, leidoHastaOtros) === 'leido'
                      ? <CheckCheck size={13} style={{ color: '#3E6B4A' }} aria-label="Leído" />
                      : <Check size={13} aria-label="Enviado" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── Indicador de "escribiendo…" ─────────────────────────────────────────────
//
// Efímero, sobre el mismo canal Realtime del hilo (broadcast `typing`, sin
// tabla ni persistencia — se pierde si nadie está conectado, y eso es
// correcto). Misma burbuja RECIBIDA que `HiloMensajes` (blanca, borde fino,
// alineada a la izquierda, mismo radio/cola), con tres puntos que pulsan con
// `apPulse` (portal-app.css) — el mismo keyframe que ya usa el kit para "N
// plazas" — en vez del `portal-breathe` a medida de antes.
export function IndicadorEscribiendo() {
  return (
    <div
      className="ap-anim-up"
      style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}
    >
      <div style={{ position: 'relative', maxWidth: '80%' }}>
        <span className="sr-only">Escribiendo…</span>
        <div
          aria-hidden
          style={{
            padding: '14px 16px', borderRadius: 20, borderBottomLeftRadius: 6,
            background: '#FFFFFF', border: '1px solid #E5E3DA',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="ap-dot-pulse"
              style={{
                width: 6, height: 6, borderRadius: 999, background: '#98A093',
                animationDelay: `${i * 220}ms`,
              }}
            />
          ))}
        </div>
        {/* Cola con `border`, no `clip-path`: mismo criterio que las burbujas de `HiloMensajes`. */}
        <span
          aria-hidden
          style={{ position: 'absolute', bottom: 0, left: -5, width: 0, height: 0, borderRight: '7px solid #FFFFFF', borderBottom: '7px solid transparent' }}
        />
      </div>
    </div>
  );
}

// ── Compositor ──────────────────────────────────────────────────────────────

export function CompositorPortal({
  valor, onValor, onEnviar, enviando, deshabilitado, nombre, desplazamientoTeclado = 0,
}: {
  valor: string;
  onValor: (v: string) => void;
  onEnviar: () => void;
  enviando: boolean;
  deshabilitado: boolean;
  nombre: string;
  desplazamientoTeclado?: number;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const puedeEnviar = Boolean(valor.trim()) && !enviando && !deshabilitado;

  // Crece con el texto (hasta 5 líneas) en vez de ser un renglón con scroll
  // interno.
  //
  // ⚠️ Con el campo VACÍO se deja `height:auto` y NO se mide: visto en el
  // navegador, la primera medición al montar devolvía un `scrollHeight` que no
  // se correspondía con una línea y el compositor arrancaba con la altura
  // máxima —una caja enorme y vacía— hasta la primera tecla. Vacío = una fila
  // (`minHeight`), sin medir nada.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (!valor) return;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 46), 132)}px`;
  }, [valor]);

  return (
    <div
      style={{
        flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 8,
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
        borderTop: '1px solid #E5E3DA', background: '#FAF9F5',
        transform: desplazamientoTeclado > 0 ? `translateY(-${desplazamientoTeclado}px)` : undefined,
      }}
    >
      <textarea
        ref={areaRef}
        value={valor}
        onChange={e => onValor(e.target.value.slice(0, LIMITE_CUERPO))}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnviar(); }
        }}
        placeholder={`Escribe a ${nombre.split(' ')[0]}…`}
        aria-label="Escribe un mensaje"
        rows={1}
        disabled={deshabilitado || enviando}
        style={{
          flex: 1, resize: 'none', maxHeight: 132, minHeight: 46, overflowY: 'auto',
          borderRadius: 23, border: '1.5px solid #E5E3DA', background: '#FFFFFF', color: '#1A1A1A',
          padding: '12px 16px', fontFamily: sans, fontSize: 16, lineHeight: 1.3,
          opacity: enviando ? 0.6 : 1,
          transition: `border-color ${dur.foco}ms ${EASE}, opacity ${dur.color}ms ${EASE}`,
        }}
      />
      <button
        type="button"
        onClick={onEnviar}
        disabled={!puedeEnviar}
        aria-label="Enviar mensaje"
        style={{
          width: 46, height: 46, borderRadius: '50%', border: 'none', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: puedeEnviar ? 'var(--ap-tinta, #1A1A1A)' : '#EFEDE4',
          color: puedeEnviar ? '#F1ECE1' : '#98A093',
          transform: puedeEnviar ? 'scale(1)' : 'scale(.9)',
          cursor: puedeEnviar ? 'pointer' : 'default',
          transition: `background ${dur.color}ms ${EASE}, transform ${dur.control}ms ${EASE}, color ${dur.color}ms ${EASE}`,
        }}
      >
        {enviando
          ? <span aria-hidden className="animate-spin" style={{ width: 17, height: 17, borderRadius: 999, border: '2px solid currentColor', borderTopColor: 'transparent' }} />
          : <ArrowUp size={19} aria-hidden />}
      </button>
    </div>
  );
}
