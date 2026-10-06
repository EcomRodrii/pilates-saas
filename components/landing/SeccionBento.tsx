import Link from 'next/link';
import {
  ArrowRight, Bell, CalendarCheck, Check, FileSpreadsheet, LifeBuoy, RefreshCw, Send, UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { PLANS } from './data';
import { TRIAL_DIAS } from '@/lib/billing/trial';

// «Todo lo que necesita un estudio, en una sola plataforma» — la rejilla de
// capacidades (encargo del fundador, 6-oct-2026).
//
// DÓNDE VA y por qué: entre el calendario («y por la mañana, solo lo que
// necesita tu decisión») y «Detrás de Tentare hay personas». Hasta ahí la
// página cuenta la historia en profundidad (reserva → baja → noche → mañana);
// esto es el resumen de TODO lo que Tentare hace, justo antes de pedirle
// confianza (personas, precio, dudas). Más arriba habría resumido lo que aún no
// se ha contado; más abajo, tras «personas», rompería el paso de la confianza a
// la oferta.
//
// Es un Server Component: no entra ni un byte de este texto en el JavaScript de
// la home (LandingCliente la recibe ya pintada, como las guías). Todo lo
// dibujado son miniaturas del producto en HTML y CSS —no capturas—, con datos de
// MUESTRA: van `aria-hidden` y la nota del pie lo dice. Sin Tenti: la web
// comercial está vetada en lib/tenti/donde-vive-tenti.test.ts.
//
// ⚠️ TODA frase de promesa de aquí está cruzada con el código (lista en el PR):
//   · el asistente CONSULTA y PROPONE clases, salas, eventos y citas; nada se
//     crea sin confirmar, y no cobra, borra, edita ni escribe a nadie
//     (lib/asistente/herramientas/definiciones.ts: solo `proponer_*` y consultas);
//   · la sustitución espera tu visto bueno en el modo por defecto (asistido);
//     el autónomo es del plan Estudio (`sustitucionesAutonomas`);
//   · Centro de Control y sus resúmenes, plan Estudio (`decisiones`);
//   · varias sedes, plan Cadena (`multiCentro`), sin vista que las sume;
//   · nada de cifras ni de «automático» donde hay visto bueno.
// Nada de lo congelado (Kiosko, VOD, Chat de equipo, Network).

const PRECIO_DESDE = PLANS[0].price.replace('€', ' €');

interface Tarjeta {
  id: string;
  ancho: 5 | 7;
  oscura?: boolean;
  titulo: string;
  texto: string;
  chips: string[];
  enlace: { href: string; label: string };
  visual: React.ReactNode;
}

// ── Miniaturas ───────────────────────────────────────────────────────────────

function VisualReservas() {
  const plazas = ['t', 't', 'l', 'e', 't', 'l', 'l', 't'] as const; // tomada / libre / elegida
  return (
    <div className="bn-v bn-v-reservas">
      <div className="bn-clase bn-clase-1">
        <span className="bn-hora">09:00</span>
        <span className="bn-clase-n">Reformer Flow<small>Sala 1</small></span>
        <span className="bn-pill">10/10</span>
      </div>
      <div className="bn-clase bn-clase-2">
        <span className="bn-hora">10:15</span>
        <span className="bn-clase-n">Pilates Mat<small>Sala 2</small></span>
        <span className="bn-pill bn-pill-espera">+2 en espera</span>
      </div>
      <div className="bn-clase bn-clase-3">
        <div className="bn-clase-fila">
          <span className="bn-hora">19:00</span>
          <span className="bn-clase-n">Reformer Avanzado<small>Elige tu reformer</small></span>
          <span className="bn-pill">5/8</span>
        </div>
        <div className="bn-plazas">
          {plazas.map((p, i) => <span key={i} className={`bn-plaza bn-plaza-${p}`}>{i + 1}</span>)}
        </div>
      </div>
    </div>
  );
}

function VisualApp() {
  return (
    <div className="bn-v bn-v-app">
      <div className="bn-movil">
        <div className="bn-movil-isla" />
        <div className="bn-movil-cab">
          <span className="bn-movil-logo">A</span>
          <span><b>Estudio Aire</b><small>Hola, Lucía</small></span>
        </div>
        <div className="bn-movil-prox">
          <small>Tu próxima clase</small>
          <b>Hoy · 19:00</b>
          <span>Reformer Flow · plaza 4</span>
          <i><Check size={11} strokeWidth={3} aria-hidden /> Reservada</i>
        </div>
        <div className="bn-movil-bono">
          <span>Bono de 10 clases</span>
          <div className="bn-barra"><span style={{ width: '60%' }} /></div>
          <small>Te quedan 6</small>
        </div>
        <div className="bn-movil-tabs"><span className="on" /><span /><span /><span /></div>
      </div>
    </div>
  );
}

function VisualCobros() {
  const filas: { n: string; c: string; e: string; t: 'ok' | 're' | 'fa' }[] = [
    { n: 'Cuota mensual · Ana', c: 'Tarjeta', e: 'Cobrado', t: 'ok' },
    { n: 'Cuota mensual · Marta', c: 'SEPA', e: 'Se reintenta mañana', t: 're' },
    { n: 'Bono 10 clases · Carmen', c: 'Bizum', e: 'Cobrado', t: 'ok' },
  ];
  return (
    <div className="bn-v bn-v-cobros">
      {filas.map((f) => (
        <div key={f.n} className="bn-recibo">
          <span className="bn-recibo-i"><Check size={13} strokeWidth={3} aria-hidden /></span>
          <span className="bn-recibo-n">{f.n}<small>{f.c}</small></span>
          <span className={`bn-estado bn-estado-${f.t}`}>{f.e}</span>
        </div>
      ))}
      <div className="bn-recibo bn-recibo-factura">
        <span className="bn-recibo-i"><RefreshCw size={13} aria-hidden /></span>
        <span className="bn-recibo-n">Factura emitida con numeración legal<small>Se envía a la alumna</small></span>
      </div>
    </div>
  );
}

function VisualDecisiones() {
  const filas: { Icono: LucideIcon; t: string; s: string; b: string }[] = [
    { Icono: UserCheck, t: 'Sustitución propuesta', s: 'Reformer Avanzado · lun 08:30', b: 'Dar visto bueno' },
    { Icono: CalendarCheck, t: 'Reserva por aprobar', s: 'Clase de valoración · jue 12:00', b: 'Revisar' },
    { Icono: RefreshCw, t: 'Cobro que no ha pasado', s: 'Cuota de Marta · SEPA', b: 'Ver recibo' },
  ];
  return (
    <div className="bn-v bn-v-decisiones">
      <div className="bn-panel">
        <div className="bn-panel-cab"><b>Por decidir</b><span className="bn-contador">3</span></div>
        {filas.map(({ Icono, t, s, b }) => (
          <div key={t} className="bn-decision">
            <span className="bn-decision-i"><Icono size={15} aria-hidden /></span>
            <span className="bn-decision-t">{t}<small>{s}</small></span>
            <span className="bn-btn-mini">{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualSustituciones() {
  const pasos: { h: string; t: string; s?: string; on?: boolean }[] = [
    { h: '16:42', t: 'Julia no puede dar su clase de las 19:00', s: 'Reformer Avanzado · Sala 1' },
    { h: '16:42', t: 'Tentare propone a quién avisar', s: 'Por disponibilidad y costumbre horaria' },
    { h: '16:50', t: 'Tú das el visto bueno', on: true },
    { h: '17:05', t: 'Sara acepta y la clase queda cubierta', s: 'Las alumnas siguen con su reserva' },
  ];
  return (
    <div className="bn-v bn-v-sust">
      <ol className="bn-linea">
        {pasos.map((p) => (
          <li key={p.h + p.t} className={p.on ? 'bn-paso bn-paso-on' : 'bn-paso'}>
            <span className="bn-paso-h">{p.h}</span>
            <span className="bn-paso-t">{p.t}{p.s && <small>{p.s}</small>}</span>
          </li>
        ))}
      </ol>
      <div className="bn-candidatas">
        {['Sara', 'Marta', 'Lucía'].map((n, i) => (
          <span key={n} className="bn-cand">
            <span className="bn-cand-av">{n[0]}</span>{n}
            <span className="bn-cand-barra"><span style={{ width: `${88 - i * 18}%` }} /></span>
          </span>
        ))}
      </div>
    </div>
  );
}

function VisualEquipo() {
  const dias = ['L', 'M', 'X', 'J', 'V'];
  // Disponibilidad de una instructora de muestra: mañana / mediodía / tarde.
  const rejilla = [
    [1, 0, 1, 0, 1],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 0],
  ];
  return (
    <div className="bn-v bn-v-equipo">
      <div className="bn-equipo-cab"><span className="bn-cand-av">J</span><b>Julia<small>Disponibilidad de la semana</small></b></div>
      <div className="bn-rejilla">
        {dias.map((d) => <span key={d} className="bn-rejilla-d">{d}</span>)}
        {rejilla.flat().map((v, i) => <span key={i} className={v ? 'bn-celda bn-celda-on' : 'bn-celda'} />)}
      </div>
      <div className="bn-ausencia"><CalendarCheck size={13} aria-hidden /> Ausencia · 3 – 7 nov · vacaciones</div>
    </div>
  );
}

function VisualNoche() {
  const avisos = [
    'Plaza liberada: la ocupa la lista de espera',
    'Recordatorio de las clases de mañana enviado',
    'Cuota reintentada y cobrada',
    'Bono a punto de agotarse: aviso a Ana',
  ];
  return (
    <div className="bn-v bn-v-noche">
      {avisos.map((a, i) => (
        <div key={a} className="bn-aviso" style={{ ['--i' as string]: i }}>
          <span className="bn-aviso-i"><Bell size={12} aria-hidden /></span>{a}
        </div>
      ))}
    </div>
  );
}

function VisualAsistente() {
  return (
    <div className="bn-v bn-v-asist">
      <div className="bn-burbuja bn-burbuja-yo">Crea una clase de Reformer Flow el jueves a las 19:00 en la sala 1</div>
      <div className="bn-burbuja bn-burbuja-t">
        Te la preparo. Revísala antes de crearla:
        <div className="bn-propuesta">
          <b>Reformer Flow</b>
          <span>Jueves · 19:00 · Sala 1</span>
          <div className="bn-propuesta-acc"><span className="bn-btn-mini bn-btn-mini-arena">Confirmar</span><span className="bn-btn-mini bn-btn-mini-lin">Cancelar</span></div>
        </div>
        <small>No se crea nada hasta que confirmes.</small>
      </div>
      <div className="bn-entrada"><span>Pregúntale a Tentare…</span><Send size={14} aria-hidden /></div>
    </div>
  );
}

function VisualMigracion() {
  const filas = ['Alumnas', 'Bonos y cuotas', 'Reservas', 'Clases y horario'];
  return (
    <div className="bn-v bn-v-migra">
      <div className="bn-acta">
        <div className="bn-acta-cab"><FileSpreadsheet size={15} aria-hidden /><b>Acta de importación</b><span className="bn-etiqueta">Ejemplo</span></div>
        {filas.map((f) => (
          <div key={f} className="bn-acta-fila"><span className="bn-recibo-i"><Check size={12} strokeWidth={3} aria-hidden /></span>{f}<span className="bn-acta-ok">Revisado</span></div>
        ))}
        <div className="bn-acta-acc"><span className="bn-btn-mini bn-btn-mini-arena">Confirmar</span><span className="bn-btn-mini bn-btn-mini-lin">Deshacer la importación</span></div>
      </div>
    </div>
  );
}

function VisualSoporte() {
  return (
    <div className="bn-v bn-v-soporte">
      <div className="bn-contacto"><LifeBuoy size={16} aria-hidden /><span>Te responde una persona<small>Por WhatsApp o por email, en español</small></span></div>
      <ul className="bn-datos">
        <li><b>{TRIAL_DIAS} días</b> gratis, sin tarjeta</li>
        <li><b>Sin permanencia</b>, mes a mes</li>
        <li>Precio público, <b>desde {PRECIO_DESDE}/mes</b></li>
      </ul>
    </div>
  );
}

// ── Contenido ────────────────────────────────────────────────────────────────

const TARJETAS: Tarjeta[] = [
  {
    id: 'reservas', ancho: 7,
    titulo: 'De la reserva a la clase, sin una llamada',
    texto:
      'Tus alumnas encuentran su hueco, eligen su reformer y reservan desde el móvil. Si la clase está llena, entran en la lista de espera y la plaza que se libera pasa a la siguiente.',
    chips: ['Elige su reformer', 'Lista de espera', 'Clase fija', 'Reservas en tu web'],
    enlace: { href: '/funcionalidades/reservas-online', label: 'Cómo funcionan las reservas online' },
    visual: <VisualReservas />,
  },
  {
    id: 'app', ancho: 5,
    titulo: 'Una app con tu nombre, no con el nuestro',
    texto:
      'La app de tus alumnas lleva el logo y los colores de tu estudio. Se añade a la pantalla de inicio del móvil y desde ella reservan, ven su bono y pagan sus recibos.',
    chips: ['Tu logo y tus colores', 'Se instala desde el móvil', 'Avisos en el móvil'],
    enlace: { href: '/funcionalidades/app-para-alumnas', label: 'Ver la app para alumnas' },
    visual: <VisualApp />,
  },
  {
    id: 'cobros', ancho: 5,
    titulo: 'Bonos, cuotas y cobros que cuadran',
    texto:
      'Vende bonos y cuotas mensuales, cobra con tarjeta o domiciliación SEPA y deja que un cobro fallido se reintente solo. Cada cobro tiene su recibo y su factura.',
    chips: ['Tarjeta y SEPA', 'Bizum en pagos sueltos', 'Reintento de cobros', 'Facturas con numeración legal'],
    enlace: { href: '/funcionalidades/cobros-recurrentes', label: 'Cómo funcionan los cobros recurrentes' },
    visual: <VisualCobros />,
  },
  {
    id: 'decisiones', ancho: 7,
    titulo: 'Cada mañana, solo lo que necesita tu criterio',
    texto:
      'El calendario te enseña por sala qué ocurre esta semana y reúne en un solo sitio lo que espera tu visto bueno: una sustitución, una reserva por aprobar, un cobro que no ha pasado. Lo demás ya está resuelto.',
    chips: ['Calendario por sala', 'Lo que espera tu visto bueno', 'Centro de Control (plan Estudio)'],
    enlace: { href: '/funcionalidades/calendario-y-salas', label: 'Ver el calendario y las salas' },
    visual: <VisualDecisiones />,
  },
  {
    id: 'sustituciones', ancho: 7,
    titulo: 'Cuando una instructora cancela, no te toca a ti',
    texto:
      'Tentare propone a quién avisar según su disponibilidad y su costumbre horaria. Das tu visto bueno, la candidata acepta y la clase queda cubierta. Si nadie acepta, te avisa para que decidas tú.',
    chips: ['Ranking de candidatas', 'Con tu visto bueno', 'Modo autónomo (plan Estudio)', 'Aviso si nadie acepta'],
    enlace: { href: '/funcionalidades/sustituciones', label: 'Cómo funcionan las sustituciones' },
    visual: <VisualSustituciones />,
  },
  {
    id: 'equipo', ancho: 5,
    titulo: 'Tu equipo, con su propio horario',
    texto:
      'Cada instructora ve su agenda, marca cuándo puede dar clase y cuándo no, y avisa de una baja con su motivo desde su app. Con varias sedes, un solo acceso y un selector de sede (plan Cadena).',
    chips: ['Disponibilidad y ausencias', 'App de la instructora', 'Pasar lista'],
    enlace: { href: '/funcionalidades/gestion-de-instructoras', label: 'Ver la gestión de instructoras' },
    visual: <VisualEquipo />,
  },
  {
    id: 'noche', ancho: 5,
    titulo: 'Mientras cierras, el estudio sigue',
    texto:
      'Recordatorios de clase, plazas liberadas que ocupa la lista de espera, avisos de bono a punto de agotarse y cobros reintentados. Trabajo hecho, no una bandeja de avisos por leer.',
    chips: ['Recordatorios de clase', 'Avisos de bono', 'Cobros reintentados'],
    enlace: { href: '/funcionalidades/automatizaciones-y-avisos', label: 'Ver las automatizaciones y avisos' },
    visual: <VisualNoche />,
  },
  {
    id: 'asistente', ancho: 7, oscura: true,
    titulo: 'Pregúntale a Tentare',
    texto:
      'Un asistente que responde con los datos de tu estudio —quién lleva semanas sin venir, qué clases tienen huecos— y prepara clases, salas, eventos y citas. Siempre te enseña lo que va a crear y espera tu confirmación. No cobra, no borra, no edita y no escribe a tus alumnas.',
    chips: ['Consulta tus datos', 'Crea clases, salas, eventos y citas', 'Siempre con tu confirmación'],
    enlace: { href: '/precios', label: 'Qué incluye cada plan' },
    visual: <VisualAsistente />,
  },
  {
    id: 'migracion', ancho: 7,
    titulo: 'Cambiarte de programa, sin empezar de cero',
    texto:
      'Trae tus alumnas, tus bonos, tus reservas y tu horario desde Excel o desde el programa que usas ahora. Antes de dar nada por bueno ves un acta con los números, y si algo no te convence lo deshaces con un botón. Si lo prefieres, lo hacemos contigo.',
    chips: ['Excel y otros programas', 'Acta con los números', 'Botón para deshacer', 'Te ayudamos'],
    enlace: { href: '/soluciones/cambiar-de-software', label: 'Cómo es cambiarte a Tentare' },
    visual: <VisualMigracion />,
  },
  {
    id: 'soporte', ancho: 5,
    titulo: 'Una persona al otro lado, desde el primer día',
    texto:
      'Si algo no sale, escribes por WhatsApp o por email y te responde alguien que conoce un estudio. Pruebas sin tarjeta, pagas mes a mes y puedes irte cuando quieras.',
    chips: ['WhatsApp y email', 'Sin permanencia', `${TRIAL_DIAS} días sin tarjeta`],
    enlace: { href: '/sobre-tentare', label: 'Quién está detrás de Tentare' },
    visual: <VisualSoporte />,
  },
];

const MAS: { href: string; label: string }[] = [
  { href: '/funcionalidades', label: 'Todas las funcionalidades' },
  { href: '/precios', label: 'Planes y precios' },
  { href: '/soluciones/estudio-de-pilates-reformer', label: 'Software para estudios de Pilates reformer' },
  { href: '/recursos', label: 'Guías para dueñas de estudios' },
  { href: '/comparativa', label: 'Comparativa de programas' },
  { href: '/glosario', label: 'Glosario de gestión de estudios' },
];

export function SeccionBento() {
  return (
    <section id="plataforma" className="bn" aria-labelledby="bn-h">
      <div className="bn-wrap">
        <header className="bn-head lp-rv">
          <h2 id="bn-h" className="bn-h2">Todo lo que necesita tu estudio de Pilates, en una sola plataforma.</h2>
          <p className="bn-lead">
            Reservas, app para tus alumnas, cobros, equipo y un asistente que conoce tus datos. Un programa para
            centros de Pilates pensado para quien lleva el estudio, da clase y contesta mensajes a la vez.
          </p>
        </header>

        <div className="bn-rejilla-tarjetas">
          {TARJETAS.map((t, n) => (
            <article
              key={t.id}
              className={`bn-card bn-w${t.ancho}${t.oscura ? ' bn-card-oscura' : ''} lp-rv`}
              style={{ ['--lp-r' as string]: (n % 2) * 6 }}
              aria-labelledby={`bn-${t.id}-h`}
            >
              <div className="bn-texto">
                <h3 id={`bn-${t.id}-h`} className="bn-h3">{t.titulo}</h3>
                <p className="bn-p">{t.texto}</p>
                <ul className="bn-chips">
                  {t.chips.map((c) => <li key={c}>{c}</li>)}
                </ul>
                <Link href={t.enlace.href} className="bn-mas lp-flecha">{t.enlace.label} <ArrowRight size={14} aria-hidden /></Link>
              </div>
              <div className="bn-visual" aria-hidden="true">{t.visual}</div>
            </article>
          ))}
        </div>

        <p className="bn-nota">Las pantallas de estas tarjetas son ejemplos con datos de muestra.</p>

        <nav className="bn-mas-nav" aria-label="Seguir explorando Tentare">
          {MAS.map((l) => (
            <Link key={l.href} href={l.href} className="bn-salida lp-flecha">{l.label} <ArrowRight size={14} aria-hidden /></Link>
          ))}
        </nav>
      </div>

      <style>{`
        .bn { padding: clamp(64px,7vw,104px) clamp(20px,4vw,48px); }
        .bn-wrap { max-width: 1240px; margin: 0 auto; }
        .bn-head { max-width: 780px; margin: 0 auto clamp(32px,4vw,52px); text-align: center; }
        .bn-h2 { margin: 0 0 16px; font-size: clamp(28px,4vw,52px); font-weight: 800; line-height: 1.04; letter-spacing: -.04em; text-wrap: balance; color: #1F2216; }
        .bn-lead { margin: 0 auto; max-width: 60ch; font-size: clamp(16px,1.4vw,18px); line-height: 1.6; color: #5A5A52; text-wrap: pretty; }

        .bn-rejilla-tarjetas { display: grid; grid-template-columns: repeat(12,minmax(0,1fr)); gap: 16px; }
        .bn-w7 { grid-column: span 7; } .bn-w5 { grid-column: span 5; }

        .bn-card { position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: 28px;
          background: #F8F7F2; border: 1px solid #E2E1D8; min-height: 420px; }
        .bn-card-oscura { background: #2B2F1E; border-color: #2B2F1E; color: #F1F2EA; }
        .bn-texto { padding: clamp(22px,2.6vw,34px) clamp(22px,2.6vw,34px) 0; position: relative; z-index: 1; }
        .bn-h3 { margin: 0 0 10px; font-size: clamp(20px,1.9vw,25px); font-weight: 800; line-height: 1.12; letter-spacing: -.03em; color: #1F2216; text-wrap: balance; }
        .bn-p { margin: 0 0 16px; max-width: 54ch; font-size: 15px; line-height: 1.6; color: #5A5A52; text-wrap: pretty; }
        .bn-card-oscura .bn-h3 { color: #fff; }
        .bn-card-oscura .bn-p { color: #C9CCB8; }

        .bn-chips { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .bn-chips li { padding: 6px 12px; border-radius: 999px; background: #fff; border: 1px solid #E2E1D8; font-size: 12.5px; font-weight: 600; color: #3B3B34; }
        .bn-card-oscura .bn-chips li { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.16); color: #E8E9DC; }
        .bn-mas { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 14px; font-weight: 700; color: #343825; }
        .bn-mas:hover, .bn-salida:hover { text-decoration: underline; text-underline-offset: 4px; }
        .bn-card-oscura .bn-mas { color: #D9C29E; }
        .bn-mas:focus-visible, .bn-salida:focus-visible { outline: 2px solid #343825; outline-offset: 3px; border-radius: 6px; }
        .bn-card-oscura .bn-mas:focus-visible { outline-color: #D9C29E; }

        .bn-visual { position: relative; flex: 1; min-height: 250px; margin-top: 6px; padding: 0 clamp(18px,2.4vw,32px); }
        .bn-v { position: relative; height: 100%; }
        .bn-v small { display: block; font-size: 11.5px; font-weight: 500; color: #6B6B63; line-height: 1.3; }
        .bn-card-oscura .bn-v small { color: #A6A99A; }

        /* Mini-UI: la misma tarjeta blanca de la cabecera (borde fino, sombra suave). */
        .bn-clase, .bn-panel, .bn-recibo, .bn-acta, .bn-contacto, .bn-aviso, .bn-movil, .bn-rejilla, .bn-linea {
          background: #fff; border: 1px solid rgba(52,56,37,.08); box-shadow: 0 18px 36px -22px rgba(34,37,26,.4), 0 1px 3px rgba(34,37,26,.06); }
        .bn-hora { font-size: 12px; font-weight: 700; color: #5A5E48; font-variant-numeric: tabular-nums; }
        .bn-pill { padding: 3px 9px; border-radius: 999px; background: #F1F2EA; font-size: 11.5px; font-weight: 700; color: #343825; white-space: nowrap; }
        .bn-pill-espera { background: #D9C29E; }
        .bn-btn-mini { display: inline-block; padding: 6px 11px; border-radius: 999px; background: #343825; color: #D9C29E; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
        .bn-btn-mini-arena { background: #D9C29E; color: #2B2F1E; }
        .bn-btn-mini-lin { background: transparent; border: 1px solid currentColor; color: inherit; opacity: .8; }
        .bn-etiqueta { margin-left: auto; padding: 2px 8px; border-radius: 999px; background: #F1F2EA; font-size: 10.5px; font-weight: 700; color: #5A5E48; }

        /* Reservas */
        .bn-v-reservas { display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
        .bn-clase { display: flex; flex-direction: column; gap: 10px; padding: 11px 14px; border-radius: 16px; width: min(420px, 92%); }
        .bn-clase, .bn-clase-fila { font-size: 13.5px; }
        .bn-clase:not(.bn-clase-3) { flex-direction: row; align-items: center; gap: 12px; }
        .bn-clase-fila { display: flex; align-items: center; gap: 12px; }
        .bn-clase-n { flex: 1; font-weight: 700; color: #1F2216; letter-spacing: -.01em; }
        .bn-clase-2 { margin-left: clamp(24px,7vw,70px); }
        .bn-clase-3 { margin-left: clamp(8px,3vw,28px); background: #FBF4E6; border-color: rgba(217,194,158,.7); }
        .bn-plazas { display: flex; gap: 6px; flex-wrap: wrap; }
        .bn-plaza { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px; font-size: 11.5px; font-weight: 700; }
        .bn-plaza-t { background: #E2E1D8; color: #8A8A80; }
        .bn-plaza-l { background: #fff; border: 1.5px solid #B9BFA3; color: #5A5E48; }
        .bn-plaza-e { background: #343825; color: #D9C29E; box-shadow: 0 0 0 3px rgba(217,194,158,.7); }

        /* App */
        .bn-v-app { display: flex; justify-content: center; overflow: hidden; }
        .bn-movil { position: relative; width: min(250px,78%); margin-top: 4px; padding: 26px 14px 16px; border-radius: 34px 34px 0 0;
          border-width: 6px 6px 0; border-color: #2B2F1E; display: flex; flex-direction: column; gap: 10px; height: 270px; }
        .bn-movil-isla { position: absolute; top: 8px; left: 50%; width: 64px; height: 16px; border-radius: 999px; background: #2B2F1E; transform: translateX(-50%); }
        .bn-movil-cab { display: flex; align-items: center; gap: 9px; font-size: 13px; }
        .bn-movil-cab b { display: block; color: #1F2216; }
        .bn-movil-logo { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: #343825; color: #D9C29E; font-weight: 800; }
        .bn-movil-prox { display: flex; flex-direction: column; gap: 2px; padding: 11px 12px; border-radius: 14px; background: #343825; color: #fff; font-size: 12px; }
        .bn-movil-prox small { color: #C9CCB8; } .bn-movil-prox b { font-size: 15px; }
        .bn-movil-prox i { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; margin-top: 4px; padding: 2px 8px; border-radius: 999px; background: #D9C29E; color: #2B2F1E; font-style: normal; font-weight: 700; font-size: 11px; }
        .bn-movil-bono { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-radius: 14px; background: #F1F2EA; font-size: 12px; font-weight: 700; color: #1F2216; }
        .bn-barra { height: 6px; border-radius: 99px; background: #DADCCB; overflow: hidden; } .bn-barra span { display: block; height: 100%; border-radius: inherit; background: #343825; }
        .bn-movil-tabs { display: flex; justify-content: space-around; margin-top: auto; } .bn-movil-tabs span { width: 22px; height: 4px; border-radius: 4px; background: #DADCCB; } .bn-movil-tabs .on { background: #343825; }

        /* Cobros */
        .bn-v-cobros { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
        .bn-recibo { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; font-size: 13px; }
        .bn-recibo-i { flex-shrink: 0; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 8px; background: #F1F2EA; color: #343825; }
        .bn-recibo-n { flex: 1; min-width: 0; font-weight: 700; color: #1F2216; }
        .bn-estado { flex-shrink: 0; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
        .bn-estado-ok { background: rgba(47,107,79,.12); color: #2F6B4F; }
        .bn-estado-re { background: rgba(143,98,21,.13); color: #8F6215; }
        .bn-recibo-factura { background: #FBF4E6; }

        /* Decisiones */
        .bn-v-decisiones { padding-top: 4px; }
        .bn-panel { max-width: 560px; border-radius: 18px; padding: 8px 8px 4px; }
        .bn-panel-cab { display: flex; align-items: center; gap: 8px; padding: 8px 10px 10px; font-size: 14px; color: #1F2216; }
        .bn-contador { display: inline-grid; place-items: center; min-width: 22px; height: 22px; border-radius: 99px; background: #343825; color: #D9C29E; font-size: 12px; font-weight: 800; }
        .bn-decision { display: flex; align-items: center; gap: 10px; padding: 10px; border-top: 1px solid #EEEEE8; }
        .bn-decision-i { flex-shrink: 0; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; background: #F1F2EA; color: #343825; }
        .bn-decision-t { flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; color: #1F2216; }

        /* Sustituciones */
        .bn-v-sust { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: 14px; align-items: start; padding-top: 4px; }
        .bn-linea { list-style: none; margin: 0; padding: 12px 14px; border-radius: 18px; display: flex; flex-direction: column; gap: 11px; }
        .bn-paso { display: flex; gap: 12px; font-size: 13px; }
        .bn-paso-h { flex-shrink: 0; width: 38px; font-weight: 700; color: #5A5E48; font-variant-numeric: tabular-nums; }
        .bn-paso-t { font-weight: 700; color: #1F2216; line-height: 1.35; }
        .bn-paso-on .bn-paso-t { color: #343825; }
        .bn-paso-on .bn-paso-t::after { content: 'Visto bueno'; display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 99px; background: #D9C29E; font-size: 10.5px; color: #2B2F1E; }
        .bn-candidatas { display: flex; flex-direction: column; gap: 8px; }
        .bn-cand { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 14px; background: #fff; border: 1px solid rgba(52,56,37,.08); font-size: 13px; font-weight: 700; color: #1F2216; box-shadow: 0 10px 24px -18px rgba(34,37,26,.4); }
        .bn-cand-av { display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border-radius: 99px; background: #D9C29E; color: #2B2F1E; font-size: 11.5px; font-weight: 800; }
        .bn-cand-barra { margin-left: auto; width: 44px; height: 5px; border-radius: 99px; background: #E2E1D8; overflow: hidden; } .bn-cand-barra span { display: block; height: 100%; background: #343825; }

        /* Equipo */
        .bn-v-equipo { display: flex; flex-direction: column; gap: 10px; }
        .bn-equipo-cab { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: #1F2216; }
        .bn-rejilla { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; padding: 12px; border-radius: 16px; max-width: 360px; }
        .bn-rejilla-d { text-align: center; font-size: 11px; font-weight: 700; color: #6B6B63; }
        .bn-celda { height: 22px; border-radius: 7px; background: #F1F2EA; } .bn-celda-on { background: #343825; }
        .bn-ausencia { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 7px 12px; border-radius: 99px; background: #D9C29E; font-size: 12px; font-weight: 700; color: #2B2F1E; }

        /* Noche */
        .bn-v-noche { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
        .bn-aviso { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; font-size: 13px; font-weight: 600; color: #1F2216; width: min(94%, 400px); }
        .bn-aviso:nth-child(even) { margin-left: auto; }
        .bn-aviso-i { flex-shrink: 0; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: #343825; color: #D9C29E; }

        /* Asistente */
        .bn-v-asist { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; max-width: 560px; }
        .bn-burbuja { padding: 10px 14px; border-radius: 16px; font-size: 13.5px; line-height: 1.45; max-width: 88%; }
        .bn-burbuja-yo { align-self: flex-end; background: #D9C29E; color: #2B2F1E; font-weight: 600; border-bottom-right-radius: 5px; }
        .bn-burbuja-t { align-self: flex-start; background: rgba(255,255,255,.1); color: #F1F2EA; border-bottom-left-radius: 5px; }
        .bn-propuesta { display: flex; flex-direction: column; gap: 3px; margin: 8px 0; padding: 10px 12px; border-radius: 12px; background: #F8F7F2; color: #1F2216; font-size: 13px; }
        .bn-propuesta span:not(.bn-btn-mini) { color: #5A5E48; font-weight: 600; font-size: 12px; }
        .bn-propuesta-acc { display: flex; gap: 8px; margin-top: 6px; }
        .bn-propuesta .bn-btn-mini-lin { color: #343825; }
        .bn-entrada { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding: 11px 14px; border-radius: 99px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); font-size: 13px; color: #A6A99A; }

        /* Migración */
        .bn-v-migra { padding-top: 4px; }
        .bn-acta { max-width: 520px; border-radius: 18px; padding: 12px 14px 14px; font-size: 13.5px; }
        .bn-acta-cab { display: flex; align-items: center; gap: 8px; padding-bottom: 10px; color: #1F2216; }
        .bn-acta-fila { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #EEEEE8; font-weight: 600; color: #1F2216; }
        .bn-acta-ok { margin-left: auto; font-size: 11.5px; font-weight: 700; color: #2F6B4F; }
        .bn-acta-acc { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 10px; border-top: 1px solid #EEEEE8; }
        .bn-acta .bn-btn-mini-lin { color: #343825; }

        /* Soporte */
        .bn-v-soporte { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
        .bn-contacto { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; font-size: 14px; font-weight: 700; color: #1F2216; }
        .bn-contacto > svg { flex-shrink: 0; color: #343825; }
        .bn-datos { list-style: none; margin: 0; padding: 0 4px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; color: #3B3B34; }
        .bn-datos li::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 10px; border-radius: 99px; background: #D9C29E; vertical-align: middle; }

        .bn-nota { margin: 18px 0 0; text-align: center; font-size: 12.5px; color: #6B6B63; }
        .bn-mas-nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 28px; margin-top: 18px; padding-top: 18px; border-top: 1px solid #DEDED6; }
        .bn-salida { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 14.5px; font-weight: 700; color: #343825; }

        @media (max-width: 960px) {
          .bn-w7, .bn-w5 { grid-column: span 12; }
          .bn-card { min-height: 0; }
          .bn-visual { min-height: 230px; padding-bottom: 22px; }
        }
        @media (max-width: 520px) {
          .bn-card { border-radius: 22px; }
          .bn-v-sust { grid-template-columns: minmax(0,1fr); }
          .bn-candidatas { flex-direction: row; flex-wrap: wrap; }
          .bn-clase-2, .bn-clase-3 { margin-left: 0; }
          .bn-clase { width: 100%; }
          .bn-visual { padding-bottom: 20px; }
          .bn-v-app { padding-bottom: 0; } .bn-card:has(.bn-v-app) .bn-visual { padding-bottom: 0; }
        }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes bn-sube { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
          .bn-aviso { animation: bn-sube .5s var(--motion-ease) both; animation-delay: calc(var(--i) * .08s); }
        }
      `}</style>
    </section>
  );
}
