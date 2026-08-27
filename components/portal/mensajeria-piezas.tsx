'use client';

// Las PIEZAS visuales de Mensajes en el portal de la clienta.
//
// Separadas de las dos pantallas (`app/portal/[slug]/mensajes/…`) por el mismo
// motivo que en el panel: aquellas solo viven dentro de StudioProvider +
// PortalAuthProvider + sesión de socia, y así el aspecto —modo día/noche, 375
// a 430 px— se puede mirar en un navegador de verdad en vez de darlo por bueno
// leyendo el JSX. `useModo` no necesita provider (es un hook con localStorage),
// y el color del estudio entra por `--portal-brand`, que cascadea.
//
// Todo el movimiento usa la ÚNICA curva del portal (`EASE`) y las duraciones
// con nombre de `lib/portal-design`. `cuerpo` va siempre como texto plano.

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ArrowUp, Check, CheckCheck } from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import { sans, texto, micro, EASE, dur } from '@/lib/portal-design';
import { Card } from '@/components/portal/ui';
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
  const { t } = useModo();
  const preview = unaLinea(ultimoCuerpo, 74);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', background: 'none',
        border: 'none', padding: 0, cursor: 'pointer',
        // Entrada escalonada, con la ÚNICA curva del portal.
        animation: `portal-rise-soft ${dur.card}ms ${EASE} ${Math.min(indice, 8) * 55}ms both`,
      }}
      aria-label={`Abrir conversación con ${nombre}${sinLeer ? ', con mensajes sin leer' : ''}`}
    >
      <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 13 }}>
        {avatar}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <p style={{
              fontFamily: sans, fontSize: 15, fontWeight: sinLeer ? 800 : 700, color: t.ink,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {nombre}
            </p>
            {/* ⚠️ El acento de "sin leer" va en `t.heroAccent`, NO en
                `--portal-brand`. El color de marca del estudio es FIJO: no
                cambia entre día y noche, así que un oliva oscuro (el de
                Tentare, #343825) sobre el fondo de noche (#12140E) se queda
                casi invisible — visto en el navegador con el modo noche
                puesto. `heroAccent` es el acento del portal que sí gira con el
                modo y está medido para AA sobre `bg`/`surface`
                (lib/portal-paleta.ts). La marca sigue siendo la marca donde
                ya lo era: burbuja propia, avatar del estudio y botones. */}
            <span style={{
              ...texto.nota, flexShrink: 0,
              color: sinLeer ? t.heroAccent : t.muted,
              fontWeight: sinLeer ? 700 : 400,
            }}>
              {selloLista(ultimoMensajeEn)}
            </span>
          </div>
          <p style={{ ...micro(8.5, 0.2, 700), color: t.micro, marginTop: 3 }}>{contexto}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <p style={{
              ...texto.meta, flex: 1, minWidth: 0,
              color: sinLeer ? t.ink : t.muted,
              fontWeight: sinLeer ? 500 : 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {preview ? (mio ? `Tú: ${preview}` : preview) : 'Sin mensajes todavía'}
            </p>
            {sinLeer && (
              <span
                aria-hidden
                style={{ width: 9, height: 9, borderRadius: 999, background: t.heroAccent, flexShrink: 0 }}
              />
            )}
          </div>
        </div>
      </Card>
    </button>
  );
}

// ── Cuerpo del hilo ─────────────────────────────────────────────────────────

export function HiloMensajes({ mensajes, authUserId, leidoHastaOtros }: {
  mensajes: RowMensajes[];
  authUserId: string | null;
  leidoHastaOtros: string | null | undefined;
}) {
  const { t } = useModo();
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
                ...micro(9, 0.16, 700), color: t.muted, background: t.velo,
                padding: '5px 12px', borderRadius: 999, border: `1px solid ${t.line}`,
              }}
            >
              {dia.etiqueta}
            </span>
          </div>

          {dia.bloques.map(bloque => {
            const mio = bloque.remitenteAuthUserId === authUserId;
            const ultimo = bloque.items[bloque.items.length - 1];
            const fondo = mio ? 'var(--portal-brand)' : t.surface2;
            return (
              <div key={bloque.items[0].id} style={{ marginBottom: 12 }}>
                {bloque.items.map(m => {
                  const cola = m.id === ultimo.id;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex', justifyContent: mio ? 'flex-end' : 'flex-start',
                        marginBottom: cola ? 0 : 3,
                        animation: `portal-rise-soft ${dur.control}ms ${EASE} both`,
                      }}
                    >
                      <div style={{ position: 'relative', maxWidth: '80%' }}>
                        <div
                          style={{
                            padding: '10px 15px', borderRadius: 20,
                            borderBottomRightRadius: mio && cola ? 6 : 20,
                            borderBottomLeftRadius: !mio && cola ? 6 : 20,
                            background: fondo,
                            color: mio ? 'var(--portal-brand-foreground)' : t.ink,
                            // ⚠️ La burbuja RECIBIDA lleva contorno. El color de
                            // marca del estudio es libre, y con el oliva de
                            // Tentare en modo noche (#343825) quedaba casi
                            // idéntico a `surface2` (#242820): los dos lados de
                            // la conversación se distinguían solo por la
                            // alineación. Visto en el navegador; el contorno lo
                            // separa sin depender de qué color elija el estudio.
                            border: mio ? '1px solid transparent' : `1px solid ${t.line}`,
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
                    justifyContent: mio ? 'flex-end' : 'flex-start', color: t.muted,
                  }}
                >
                  <span style={{ ...texto.nota, color: t.muted }}>{horaCorta(ultimo.creado_en)}</span>
                  {ultimo.id === idUltimoMio && (
                    estadoEntrega(ultimo.creado_en, leidoHastaOtros) === 'leido'
                      // Mismo motivo que el acento de "sin leer": este check
                      // va sobre el FONDO de la pantalla, no sobre la burbuja,
                      // así que necesita un color que gire con el modo.
                      ? <CheckCheck size={13} style={{ color: t.heroAccent }} aria-label="Leído" />
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
// correcto). Misma burbuja RECIBIDA que `HiloMensajes` (t.surface2, alineada
// a la izquierda, mismo radio/cola), con tres puntos que pulsan con la ÚNICA
// curva del portal y una duración con nombre — nada de timings sueltos.
export function IndicadorEscribiendo() {
  const { t } = useModo();
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'flex-start', marginBottom: 12,
        animation: `portal-rise-soft ${dur.control}ms ${EASE} both`,
      }}
    >
      <div style={{ position: 'relative', maxWidth: '80%' }}>
        <span className="sr-only">Escribiendo…</span>
        <div
          aria-hidden
          style={{
            padding: '14px 16px', borderRadius: 20, borderBottomLeftRadius: 6,
            background: t.surface2, border: `1px solid ${t.line}`,
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 6, height: 6, borderRadius: 999, background: t.muted,
                animation: `portal-breathe ${dur.washInner}ms ${EASE} ${(i * dur.washInner) / 6}ms infinite`,
              }}
            />
          ))}
        </div>
        {/* Cola con `border`, no `clip-path`: mismo criterio que las burbujas de `HiloMensajes`. */}
        <span
          aria-hidden
          style={{ position: 'absolute', bottom: 0, left: -5, width: 0, height: 0, borderRight: `7px solid ${t.surface2}`, borderBottom: '7px solid transparent' }}
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
  const { t } = useModo();
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
        borderTop: `1px solid ${t.line}`, background: t.bg,
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
          borderRadius: 23, border: `1.5px solid ${t.line}`, background: t.surface, color: t.ink,
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
          background: puedeEnviar ? 'var(--portal-brand)' : t.surface2,
          color: puedeEnviar ? 'var(--portal-brand-foreground)' : t.muted,
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
