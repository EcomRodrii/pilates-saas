import Link from 'next/link';
import { ArrowRight, GraduationCap, LifeBuoy, Repeat } from 'lucide-react';
import { CAPITULOS, ETIQUETA_NIVEL, EXPLICACION_NIVEL, NIVELES } from '@/lib/guia/curriculo';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { VideoFachada } from '@/components/ayuda/VideoFachada';
import type { VideoAyuda } from '@/lib/ayuda/videos';
import { urlArticulo, articuloDe } from '@/lib/ayuda/registro';
import '@/components/ayuda/academy.css';

// El ESCAPARATE público de Academy. La formación de verdad está DENTRO del panel, conectada a los datos de cada estudio (el progreso se
// marca solo cuando lo hecho existe en el estudio: «Primeros pasos» y «Cambiar a Tentare»). Esta página enseña de qué va, para quien aún no
// tiene cuenta y para quien compara: el índice del curso (que es el currículo real, no una copia) y los vídeos publicados.
//
// Es de servidor y sin JavaScript propio: nada de buscador (eso es el Centro de ayuda), ni «hecha» en el navegador, ni datos de nadie.
// Sin vídeos publicados no hay sección de vídeos, y nunca un «próximamente».
export function EscaparateAcademy({ videos }: { videos: VideoAyuda[] }) {
  return (
    <div className="ac-portada">
      <header className="ac-hero">
        <p className="ac-kicker"><GraduationCap size={14} aria-hidden="true" /> Tentare Academy</p>
        <h1>Aprende a sacar el máximo partido a Tentare.</h1>
        <p>Un curso dentro de tu panel: cada lección te enseña una parte de tu estudio, te lleva a la pantalla real y se marca sola cuando lo has hecho de verdad.</p>
        <div className="ac-acciones">
          <Link className="ac-boton" href="/crear-estudio">{CTA_ALTA} <ArrowRight size={15} aria-hidden="true" /></Link>
          <Link className="ac-boton ac-boton--claro" href="/ayuda">Centro de ayuda</Link>
        </div>
      </header>

      <div className="ac-cuerpo">
        <section className="ac-seccion" aria-label="Cómo funciona">
          <h2>Se aprende haciéndolo en tu estudio</h2>
          <div className="ac-tres">
            <article><h3>Lecciones que abren la pantalla real</h3><p>Cada lección explica para qué sirve algo y te lleva a hacerlo en tu propio estudio, no en uno de ejemplo.</p></article>
            <article><h3>Un progreso que no se puede falsear</h3><p>Una lección no se marca por leerla: se marca cuando la sala, la clase o la tarifa existen en tu estudio. El porcentaje es el de tu estudio de verdad.</p></article>
            <article><h3>Por qué importa, antes de cómo se hace</h3><p>Cada capítulo empieza por lo que te quita de encima y termina con lo que te falta de ese tema en tu estudio.</p></article>
          </div>
        </section>

        <section className="ac-seccion" aria-label="El curso">
          <h2>El curso, capítulo a capítulo</h2>
          <p>Es el mismo recorrido que verás dentro del panel al crear tu cuenta.</p>
          <div className="ac-niveles">
            {NIVELES.map(nivel => (
              <article key={nivel} className="ac-nivel">
                <h3>{ETIQUETA_NIVEL[nivel]}</h3>
                <p>{EXPLICACION_NIVEL[nivel]}</p>
                <ol>
                  {CAPITULOS.filter(c => c.nivel === nivel).map(c => (
                    <li key={c.id}><b>{c.numero}</b><div>{c.titulo}<span>{c.resumen}</span></div></li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>

        <section className="ac-seccion" aria-label="Cambiar de software">
          <div className="ac-cambiar">
            <div>
              <strong><Repeat size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 8 }} />¿Vienes de otro programa?</strong>
              <p>Hay un recorrido de 11 pasos para cambiar sin perder el control: elegir de dónde vienes, sacar tus datos, importarlos, comprobarlos y hacer una prueba antes de dejar el programa anterior. No promete lo que no se puede traer, y lo dice.</p>
            </div>
            <Link className="ac-boton ac-boton--claro" href="/soluciones/cambiar-de-software">Cómo cambiar de software</Link>
          </div>
        </section>

        {videos.length > 0 && (
          <section className="ac-seccion" aria-label="Vídeos">
            <h2>Vídeos</h2>
            <p>Cortos y prácticos. Cada uno tiene su guía escrita debajo.</p>
            <div className="ac-videos">
              {videos.map(v => {
                const [c, s] = v.articulo.split('/');
                const guia = articuloDe(c, s);
                return (
                  <div key={v.articulo}>
                    <VideoFachada video={v} />
                    {guia && <p style={{ margin: '8px 4px 0' }}><Link href={urlArticulo(guia)} style={{ color: 'inherit', fontSize: 'var(--w-fs-pequeno, .875rem)', fontWeight: 500 }}>Leer la guía: {guia.titulo}</Link></p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <aside className="ac-ayuda" aria-label="Si algo no funciona">
          <div>
            <strong><LifeBuoy size={16} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 8 }} />¿Algo no funciona?</strong>
            <p>Academy enseña; el Centro de ayuda resuelve problemas concretos: acceso, pagos, reservas, el widget…</p>
          </div>
          <Link className="ac-boton" href="/ayuda/problemas">Ir al Centro de ayuda <ArrowRight size={15} aria-hidden="true" /></Link>
        </aside>
      </div>
    </div>
  );
}
