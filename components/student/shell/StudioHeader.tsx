'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { useFotoUrl } from '@/lib/foto-signed-url';
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

/**
 * Lado del icono del estudio junto a su nombre. Es su favicon —el símbolo, que
 * al subirlo se prepara como cuadrado con el dibujo ocupando el 84 %—, así que
 * a 36 px la figura mide unos 30: la misma marca que la pestaña y que el icono
 * de la app en el móvil de la alumna.
 */
export const LADO_ICONO_MARCA = 36;

/**
 * Sin icono, el logo: 40 px de alto y como mucho 160 de ancho, sin deformar.
 * ⚠️ El logo salía como una raya de 5 px no por estos números sino porque
 * Storage devolvía una franja recortada del centro (ver `urlServida`).
 */
export const ALTO_LOGO = 40;
export const ANCHO_MAX_LOGO = 160;

/**
 * A partir de esta proporción (ancho / alto) un logo es un lockup apaisado: el
 * logotipo con el nombre al lado. En un hueco de `ALTO_LOGO` de alto y
 * `ANCHO_MAX_LOGO` de ancho como mucho, uno de 2000×200 se pinta como una
 * raya — así lo describió el fundador. Además repetiría el nombre, que ya va
 * escrito al lado.
 */
const PROPORCION_LOGO_APAISADO = 3.2;

/**
 * La marca del estudio junto a su nombre: su icono › su logo › su inicial.
 *
 * El icono va primero porque el logo completo casi nunca es una marca
 * compacta: el medido en producción era una figura de trazo fino con el nombre
 * y un lema debajo, sobre crema, y a 40 px de alto la figura medía 15 y el
 * texto era ilegible. El icono es el símbolo solo, ya preparado para verse
 * pequeño. Es la misma pieza para la cabecera y la pantalla de acceso.
 *
 * Del logo, la proporción solo se sabe al cargarlo, así que hasta entonces se
 * pinta (lo normal es un isotipo) y, si resulta apaisado, cambia al monograma.
 */
export function MarcaEstudio({ iconoUrl, logoUrl, nombre, flotando }: {
  iconoUrl: string | null; logoUrl: string | null; nombre: string; flotando: boolean;
}) {
  const [apaisado, setApaisado] = useState<{ src: string; si: boolean } | null>(null);
  const esApaisado = apaisado?.src === logoUrl && apaisado.si;
  if (iconoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        // 3x: a 36 px en un iPhone son 108 píxeles reales.
        src={urlServida(iconoUrl, LADO_ICONO_MARCA * 3)}
        alt=""
        decoding="async"
        width={LADO_ICONO_MARCA}
        height={LADO_ICONO_MARCA}
        style={{
          width: LADO_ICONO_MARCA, height: LADO_ICONO_MARCA, flexShrink: 0,
          // `contain` y fondo blanco: un favicon subido antes de prepararse al
          // subir puede no ser cuadrado, y no se recorta ni se deforma.
          objectFit: 'contain', background: '#FFFFFF', borderRadius: 10,
          // Sobre la foto, una sombra lo separa; sobre el crema, un filo.
          boxShadow: flotando ? '0 1px 4px rgba(0,0,0,.28)' : '0 0 0 1px var(--border)',
        }}
      />
    );
  }
  if (logoUrl && !esApaisado) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={urlServida(logoUrl, ANCHO_MAX_LOGO)}
        alt=""
        decoding="async"
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          setApaisado({ src: logoUrl, si: h > 0 && w / h > PROPORCION_LOGO_APAISADO });
        }}
        style={{ height: ALTO_LOGO, maxWidth: ANCHO_MAX_LOGO, objectFit: 'contain', flexShrink: 0 }}
      />
    );
  }
  // Sin logo (o con uno que no cabe), monograma con la inicial — el diseño lo
  // declara como estado normal, no como respaldo de error (`logoUrl: null`).
  return (
    <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: flotando ? 'rgba(250,249,245,.22)' : 'var(--accent)', color: flotando ? 'var(--on-dark)' : 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-meta)', fontWeight: 800 }}>
      {inicialDe(nombre)}
    </span>
  );
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
  // SEC-01 (auditoría 23-sep): `socia.fotoUrl` es la URL pública vieja —
  // dejó de usarse para no seguir exponiendo el bucket público. `socioId`
  // sirve directo como `path` de la firma (mismo id con el que se sube:
  // app/api/public/foto-perfil/route.ts, "path = id de la socia"). Solo se
  // pide si `fotoUrl` existe: sin foto, pedir la firma igual habría sido un
  // "object not found" en cada carga para la mayoría de socias.
  const { url: fotoFirmada } = useFotoUrl(socia?.fotoUrl ? socia.socioId : null, estudio.id, 'portal');

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
      // Sobre la foto, el velo mide lo que la foto —el ancho del shell en cada
      // escalón— y no la ventana: pintaba una franja gris encima del crema.
      className="ancho-shell"
      style={{
        position: 'fixed', top: 0, width: '100%', zIndex: 46, paddingTop: 'var(--safe-top)',
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
          : 'var(--velo)',
        backdropFilter: flotando ? undefined : 'blur(16px)',
        borderBottom: flotando ? 'none' : '1px solid var(--border)',
        transition: 'background .18s linear',
      }}
    >
      <div className="ancho-shell px" style={{ height: altoCabecera(lema), display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        <Link href={href()} aria-label={estudio.nombre} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, color: flotando ? 'var(--on-dark)' : 'var(--foreground)' }}>
          <MarcaEstudio iconoUrl={estudio.iconoMarcaUrl} logoUrl={estudio.logoUrl} nombre={estudio.nombre} flotando={flotando} />
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
          style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid ' + (flotando ? 'rgba(255,255,255,.45)' : 'var(--border)'), background: flotando ? 'rgba(250,249,245,.22)' : 'var(--card)', color: flotando ? 'var(--on-dark)' : 'var(--foreground)' }}
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
            <AvatarSocia nombre={socia.nombre} fotoUrl={fotoFirmada} size={34} />
          </Link>
        )}
        </div>
      </div>
    </header>
  );
}
