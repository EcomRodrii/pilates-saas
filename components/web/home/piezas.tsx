import type { ReactNode } from 'react';
import { MarcoIphone } from '@/components/ui/marco-iphone';
import { LogoTentare } from '@/components/marca/logo-tentare';

// ─────────────────────────────────────────────────────────────────────────────
// Fragmentos del producto para la home nueva (fase 2.2, 19-oct-2026).
//
// La forma es la de bsport y Mariana Tek: el producto no se enseña a pantalla
// entera, se DIBUJA el momento que demuestra la promesa (3 a 6 elementos,
// legible al tamaño de una tarjeta). Cada pieza copia los TEXTOS y la estructura
// del componente real del que sale, para que lo que se ve en la web sea lo que
// la dueña encuentra en el panel o en la app:
//   · avisos a la alumna: plantillas de lib/notifications/catalog.ts
//     («Tu bono está por caducar», «Se te ha agotado el bono»…);
//   · cobros: estados de lib/cobros/deudas.ts y components/cobros/* («Sin
//     cobrar», «Se reintenta solo», «Próximas cuotas · 30 días»);
//   · sustituciones: app/(dashboard)/sustituciones/page.tsx («Esperando tu visto
//     bueno», «Encaje con esta clase», «Contactando», «Cubierta»);
//   · informes: los títulos de lib/informes/* y de la página de informes.
// Los datos son de MUESTRA (nombres inventados, los mismos del sembrado de los
// e2e) y todo va `aria-hidden` dentro de un <figure> con su descripción: un
// lector de pantalla no debe leer cifras de ejemplo como si fueran de su estudio.
//
// Server Components: nada de esto entra en el JavaScript de la home.
// ─────────────────────────────────────────────────────────────────────────────

/** Un fragmento con su descripción para lectores de pantalla. */
export function Escena({ descripcion, className = '', children }: { descripcion: string; className?: string; children: ReactNode }) {
  return (
    <figure className={`wh-escena ${className}`.trim()}>
      <div className="wh-escena-piezas" aria-hidden="true">{children}</div>
      <figcaption className="wh-oculto">{descripcion}</figcaption>
    </figure>
  );
}

type Tono = 'ok' | 'aviso' | 'error' | 'neutro' | 'arena';

export function Pastilla({ tono = 'neutro', children }: { tono?: Tono; children: ReactNode }) {
  return <span className={`wh-pastilla wh-pastilla-${tono}`}>{children}</span>;
}

/** Un aviso en el móvil de la alumna o de la dueña, con el isotipo como icono de app. */
export function Aviso({ titulo, texto, hora = 'ahora', className = '', estilo }: { titulo: string; texto: string; hora?: string; className?: string; estilo?: React.CSSProperties }) {
  return (
    <div className={`wh-aviso ${className}`.trim()} style={estilo}>
      <span className="wh-aviso-icono"><LogoTentare formato="isotipo" tinta="color" alto={15} decorativo /></span>
      <span className="wh-aviso-cuerpo">
        <span className="wh-aviso-fila"><b>{titulo}</b><time>{hora}</time></span>
        <span className="wh-aviso-texto">{texto}</span>
      </span>
    </div>
  );
}

/** Tarjeta blanca pequeña con etiqueta, estado y una línea: el fragmento del héroe. */
export function Ficha({ etiqueta, estado, tono = 'ok', titulo, nota, className = '', estilo }: {
  etiqueta: string; estado: string; tono?: Tono; titulo: string; nota?: string; className?: string; estilo?: React.CSSProperties;
}) {
  return (
    <div className={`wh-ficha ${className}`.trim()} style={estilo}>
      <span className="wh-ficha-fila"><span className="wh-ficha-etiqueta">{etiqueta}</span><Pastilla tono={tono}>{estado}</Pastilla></span>
      <span className="wh-ficha-titulo">{titulo}</span>
      {nota && <span className="wh-ficha-nota">{nota}</span>}
    </div>
  );
}

/** Iniciales en un círculo, como el avatar de las listas del panel. */
export function Iniciales({ t, tono = 'a' }: { t: string; tono?: 'a' | 'b' | 'c' }) {
  return <span className={`wh-ini wh-ini-${tono}`}>{t}</span>;
}

// ── Capturas reales de la app de la alumna ──────────────────────────────────
// Las de public/landing/capturas, hechas con e2e/landing-capturas.spec.ts sobre
// el estudio de muestra «Estudio Alma» (datos 100 % inventados del andamiaje de
// los e2e) y optimizadas con scripts/capturas-landing.mjs.
export const CAPTURAS_APP = {
  inicio: {
    // 20-oct-2026: la app de la alumna NUEVA (captura del fundador en un iPhone 17 Pro, 1206×2622). Sin su
    // barra de estado (la dibuja el marco del iPhone), y con la cabecera de un estudio FICTICIO («Estudio
    // Alma», monograma) y un nombre y un avatar genéricos en vez de los reales: el repo es público y la web
    // no enseña la marca de otro estudio. Altura real: 1696 a 780 px de ancho.
    n: 'app-alumna-inicio-v2-estudio-pilates',
    alt: 'Inicio de la app de la alumna con la marca de su estudio: su próxima clase con foto, accesos a reservar, su plan, la comunidad y sus favoritos, y su progreso de la semana',
    tinta: 'clara',
  },
  // 21-oct-2026: tres pantallas más de la app nueva, para no repetir Inicio en todas las
  // páginas. Salen de e2e/landing-capturas.spec.ts (Estudio Alma, datos inventados) con
  // scripts/capturas-landing.mjs, que les añade el hueco de la barra de estado.
  reservar: {
    n: 'app-alumna-reservar-manana',
    alt: 'Reservar en la app de la alumna: las clases de mañana con su foto, su hora, su sala, su instructora y las plazas que quedan',
    tinta: 'oscura',
  },
  miPlan: {
    n: 'app-alumna-mi-plan',
    alt: 'Mi plan en la app de la alumna: su bono con las sesiones que le quedan y hasta cuándo, su próxima clase, la tienda y sus recibos',
    tinta: 'oscura',
  },
  elegirReformer: {
    n: 'app-alumna-elegir-reformer',
    alt: 'La alumna confirma su plaza en la app: la clase, la sesión que gasta de su bono, la cancelación gratuita y el mapa de la sala para elegir su reformer',
    tinta: 'clara',
  },
} as const;

// ── Escenas del producto ────────────────────────────────────────────────────

/** El día en el calendario: tres clases, una llena con su lista de espera. */
export function AgendaDia({ className = '' }: { className?: string }) {
  const clases = [
    { hora: '09:00', nombre: 'Reformer Fundamental', con: 'Con Ana · Sala Norte', plazas: '6/8', lleno: false },
    { hora: '18:00', nombre: 'Yoga Flow', con: 'Con Marta · Sala Sur', plazas: '11/14', lleno: false },
    { hora: '19:00', nombre: 'Reformer Avanzado', con: 'Con Ana · Sala Norte', plazas: '8/8', lleno: true },
  ];
  return (
    <div className={`wh-panel wh-agenda ${className}`.trim()}>
      <div className="wh-panel-cab"><b>Hoy, martes</b><span>3 clases</span></div>
      <ul className="wh-agenda-lista">
        {clases.map((c) => (
          <li key={c.hora} className={c.lleno ? 'wh-agenda-clase wh-agenda-llena' : 'wh-agenda-clase'}>
            <span className="wh-agenda-hora">{c.hora}</span>
            <span className="wh-agenda-cuerpo"><b>{c.nombre}</b><span>{c.con}</span></span>
            <span className="wh-agenda-plazas">
              <span>{c.plazas}</span>
              {c.lleno && <Pastilla tono="arena">Lista de espera · 2</Pastilla>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «Quién me debe» y las próximas cuotas: el resumen de Cobros. */
export function PanelCobros({ className = '', completo = false }: { className?: string; completo?: boolean }) {
  const filas = [
    { ini: 'LM', nombre: 'Laura Martín', concepto: 'Mensual ilimitado', importe: '75 €', estado: 'Se reintenta solo', tono: 'aviso' as Tono },
    { ini: 'CD', nombre: 'Carmen Del Río', concepto: 'Bono 10 clases', importe: '120 €', estado: 'Cobrado', tono: 'ok' as Tono },
    { ini: 'MG', nombre: 'María García', concepto: 'Mensual 2 días', importe: '59 €', estado: 'Se cobra solo', tono: 'neutro' as Tono },
    { ini: 'BO', nombre: 'Bea Ortega', concepto: 'Clase suelta', importe: '18 €', estado: 'Sin cobrar', tono: 'error' as Tono },
  ];
  return (
    <div className={`wh-panel wh-cobros ${className}`.trim()}>
      <div className="wh-panel-cab"><b>Cobros</b><span>Próximas cuotas · 30 días</span></div>
      <ul className="wh-filas">
        {(completo ? filas : filas.slice(0, 3)).map((f, i) => (
          <li key={f.nombre} className="wh-fila">
            <Iniciales t={f.ini} tono={(['a', 'b', 'c'] as const)[i % 3]} />
            <span className="wh-fila-cuerpo"><b>{f.nombre}</b><span>{f.concepto}</span></span>
            <span className="wh-fila-dcha"><b>{f.importe}</b><Pastilla tono={f.tono}>{f.estado}</Pastilla></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Una baja con su candidata propuesta, esperando el visto bueno (modo asistido, el de serie). */
export function PanelSustitucion({ className = '', completo = false }: { className?: string; completo?: boolean }) {
  const candidatas = [
    { ini: 'AF', nombre: 'Ana Ferrer', encaje: 92, nota: 'Da esta clase los martes' },
    { ini: 'LR', nombre: 'Lucía Ramos', encaje: 74, nota: 'Libre a esa hora' },
    { ini: 'SM', nombre: 'Sara Molina', encaje: 58, nota: 'Ha dado Reformer Avanzado' },
  ];
  return (
    <div className={`wh-panel wh-susti ${className}`.trim()}>
      <div className="wh-susti-cab">
        <span><b>Reformer Avanzado · 19:00</b><span>Marta no puede darla</span></span>
        <Pastilla tono="arena">Esperando tu visto bueno</Pastilla>
      </div>
      <p className="wh-susti-et">Encaje con esta clase</p>
      <ul className="wh-filas">
        {(completo ? candidatas : candidatas.slice(0, 2)).map((c, i) => (
          <li key={c.nombre} className="wh-fila">
            <Iniciales t={c.ini} tono={(['a', 'b', 'c'] as const)[i % 3]} />
            <span className="wh-fila-cuerpo"><b>{c.nombre}</b><span>{c.nota}</span></span>
            <span className="wh-encaje"><span style={{ width: `${c.encaje}%` }} /></span>
          </li>
        ))}
      </ul>
      <div className="wh-susti-acciones"><span className="wh-boton-ui">Avisar por email</span><span className="wh-boton-ui wh-boton-ui-claro">Lo resuelvo por mi cuenta</span></div>
    </div>
  );
}

/** Evolución de ingresos y ocupación por tipo de clase, redibujadas en la paleta. */
export function PanelInformes({ className = '', completo = false }: { className?: string; completo?: boolean }) {
  const meses = [
    { m: 'may', v: 52 }, { m: 'jun', v: 58 }, { m: 'jul', v: 49 }, { m: 'ago', v: 44 }, { m: 'sep', v: 71 }, { m: 'oct', v: 80 },
  ];
  const tipos = [
    { t: 'Reformer Avanzado', v: 94 }, { t: 'Reformer Fundamental', v: 81 }, { t: 'Yoga Flow', v: 68 }, { t: 'Pilates Mat', v: 46 },
  ];
  return (
    <div className={`wh-panel wh-informes ${className}`.trim()}>
      <div className="wh-panel-cab"><b>Evolución de ingresos</b><span>Últimos 6 meses</span></div>
      <div className="wh-barras">
        {meses.map((x, i) => (
          <span key={x.m} className={i === meses.length - 1 ? 'wh-barra wh-barra-ultima' : 'wh-barra'}>
            <span style={{ height: `${x.v}%` }} />
            <small>{x.m}</small>
          </span>
        ))}
      </div>
      {completo && (
        <>
          <div className="wh-panel-cab wh-panel-cab-2"><b>Ocupación por tipo de clase</b><span>Este mes</span></div>
          <ul className="wh-ocupacion">
            {tipos.map((x) => (
              <li key={x.t}><span>{x.t}</span><span className="wh-ocupacion-barra"><span style={{ width: `${x.v}%` }} /></span><b>{x.v} %</b></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Pasar lista desde la app de la instructora. */
export function PasarLista({ className = '' }: { className?: string }) {
  const alumnas = [['CD', 'Carmen'], ['LM', 'Laura'], ['MG', 'María'], ['BO', 'Bea']] as const;
  return (
    <div className={`wh-panel wh-lista ${className}`.trim()}>
      <div className="wh-panel-cab"><b>Pasar lista</b><span>Reformer 19:00</span></div>
      <ul className="wh-filas">
        {alumnas.map(([ini, n], i) => (
          <li key={n} className="wh-fila">
            <Iniciales t={ini} tono={(['a', 'b', 'c'] as const)[i % 3]} />
            <span className="wh-fila-cuerpo"><b>{n}</b></span>
            {i < 3 ? <Pastilla tono="ok">Ha venido</Pastilla> : <Pastilla>Sin marcar</Pastilla>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * La app NUEVA de la alumna en el iPhone 17 Pro, la misma captura que el héroe de la
 * home (sin la marca de ningún estudio real: components/web/home/piezas.tsx). Para
 * una `pieza` con `movil: true` (soluciones y funcionalidades, fases 2.3 y 2.4).
 */
export function AppAlumna({ captura = 'inicio' }: { captura?: keyof typeof CAPTURAS_APP }) {
  const c = CAPTURAS_APP[captura];
  return (
    <MarcoIphone modelo="17-pro" escala={0.5} tinta={c.tinta} indicador="oscura">
      <div style={{ height: '100%', background: '#F4EEE5' }}>
        <picture>
          <source type="image/avif" srcSet={`/landing/capturas/${c.n}-390.avif 390w, /landing/capturas/${c.n}-780.avif 780w`} sizes="210px" />
          <img
            src={`/landing/capturas/${c.n}-390.webp`}
            srcSet={`/landing/capturas/${c.n}-390.webp 390w, /landing/capturas/${c.n}-780.webp 780w`}
            sizes="210px"
            width={780}
            height={1696}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 0' }}
          />
        </picture>
      </div>
    </MarcoIphone>
  );
}
