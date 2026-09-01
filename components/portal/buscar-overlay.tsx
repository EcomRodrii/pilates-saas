'use client';

// BUSCAR — overlay de búsqueda del portal de la clienta.
//
// Tomado del diseño "Tentare App Cliente v2" (Claude Design,
// Tentare Studio App.dc.html): un overlay a PANTALLA COMPLETA que se abre
// ENCIMA de la pantalla actual (transición de opacidad+transform, mismos
// tokens que la hoja de acceso — `dur.sheet`/`EASE`, ver hoja-pase.tsx) y se
// cierra sin navegar. NUNCA un push de ruta: se abre desde Inicio y desde
// Horario con el mismo estado local `buscarAbierto`, igual que ya hace cada
// pantalla con sus propias hojas (`paseAbierto` en portal-home-view.tsx,
// `cancelando`/`paseAbierto` en portal-clases-view.tsx).
//
// Adaptaciones respecto al diseño literal (el resto vive en lib/portal-busqueda.ts):
//  · "Búsquedas recientes" son un historial REAL de este dispositivo
//    (lib/portal-busqueda-reciente.ts), no los ejemplos fijos de la maqueta.
//  · "Popular en tu estudio" ya no es "popularidad entre estudios" (el
//    portal es de un único estudio) — son datos reales de ESTE estudio.
//  · El vacío sin resultados pierde el CTA "ampliar zona en 3km" del
//    original (pensado para reserva pública multi-estudio, no aplica aquí).
//
// Estilo: valores LITERALES del kit "Tentare Studio App"
// (app/portal/[slug]/portal-app.css), no los tokens de useModo()/portal-design
// que usaba antes — mismo paso que ya se hizo en otras pantallas del portal.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Search, X, ChevronRight } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { EASE, dur, sans } from '@/lib/portal-design';
import {
  resultadosBusqueda, resultadosPopulares, inicialesDeResultado, type ResultadoBusqueda,
} from '@/lib/portal-busqueda.ts';
import { obtenerBusquedasRecientes, guardarBusquedaReciente } from '@/lib/portal-busqueda-reciente.ts';

interface BuscarOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function BuscarOverlay({ open, onClose }: BuscarOverlayProps) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { tiposClase, instructores, sesiones, reservas } = useStudio();

  // Mismo mecanismo que la transición de pantallas de portal-shell.tsx: se
  // queda MONTADO durante la animación de salida (`dur.sheet`) y solo
  // entonces desaparece del DOM — sin esto, `open=false` lo desmontaría de
  // golpe y la transición de cierre nunca se vería.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [recientes, setRecientes] = useState<string[]>([]);
  const [ahora] = useState(() => new Date());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el ciclo de montaje con la prop `open` (sistema externo: quien abre/cierra el overlay) y con localStorage, no con otro estado de React.
      setMounted(true);
      setRecientes(obtenerBusquedasRecientes(slug));
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = setTimeout(() => { setMounted(false); setQuery(''); }, dur.sheet);
    return () => clearTimeout(id);
  }, [open, slug]);

  useEffect(() => {
    if (!visible) return;
    // El foco espera al frame siguiente a que empiece la transición: pedirlo
    // en el mismo tick en que el overlay aún mide 0 hace que iOS salte el
    // teclado antes de que la hoja haya terminado de moverse.
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [visible]);

  const populares = useMemo(
    () => resultadosPopulares({ tiposClase, instructores, sesiones, reservas, ahora, slug }),
    [tiposClase, instructores, sesiones, reservas, ahora, slug],
  );
  const resultados = useMemo(
    () => resultadosBusqueda({ query, tiposClase, instructores, sesiones, slug }),
    [query, tiposClase, instructores, sesiones, slug],
  );

  // Placeholder de ejemplo con datos REALES de este estudio (el diseño traía
  // "Reformer, Marta, Espai Llum…" de la tienda de muestra) — con un
  // catálogo aún vacío cae a un texto genérico, nunca a un nombre inventado.
  const placeholder = useMemo(() => {
    const tipo = tiposClase[0]?.nombre;
    const inst = instructores.find(i => i.activo)?.nombre;
    if (tipo && inst) return `${tipo}, ${inst}…`;
    return tipo || inst || 'Busca una clase o una instructora…';
  }, [tiposClase, instructores]);

  function confirmarBusqueda() {
    const limpia = query.trim();
    if (limpia) guardarBusquedaReciente(slug, limpia);
  }

  function irA(resultado: ResultadoBusqueda) {
    confirmarBusqueda();
    onClose();
    router.push(resultado.href);
  }

  if (!mounted) return null;

  const qLimpia = query.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar"
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'var(--ap-fondo, #FAF9F5)', color: 'var(--ap-tinta, #1A1A1A)',
        display: 'flex', flexDirection: 'column', fontFamily: sans,
        paddingTop: 'env(safe-area-inset-top)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(14px) scale(.98)',
        transition: `transform ${dur.sheet}ms ${EASE}, opacity ${dur.tab}ms ${EASE}`,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {/* Cabecera: input + Cerrar. El input lleva 16px de fuente para que iOS
          no haga zoom al enfocar — no se toca, es funcional, no estético. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        padding: '18px 20px 16px',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <Search size={17} strokeWidth={1.9} style={{ position: 'absolute', left: 15, color: 'var(--ap-sec, #5A5A52)', pointerEvents: 'none' }} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmarBusqueda(); }}
            placeholder={placeholder}
            inputMode="search"
            enterKeyHint="search"
            aria-label="Buscar en el estudio"
            style={{
              width: '100%', height: 48, borderRadius: 999, padding: '0 40px 0 40px', fontSize: 16,
              minWidth: 0, border: '1.5px solid var(--ap-tinta, #1A1A1A)', background: 'var(--ap-card, #FFFFFF)',
              color: 'var(--ap-tinta, #1A1A1A)', outline: 'none', fontFamily: sans,
            }}
          />
          {query && (
            <button
              type="button" aria-label="Borrar búsqueda"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              style={{
                position: 'absolute', right: 8, width: 26, height: 26, borderRadius: '50%', border: 'none',
                background: 'var(--ap-pill, #EFEDE4)', color: 'var(--ap-sec, #5A5A52)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button" onClick={onClose}
          style={{
            fontFamily: sans, fontSize: 14.5, fontWeight: 700, color: 'var(--ap-tinta, #1A1A1A)',
            background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '6px 2px',
          }}
        >
          Cerrar
        </button>
      </div>

      {/* Cuerpo, con scroll propio (el overlay entero es fixed, así que no
          hay <main> exterior que lo haga por él). */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '22px 20px calc(40px + env(safe-area-inset-bottom))' }}>
        {!qLimpia ? (
          <>
            {recientes.length > 0 && (
              <section style={{ marginBottom: 30 }}>
                <p className="ap-label" style={{ marginBottom: 14 }}>Búsquedas recientes</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {recientes.map(q => (
                    <button
                      key={q} type="button" onClick={() => setQuery(q)}
                      style={{
                        fontFamily: sans, fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 999,
                        border: '1px solid var(--ap-borde, #E5E3DA)', background: 'var(--ap-card, #FFFFFF)',
                        color: 'var(--ap-tinta, #1A1A1A)', cursor: 'pointer',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {populares.length > 0 && (
              <section>
                <p className="ap-label" style={{ marginBottom: 8 }}>Popular en tu estudio</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {populares.map(r => (
                    <FilaResultado key={`${r.tipo}-${r.id}`} r={r} onClick={() => irA(r)} tamIcono={60} />
                  ))}
                </div>
              </section>
            )}

            {recientes.length === 0 && populares.length === 0 && (
              <p style={{ fontFamily: sans, fontSize: 13, color: 'var(--ap-sec, #5A5A52)', textAlign: 'center', marginTop: 40 }}>
                Busca una clase o una instructora por su nombre.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="ap-label" style={{ marginBottom: 8 }}>
              {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}
            </p>
            {resultados.length === 0 ? (
              <div style={{
                border: '1.5px dashed var(--ap-borde, #E5E3DA)', borderRadius: 16, padding: '34px 22px',
                textAlign: 'center', marginTop: 12,
              }}>
                <p style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: 'var(--ap-tinta, #1A1A1A)' }}>
                  Nada con «{qLimpia}» en este estudio
                </p>
                <p style={{ fontFamily: sans, fontSize: 12, color: 'var(--ap-sec, #5A5A52)', marginTop: 6 }}>
                  Prueba con el nombre de una clase o de tu instructora.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {resultados.map(r => (
                  <FilaResultado key={`${r.tipo}-${r.id}`} r={r} onClick={() => irA(r)} tamIcono={52} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilaResultado({ r, onClick, tamIcono }: {
  r: ResultadoBusqueda; onClick: () => void; tamIcono: number;
}) {
  return (
    <button
      type="button" onClick={onClick} className="ap-card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: sans,
      }}
    >
      {r.fotoUrl ? (
        <div style={{ width: tamIcono, height: tamIcono, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      ) : (
        <span style={{
          width: tamIcono, height: tamIcono, borderRadius: 14, flexShrink: 0,
          background: r.color ? `${r.color}20` : 'var(--ap-pill, #EFEDE4)', color: r.color ?? 'var(--ap-tinta, #1A1A1A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
        }}>
          {inicialesDeResultado(r.nombre)}
        </span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: 'var(--ap-tinta, #1A1A1A)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {r.nombre}
        </div>
        <div style={{
          fontSize: 12.5, color: 'var(--ap-sec, #5A5A52)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {r.meta}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--ap-ter, #98A093)', flexShrink: 0 }} aria-hidden />
    </button>
  );
}
