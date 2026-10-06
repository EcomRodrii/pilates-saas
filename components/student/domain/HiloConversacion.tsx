'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useVolver } from '@/components/student/shell/volver';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useAsync } from '@/lib/student/useAsync';
import type { HiloCargado, MensajeHilo, ResultadoEnviar, ResultadoModeracionApp } from '@/lib/student/mensajeria';
import { agruparHilo, horaCorta } from '@/lib/mensajeria/presentacion';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { useToast } from '@/components/student/ui/Toast';
import { Icono } from '@/components/student/ui/Icono';
import { useNormasComunidad } from '@/components/student/domain/NormasComunidad';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { TEXTO_NO_ADMITE, type EstadoHilo } from '@/lib/moderacion/reglas';
import { TEXTO_BLOQUEO_HECHO, TEXTO_GRACIAS_DENUNCIA } from '@/lib/moderacion/denuncias';

// Hilo de una conversación: el de la alumna (`/mensajes/[id]`) y el de la
// instructora con una alumna suya (`/equipo/mensajes/[id]`). Misma pantalla;
// cada página solo pone el título y de dónde salen los datos.
//
// Sin Realtime a propósito (ver lib/student/mensajeria.ts): se refresca al
// montar y al enviar — mismo criterio que el resto de la app, que tampoco lleva
// websocket.
//
// ⚠️ El compositor va en el FLUJO NORMAL, nunca en `position: fixed`. La
// primera versión lo ponía fijo, flotando encima de la nav inferior con un
// `bottom: var(--nav-height)` calculado a mano — en iOS Safari real, al abrir
// el teclado, dos elementos `fixed` (compositor + nav) se separan del
// viewport visual y acaban flotando a mitad de pantalla, por encima del
// teclado (visto en grabación real, no en el navegador headless). El arreglo
// de verdad es `StudentShell sinNav`: la pantalla pasa a ser una columna flex
// a pantalla completa (mensajes con scroll propio, compositor como último
// hijo normal) — así el compositor sube con el teclado solo, como hace
// cualquier `<input>` normal, sin ninguna posición fija que reconciliar.
//
// Pasada de diseño (15-sep-2026): con `avatar`, la cabecera es la de un chat —
// foto, nombre y quién es— y, con `hrefPerfil`, lleva a su ficha. El aviso de
// que el estudio puede leer va en una etiqueta, y una conversación vacía enseña
// con quién vas a hablar en vez de una línea suelta. Sin `avatar`, la cabecera
// de siempre.
//
// Moderación (App Store 1.2): tocar un mensaje de la otra parte abre una hoja
// con «Denunciar este mensaje» y, en un chat instructora–alumna, «Bloquear»
// (con confirmación: es en este estudio, y el estudio lo revisa). Si el hilo
// ya no admite mensajes —cerrado por el estudio o bloqueado— no hay
// compositor: lo dice el servidor (`estado`), nunca se deduce aquí. Quien
// bloqueó puede desbloquear desde el mismo sitio.

export function HiloConversacion({
  titulo, cargar, enviar, marcarLeido, miId, modo = 'alumna', aviso = null,
  avatar = null, subtitulo = null, hrefPerfil = null, denunciar = null, bloquear = null, nombreOtraParte = null,
}: {
  titulo: string;
  /** Estable (useCallback). Lanza si no se pueden leer los mensajes. */
  cargar: () => Promise<HiloCargado>;
  enviar: (cuerpo: string) => Promise<ResultadoEnviar>;
  /** `hasta`: el id del último mensaje pintado (`null` si ninguno). */
  marcarLeido: (hasta: string | null) => Promise<void>;
  miId: string | null;
  modo?: 'alumna' | 'instructora';
  /** Aviso fijo bajo la cabecera (p.ej. que el estudio puede leer la conversación). */
  aviso?: string | null;
  /** Con quién se habla: pinta la cabecera de chat. */
  avatar?: { nombre: string; fotoUrl: string | null } | null;
  /** «Tu alumna», «Tu instructora»… bajo el nombre. */
  subtitulo?: string | null;
  /** Su ficha, si la hay: el enlace «Ver ficha» de la cabecera. */
  hrefPerfil?: string | null;
  /** Denunciar un mensaje de la otra parte. Sin él, los mensajes no se pueden tocar. */
  denunciar?: ((mensajeId: string) => Promise<ResultadoModeracionApp>) | null;
  /** Bloquear o desbloquear (solo en un chat instructora–alumna). */
  bloquear?: ((bloquear: boolean) => Promise<ResultadoModeracionApp>) | null;
  /** Para el texto de bloquear: «Bloquear a Lucía M.». */
  nombreOtraParte?: string | null;
}) {
  const { toast } = useToast();
  const { conNormas, hoja: hojaNormas } = useNormasComunidad();
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [extra, setExtra] = useState<MensajeHilo[]>([]);
  // Lo que ha cambiado aquí (bloquear, o un 409 al enviar) manda sobre lo cargado.
  const [estadoLocal, setEstadoLocal] = useState<EstadoHilo | null>(null);
  const [opciones, setOpciones] = useState<MensajeHilo | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const mensajes = [...(data?.mensajes ?? []), ...extra];
  const estadoHilo: EstadoHilo = estadoLocal ?? data?.estado ?? 'ABIERTA';

  // Marcar leído al abrir, HASTA el último mensaje que se ha pintado: uno que
  // llegue después no se ha visto. Best-effort: si falla, la próxima carga de la
  // bandeja seguirá enseñándola sin leer, que es el fallo seguro correcto —
  // nunca al revés.
  const ultimoPintado = data && data.mensajes.length > 0 ? data.mensajes[data.mensajes.length - 1].id : null;
  useEffect(() => {
    if (estado === 'ready' || estado === 'empty') void marcarLeido(ultimoPintado);
  }, [estado, marcarLeido, ultimoPintado]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length]);

  const mandar = async () => {
    const cuerpo = borrador.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    // Si faltan las normas de la comunidad, se enseñan y el mismo envío se repite.
    const r = await conNormas(() => enviar(cuerpo));
    setEnviando(false);
    if (!r.ok) {
      // Sin aceptar las normas no hay nada que avisar: la hoja ya lo ha dicho todo.
      // Cerrado o bloqueado entre medias (409): se dice y el borrador se queda a la
      // vista, para que no se pierda; al volver a entrar ya no hay compositor.
      if (r.codigo !== 'NORMAS_PENDIENTES') toast(r.error);
      return;
    }
    setExtra((e) => [...e, r.mensaje]);
    setBorrador('');
  };

  const dias = agruparHilo(mensajes, new Date());
  const listo = estado === 'ready' || estado === 'empty';
  const puedeEnviar = Boolean(borrador.trim()) && !enviando;

  const desbloquear = async () => {
    if (!bloquear) return;
    const r = await bloquear(false);
    if (!r.ok) { toast(r.error); return; }
    setEstadoLocal(r.estado ?? 'ABIERTA');
  };

  return (
    <StudentShell sinNav modo={modo}>
      {/* ⚠️ `height: 100%` NO llenaba la pantalla: el porcentaje se resuelve
          contra el alto del padre, y `.page` no declara `height` — lo suyo sale
          de `flex: 1`. Medido en el navegador: `.page` 844 px y esta columna
          472, o sea el alto del contenido. Con pocos mensajes —el caso NORMAL
          de una conversación recién abierta desde «Escribir al estudio»— el
          compositor se quedaba flotando a media altura con 600 px de crema
          muerta debajo, y la pantalla parecía a medio cargar.
          Se resta la altura real de la cabecera (`--header-height`) y las áreas
          seguras, que es lo mismo que `.page` añade como `padding` cuando
          `sinNav`. Con un alto definido, la lista vuelve a desplazarse por
          dentro y el compositor queda abajo. */}
      <div
        style={{
          height: 'calc(100dvh - var(--header-height) - var(--safe-top) - var(--safe-bottom))',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {avatar
          ? <CabeceraChat titulo={titulo} avatar={avatar} subtitulo={subtitulo} hrefPerfil={hrefPerfil} />
          : <PageHeader titulo={titulo} back />}
        {aviso && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px 0' }}>
            {/* Sin icono: el del kit es un «!», y esto informa, no alerta. */}
            <p
              className="t-meta"
              data-testid="aviso-hilo"
              style={{ margin: 0, padding: '5px 12px', borderRadius: 999, background: 'var(--muted)', color: 'var(--muted-foreground)', textAlign: 'center' }}
            >
              {aviso}
            </p>
          </div>
        )}

        <div className="px" style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {estado === 'loading' && <ListSkeleton n={5} h={40} />}
          {estado === 'error' && <ErrorState onRetry={reintentar} />}
          {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver este hilo." />}
          {listo && dias.map((dia) => (
            <div key={dia.etiqueta}>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
                <span style={{ padding: '3px 10px', borderRadius: 999, background: 'var(--muted)', fontSize: 'var(--t-micro)', fontWeight: 700, color: 'var(--subtle-foreground)' }}>{dia.etiqueta}</span>
              </div>
              {dia.bloques.map((bloque, i) => {
                const mio = bloque.remitenteAuthUserId === miId;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: mio ? 'flex-end' : 'flex-start', gap: 3, marginTop: 6 }}>
                    {bloque.items.map((m) => {
                      const tocable = !mio && !m.oculto && Boolean(denunciar);
                      return (
                      <div
                        key={m.id}
                        data-testid="mensaje"
                        {...(tocable ? {
                          role: 'button', tabIndex: 0, 'aria-label': 'Opciones del mensaje', 'aria-haspopup': 'dialog' as const,
                          onClick: () => setOpciones(m),
                          onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpciones(m); } },
                        } : {})}
                        style={{
                          cursor: tocable ? 'pointer' : undefined,
                          fontStyle: m.oculto ? 'italic' : undefined,
                          opacity: m.oculto ? 0.7 : undefined,
                          maxWidth: '80%', padding: '9px 12px', borderRadius: 18,
                          borderBottomRightRadius: mio ? 6 : 18, borderBottomLeftRadius: mio ? 18 : 6,
                          background: mio ? 'var(--accent)' : 'var(--card)', color: mio ? 'var(--accent-foreground)' : 'var(--foreground)',
                          border: mio ? 'none' : '1px solid var(--border)',
                          fontSize: 'var(--t-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}
                      >
                        {m.cuerpo}
                      </div>
                      );
                    })}
                    <span className="t-num" style={{ fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--subtle-foreground)' }}>{horaCorta(bloque.items[bloque.items.length - 1].creado_en)}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {/* `useAsync` se construye con `() => false` como predicado de vacío,
              así que `estado` NUNCA vale 'empty' y este texto no se pintaba
              jamás — justo en el camino principal de «Escribir al estudio», que
              aterriza aquí con cero mensajes. Se deriva de los mensajes, que es
              el dato real. */}
          {listo && mensajes.length === 0 && (
            avatar ? (
              <div data-testid="hilo-vacio" style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', padding: '24px 12px' }}>
                <AvatarSocia nombre={avatar.nombre} fotoUrl={avatar.fotoUrl} size={64} />
                <p className="t-card-title" style={{ margin: 0 }}>{titulo}</p>
                <p className="t-meta" style={{ margin: 0 }}>Este es el comienzo de tu conversación.</p>
              </div>
            ) : (
              <p className="t-meta" style={{ textAlign: 'center', margin: '20px 0' }}>Este es el comienzo de tu conversación.</p>
            )
          )}
          <div ref={finRef} />
        </div>

        {listo && estadoHilo !== 'ABIERTA' && (
          <div data-testid="hilo-sin-compositor" style={{ flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="px" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 12, paddingBottom: 12, textAlign: 'center' }}>
              <p className="t-meta" style={{ margin: 0 }}>
                {estadoHilo === 'BLOQUEADA_POR_MI' ? 'Has bloqueado esta conversación.' : TEXTO_NO_ADMITE}
              </p>
              {estadoHilo === 'BLOQUEADA_POR_MI' && bloquear && (
                <Button size="sm" variant="secondary" onClick={() => void desbloquear()}>Desbloquear</Button>
              )}
            </div>
          </div>
        )}

        {listo && estadoHilo === 'ABIERTA' && (
          <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
            <div className="px" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingTop: 10, paddingBottom: 10 }}>
              <textarea
                value={borrador}
                onChange={(e) => setBorrador(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void mandar(); }
                }}
                rows={1}
                placeholder="Escribe un mensaje…"
                aria-label="Escribe un mensaje"
                className="input"
                style={{ flex: 1, resize: 'none', fontSize: 'var(--t-body)', minHeight: 42, maxHeight: 120, padding: '10px 14px', borderRadius: 21 }}
              />
              <button
                type="button"
                onClick={() => void mandar()}
                disabled={!puedeEnviar}
                aria-label="Enviar"
                className="tap"
                style={{
                  width: 42, height: 42, flexShrink: 0, borderRadius: 999, border: 'none',
                  // Sin nada escrito, gris de «aún no»; con texto, el color del estudio.
                  background: puedeEnviar ? 'var(--accent)' : 'var(--muted)',
                  color: puedeEnviar ? 'var(--accent-foreground)' : 'var(--subtle-foreground)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background .15s',
                }}
              >
                <Icono nombre="enviar" />
              </button>
            </div>
          </div>
        )}
      </div>
      {hojaNormas}
      {/* Montada solo mientras se usa: un `Sheet` cerrado sigue en el DOM. */}
      {opciones && denunciar && (
        <HojaMensaje
          mensaje={opciones}
          onClose={() => setOpciones(null)}
          denunciar={denunciar}
          bloquear={estadoHilo === 'ABIERTA' ? bloquear : null}
          nombreOtraParte={nombreOtraParte}
          onBloqueado={(e) => setEstadoLocal(e)}
        />
      )}
    </StudentShell>
  );
}

/** Cabecera de chat: volver, foto, nombre, quién es y, si la hay, su ficha. */
function CabeceraChat({ titulo, avatar, subtitulo, hrefPerfil }: {
  titulo: string;
  avatar: { nombre: string; fotoUrl: string | null };
  subtitulo: string | null;
  hrefPerfil: string | null;
}) {
  const volver = useVolver();
  return (
    <div className="px" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <button
        type="button" onClick={volver} aria-label="Volver" className="tap tap--icono"
        style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Icono nombre="flecha-izquierda" tamano={18} />
      </button>
      <AvatarSocia nombre={avatar.nombre} fotoUrl={avatar.fotoUrl} size={40} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 className="trunc" style={{ margin: 0, fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.02em', color: 'var(--foreground)' }}>{titulo}</h1>
        {subtitulo && <p className="t-meta trunc" style={{ margin: '1px 0 0' }}>{subtitulo}</p>}
      </div>
      {hrefPerfil && (
        <Link href={hrefPerfil} className="btn btn--sm btn--secondary tap" data-testid="ver-ficha-hilo" style={{ flexShrink: 0 }}>
          Ver ficha
        </Link>
      )}
    </div>
  );
}

/**
 * Lo que se puede hacer con un mensaje de la otra parte. Denunciar va al
 * momento («Gracias. Lo revisaremos.»); bloquear pide confirmación porque
 * corta la conversación en este estudio.
 */
function HojaMensaje({ mensaje, onClose, denunciar, bloquear, nombreOtraParte, onBloqueado }: {
  mensaje: MensajeHilo;
  onClose: () => void;
  denunciar: (mensajeId: string) => Promise<ResultadoModeracionApp>;
  bloquear: ((bloquear: boolean) => Promise<ResultadoModeracionApp>) | null;
  nombreOtraParte: string | null;
  onBloqueado: (estado: EstadoHilo) => void;
}) {
  const { toast } = useToast();
  const [paso, setPaso] = useState<'opciones' | 'bloquear'>('opciones');
  const [ocupado, setOcupado] = useState<'denunciar' | 'bloquear' | null>(null);
  const quien = nombreOtraParte ?? 'esta persona';

  const alDenunciar = async () => {
    setOcupado('denunciar');
    const r = await denunciar(mensaje.id);
    setOcupado(null);
    if (!r.ok) { toast(r.error); return; }
    toast(r.mensaje ?? TEXTO_GRACIAS_DENUNCIA);
    onClose();
  };
  const alBloquear = async () => {
    if (!bloquear) return;
    setOcupado('bloquear');
    const r = await bloquear(true);
    setOcupado(null);
    if (!r.ok) { toast(r.error); return; }
    onBloqueado(r.estado ?? 'BLOQUEADA_POR_MI');
    toast(TEXTO_BLOQUEO_HECHO);
    onClose();
  };

  return (
    <Sheet open onClose={onClose} label="Opciones del mensaje">
      <div data-testid="hoja-mensaje">
        {paso === 'opciones' ? (
          <>
            <p className="t-meta" style={{ margin: 0, padding: '8px 12px', borderRadius: 12, background: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'hidden' }}>
              {mensaje.cuerpo}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <Button full variant="secondary" loading={ocupado === 'denunciar'} disabled={ocupado !== null} onClick={() => void alDenunciar()}>
                Denunciar este mensaje
              </Button>
              {bloquear && (
                <Button full variant="danger" disabled={ocupado !== null} onClick={() => setPaso('bloquear')}>
                  Bloquear a {quien}
                </Button>
              )}
              <Button full variant="ghost" disabled={ocupado !== null} onClick={onClose}>Cancelar</Button>
            </div>
          </>
        ) : (
          <>
            <h3 className="t-h2" style={{ margin: 0 }}>¿Bloquear a {quien}?</h3>
            <p className="t-meta" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>
              En este estudio, ninguna de las dos podréis escribir en esta conversación. El estudio lo sabrá para revisarlo. Podrás desbloquearla cuando quieras.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Button full variant="danger" loading={ocupado === 'bloquear'} onClick={() => void alBloquear()}>Bloquear</Button>
              <Button full variant="ghost" disabled={ocupado !== null} onClick={() => setPaso('opciones')}>Cancelar</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
