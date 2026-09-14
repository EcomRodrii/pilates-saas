'use client';

import { useEffect, useRef, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useAsync } from '@/lib/student/useAsync';
import type { ResultadoEnviar } from '@/lib/student/mensajeria';
import { agruparHilo, horaCorta } from '@/lib/mensajeria/presentacion';
import type { RowMensajes } from '@/lib/db-types';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { useToast } from '@/components/student/ui/Toast';
import { Icono } from '@/components/student/ui/Icono';

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

export function HiloConversacion({
  titulo, cargar, enviar, marcarLeido, miId, modo = 'alumna', aviso = null,
}: {
  titulo: string;
  /** Estable (useCallback). Lanza si no se pueden leer los mensajes. */
  cargar: () => Promise<RowMensajes[]>;
  enviar: (cuerpo: string) => Promise<ResultadoEnviar>;
  marcarLeido: () => Promise<void>;
  miId: string | null;
  modo?: 'alumna' | 'instructora';
  /** Aviso fijo bajo la cabecera (p.ej. que el estudio puede leer la conversación). */
  aviso?: string | null;
}) {
  const { toast } = useToast();
  const [borrador, setBorrador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [extra, setExtra] = useState<RowMensajes[]>([]);
  const finRef = useRef<HTMLDivElement>(null);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const mensajes = [...(data ?? []), ...extra];

  // Marcar leído al abrir. Best-effort: si falla, la próxima carga de la bandeja
  // seguirá enseñándola sin leer, que es el fallo seguro correcto — nunca al revés.
  useEffect(() => {
    if (estado === 'ready' || estado === 'empty') void marcarLeido();
  }, [estado, marcarLeido]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes.length]);

  const mandar = async () => {
    const cuerpo = borrador.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    const r = await enviar(cuerpo);
    setEnviando(false);
    if (!r.ok) { toast(r.error); return; }
    setExtra((e) => [...e, r.mensaje]);
    setBorrador('');
  };

  const dias = agruparHilo(mensajes, new Date());
  const listo = estado === 'ready' || estado === 'empty';

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
        <PageHeader titulo={titulo} back />
        {aviso && (
          <p className="t-meta" data-testid="aviso-hilo" style={{ textAlign: 'center', margin: '6px 0 0', padding: '0 16px' }}>{aviso}</p>
        )}

        <div className="px" style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {estado === 'loading' && <ListSkeleton n={5} h={40} />}
          {estado === 'error' && <ErrorState onRetry={reintentar} />}
          {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver este hilo." />}
          {listo && dias.map((dia) => (
            <div key={dia.etiqueta}>
              <p style={{ textAlign: 'center', margin: '10px 0', fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--subtle-foreground)' }}>{dia.etiqueta}</p>
              {dia.bloques.map((bloque, i) => {
                const mio = bloque.remitenteAuthUserId === miId;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: mio ? 'flex-end' : 'flex-start', gap: 3, marginTop: 6 }}>
                    {bloque.items.map((m) => (
                      <div
                        key={m.id}
                        data-testid="mensaje"
                        style={{
                          maxWidth: '80%', padding: '9px 12px', borderRadius: 16,
                          borderBottomRightRadius: mio ? 4 : 16, borderBottomLeftRadius: mio ? 16 : 4,
                          background: mio ? 'var(--accent)' : 'var(--muted)', color: mio ? 'var(--accent-foreground)' : 'var(--foreground)',
                          fontSize: 'var(--t-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}
                      >
                        {m.cuerpo}
                      </div>
                    ))}
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
            <p className="t-meta" style={{ textAlign: 'center', margin: '20px 0' }}>Este es el comienzo de tu conversación.</p>
          )}
          <div ref={finRef} />
        </div>

        {listo && (
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
                style={{ flex: 1, resize: 'none', fontSize: 'var(--t-body)', minHeight: 40, maxHeight: 120, padding: '9px 12px' }}
              />
              <button
                type="button"
                onClick={() => void mandar()}
                disabled={!borrador.trim() || enviando}
                aria-label="Enviar"
                style={{
                  width: 40, height: 40, flexShrink: 0, borderRadius: 999, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-foreground)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: !borrador.trim() || enviando ? 0.5 : 1,
                }}
              >
                <Icono nombre="enviar" />
              </button>
            </div>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
