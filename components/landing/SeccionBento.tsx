import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Link from 'next/link';
import { PLANS } from './data';
import { FotoLanding } from './FotoLanding';
import { FOTOS_BENTO } from './fotos-bento';
import { LogoTentare } from '@/components/marca/logo-tentare';

// «Todo lo que necesita tu estudio, en una sola plataforma» — cuarta versión
// (6-oct-2026), esta vez CLONANDO la estructura, la escala y la sensación de la
// referencia que el fundador ha pegado dos veces (images/8.png): título
// centrado en dos líneas, rejilla de dos columnas con ritmo alterno
// [ancha|estrecha] · [ancha completa] · [ancha|estrecha] · [ancha completa],
// seis tarjetas COMPACTAS con el mismo tinte pastel (una sola familia oliva/
// arena, sin bordes ni sombra de tarjeta) y, dentro de cada una, SOLO: un
// título, una descripción de dos o tres líneas, chips pequeños con un último «…»
// y el visual.
//
// EL VISUAL son tarjetitas blancas, planas y muy pequeñas (9–11 px) hechas en
// HTML/CSS con el estilo real del producto y DATOS DE MUESTRA creíbles
// (nombres inventados, sin apellidos reales), apiladas, escalonadas y a veces
// cortadas por el borde de la tarjeta; un móvil que asoma por abajo con la
// pantalla REAL de la app (captura de e2e con datos de muestra, ver
// scripts/capturas-landing.mjs); avisos al estilo de iOS con el isotipo de
// Tentare; y fotos donde las hay (fotos-bento.ts dice qué foto pide cada hueco).
// Ni un logotipo de terceros. Sin Tenti: la web comercial está vetada en
// lib/tenti/donde-vive-tenti.test.ts.
//
// Los enlaces SEO no ocupan sitio dentro de las tarjetas: el título entero es el
// enlace (sin subrayado) y una fila de enlaces cierra la sección.
//
// Server Component: ni un byte de esto entra en el JavaScript de la home. Las
// imágenes van con <picture> AVIF+WebP ya generados (FotoLanding.tsx explica por
// qué no next/image), con width/height (CLS 0) y `loading="lazy"`.
//
// Cada pieza se coloca con variables CSS: `--l/--r/--t/--b` en escritorio (px
// desde el borde de la tarjeta) y `--ml/--mr/--mt/--mb` en móvil (px desde el
// escenario, que en móvil pasa a ir debajo del texto). Las piezas con
// `.bn-no-m` desaparecen en móvil en vez de encogerse a ilegible.
//
// ⚠️ TODA frase de promesa de aquí está cruzada con el código (lista en el PR):
//   · el asistente CONSULTA y PROPONE clases, salas, eventos y citas; nada se
//     crea sin confirmar y no cobra, borra, edita ni escribe a nadie;
//   · los reintentos de cobro, de lib/billing/dunning.ts (1, 3 y 7 días);
//   · el Centro de Control, plan Estudio; la sustitución espera tu visto bueno,
//     y es solo un chip: no es lo que más busca un estudio;
//   · los avisos y las tarjetitas son ejemplos de lo que la app y el panel
//     muestran hoy; nada de cifras de clientas.
// Nada de lo congelado (Kiosko, VOD, Chat de equipo, Network).

const PRECIO_DESDE = PLANS[0].price.replace('€', ' €');

type Pos = Partial<Record<'l' | 'r' | 't' | 'b' | 'w' | 'ml' | 'mr' | 'mt' | 'mb' | 'mw', string | number>>;
const px = (v: string | number) => (typeof v === 'number' ? `${v}px` : v);
function estilo(p: Pos): React.CSSProperties {
  const s: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (v !== undefined) s[`--${k}`] = px(v);
  return s as React.CSSProperties;
}

function Imagen({ n, r, a, alt, sizes, ancho }: { n: string; r: number; a: readonly [number, number]; alt: string; sizes: string; ancho: number }) {
  const set = (f: 'avif' | 'webp') => a.map((w) => `/landing/capturas/${n}-${w}.${f} ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <img src={`/landing/capturas/${n}-${a[0]}.webp`} srcSet={set('webp')} sizes={sizes} width={ancho} height={Math.round(ancho * r)} alt={alt} loading="lazy" decoding="async" />
    </picture>
  );
}

const MOVILES = {
  inicio: { n: 'app-alumna-inicio-estudio-pilates', alt: 'Inicio de la app de una alumna: su próxima clase de hoy y accesos rápidos a clases, instructoras, su plan y favoritos' },
  recibos: { n: 'app-alumna-recibos-pagar', alt: 'App de la alumna: pantalla de Recibos con 120 euros por pagar y el botón «Pagar 120 euros»' },
  asistente: { n: 'app-asistente-confirmar-clase', alt: 'Chat de «Pregúntale a Tentare» en el móvil: una petición para crear una clase y la tarjeta «Crear una clase» con los botones Confirmar, Cambiar algo y Cancelar' },
} as const;

/** El móvil que asoma por el borde de abajo: la pantalla real dentro de un bisel fino. */
function Movil({ cual, pos, ancho = 150, mancho }: { cual: keyof typeof MOVILES; pos: Pos; ancho?: number; mancho?: number }) {
  const m = MOVILES[cual];
  return (
    <div className="bn-e bn-tel" style={{ ...estilo(pos), ['--tw' as string]: `${ancho}px`, ['--mtw' as string]: `${mancho ?? ancho}px` }}>
      <span className="bn-tel-isla" aria-hidden="true" />
      <Imagen n={m.n} r={844 / 390} a={[390, 780]} alt={m.alt} sizes="(max-width: 700px) 150px, 170px" ancho={780} />
    </div>
  );
}

/** Tarjetita blanca, plana y muy pequeña. */
function Mini({ pos, children, clase = '', etiqueta }: { pos: Pos; children: React.ReactNode; clase?: string; etiqueta: string }) {
  return (
    <div className={`bn-e bn-m ${clase}`} style={estilo(pos)} role="img" aria-label={etiqueta}>
      <div aria-hidden="true" className="bn-m-in">{children}</div>
    </div>
  );
}

const Av = ({ t, tono = 'a' }: { t: string; tono?: 'a' | 'o' | 'c' }) => <span className={`bn-av bn-av-${tono}`}>{t}</span>;
const Tag = ({ t, tono = 'o' }: { t: string; tono?: 'ok' | 'warn' | 'arena' | 'o' | 'osc' }) => <span className={`bn-tag bn-tag-${tono}`}>{t}</span>;

/** Aviso al estilo de iOS, con el isotipo de Tentare como icono de app. */
function Aviso({ titulo, linea, hora = 'ahora', pos }: { titulo: string; linea: string; hora?: string; pos: Pos }) {
  return (
    <div className="bn-e bn-aviso" style={estilo(pos)} role="img" aria-label={`Aviso de ejemplo: ${titulo}. ${linea}`}>
      <span className="bn-squircle bn-aviso-i" aria-hidden="true"><LogoTentare formato="isotipo" tinta="color" alto={15} decorativo /></span>
      <span className="bn-aviso-t" aria-hidden="true"><b>{titulo}</b><span>{linea}</span></span>
      <time aria-hidden="true">{hora}</time>
    </div>
  );
}

/**
 * Las fotos que suministra el fundador (public/landing/fotos-fundador/, FUERA de
 * git: el repo es público y su licencia está sin confirmar). Si el fichero no
 * está, el hueco queda limpio (solo el tinte y las tarjetitas) y el PR no rompe;
 * para `equipo` hay además una foto de reserva de las registradas en la home.
 * Nunca se amplía por encima de su tamaño nativo: `object-fit: cover` sin escalado
 * artificial, y las cajas miden menos que la foto.
 */
const FOTOS_FUNDADOR = {
  reservas: { f: 'reservas.png', w: 412, h: 624, alt: 'Mujer sentada en un reformer, con la mano en alto, haciéndose un selfie en un estudio de Pilates luminoso', pos: '50% 30%' },
  app: { f: 'app.png', w: 414, h: 742, alt: 'Mujer sonriendo con el móvil en la mano, con ropa de deporte clara y verde, después de la clase', pos: '50% 20%' },
  equipo: { f: 'equipo.png', w: 434, h: 600, alt: 'Una instructora y una alumna charlando sobre sus reformers en un estudio de Pilates con cortinas de luz', pos: '50% 40%' },
} as const;
const hayFoto = (clave: keyof typeof FOTOS_FUNDADOR) => existsSync(join(process.cwd(), 'public/landing/fotos-fundador', FOTOS_FUNDADOR[clave].f));

function Foto({ clave, pos }: { clave: keyof typeof FOTOS_FUNDADOR; pos: Pos }) {
  const d = FOTOS_FUNDADOR[clave];
  const hueco = clave === 'equipo' ? FOTOS_BENTO.equipo : null;
  if (hayFoto(clave)) {
    return (
      <div className="bn-e bn-foto" style={estilo(pos)} data-hueco={clave} data-foto="fundador">
        {/* eslint-disable-next-line @next/next/no-img-element -- foto provisional del fundador, sin derivados */}
        <img src={`/landing/fotos-fundador/${d.f}`} width={d.w} height={d.h} alt={d.alt} loading="lazy" decoding="async" style={{ objectPosition: d.pos }} />
      </div>
    );
  }
  if (hueco?.foto) {
    return (
      <div className="bn-e bn-foto" style={estilo(pos)} data-hueco={clave} data-foto="reserva">
        <FotoLanding foto={hueco.foto} mediaMovil="(max-width: 700px)" sizes={{ escritorio: '(max-width: 960px) 92vw, 440px', movil: '92vw' }} />
      </div>
    );
  }
  return <span hidden data-hueco={clave} data-foto="pendiente" data-pide={FOTOS_BENTO[clave as 'app'].pide} />;
}

function Texto({ id, href, titulo, texto, chips }: { id: string; href: string; titulo: string; texto: string; chips: string[] }) {
  return (
    <div className="bn-t">
      <h3 id={id} className="bn-h3"><Link href={href}>{titulo}</Link></h3>
      <p className="bn-p">{texto}</p>
      <ul className="bn-chips">{[...chips, '…'].map((c) => <li key={c}>{c}</li>)}</ul>
    </div>
  );
}

const MAS: { href: string; label: string }[] = [
  { href: '/funcionalidades', label: 'Todas las funcionalidades' },
  { href: '/precios', label: `Planes y precios · desde ${PRECIO_DESDE}` },
  { href: '/soluciones/estudio-de-pilates-reformer', label: 'Software para estudios de Pilates reformer' },
  { href: '/recursos', label: 'Guías para dueñas de estudios' },
  { href: '/comparativa', label: 'Comparativa de programas' },
  { href: '/glosario', label: 'Glosario' },
];

export function SeccionBento() {
  return (
    <section id="plataforma" className="bn" aria-labelledby="bn-h">
      <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
        <defs>
          <clipPath id="bn-squircle" clipPathUnits="objectBoundingBox">
            <path d="M0.5,0 C0.82,0 1,0.18 1,0.5 C1,0.82 0.82,1 0.5,1 C0.18,1 0,0.82 0,0.5 C0,0.18 0.18,0 0.5,0 Z" />
          </clipPath>
        </defs>
      </svg>

      <div className="bn-wrap">
        <h2 id="bn-h" className="bn-h2 lp-rv">Todo lo que necesita tu estudio de Pilates, en una sola plataforma.</h2>

        <div className="bn-rejilla">
          {/* 1 · Reservas y lista de espera */}
          <article className="bn-card bn-w7 bn-r1 bn-c1 lp-rv" aria-labelledby="bn-res-h">
            <Texto id="bn-res-h" href="/funcionalidades/reservas-online" titulo="Que tus alumnas llenen las clases solas"
              texto="Reservan desde el móvil, eligen su reformer y, si la clase está llena, entran en la lista de espera."
              chips={['Elige su reformer', 'Lista de espera', 'Reservas en tu web']} />
            <div className="bn-st" style={{ ['--sh' as string]: '250px' }}>
              <Foto clave="reservas" pos={{ r: 0, t: 0, b: 0, w: 214, mr: 0, mt: 0, mb: 0, mw: 128 }} />
              <span className="bn-hora bn-no-m" style={estilo({ l: 30, t: 153 })} aria-hidden="true">09:00</span>
              <span className="bn-hora bn-no-m" style={estilo({ l: 30, t: 213 })} aria-hidden="true">10:00</span>
              <span className="bn-hora bn-no-m" style={estilo({ l: 30, t: 273 })} aria-hidden="true">11:00</span>
              <Mini etiqueta="Clase de Reformer Flow de las 9:00, completa: 12 de 12" pos={{ l: 78, t: 142, w: 196, ml: 18, mt: 8, mw: 200 }}>
                <span className="bn-fila"><span><b>Reformer Flow</b><i>09:00 – 09:50</i></span><span className="bn-cifra bn-ok">12/12<i>llena</i></span></span>
              </Mini>
              <Mini etiqueta="Clase de Reformer Avanzado de las 10:00 con 8 de 12 plazas y 2 personas en lista de espera" clase="bn-m-arena" pos={{ l: 138, t: 196, w: 224, ml: 62, mt: 62, mw: 230 }}>
                <span className="bn-fila"><span><b>Reformer Avanzado</b><i>10:00 – 10:50</i></span><span className="bn-cifra bn-warn">8/12<i>reservadas</i></span></span>
                <span className="bn-fila bn-fila-pie"><Tag t="LISTA DE ESPERA" tono="arena" /><span className="bn-mini-txt">+2 esperando</span></span>
              </Mini>
              <Mini etiqueta="Clase de Mat de las 11:00 con 10 de 12 plazas" pos={{ l: 78, t: 262, w: 196, ml: 18, mt: 140, mw: 200 }}>
                <span className="bn-fila"><span><b>Mat</b><i>11:00 – 11:50</i></span><span className="bn-cifra bn-ok">10/12<i>reservadas</i></span></span>
              </Mini>
              <Mini etiqueta="Mapa de la sala para elegir reformer, con unos ocupados y uno elegido" pos={{ r: 150, t: 236, w: 176, ml: 150, mt: 150, mw: 176 }} clase="bn-no-m-corto">
                <b className="bn-mapa-t">Elige tu sitio</b>
                <span className="bn-mapa">{['x', 'x', 'l', 'e', 'l', 'x', 'l', 'x', 'l', 'l', 'x', 'l', 'l', 'x'].map((v, i) => <i key={i} className={`bn-pl bn-pl-${v}`} />)}</span>
              </Mini>
            </div>
          </article>

          {/* 2 · App con tu marca */}
          <article className="bn-card bn-w5 bn-r1 bn-c2 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-app-h">
            <Texto id="bn-app-h" href="/funcionalidades/app-para-alumnas" titulo="Tu app, con el nombre de tu estudio"
              texto="Tus alumnas reservan, ven su bono y pagan desde el móvil, con tu nombre, tu logo y tus colores."
              chips={['Tu logo y tus colores', 'Avisos en el móvil']} />
            <div className="bn-st" style={{ ['--sh' as string]: '260px' }}>
              <Foto clave="app" pos={{ l: 0, t: 132, b: 0, w: 196, ml: 0, mt: 46, mb: 0, mw: 150 }} />
              <Movil cual="inicio" ancho={158} pos={{ r: 38, t: 176, mr: 22, mt: 62 }} />
              <Aviso titulo="Recordatorio de clase" linea="Reformer Flow, hoy a las 19:00" pos={{ l: 22, t: 150, w: 250, ml: 12, mt: 4, mw: 262 }} />
            </div>
          </article>

          {/* 3 · Bonos y cobros (ancha) */}
          <article className="bn-card bn-w12 bn-r2 bn-c3 lp-rv" aria-labelledby="bn-cob-h">
            <Texto id="bn-cob-h" href="/funcionalidades/cobros-recurrentes" titulo="Cobra sin perseguir a nadie"
              texto="Bonos y cuotas con tarjeta o SEPA. Si un cobro falla, se reintenta a los 1, 3 y 7 días."
              chips={['Tarjeta y SEPA', 'Reintento de cobros', 'Facturas']} />
            <div className="bn-st" style={{ ['--sh' as string]: '270px' }}>
              <Mini etiqueta="Recibo de Ana López, cuota mensual de 59 euros, cobrado" pos={{ l: 470, t: 30, w: 246, ml: 12, mt: 4, mw: 262 }}>
                <span className="bn-fila"><span className="bn-quien"><Av t="AL" /><span><b>Ana López</b><i>Cuota mensual · 59 €</i></span></span><Tag t="Cobrado" tono="ok" /></span>
              </Mini>
              <Mini etiqueta="Recibo de Marta Ruiz, bono de 10 clases de 120 euros, se reintenta mañana" pos={{ l: 560, t: 94, w: 256, ml: 56, mt: 62, mw: 270 }}>
                <span className="bn-fila"><span className="bn-quien"><Av t="MR" tono="o" /><span><b>Marta Ruiz</b><i>Bono 10 clases · 120 €</i></span></span><Tag t="Reintento mañana" tono="warn" /></span>
              </Mini>
              <Mini etiqueta="Recibo de Laura Martín por pagar desde su app" pos={{ l: 484, t: 158, w: 246, ml: 12, mt: 128, mw: 196 }}>
                <span className="bn-fila"><span className="bn-quien"><Av t="LM" tono="c" /><span><b>Laura Martín</b><i>Cuota · 59 €</i></span></span><Tag t="Pagar 59 €" tono="osc" /></span>
              </Mini>
              <Movil cual="recibos" ancho={150} mancho={128} pos={{ r: 110, t: 30, mr: 12, mt: 126 }} />
            </div>
          </article>

          {/* 4 · Calendario y Centro de Control */}
          <article className="bn-card bn-w7 bn-r3 bn-c1 lp-rv" aria-labelledby="bn-cc-h">
            <Texto id="bn-cc-h" href="/funcionalidades/calendario-y-salas" titulo="Cada mañana, una sola cosa que mirar"
              texto="El Centro de Control te propone lo que merece tu atención y «Pregúntale a Tentare» prepara clases y citas cuando tú confirmas."
              chips={['Calendario por sala', 'Lo que espera tu visto bueno', 'Pregúntale a Tentare']} />
            <div className="bn-st" style={{ ['--sh' as string]: '270px' }}>
              <Mini etiqueta="Recomendación del Centro de Control: abrir una segunda clase de Reformer los martes, con 7 personas en lista de espera" pos={{ l: 30, t: 150, w: 292, ml: 12, mt: 4, mw: 276 }}>
                <span className="bn-fila"><Tag t="RECOMENDACIÓN" tono="arena" /><span className="bn-mini-txt">Plan Estudio</span></span>
                <b className="bn-m-tit">Abrir una segunda clase de Reformer los martes</b>
                <i className="bn-m-sub">7 personas en lista de espera</i>
              </Mini>
              <Mini etiqueta="Bea lleva seis semanas sin venir" pos={{ l: 74, t: 258, w: 228, ml: 12, mt: 120, mw: 188 }}>
                <span className="bn-fila"><span className="bn-quien"><Av t="BO" tono="c" /><span><b>Bea</b><i>6 semanas sin venir</i></span></span></span>
              </Mini>
              <Mini etiqueta="Lo que espera tu visto bueno: una reserva por aprobar" pos={{ l: 196, t: 318, w: 214, ml: 80, mt: 142, mw: 230 }} clase="bn-no-m">
                <span className="bn-fila"><span><b>Reserva por aprobar</b><i>Valoración · jue 12:00</i></span><Tag t="Revisar" tono="osc" /></span>
              </Mini>
              <Movil cual="asistente" ancho={162} mancho={140} pos={{ r: 30, t: 152, mr: 10, mt: 116 }} />
            </div>
          </article>

          {/* 5 · Equipo */}
          <article className="bn-card bn-w5 bn-r3 bn-c2 lp-rv" style={{ ['--lp-r' as string]: 6 }} aria-labelledby="bn-eq-h">
            <Texto id="bn-eq-h" href="/funcionalidades/gestion-de-instructoras" titulo="Tu equipo, con su horario"
              texto="Cada instructora ve su agenda y marca su disponibilidad. Cuando hay una baja, la sustituta la apruebas tú."
              chips={['Disponibilidad', 'App de la instructora', 'Sustituciones con tu visto bueno']} />
            <div className="bn-st" style={{ ['--sh' as string]: '270px' }}>
              <Foto clave="equipo" pos={{ l: 0, r: 0, t: 206, b: 0, ml: 0, mr: 0, mt: 70, mb: 0 }} />
              <Mini etiqueta="Disponibilidad de Marta Ruiz esta semana: lunes, miércoles y viernes" pos={{ l: 24, t: 172, w: 230, ml: 16, mt: 40, mw: 232 }}>
                <span className="bn-fila"><span className="bn-quien"><Av t="MR" tono="o" /><span><b>Marta Ruiz</b><i>Esta semana</i></span></span>
                  <span className="bn-dias">{['L', 'M', 'X', 'J', 'V'].map((d, i) => <i key={d} className={i % 2 === 0 ? 'on' : ''}>{d}</i>)}</span></span>
              </Mini>
              <Mini etiqueta="Ausencia de vacaciones del 3 al 7 de noviembre" pos={{ r: 22, t: 250, w: 150, mr: 14, mt: 150, mw: 160 }}>
                <span className="bn-fila"><span><b>Vacaciones</b><i>3 – 7 nov</i></span><Tag t="Ausencia" tono="arena" /></span>
              </Mini>
            </div>
          </article>

          {/* 6 · Migración y soporte (ancha) */}
          <article className="bn-card bn-w12 bn-r4 bn-c3 lp-rv" aria-labelledby="bn-mig-h">
            <Texto id="bn-mig-h" href="/soluciones/cambiar-de-software" titulo="Cámbiate sin empezar de cero"
              texto="Trae tus alumnas y tus bonos desde Excel u otro programa y revisa los números. Si algo no sale, te responde una persona."
              chips={['Excel y otros programas', 'Botón para deshacer', 'Te responde una persona']} />
            <div className="bn-st" style={{ ['--sh' as string]: '260px' }}>
              <Mini etiqueta="Importando: alumnas, bonos y horario, todo revisado" pos={{ l: 520, t: 34, w: 232, ml: 14, mt: 4, mw: 240 }}>
                <b className="bn-m-tit">Importando desde Excel</b>
                <span className="bn-lista"><span><i className="bn-ck">✓</i>Alumnas</span><span><i className="bn-ck">✓</i>Bonos</span><span><i className="bn-ck">✓</i>Horario</span></span>
              </Mini>
              <Mini etiqueta="Botón para deshacer la importación" pos={{ l: 590, t: 156, w: 176, ml: 70, mt: 118, mw: 180 }}>
                <span className="bn-fila"><b>↶ Deshacer importación</b></span>
              </Mini>
              <Mini etiqueta="Soporte de Tentare: te responde una persona, por WhatsApp o por email" pos={{ r: 56, t: 52, w: 262, ml: 22, mt: 150, mw: 270 }}>
                <b className="bn-m-tit">¿Dudas? Te respondemos</b>
                <span className="bn-soporte">
                  <span className="bn-quien"><span className="bn-av bn-av-o bn-av-logo"><LogoTentare formato="isotipo" tinta="color" alto={12} decorativo /></span><span><b>Soporte de Tentare</b><i>Una persona, en español</i></span></span>
                </span>
                <span className="bn-fila bn-fila-pie"><Tag t="WhatsApp" tono="o" /><Tag t="Email" tono="o" /></span>
              </Mini>
            </div>
          </article>
        </div>

        <nav className="bn-mas-nav" aria-label="Seguir explorando Tentare">
          {MAS.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}
        </nav>
        <p className="bn-nota">Las pantallas y tarjetas son ejemplos con datos de muestra.</p>
      </div>

      <style>{`
        .bn { padding: clamp(56px,6vw,88px) clamp(16px,4vw,40px); }
        .bn-wrap { max-width: 1100px; margin: 0 auto; }
        .bn-h2 { margin: 0 auto 30px; max-width: 18em; text-align: center; font-size: clamp(25px,3.1vw,34px); font-weight: 600; line-height: 1.16; letter-spacing: -.03em; color: #1F2216; text-wrap: balance; }

        .bn-rejilla { display: grid; grid-template-columns: repeat(12,minmax(0,1fr)); gap: 12px; }
        .bn-w7 { grid-column: span 7; } .bn-w5 { grid-column: span 5; } .bn-w12 { grid-column: span 12; }
        .bn-card { position: relative; overflow: hidden; border-radius: 22px; }
        .bn-r1 { height: 372px; } .bn-r2 { height: 270px; } .bn-r3 { height: 398px; } .bn-r4 { height: 246px; }
        .bn-c1 { background: #E6EBDB; } .bn-c2 { background: #F0F2E7; } .bn-c3 { background: #E9EDDF; }

        .bn-t { position: relative; z-index: 3; padding: 26px 26px 0; max-width: 100%; }
        .bn-w12 .bn-t { max-width: 420px; }
        .bn-h3 { margin: 0 0 6px; font-size: 20px; font-weight: 600; line-height: 1.2; letter-spacing: -.02em; color: #1F2216; text-wrap: balance; }
        .bn-h3 a { color: inherit; text-decoration: none; }
        .bn-h3 a:hover { text-decoration: underline; text-underline-offset: 4px; }
        .bn-h3 a:focus-visible, .bn-mas-nav a:focus-visible { outline: 2px solid #343825; outline-offset: 3px; border-radius: 6px; }
        .bn-p { margin: 0 0 10px; max-width: 46ch; font-size: 13px; line-height: 1.5; color: #636758; text-wrap: pretty; }
        .bn-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
        .bn-chips li { padding: 4px 10px; border-radius: 999px; background: rgba(52,56,37,.07); font-size: 11px; font-weight: 500; color: #4A4E3D; }

        /* El escenario ocupa toda la tarjeta (por detrás del texto) en escritorio. */
        .bn-st { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
        .bn-e { position: absolute; left: var(--l, auto); right: var(--r, auto); top: var(--t, auto); bottom: var(--b, auto); width: var(--w, auto); }

        /* Tarjetita: blanca, plana, muy pequeña, sombra casi inexistente. */
        .bn-m { background: #fff; border-radius: 13px; padding: 8px 10px; font-size: 10px; line-height: 1.25; color: #1F2216; box-shadow: 0 1px 2px rgba(34,37,26,.05), 0 8px 18px -12px rgba(34,37,26,.12); }
        .bn-m-arena { background: #FBF5E6; }
        .bn-fila { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .bn-fila-pie { margin-top: 6px; justify-content: flex-start; }
        .bn-m b { display: block; font-size: 10.5px; font-weight: 600; }
        .bn-m i { display: block; font-style: normal; font-size: 9px; color: #7C806F; }
        .bn-m-tit { margin: 5px 0 1px; } .bn-m-sub { }
        .bn-mini-txt { font-size: 9px; color: #7C806F; }
        .bn-cifra { text-align: right; font-size: 11px; font-weight: 700; } .bn-cifra i { font-weight: 500; }
        .bn-ok { color: #2F6B4F; } .bn-warn { color: #B5701A; }
        .bn-hora { position: absolute; left: var(--l); top: var(--t); font-size: 9.5px; color: #8A8E7D; font-variant-numeric: tabular-nums; }
        .bn-quien { display: flex; align-items: center; gap: 7px; }
        .bn-av { display: grid; place-items: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: 99px; font-size: 8.5px; font-weight: 700; }
        .bn-av-a { background: #EBD9B4; color: #4B3E1B; } .bn-av-o { background: #D6DCC4; color: #343825; } .bn-av-c { background: #E8E3D2; color: #4A4535; }
        .bn-av-logo { background: #fff; box-shadow: 0 0 0 1px rgba(52,56,37,.1); } .bn-av-logo svg { width: 12px; height: auto; }
        .bn-tag { flex-shrink: 0; padding: 2px 6px; border-radius: 5px; font-size: 8.5px; font-weight: 700; letter-spacing: .02em; white-space: nowrap; }
        .bn-tag-ok { background: #E1EEDF; color: #2F6B4F; } .bn-tag-warn { background: #F7E9CC; color: #8F6215; }
        .bn-tag-arena { background: #EFE2C8; color: #5A4A1F; } .bn-tag-o { background: #E4E8D6; color: #343825; } .bn-tag-osc { background: #343825; color: #E9D9B6; }
        .bn-mapa-t { margin-bottom: 5px; }
        .bn-mapa { display: grid; grid-template-columns: repeat(7,1fr); gap: 4px; }
        .bn-pl { display: block; height: 11px; border-radius: 4px; background: #fff; border: 1px solid #C9CFB7; }
        .bn-pl-x { background: #E4E6DA; border-color: #E4E6DA; } .bn-pl-e { background: #343825; border-color: #343825; }
        .bn-dias { display: flex; gap: 3px; } .bn-dias i { display: grid !important; place-items: center; width: 14px; height: 14px; border-radius: 99px; background: #EEF0E6; font-size: 7.5px !important; font-weight: 600; color: #8A8E7D !important; }
        .bn-dias i.on { background: #343825; color: #E9D9B6 !important; }
        .bn-lista { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; font-size: 9.5px; color: #3B3F2C; } .bn-lista span { display: flex; align-items: center; gap: 6px; }
        .bn-ck { display: inline-grid !important; place-items: center; width: 13px; height: 13px; border-radius: 99px; background: #E1EEDF; color: #2F6B4F !important; font-size: 8px !important; font-weight: 800; }
        .bn-soporte { display: block; margin-top: 6px; }

        /* Aviso al estilo de iOS: 18 px de radio, translúcido con desenfoque, icono de app a la izquierda, hora a la derecha. */
        .bn-aviso { display: flex; align-items: center; gap: 8px; padding: 8px 10px 8px 8px; border-radius: 18px; background: rgba(255,255,255,.78);
          -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5);
          box-shadow: 0 1px 2px rgba(34,37,26,.05), 0 8px 18px -12px rgba(34,37,26,.14); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-ui), system-ui, sans-serif; }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .bn-aviso { background: #FBFAF5; } }
        .bn-aviso-i { flex-shrink: 0; display: grid; place-items: center; width: 28px; height: 28px; background: #fff; }
        .bn-aviso-i svg { width: 15px; height: auto; }
        .bn-aviso-t { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }
        .bn-aviso-t b { font-size: 10.5px; font-weight: 600; color: #1A1A1A; } .bn-aviso-t span { font-size: 10px; color: #3C3C43; }
        .bn-aviso time { align-self: flex-start; font-size: 9px; color: #6B6B73; }
        .bn-squircle { clip-path: url(#bn-squircle); }
        .bn-tile-caja { display: flex; flex-direction: column; align-items: center; gap: 5px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-ui), system-ui, sans-serif; }
        .bn-tile { display: grid; place-items: center; width: 46px; height: 46px; background: linear-gradient(160deg,#fff,#EDEBDD); filter: drop-shadow(0 6px 10px rgba(34,37,26,.16)); }
        .bn-tile svg { width: 26px; height: auto; }
        .bn-tile-et { font-size: 9.5px; font-weight: 500; color: #3B3F2C; }

        /* Móvil que asoma: bisel fino, isla y pantalla real, cortado por el borde de abajo. */
        .bn-tel { width: var(--tw, 150px); padding: 14px 4px 0; border-radius: 24px 24px 0 0; background: #1B1D14; box-shadow: 0 30px 50px -28px rgba(34,37,26,.4); overflow: hidden; }
        .bn-tel img { display: block; width: 100%; height: auto; border-radius: 20px 20px 0 0; }
        .bn-tel-isla { position: absolute; top: 4px; left: 50%; width: 26%; height: 6px; border-radius: 99px; background: #0B0C07; transform: translateX(-50%); }
        .bn-foto { overflow: hidden; background: transparent; }
        .bn-foto[data-hueco="app"] { border-radius: 20px 20px 0 0; }
        .bn-foto picture, .bn-foto img { display: block; width: 100%; height: 100%; } .bn-foto img { object-fit: cover; }
        
        .bn-mas-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 22px; margin-top: 22px; }
        .bn-mas-nav a { display: inline-flex; align-items: center; min-height: 40px; font-size: 13px; font-weight: 600; color: #4A4E3D; }
        .bn-mas-nav a:hover { color: #1F2216; text-decoration: underline; text-underline-offset: 4px; }
        .bn-nota { margin: 4px 0 0; text-align: center; font-size: 11.5px; color: #8A8E7D; }

        @media (max-width: 960px) {
          .bn-w7, .bn-w5, .bn-w12 { grid-column: span 12; }
          .bn-w12 .bn-t { max-width: none; }
          .bn-r1, .bn-r2, .bn-r3, .bn-r4 { height: 340px; }
        }

        /* Móvil: una columna, tarjetas compactas; el escenario pasa debajo del texto y las piezas se recolocan a tamaño legible. */
        @media (max-width: 700px) {
          .bn-h2 { margin-bottom: 20px; }
          .bn-card { height: auto !important; border-radius: 20px; }
          .bn-t { padding: 22px 20px 0; }
          .bn-st { position: relative; inset: auto; height: var(--sh, 250px); margin-top: 12px; }
          .bn-e { left: var(--ml, auto); right: var(--mr, auto); top: var(--mt, auto); bottom: var(--mb, auto); width: var(--mw, auto); }
          .bn-tel { width: var(--mtw, var(--tw, 150px)); }
          .bn-hora, .bn-no-m { display: none !important; }
          .bn-foto { border-radius: 0; }
          .bn-c3 .bn-st, .bn-c1 .bn-st { }
        }
      `}</style>
    </section>
  );
}
