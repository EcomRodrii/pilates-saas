'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { inicialDe } from '@/lib/monograma-estudio';
import { urlServida } from '@/lib/student/imagen-servida';
import { Icono } from '@/components/student/ui/Icono';

/**
 * Cabecera fija con la marca del estudio. Del paquete
 * (`components/shell/StudioHeader.tsx`), con dos diferencias obligadas:
 *
 *  1. El estudio sale del contexto (depende del slug), no de una constante.
 *  2. Los `href` se construyen con el prefijo `/portal/<slug>`.
 *
 * `transparente` es para los héroes fotográficos (Inicio, detalle de clase),
 * donde el header flota sobre la foto — decisión visual del handoff §12.
 */
/**
 * Alto de la barra. Lo exporta porque los héroes fotográficos se meten DEBAJO
 * con un margen negativo, y ese margen tiene que ser exactamente este número:
 * si se copian a mano y uno de los dos cambia, la foto asoma por arriba o el
 * saludo queda tapado.
 */
export const ALTO_CABECERA = 56;
/** Con lema, la marca ocupa dos líneas. */
export const ALTO_CABECERA_CON_LEMA = 66;

/** El que corresponde a este estudio. */
export function altoCabecera(lema: string | null | undefined): number {
  return lema ? ALTO_CABECERA_CON_LEMA : ALTO_CABECERA;
}

export function StudioHeader({ noLeidas = 0, transparente = false, conLema = false }: { noLeidas?: number; transparente?: boolean;
  /** Pinta el lema del estudio bajo su nombre. Solo donde hay sitio: sobre un
   *  héroe fotográfico. En las pantallas normales la barra mide 56 y no cabe. */
  conLema?: boolean }) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const lema = conLema ? estudio.lema : null;
  // ⚠️ NO cuesta una petición. `useSesionStudent` resuelve por
  // `cacheSocia` —una sola llamada a `/api/public/session` por sesión,
  // compartida— y la pantalla de Inicio ya la hace. Por eso la cara sale de ahí
  // y no del catálogo: ese payload es el gordo, y hay pantallas de la app que
  // hoy no lo piden.
  const { socia } = useSesionStudent(estudio.slug);

  // ⚠️ Transparente solo MIENTRAS se ve el héroe.
  //
  // La barra es fija y el héroe no: en cuanto se baja un dedo, la foto se va y
  // el nombre del estudio —en crema, pensado para ir sobre una foto oscura— se
  // queda flotando sobre las tarjetas de la página. Medido en Inicio a 470 px
  // de scroll: el monograma caía justo encima de la baldosa «Reservar clase» y
  // el lema, sobre el fondo crema de la página, era ilegible.
  //
  // Se mira el scroll y se vuelve sólida, que es lo que hace la barra en el
  // resto de la app. El umbral es bajo a propósito (24 px): el cambio tiene que
  // ocurrir antes de que el texto llegue a tocar nada, no cuando ya ha pasado.
  const [solida, setSolida] = useState(false);
  useEffect(() => {
    if (!transparente) return;
    const mirar = () => setSolida(window.scrollY > 24);
    mirar();
    window.addEventListener('scroll', mirar, { passive: true });
    return () => window.removeEventListener('scroll', mirar);
  }, [transparente]);

  const flotando = transparente && !solida;

  return (
    <header
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 46, paddingTop: 'var(--safe-top)',
        // ⚠️ VELO PROPIO cuando flota, y no es adorno: MEDIDO fotografiando los
        // píxeles bajo el nombre del estudio con el texto oculto, sobre una
        // portada clara (#F2EFE9, una sala a contraluz — lo que sube media
        // España), el nombre en crema daba **2,91:1** contra el 4,5:1 que hace
        // falta a 13,5 px. Sobre una portada oscura daba 18:1. O sea que la
        // legibilidad de la cabecera dependía de la foto que suba cada estudio,
        // que es justo lo que no controlamos — el mismo fallo, en el mismo
        // héroe, que ya obligó a poner un velo local al bloque de texto.
        // Con este velo, sobre esa misma portada clara: nombre **8,53:1** y
        // lema **6,13:1**. Lo guarda `e2e/student-cabecera-sobre-foto.spec.ts`.
        background: flotando
          ? 'linear-gradient(to bottom, rgba(8,8,8,.58), rgba(8,8,8,.52) 70%, rgba(8,8,8,.2) 92%, transparent)'
          : 'rgba(250,249,245,.88)',
        backdropFilter: flotando ? undefined : 'blur(16px)',
        borderBottom: flotando ? 'none' : '1px solid var(--border)',
        transition: 'background .18s linear',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto', height: altoCabecera(lema), display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
        {/* ⚠️ `minWidth: 0` y el recorte de abajo NO están en el paquete, y sin
            ellos el header se rompe con datos reales.
            Medido a 320px con un logo apaisado (2000×200, un lockup de marca de
            lo más normal) y el nombre completo del estudio: el logo crecía a
            260px porque `height: 26` no lleva tope de anchura, el nombre se
            iba hasta x=349 —en una pantalla de 320— y SE SOLAPABA con la
            campana, que empieza en 281. El paquete no lo ve porque su mock
            tiene `logoUrl: null` y un nombre corto.
            No se tapa con `overflow: hidden` en el header: se arregla donde
            está el problema — el logo se acota, el nombre puede encogerse y
            elidirse, y la campana no se comprime nunca. */}
        <Link href={href()} aria-label={estudio.nombre} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, color: flotando ? '#FAF9F5' : 'var(--foreground)' }}>
          {estudio.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlServida(estudio.logoUrl, 132)} alt="" decoding="async" style={{ height: 26, maxWidth: 132, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            // Sin logo, monograma con la inicial — el diseño lo declara como
            // estado normal, no como respaldo de error (`logoUrl: null`).
            <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: flotando ? 'rgba(250,249,245,.22)' : 'var(--accent)', color: flotando ? '#FAF9F5' : 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-meta)', fontWeight: 800 }}>
              {inicialDe(estudio.nombre)}
            </span>
          )}
          {/* Con lema, nombre y lema van apilados. El `minWidth: 0` sube al
              contenedor para que el recorte de arriba siga funcionando. */}
          <span className="stack" style={{ ['--gap' as string]: '1px', minWidth: 0 }}>
            <span style={{ fontSize: 'var(--t-body)', fontWeight: 800, letterSpacing: '-.01em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estudio.nombre}</span>
            {lema && (
              // Versales y muy espaciado, como en la maqueta. La opacidad no
              // baja de .82: sobre una foto que sube cada estudio, atenuar es
              // justo lo que no podemos permitirnos (mismo criterio que el
              // kicker del héroe, que ya subió de .72 a .9 por esto).
              <span style={{
                fontSize: 'var(--t-micro)', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase',
                color: flotando ? 'rgba(250,249,245,.82)' : 'var(--subtle-foreground)',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{lema}</span>
            )}
          </span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Link
          href={href('/notificaciones')}
          aria-label={'Notificaciones' + (noLeidas ? `, ${noLeidas} sin leer` : '')}
          className="tap tap--icono"
          style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + (flotando ? 'rgba(255,255,255,.45)' : 'var(--border)'), background: flotando ? 'rgba(250,249,245,.22)' : 'var(--card)', color: flotando ? '#FAF9F5' : 'var(--foreground)' }}
        >
          {/* La campana del mismo set que la barra de abajo (HugeIcons
              stroke-rounded), a 1.5 por el mismo motivo: a 2 se empasta el
              badajo con la falda. */}
          <Icono nombre="campana" tamano={19} />
          {noLeidas > 0 && (
            <span aria-hidden style={{ position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 99, background: 'var(--warning)', border: '1.5px solid #fff', animation: 'apDot .4s both' }} />
          )}
        </Link>

        {/* Su cara, a Perfil. Sí, Perfil ya está en la barra de abajo: esto no
            es navegación redundante, es la señal de QUIÉN ha entrado —que en
            una app de marca blanca, donde la alumna puede tener dos estudios,
            no es evidente— y de paso el atajo a lo suyo.
            Solo con sesión resuelta: un círculo vacío mientras carga es peor
            que nada. */}
        {socia && (
          <Link
            href={href('/perfil')}
            aria-label={`Tu perfil, ${socia.nombre}`}
            className="tap tap--icono"
            style={{
              display: 'flex', width: 34, height: 34, flexShrink: 0, borderRadius: 999,
              // El aro despega la foto de lo que haya detrás: sobre el héroe es
              // una foto sobre otra foto.
              boxShadow: flotando ? '0 0 0 1.5px rgba(250,249,245,.55)' : '0 0 0 1.5px var(--border)',
            }}
          >
            <AvatarSocia nombre={socia.nombre} fotoUrl={socia.fotoUrl ?? null} size={34} />
          </Link>
        )}
        </div>
      </div>
    </header>
  );
}
