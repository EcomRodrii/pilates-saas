'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, LifeBuoy, PlayCircle, Search, Sparkles } from 'lucide-react';
import { CATEGORIAS, articuloDe, urlArticulo } from '@/lib/ayuda/registro';
import { buscarArticulos } from '@/lib/ayuda/busqueda';
import { RUTAS, leerHechas, progresoDeRuta, rutaEmpezada } from '@/lib/ayuda/academy';
import { crearRegistroDeBusquedas } from '@/lib/ayuda/registrar-busqueda';
import type { VideoAyuda } from '@/lib/ayuda/videos';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { VideoFachada } from '@/components/ayuda/VideoFachada';
import '@/components/ayuda/academy.css';

// La portada de Tentare Academy: lo que YA existe (las guías del Centro de ayuda), ordenado para aprender, no para resolver un problema.
// Nada aquí es contenido nuevo ni una página vacía: una ruta es una lista de guías publicadas; la sección de vídeos solo existe si hay
// un vídeo PUBLICADO; y «sigue donde lo dejaste» solo sale si esta persona ha marcado alguna guía. El Centro de ayuda (/ayuda) sigue
// siendo donde se resuelve un problema.
const guiaDe = (clave: string) => { const [c, s] = clave.split('/'); return articuloDe(c, s); };

export function PortadaAcademy({ videos }: { videos: VideoAyuda[] }) {
  const [query, setQuery] = useState('');
  const [hechas, setHechas] = useState<ReadonlySet<string>>(new Set());
  const q = query.trim();
  const resultados = useMemo(() => (q ? buscarArticulos(q) : []), [q]);
  const registro = useRef(crearRegistroDeBusquedas());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee el navegador (localStorage) tras montar: en el servidor no existe.
    setHechas(leerHechas(window.localStorage));
    const r = registro.current;
    return () => r.cancelar();
  }, []);
  useEffect(() => { registro.current.cambio(q, resultados.length); }, [q, resultados.length]);

  const videoDe = useMemo(() => new Map(videos.map(v => [v.articulo, v])), [videos]);
  const empezada = useMemo(() => rutaEmpezada(hechas), [hechas]);
  const continuar = empezada ? { ruta: empezada.ruta, guia: guiaDe(empezada.siguiente), hechas: empezada.hechas, total: empezada.total } : null;

  return (
    <div className="ac-portada">
      <header className="ac-hero">
        <p className="ac-kicker"><Sparkles size={14} aria-hidden="true" /> Tentare Academy</p>
        <h1>Aprende a sacar el máximo partido a Tentare.</h1>
        <p>Guías, vídeos y rutas para configurar tu estudio y gestionarlo con más autonomía y control, a tu ritmo.</p>
        <div className="ac-buscar">
          <Search size={19} aria-hidden="true" />
          <input
            type="search" aria-label="Buscar en Academy" placeholder="¿Qué quieres aprender?"
            value={query} onChange={e => setQuery(e.target.value)} autoComplete="off"
          />
        </div>
      </header>

      <div className="ac-cuerpo">
        {q ? (
          <section className="ac-seccion" aria-live="polite">
            <p style={{ textAlign: 'center', color: 'var(--w-texto-3, #586860)', fontSize: 'var(--w-fs-pequeno, .875rem)', marginBottom: 16 }}>
              {resultados.length > 0 ? `${resultados.length} guía${resultados.length === 1 ? '' : 's'} para «${q}»` : `Sin resultados para «${q}»`}
            </p>
            {resultados.length > 0 ? (
              <div className="ac-resultados">
                {resultados.map(r => (
                  <Link key={r.href} href={r.href}>
                    <small>{r.categoriaTitulo}</small><strong>{r.articulo.titulo}</strong><span>{r.articulo.descripcion}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="ac-resultados">
                <p style={{ margin: 0, textAlign: 'center', color: 'var(--w-texto-2, #3A4A41)' }}>
                  No hemos encontrado ninguna guía. Prueba con otras palabras, o <Link href="/ayuda" style={{ color: 'var(--w-olive, #214E36)', fontWeight: 600 }}>pregunta en el Centro de ayuda</Link>.
                </p>
              </div>
            )}
          </section>
        ) : (
          <>
            {continuar?.guia && (
              <section className="ac-seccion" aria-label="Sigue donde lo dejaste">
                <h2>Sigue donde lo dejaste</h2>
                <p>{continuar.ruta.titulo}: {continuar.hechas} de {continuar.total} guías hechas.</p>
                <div className="ac-resultados" style={{ margin: 0, maxWidth: 'none' }}>
                  <Link href={urlArticulo(continuar.guia)}>
                    <small>Siguiente guía</small><strong>{continuar.guia.titulo}</strong><span>{continuar.guia.descripcion}</span>
                  </Link>
                </div>
              </section>
            )}

            <section className="ac-seccion" aria-label="Rutas de aprendizaje">
              <h2>Rutas de aprendizaje</h2>
              <p>Cada ruta es una lista ordenada de guías: léelas en orden y tendrás esa parte de tu estudio funcionando.</p>
              <div className="ac-rutas">
                {RUTAS.map(ruta => {
                  const p = progresoDeRuta(ruta, hechas);
                  return (
                    <article key={ruta.id} className="ac-ruta">
                      <h3>{ruta.titulo}</h3>
                      <p>{ruta.descripcion}</p>
                      <ol>
                        {ruta.guias.map((clave, i) => {
                          const g = guiaDe(clave);
                          if (!g) return null;
                          return (
                            <li key={clave}>
                              <Link href={urlArticulo(g)}>
                                <span className="ac-paso" data-hecha={hechas.has(clave)}>{hechas.has(clave) ? <Check size={13} aria-label="Hecha" /> : i + 1}</span>
                                <span>{g.titulo}</span>
                                {videoDe.has(clave) && <PlayCircle className="ac-con-video" size={18} aria-label="Con vídeo" />}
                              </Link>
                            </li>
                          );
                        })}
                      </ol>
                      <p className="ac-progreso">{p.hechas} de {p.total} hechas</p>
                    </article>
                  );
                })}
              </div>
            </section>

            {videos.length > 0 && (
              <section className="ac-seccion" aria-label="Vídeos">
                <h2>Vídeos</h2>
                <p>Cortos y prácticos. Cada uno tiene su guía escrita debajo.</p>
                <div className="ac-videos">
                  {videos.map(v => {
                    const g = guiaDe(v.articulo);
                    return (
                      <div key={v.articulo}>
                        <VideoFachada video={v} />
                        {g && <p style={{ margin: '8px 4px 0' }}><Link href={urlArticulo(g)} style={{ color: 'inherit', fontSize: 'var(--w-fs-pequeno, .875rem)', fontWeight: 500 }}>Leer la guía: {g.titulo}</Link></p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="ac-seccion" aria-label="Por tema">
              <h2>Explora por tema</h2>
              <p>Todas las guías del Centro de ayuda, por categoría.</p>
              <div className="ac-categorias">
                {CATEGORIAS.filter(c => c.slug !== 'problemas').map(c => <Link key={c.slug} href={`/ayuda/${c.slug}`}>{c.titulo}</Link>)}
              </div>
            </section>
          </>
        )}

        <aside className="ac-ayuda" aria-label="Si algo no funciona">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <LifeBuoy size={22} aria-hidden="true" />
            <div>
              <strong>¿Algo no funciona?</strong>
              <p>Academy enseña; el Centro de ayuda resuelve problemas concretos: acceso, pagos, reservas, el widget…</p>
            </div>
          </div>
          <Link className="ac-boton" href="/ayuda/problemas">Ir al Centro de ayuda <ArrowRight size={15} aria-hidden="true" /></Link>
        </aside>

        <p style={{ margin: '28px 0 0', textAlign: 'center', fontSize: 'var(--w-fs-pequeno, .875rem)', color: 'var(--w-texto-2, #3A4A41)' }}>
          ¿Aún no tienes cuenta? <Link href="/crear-estudio" style={{ color: 'var(--w-olive, #214E36)', fontWeight: 600 }}>{CTA_ALTA}</Link> y sigue las guías con tu propio estudio.
        </p>
      </div>
    </div>
  );
}
