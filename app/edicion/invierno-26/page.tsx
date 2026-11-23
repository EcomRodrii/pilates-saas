import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, BarChart3, CalendarDays, CreditCard, LayoutTemplate, ShieldCheck, Smartphone, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { PieWeb } from '@/components/web/PieWeb';
import { HeroParticulas } from '@/components/edicion/hero-particulas';
import { NavCapitulos } from '@/components/edicion/nav-capitulos';
import { Revelar } from '@/components/edicion/revelar';
import { CAPITULOS, EDICION, anclaVersion, type TarjetaEdicion } from '@/lib/edicion/invierno-26';
import { urlDe } from '@/lib/seo/paginas';
import '@/components/edicion/edicion.css';

export const metadata: Metadata = {
  title: `${EDICION.nombre} ${EDICION.temporada} | Todo lo nuevo en Tentare`,
  description: `Más de ${EDICION.actualizaciones} actualizaciones de Tentare desde la versión 1.0: la app de tus alumnas, el calendario, los cobros, tu web y tu equipo.`,
  alternates: { canonical: urlDe(EDICION.ruta) },
  openGraph: {
    siteName: 'Tentare', type: 'website', title: `${EDICION.nombre} ${EDICION.temporada}`,
    description: `Más de ${EDICION.actualizaciones} actualizaciones de Tentare.`, url: urlDe(EDICION.ruta),
  },
};

const ICONOS: Record<TarjetaEdicion['icono'], LucideIcon> = {
  app: Smartphone, calendario: CalendarDays, cobros: CreditCard, web: LayoutTemplate,
  seguridad: ShieldCheck, tenti: Sparkles, equipo: Users, informes: BarChart3,
};

export default function EdicionInvierno26() {
  return (
    <>
      <div className="ed-pagina">
        <header className="ed-cabecera">
          <Link href={EDICION.ruta} className="ed-cabecera-marca">
            <LogoTentare formato="isotipo" tinta="blanco" alto={22} titulo="Tentare" />
            <span>{EDICION.nombre}</span><em>{EDICION.temporada}</em>
          </Link>
          <nav className="ed-cabecera-enlaces" aria-label="Enlaces">
            <Link href="/ayuda/novedades">Todas las novedades</Link>
            <Link href="/ayuda">Centro de ayuda</Link>
            <Link href="/crear-estudio" className="ed-cabecera-cta">Empezar gratis</Link>
          </nav>
        </header>

        <section className="ed-hero" aria-labelledby="ed-h1">
          <h1 id="ed-h1" className="ed-sr">{EDICION.nombre} {EDICION.temporada}</h1>
          <div className="ed-hero-lienzo"><HeroParticulas palabra={EDICION.temporada} /></div>
          <div className="ed-hero-pie">
            <p className="ed-hero-texto">
              <span className="ed-hero-cifra">{EDICION.actualizaciones}+</span> actualizaciones para gestionar tu estudio, a tus alumnas y tu web en un solo sitio.
            </p>
            <ul className="ed-hero-indice">
              {CAPITULOS.map((c) => <li key={c.id}><a href={`#${c.id}`}>{c.nombre}</a></li>)}
            </ul>
          </div>
        </section>

        {CAPITULOS.map((c) => (
          <section key={c.id} id={c.id} className="ed-capitulo" aria-labelledby={`${c.id}-h`}>
            <Revelar>
              <p className="ed-capitulo-nombre" id={`${c.id}-h`}>{c.nombre}</p>
              <h2 className="ed-capitulo-titular">{c.titular}</h2>
            </Revelar>
            <ul className="ed-tarjetas">
              {c.tarjetas.map((t) => {
                const Icono = ICONOS[t.icono];
                return (
                  <li key={t.titulo}>
                    <Revelar>
                      <Link href={anclaVersion(t.version)} className="ed-tarjeta">
                        <span className={`ed-tile ed-tile--${c.id}`} aria-hidden="true"><Icono size={44} strokeWidth={1.25} /></span>
                        <span className="ed-tarjeta-titulo">{t.titulo}</span>
                        <span className="ed-tarjeta-texto">{t.texto}</span>
                        <span className="ed-tarjeta-version">Versión {t.version}</span>
                      </Link>
                    </Revelar>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <section className="ed-cierre">
          <Revelar>
            <h2>Y esto es solo el principio.</h2>
            <p>Cada cambio, uno a uno y con su fecha, está en las novedades.</p>
            <Link href="/ayuda/novedades" className="ed-cierre-boton">Ver todas las novedades <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </Revelar>
        </section>
        <NavCapitulos capitulos={CAPITULOS.map((c) => ({ id: c.id, nombre: c.nombre }))} />
      </div>
      <PieWeb />
    </>
  );
}
