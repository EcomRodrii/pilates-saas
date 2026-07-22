'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IBM_Plex_Mono } from 'next/font/google';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { tieneFeature } from '@/lib/billing/entitlements';

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

const ACC = '#6D28D9';
const ACC_SOFT = '#F1ECFB';
const BG = '#EEEEE8';
const DARK = '#0F0F0F';
const CARD_DARK = '#171717';
const MUTED = '#5A5A52';
const MUTED_DARK = '#A6A69E';

const btnCta =
  'inline-block bg-[#6D28D9] text-white rounded-full transition-all duration-250 hover:brightness-110 hover:-translate-y-0.5';

// ─── Scroll-reveal wrapper ───────────────────────────────────────────────────

function Reveal({
  children,
  delay = 0,
  from = 'up',
  style,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  from?: 'up' | 'left' | 'right';
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hidden =
    from === 'left' ? 'translateX(-30px)' : from === 'right' ? 'translateX(30px)' : 'translateY(22px)';

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : hidden,
        transition: `opacity .8s cubic-bezier(.2,.7,0,1) ${delay}ms, transform .8s cubic-bezier(.2,.7,0,1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children, color = '#5B21B6' }: { children: React.ReactNode; color?: string }) {
  return (
    <Reveal
      className="lp-mono"
      style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color, marginBottom: 16 }}
    >
      {children}
    </Reveal>
  );
}

function Chip({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className="lp-mono"
      style={{
        fontSize: 11.5,
        color: dark ? '#CBB6EE' : ACC,
        background: dark ? 'rgba(124,58,237,.16)' : ACC_SOFT,
        padding: '6px 12px',
        borderRadius: 999,
      }}
    >
      {children}
    </span>
  );
}

function Avatar({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        flexShrink: 0,
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: '#recorrido', label: 'Producto' },
  { href: '#sustituciones', label: 'Sustituciones' },
  { href: '#precio', label: 'Precio' },
  { href: '#faq', label: 'FAQ' },
];

const SPINE_SECTIONS = [
  { id: 'hero', label: 'Inicio' },
  { id: 'problema', label: 'El problema' },
  { id: 'antes-despues', label: 'Antes / después' },
  { id: 'recorrido', label: 'Producto' },
  { id: 'sustituciones', label: 'Sustituciones' },
  { id: 'centro-de-control', label: 'Centro de Control' },
  { id: 'precio', label: 'Precio' },
  { id: 'faq', label: 'FAQ' },
];

const RECORRIDO_ITEMS = [
  {
    n: '01',
    eyebrow: 'Reservas de alumnas',
    title: 'Reservan solas, 24/7.',
    body: 'Tus alumnas reservan y cancelan desde su móvil. Cuando alguien deja hueco, la lista de espera lo llena automáticamente — sin que muevas un dedo.',
    chips: ['Lista de espera automática', 'Cancelaciones con reglas'],
  },
  {
    n: '02',
    eyebrow: 'Alumnas y comunicación',
    title: 'Cada alumna, en su ficha.',
    body: 'Historial, bonos y asistencia de cada persona en un solo lugar. Y los avisos salen solos: recordatorios, cambios de clase, felicitaciones — por su canal.',
    chips: ['CRM de socias', 'Avisos automáticos'],
  },
  {
    n: '03',
    eyebrow: 'Calendario de clases y salas',
    title: 'Tu semana, cuadrada.',
    body: 'Clases, salas y capacidad por reformer — no solo aforo. Ves los huecos de un vistazo y evitas que dos clases pisen la misma sala.',
    chips: ['Capacidad por reformer', 'Multi-sala'],
  },
  {
    n: '04',
    eyebrow: 'Cobros, bonos y facturación',
    title: 'Cobra sin perseguir a nadie.',
    body: 'Bonos, cuotas y membresías con cobro recurrente. Reintenta los pagos fallidos y emite facturas legales desde el primer euro. Sin comisión extra de Tentare.',
    chips: ['Pagos vía Stripe', 'Facturación legal'],
  },
  {
    n: '05',
    eyebrow: 'Instructoras y horas',
    title: 'Tu equipo, bajo control.',
    body: 'Disponibilidad, calendario y horas de cada instructora. El sistema sabe quién puede dar qué — y por eso puede cubrir las bajas solo (ya llegamos a eso).',
    chips: ['Disponibilidad', 'Registro de horas'],
  },
  {
    n: '06',
    eyebrow: 'Panel de control y métricas',
    title: 'Tu estudio, de un vistazo.',
    body: 'Ingresos, ocupación, reservas y renovaciones al día. El panel que ves en el móvil y en el ordenador — el mismo que abre tu estudio cada mañana.',
    chips: ['KPIs en vivo', 'Informes'],
  },
];

const AUTONOMY_MODES = [
  { key: 'manual', tab: 'Manual', level: 'Nivel 1', levelColor: '#8E8E86', title: 'Manual', body: <>El sistema te <strong style={{ color: '#fff' }}>propone</strong> a quién avisar y qué escribir. Tú das cada paso. Ideal para tus primeras semanas, mientras coges confianza.</> },
  { key: 'asistido', tab: 'Asistido', level: 'Nivel 2 · recomendado', levelColor: '#C08BE8', title: 'Asistido', body: <>El sistema <strong style={{ color: '#fff' }}>contacta a las candidatas</strong> y gestiona los recordatorios. Cuando una acepta, tú lo <strong style={{ color: '#fff' }}>apruebas con un toque</strong> y él cierra todo lo demás.</> },
  { key: 'autonomo', tab: 'Autónomo', level: 'Nivel 3', levelColor: '#8E8E86', title: 'Autónomo', body: <>Cuando la confianza es alta, <strong style={{ color: '#fff' }}>cubre la baja solo</strong> y te lo cuenta después. Ni un toque. Tú lees el resumen cuando te va bien.</> },
  { key: 'vacaciones', tab: 'Vacaciones', level: 'Modo Vacaciones', levelColor: '#8E8E86', title: 'Vacaciones 🌴', body: <>Opera de principio a fin, <strong style={{ color: '#fff' }}>sin molestarte</strong>. Puedes estar en Cancún y el estudio funciona: bajas cubiertas, alumnas avisadas, calendario al día.</> },
] as const;

const CENTRO_CARDS = [
  { title: 'Resumen ejecutivo', body: 'El estado de tu estudio en una frase, cada mañana.', bg: ACC_SOFT, fg: ACC },
  { title: 'Prioridades que solo apruebas', body: 'Decisiones listas sobre la mesa. Tú dices sí o no.', bg: '#E7F3EC', fg: '#4E9E7F' },
  { title: 'Mientras dormías', body: 'Lo que se resolvió solo mientras no estabas.', bg: '#3A2E52', fg: '#C08BE8' },
  { title: 'Cada área, vigilada', body: 'Reservas, cobros, equipo y alumnas — controlados por separado.', bg: '#EDF3F4', fg: '#3E7C86' },
  { title: 'Riesgo de plantón', body: 'Te avisa si dependes demasiado de una sola instructora.', bg: '#FBEDE8', fg: '#C2503A' },
  { title: 'Accesos rápidos', body: 'Lo que más usas, siempre a un clic.', bg: '#F3ECF5', fg: '#8B4F9E' },
];

const DAY_MOMENTS = [
  {
    t: '07:00',
    title: 'Suena el primer «reservado»',
    body: 'Una alumna coge el Reformer de las 9:00 desde la app, aún en pijama. Su plaza queda confirmada al instante. Tú sigues durmiendo.',
    tag: 'Reservas 24/7 · confirmación automática',
    highlight: false,
  },
  {
    t: '08:30',
    title: 'Una instructora no puede hoy',
    body: 'Marta avisa desde la app de su baja de las 18:00. Antes de que llegues a leer el mensaje, Tentare ya está contactando a las instructoras que pueden cubrirla.',
    tag: 'Sustitución automática en marcha',
    highlight: true,
    badge: '★ El corazón de Tentare',
  },
  {
    t: '10:15',
    title: 'Un bono a punto de agotarse',
    body: 'Nora entra a su última sesión del bono. Recibe un aviso amable con la opción de renovar en un toque — y renueva antes de salir de la sala.',
    tag: 'Retención · renovación de bonos',
    highlight: false,
  },
  {
    t: '13:00',
    title: 'Clase llena, lista de espera activa',
    body: 'Alguien cancela la clase de las 19:00. La primera de la lista de espera entra sola, recibe su confirmación y el hueco no se pierde.',
    tag: 'Lista de espera inteligente',
    highlight: false,
  },
  {
    t: '17:05',
    title: 'Sustitución cerrada',
    body: 'Lucía confirma la clase de las 18:00. Calendario actualizado, horas registradas y alumnas avisadas de quién les dará la clase. Tú solo lo apruebas.',
    tag: 'Clase cubierta · alumnas avisadas',
    highlight: false,
    good: true,
  },
  {
    t: '20:30',
    title: 'Cierre de caja, sin caja',
    body: 'Se cobran las cuotas del mes y se emiten las facturas automáticamente. Los pagos que fallan se reintentan solos. Nadie persigue a nadie.',
    tag: 'Cobros recurrentes · facturación',
    highlight: false,
  },
];

const DISCIPLINAS = [
  'Gimnasio boutique', 'Gyrotonic', 'EMS', 'Crioterapia', 'Pilates', 'Yoga',
  'Spinning', 'Barre', 'Boxeo', 'HIIT', 'Baile',
];
const DISCIPLINA_GRADIENTS = [
  'linear-gradient(150deg,#6D28D9,#4C1D95)',
  'linear-gradient(150deg,#3E7C86,#1F4650)',
  'linear-gradient(150deg,#C2503A,#7A2E20)',
  'linear-gradient(150deg,#3E7C86,#0F2C33)',
  'linear-gradient(150deg,#8B4F9E,#4C1D95)',
  'linear-gradient(150deg,#4E9E7F,#1F4A3A)',
  'linear-gradient(150deg,#B57A8E,#5A2E3E)',
  'linear-gradient(150deg,#6D28D9,#2E1065)',
  'linear-gradient(150deg,#1A1A1A,#3A3A34)',
  'linear-gradient(150deg,#C2503A,#4C1D10)',
  'linear-gradient(150deg,#8B4F9E,#2E1065)',
];

const INTEGRACIONES = [
  { group: 'Pagos', items: ['Stripe'] },
  { group: 'Email y mensajería', items: ['Mailchimp', 'Brevo', 'Resend', 'Gmail', 'WhatsApp Business'] },
  { group: 'Calendario y acceso', items: ['Google Calendar', 'Google', 'Kisi'] },
  { group: 'Datos', items: ['Excel · importar y exportar', '+ más en camino'] },
];

const PLANS = [
  {
    name: 'Base',
    price: '29€',
    desc: 'Para empezar. Hasta 150 alumnas.',
    features: ['Reservas y calendario', 'Cobros, bonos y facturas', 'Sustituciones asistidas'],
    cta: 'Crear estudio',
    dark: false,
    popular: false,
  },
  {
    name: 'Estudio',
    price: '59€',
    desc: 'El plan completo. Alumnas ilimitadas.',
    features: ['Todo lo de Base', 'Alumnas ilimitadas', 'Sustituciones autónomas', 'App de marca'],
    cta: 'Crear mi estudio →',
    dark: true,
    popular: true,
  },
  {
    name: 'Cadena',
    price: '149€',
    desc: 'Multi-centro y white-label.',
    features: ['Todo lo de Estudio', 'Varios centros', 'Soporte dedicado'],
    cta: 'Hablar con ventas',
    dark: false,
    popular: false,
  },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Sustituye a mi software actual o convive con él?',
    a: 'Lo sustituye del todo: reservas, cobros, calendario, alumnas e instructoras están dentro. Importas tus datos con asistentes guiados por CSV —alumnas, bonos, reservas, clases y citas— con detección de duplicados, y te acompañamos en la puesta en marcha, sin cortar el servicio de tu estudio.',
  },
  {
    q: '¿Y si ninguna instructora acepta la sustitución?',
    a: 'Nunca te deja colgada. Si nadie puede, te avisa enseguida con las opciones sobre la mesa: reprogramar, cancelar avisando a las alumnas, o cubrir tú. Tú eliges; él ejecuta.',
  },
  {
    q: '¿Tengo que dar de alta a mis instructoras?',
    a: 'Sí, das de alta a tu equipo una vez con su disponibilidad. A partir de ahí el sistema trabaja con esos datos: sabe quién puede cubrir cada clase sin que tengas que decírselo.',
  },
  {
    q: '¿Cómo avisáis a las alumnas?',
    a: 'Por el canal de cada alumna: la app de marca, email o WhatsApp. Cuando cambia una clase, reciben el aviso al momento — sin que tengas que escribir nada.',
  },
  {
    q: '¿Hay permanencia?',
    a: 'Ninguna. Tus datos son tuyos: si te vas, exportas alumnas, historial y facturas cuando quieras. Nos quedamos porque funciona, no por un contrato.',
  },
  {
    q: '¿Cuánto tarda ponerlo en marcha?',
    a: 'Días, no semanas. Traes tus datos con asistentes de importación por CSV (alumnas, bonos, reservas, clases y citas) y te acompañamos en la puesta en marcha. Empiezas con lo básico y activas el resto a tu ritmo.',
  },
  {
    q: '¿Tengo que usar las sustituciones automáticas desde el principio?',
    a: 'No. Puedes empezar solo con reservas y cobros y activar las sustituciones cuando te sientas cómoda. Muchos estudios arrancan en modo Manual y suben de nivel con el tiempo.',
  },
  {
    q: '¿Están seguros los datos de mi estudio y mis alumnas?',
    a: 'Cumplimos el RGPD, cada estudio accede únicamente a sus propios datos y puedes exportarlos cuando quieras.',
  },
  {
    q: '¿Puedo gestionar varios centros?',
    a: 'Sí. El plan Cadena gestiona varios centros desde un mismo panel, con datos y permisos separados por sede.',
  },
  {
    q: '¿Pierdo datos o me quedo sin servicio al migrar?',
    a: 'No. Tu estudio sigue funcionando en tu sistema actual hasta que tú decidas arrancar. Importas por CSV con detección de duplicados y revisas los datos antes de empezar. Las tarjetas guardadas de tus alumnas no se transfieren solas entre plataformas: te ayudamos a gestionar ese paso para que nadie se quede sin cobrar.',
  },
  {
    q: '¿Me vais a subir el precio dentro de un año?',
    a: 'Nuestros precios son públicos y no jugamos a subirlos por sorpresa. Si algún día cambia una tarifa, te avisamos con antelación y respetamos tu plan.',
  },
  {
    q: '¿El soporte es de personas y en español?',
    a: 'Sí. Te atienden personas, en español, que conocen cómo funciona un estudio de pilates. Sin bots que te dan vueltas ni esperas eternas.',
  },
];

// ─── Icons (inline, matching the design's stroke style) ─────────────────────

function Icon({ path, size = 18 }: { path: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}
const IconCheck = (s?: number) => <Icon size={s} path={<path d="M20 6 9 17l-5-5" />} />;
const IconAlert = (s?: number) => <Icon size={s} path={<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} /></>} />;
const IconUsers = (s?: number) => <Icon size={s} path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx={9} cy={7} r={4} /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />;
const IconCalendar = (s?: number) => <Icon size={s} path={<><path d="M8 2v4" /><path d="M16 2v4" /><rect width={18} height={18} x={3} y={4} rx={2} /><path d="M3 10h18" /></>} />;
const IconInvoice = (s?: number) => <Icon size={s} path={<><rect width={20} height={14} x={2} y={5} rx={2} /><line x1={2} x2={22} y1={10} y2={10} /></>} />;

// ─── Sustituciones flow ──────────────────────────────────────────────────────

const FLOW_STEPS = [
  { icon: IconAlert, title: 'Entra la baja', cap: 'Ana avisa desde la app · jue 19:00' },
  { icon: IconUsers, title: 'Busca y contacta', cap: '3 candidatas disponibles · avisadas' },
  { icon: IconCalendar, title: 'Confirma y cuadra', cap: 'Lucía acepta · calendario y horas al día' },
  { icon: IconInvoice, title: 'Avisa a las alumnas', cap: 'Cambio notificado por su canal' },
];

function SustitucionesFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.unobserve(el);
        FLOW_STEPS.forEach((_, i) => {
          setTimeout(() => setStep(i), 500 + i * 750);
        });
        setTimeout(() => setDone(true), 500 + FLOW_STEPS.length * 750 + 300);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const progressPct = step < 0 ? 0 : (step / (FLOW_STEPS.length - 1)) * 100;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 30, left: '12.5%', right: '12.5%', height: 3, background: 'rgba(255,255,255,.1)', zIndex: 0 }} className="tnt-flowline" />
      <div
        className="tnt-flowline"
        style={{ position: 'absolute', top: 30, left: '12.5%', width: `${progressPct * 0.75}%`, height: 3, background: ACC, zIndex: 1, transition: 'width .6s ease', boxShadow: '0 0 12px rgba(124,58,237,.6)' }}
      />
      <div className="tnt-steps4" style={{ position: 'relative', zIndex: 2 }}>
        {FLOW_STEPS.map((s, i) => {
          const active = step >= i;
          return (
            <div key={s.title} style={{ textAlign: 'center', transition: 'opacity .5s' }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: active ? ACC : CARD_DARK,
                  border: `2px solid ${active ? ACC : 'rgba(255,255,255,.14)'}`,
                  color: active ? '#fff' : '#8E8E86',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  transition: 'all .4s cubic-bezier(.2,.7,0,1)',
                }}
              >
                {s.icon(24)}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{s.title}</div>
              <div
                className="lp-mono"
                style={{
                  fontSize: 11,
                  color: '#8E8E86',
                  lineHeight: 1.4,
                  opacity: active ? 1 : 0,
                  transform: active ? 'none' : 'translateY(6px)',
                  transition: 'opacity .5s ease, transform .5s ease',
                }}
              >
                {s.cap}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          textAlign: 'center',
          marginTop: 28,
          opacity: done ? 1 : 0,
          transform: done ? 'none' : 'translateY(6px) scale(.96)',
          transition: 'opacity .5s ease, transform .5s cubic-bezier(.2,1.4,.4,1)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            background: 'rgba(78,158,127,.14)',
            color: '#7BD3A8',
            fontSize: 14,
            fontWeight: 700,
            padding: '10px 18px',
            borderRadius: 999,
            border: '1px solid rgba(123,211,168,.28)',
          }}
        >
          {IconCheck(16)} Clase cubierta · nadie tocó el teléfono
        </span>
      </div>
      <div style={{ position: 'relative', textAlign: 'center', marginTop: 30, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,.07)' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>Y tú, mientras tanto, dabas tu clase.</span>
      </div>
    </div>
  );
}

// ─── Before / after drag comparison ─────────────────────────────────────────

function BeforeAfter() {
  const [pos, setPos] = useState(50);
  return (
    <div>
      <div
        style={{
          position: 'relative',
          borderRadius: 22,
          overflow: 'hidden',
          minHeight: 260,
          boxShadow: '0 40px 80px -30px rgba(26,26,26,.32)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, padding: 'clamp(22px,3.6vw,38px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: DARK }}>
          <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7BD3A8', marginBottom: 14 }}>Con Tentare</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(123,211,168,.12)', border: '1px solid rgba(123,211,168,.3)', borderRadius: 14, padding: '14px 16px', marginBottom: 12, maxWidth: 340 }}>
            <span style={{ color: '#7BD3A8', flexShrink: 0 }}>{IconCheck(20)}</span>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Clase cubierta</div><div style={{ fontSize: 12.5, color: '#9FE0C0' }}>Lucía acepta · alumnas avisadas</div></div>
          </div>
          <div className="lp-mono" style={{ fontSize: 12, color: '#8E8E86' }}>0 llamadas · 6 minutos · tú, sin enterarte</div>
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 'clamp(22px,3.6vw,38px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: '#F3F3EF',
            clipPath: `inset(0 ${100 - pos}% 0 0)`,
          }}
        >
          <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#C2503A', marginBottom: 14 }}>Sin Tentare</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #EFE0DC', borderRadius: 14, padding: '14px 16px', marginBottom: 12, maxWidth: 340 }}>
            <span style={{ color: '#C2503A', flexShrink: 0 }}>{IconAlert(20)}</span>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>Grupo de WhatsApp</div><div style={{ fontSize: 12.5, color: '#8E6A5E' }}>14 mensajes sin resolver</div></div>
          </div>
          <div className="lp-mono" style={{ fontSize: 12, color: '#A8887E' }}>6 llamadas · 40 minutos · clase en el aire</div>
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 3, left: `${pos}%`, background: '#fff', boxShadow: '0 0 0 1px rgba(26,26,26,.12), 0 8px 20px rgba(0,0,0,.25)', transform: 'translateX(-50%)', zIndex: 4, pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 34, height: 34, background: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(0,0,0,.22)' }}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth={2.4} strokeLinecap="round"><line x1={9} y1={6} x2={9} y2={18} /><line x1={15} y1={6} x2={15} y2={18} /></svg>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label="Comparar antes y después de Tentare"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'ew-resize', zIndex: 6, appearance: 'none', background: 'transparent' }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
        <span className="lp-mono" style={{ fontSize: 11, color: '#C2503A' }}>← Sin Tentare</span>
        <span className="lp-mono" style={{ fontSize: 11, color: '#4E9E7F' }}>Con Tentare →</span>
      </div>
    </div>
  );
}

// ─── Day timeline with scroll-linked fill ───────────────────────────────────

function DayTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    function onScroll() {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh * 0.5;
      const scrolled = vh * 0.75 - rect.top;
      setPct(Math.min(1, Math.max(0, scrolled / total)));
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 8, bottom: 8, left: 91, width: 2, background: 'rgba(255,255,255,.1)', borderRadius: 2 }} className="tnt-daybg" />
      <div
        style={{ position: 'absolute', top: 8, left: 91, width: 2, height: `${pct * 100}%`, background: `linear-gradient(${ACC}, #4C1D95)`, boxShadow: '0 0 12px rgba(124,58,237,.55)', borderRadius: 2, transition: 'height .1s linear' }}
        className="tnt-dayfill"
      />
      {DAY_MOMENTS.map((m) => (
        <div key={m.t} className="tnt-moment" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '72px 40px 1fr', alignItems: 'start', paddingBottom: 30 }}>
          <div className="lp-mono" style={{ textAlign: 'right', paddingTop: 18, fontSize: 13, color: '#8E8E86' }}>{m.t}</div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', paddingTop: 20 }}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: DARK, border: `2px solid ${ACC}`, boxShadow: m.highlight ? '0 0 0 5px rgba(109,40,217,.22)' : '0 0 0 4px rgba(109,40,217,.12)' }} />
          </div>
          <Reveal
            style={
              m.highlight
                ? { background: 'linear-gradient(150deg,#1c1440,#171717 70%)', border: '1px solid rgba(124,58,237,.5)', borderRadius: 18, padding: '20px 22px' }
                : m.good
                  ? { background: 'linear-gradient(135deg,#6D28D9,#4C1D95)', borderRadius: 18, padding: '20px 22px', boxShadow: '0 30px 60px -30px rgba(109,40,217,.7)' }
                  : { background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: '20px 22px' }
            }
          >
            {m.badge && (
              <div className="lp-mono" style={{ display: 'inline-block', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#fff', background: ACC, padding: '4px 10px', borderRadius: 999, marginBottom: 12 }}>
                {m.badge}
              </div>
            )}
            <h3 style={{ fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: '-.01em' }}>{m.title}</h3>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: m.good ? '#EADEFB' : '#A6A69E', margin: '0 0 14px' }}>{m.body}</p>
            <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: m.good ? 'rgba(255,255,255,.14)' : m.highlight ? 'rgba(124,58,237,.16)' : 'rgba(124,58,237,.12)', border: m.good ? 'none' : '1px solid rgba(124,58,237,.22)', borderRadius: 999, padding: '7px 12px', fontSize: 11, color: m.good ? '#fff' : '#CBB6EE' }}>
              {m.tag}
            </div>
          </Reveal>
        </div>
      ))}
    </div>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '20px 22px',
                textAlign: 'left',
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-.01em',
                color: '#1A1A1A',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span>{item.q}</span>
              <span
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: ACC_SOFT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  color: ACC,
                  transition: 'transform .2s',
                  transform: isOpen ? 'rotate(45deg)' : 'none',
                }}
              >
                +
              </span>
            </button>
            {isOpen && (
              <p style={{ margin: 0, padding: '0 22px 20px', fontSize: 15, lineHeight: 1.6, color: '#5A5A52' }}>{item.a}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { studio } = useStudio();
  const rol = useRol();
  useEffect(() => {
    if (!session || !studio) return;
    const tieneDecisionOS =
      rol === 'PROPIETARIO' &&
      tieneFeature({ plan: studio.plan, subscriptionStatus: studio.subscriptionStatus }, 'decisiones');
    router.replace(tieneDecisionOS ? '/centro-de-control' : '/dashboard');
  }, [session, studio, rol, router]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [autonomyMode, setAutonomyMode] = useState<(typeof AUTONOMY_MODES)[number]['key']>('asistido');
  const [activeSpine, setActiveSpine] = useState('hero');

  useEffect(() => {
    const els = SPINE_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSpine(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={plexMono.variable} style={{ background: BG, color: '#1A1A1A', overflowX: 'clip', position: 'relative' }}>
      {/* ================= SPINE (desktop only) ================= */}
      <div className="tnt-spine" aria-hidden="true" style={{ position: 'fixed', left: 26, top: '50%', transform: 'translateY(-50%)', zIndex: 80, flexDirection: 'column', alignItems: 'center' }}>
        {SPINE_SECTIONS.map((s) => {
          const on = activeSpine === s.id;
          return (
            <button
              key={s.id}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-label={`Ir a ${s.label}`}
              className="tnt-spine-dot"
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: on ? ACC : '#C9C9BE',
                margin: '12px 0',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                transform: on ? 'scale(1.6)' : 'none',
                boxShadow: on ? '0 0 0 5px rgba(109,40,217,.16)' : 'none',
                transition: 'background .3s, transform .3s, box-shadow .3s',
              }}
            />
          );
        })}
      </div>

      {/* ================= NAV ================= */}
      <div style={{ position: 'sticky', top: 0, zIndex: 90, padding: '14px clamp(14px,4vw,28px) 0', pointerEvents: 'none' }}>
        <nav
          style={{
            pointerEvents: 'auto',
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 14,
            padding: '9px 10px 9px 22px',
            borderRadius: 999,
            background: 'rgba(255,255,255,.55)',
            backdropFilter: 'blur(20px) saturate(160%)',
            border: '1px solid rgba(255,255,255,.6)',
            boxShadow: '0 10px 34px -8px rgba(26,26,26,.14), inset 0 1px 0 rgba(255,255,255,.5)',
          }}
        >
          <a href="#top" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 26, width: 'auto' }} />
          </a>
          <div className="tnt-navlinks lp-mono" style={{ display: 'flex', gap: 28, alignItems: 'center', fontSize: 12.5, letterSpacing: '.04em', textTransform: 'uppercase' }}>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} style={{ color: MUTED }}>{l.label}</a>
            ))}
          </div>
          <div className="tnt-navcta" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', padding: '9px 6px' }}>Entrar</Link>
            <Link href="/crear-estudio" className="hover:brightness-110" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: ACC, padding: '11px 20px', borderRadius: 999, boxShadow: '0 10px 22px rgba(109,40,217,.28)' }}>
              Crear estudio
            </Link>
          </div>
          <button
            className="tnt-menubtn"
            onClick={() => setMenuOpen(true)}
            aria-label="Menú"
            style={{ display: 'none', border: '1px solid rgba(26,26,26,.1)', background: 'rgba(255,255,255,.7)', borderRadius: 999, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1A1A1A', flexShrink: 0 }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><line x1={3} y1={6} x2={21} y2={6} /><line x1={3} y1={12} x2={21} y2={12} /><line x1={3} y1={18} x2={21} y2={18} /></svg>
          </button>
        </nav>
      </div>

      {/* ================= MOBILE MENU ================= */}
      {menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(15,15,15,.5)', backdropFilter: 'blur(6px)' }} onClick={() => setMenuOpen(false)}>
          <div
            style={{ position: 'absolute', top: 0, right: 0, width: 'min(84vw,340px)', height: '100%', background: BG, padding: 24, display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '-20px 0 60px rgba(15,15,15,.25)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 26, width: 'auto' }} />
              <button onClick={() => setMenuOpen(false)} aria-label="Cerrar" style={{ border: 'none', background: '#fff', borderRadius: 10, width: 40, height: 40, cursor: 'pointer', fontSize: 20, color: '#1A1A1A' }}>×</button>
            </div>
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{ padding: '14px 8px', fontSize: 18, fontWeight: 600, color: '#1A1A1A', borderBottom: '1px solid #E1E1D8' }}>{l.label}</a>
            ))}
            <Link href="/login" onClick={() => setMenuOpen(false)} style={{ marginTop: 16, textAlign: 'center', padding: 15, fontSize: 16, fontWeight: 600, color: '#1A1A1A', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14 }}>Entrar</Link>
            <Link href="/crear-estudio" onClick={() => setMenuOpen(false)} style={{ textAlign: 'center', padding: 15, fontSize: 16, fontWeight: 700, color: '#fff', background: ACC, borderRadius: 14 }}>Crear estudio</Link>
          </div>
        </div>
      )}

      {/* ================= HERO ================= */}
      <header id="top" style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) 56px' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 560, height: 560, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(124,58,237,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div className="tnt-wrap tnt-hero" style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.02fr .98fr', gap: 52, alignItems: 'center' }}>
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 'clamp(38px,5.6vw,66px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>
              <span style={{ display: 'block', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .06s both' }}>El software que lleva</span>
              <span style={{ display: 'block', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .15s both' }}>tu estudio de pilates.</span>
            </h1>
            <p style={{ fontSize: 'clamp(18px,1.7vw,23px)', fontWeight: 600, lineHeight: 1.35, color: '#1A1A1A', margin: '0 0 18px', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .24s both' }}>
              Reservas, cobros y equipo en un panel — y la única plataforma que cubre una baja de instructora{' '}
              <span style={{ position: 'relative', whiteSpace: 'nowrap', color: ACC }}>
                sola.
                <svg viewBox="0 0 90 14" style={{ position: 'absolute', left: 0, bottom: -6, width: '100%', height: 12, overflow: 'visible' }}>
                  <path d="M3 9 C 25 3, 65 3, 87 8" fill="none" stroke={ACC} strokeWidth={5} strokeLinecap="round" strokeDasharray={100} strokeDashoffset={100} style={{ animation: 'lp-dash 1s ease .7s forwards' }} />
                </svg>
              </span>
            </p>
            <p style={{ fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.55, color: MUTED, maxWidth: 470, margin: '0 0 32px', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .32s both' }}>
              Cuando una instructora avisa de que no puede, Tentare busca sustituta, la contacta y avisa a las alumnas antes de que cuelgues el teléfono. Tú solo apruebas.
            </p>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 22, animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .42s both' }}>
              <Link href="/crear-estudio" className={btnCta} style={{ fontSize: 16, fontWeight: 700, padding: '16px 28px', boxShadow: '0 16px 34px rgba(109,40,217,.34)' }}>
                Crear mi estudio →
              </Link>
            </div>
            <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.03em', color: '#8E8E86', animation: 'lp-riseIn .85s cubic-bezier(.2,.7,0,1) .5s both' }}>
              Sin permanencia · Migración incluida · Hecho en España
            </div>
          </div>

          {/* ===== HERO PRODUCT MOCKUP ===== */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 560, marginLeft: 'auto', animation: 'lp-riseIn 1.1s cubic-bezier(.2,.7,0,1) .3s both' }}>
            <div style={{ position: 'relative', width: '82%', animation: 'lp-floatA 8s ease-in-out infinite' }}>
              <div style={{ borderRadius: 15, background: 'linear-gradient(#232326,#131315)', padding: '8px 8px 11px', boxShadow: '0 40px 80px -24px rgba(26,26,26,.42), 0 8px 22px rgba(26,26,26,.18)' }}>
                <div style={{ borderRadius: 6, overflow: 'hidden', background: BG }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: ACC }} />
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
                    </div>
                    <div className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#A8A89F' }}>estudio.tentare.app</div>
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                      <div>
                        <div className="lp-mono" style={{ fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: '#A8A89F' }}>Jueves, 9 de julio</div>
                        <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>Buenas tardes 👋</div>
                      </div>
                      <div style={{ background: ACC, color: '#fff', fontSize: 10, fontWeight: 700, padding: '7px 12px', borderRadius: 999 }}>Abrir caja</div>
                    </div>
                    <div style={{ background: DARK, color: '#E8E8E4', borderRadius: 12, padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: ACC_SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconAlert(14)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700 }}>Baja de Marta · 19:00</div>
                        <div className="lp-mono" style={{ fontSize: 9.5, color: '#8E8E86' }}>Buscando sustituta…</div>
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACC, boxShadow: '0 0 0 4px rgba(124,58,237,.25)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
                      <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 12, padding: '9px 10px' }}>
                        <div className="lp-mono" style={{ fontSize: 8.5, textTransform: 'uppercase', color: '#A8A89F' }}>Ingresos mes</div>
                        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>8.940€</div>
                        <div style={{ fontSize: 9, color: '#4E9E7F', fontWeight: 700 }}>▲ 12%</div>
                      </div>
                      <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 12, padding: '9px 10px' }}>
                        <div className="lp-mono" style={{ fontSize: 8.5, textTransform: 'uppercase', color: '#A8A89F' }}>Ocupación</div>
                        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>87%</div>
                        <div style={{ height: 4, borderRadius: 99, background: '#EDEDE6', marginTop: 6, overflow: 'hidden' }}><div style={{ height: '100%', width: '87%', background: ACC, borderRadius: 99 }} /></div>
                      </div>
                      <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 12, padding: '9px 10px' }}>
                        <div className="lp-mono" style={{ fontSize: 8.5, textTransform: 'uppercase', color: '#A8A89F' }}>Reservas hoy</div>
                        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>64</div>
                        <div style={{ fontSize: 9, color: '#8E8E86' }}>8 clases</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', right: 0, bottom: 0, width: '30%', animation: 'lp-floatB 6.6s ease-in-out infinite', zIndex: 4 }}>
              <div style={{ background: 'linear-gradient(150deg,#46464b,#1e1e21 42%,#33333a)', borderRadius: 28, padding: 5, boxShadow: '-22px 34px 60px -18px rgba(26,26,26,.5)' }}>
                <div style={{ background: '#000', borderRadius: 24, padding: 3 }}>
                  <div style={{ borderRadius: 21, overflow: 'hidden', background: BG, padding: '18px 10px 10px' }}>
                    <div className="lp-mono" style={{ fontSize: 8, textTransform: 'uppercase', color: '#A8A89F', marginBottom: 6, textAlign: 'center' }}>Hoy</div>
                    <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 10, padding: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700 }}>Reformer 19:00</div>
                      <div className="lp-mono" style={{ fontSize: 8, color: ACC }}>Sustituta: Lucía</div>
                    </div>
                    <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 10, padding: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700 }}>Mat 09:00</div>
                      <div className="lp-mono" style={{ fontSize: 8, color: '#8E8E86' }}>7/12 plazas</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: 'absolute', top: '8%', left: '-4%', zIndex: 6, display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #E4EFE9', borderRadius: 14, padding: '10px 13px', boxShadow: '0 18px 40px -14px rgba(26,26,26,.26)', animation: 'lp-floatY 5s ease-in-out infinite' }} className="tnt-herobadge">
              <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: '#E7F3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4E9E7F' }}>{IconCheck(16)}</span>
              <div><div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>Baja cubierta sola</div><div className="lp-mono" style={{ fontSize: 10.5, color: '#8E8E86' }}>sin una llamada</div></div>
            </div>
          </div>
        </div>
      </header>

      {/* ================= PROBLEMA ================= */}
      <section id="problema" style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)', position: 'relative', overflow: 'hidden' }}>
        <div className="tnt-wrap tnt-g2" style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignItems: 'center' }}>
          <Reveal>
            <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 18 }}>El problema</div>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.6vw,54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 22px' }}>Tu estudio no cabe en cinco apps y un cuaderno.</h2>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED_DARK, maxWidth: 440, margin: '0 0 18px' }}>
              Reservas en una, cobros en otra, el calendario en un grupo de WhatsApp, las horas en una hoja de cálculo. Y cuando una instructora avisa de que no puede — a las 22:47 — empieza el caos: llamar una por una, cuadrar, avisar a las alumnas.
            </p>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: MUTED_DARK, maxWidth: 440, margin: 0 }}>
              Si no encuentras a nadie, la clase se cae. Y las alumnas se acuerdan.
            </p>
          </Reveal>
          <Reveal delay={120}>
            <div style={{ maxWidth: 340, margin: '0 auto', background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 26, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px 14px', borderBottom: '1px solid rgba(255,255,255,.06)', marginBottom: 14 }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2z" /></svg>
                </span>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Equipo del estudio</div><div className="lp-mono" style={{ fontSize: 10.5, color: '#8E8E86' }}>8 personas · en línea</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {[
                  { me: false, text: 'Chicas, mañana no puedo dar el Reformer de las 19h 😣' },
                  { me: false, text: '¿Alguien puede? Es urgente' },
                  { me: true, text: 'Yo estoy con mis hijas 🙈' },
                  { me: false, text: 'Uy yo libro justo ese día' },
                  { me: true, text: '¿Y las alumnas ya reservadas? 😰' },
                ].map((m, i) => (
                  <div key={i} style={{ alignSelf: m.me ? 'flex-end' : 'flex-start', maxWidth: '82%', background: m.me ? '#3A2E52' : '#242424', color: m.me ? '#E8DEF6' : '#E8E8E4', fontSize: 13, lineHeight: 1.4, padding: '9px 12px', borderRadius: m.me ? '14px 14px 4px 14px' : '14px 14px 14px 4px' }}>{m.text}</div>
                ))}
                <div className="lp-mono" style={{ alignSelf: 'center', fontSize: 10, color: '#6E6E68', marginTop: 2 }}>escribiendo…</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= ANTES / DESPUÉS ================= */}
      <section id="antes-despues" style={{ padding: 'clamp(64px,8vw,104px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 620, margin: '0 auto clamp(40px,6vw,58px)', textAlign: 'center' }}>
            <Eyebrow>Antes / después</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.4vw,52px)', lineHeight: 1.03, letterSpacing: '-.04em', margin: '0 0 14px' }}>Arrastra y compara tu semana.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>Mismo estudio, misma baja de última hora un jueves por la tarde. Así cambia cuando dejas de gestionarla a mano.</p></Reveal>
          </div>
          <Reveal delay={120} style={{ maxWidth: 780, margin: '0 auto' }}>
            <BeforeAfter />
          </Reveal>
        </div>
      </section>

      {/* ================= RECORRIDO ================= */}
      <section id="recorrido" style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 680, marginBottom: 'clamp(48px,7vw,84px)' }}>
            <Eyebrow>La plataforma, módulo a módulo</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.6vw,54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 14px' }}>Cada pieza de tu estudio, ya conectada.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>De la reserva a la factura, pasando por el calendario y tu equipo — sin saltar entre apps ni duplicar datos.</p></Reveal>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(56px,8vw,90px)' }}>
            {RECORRIDO_ITEMS.map((item, i) => {
              const alt = i % 2 === 1;
              return (
                <div key={item.n} className="tnt-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(28px,5vw,68px)', alignItems: 'center' }}>
                  <Reveal style={{ order: alt ? 2 : 1 }}>
                    <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 12 }}>{item.n} · {item.eyebrow}</div>
                    <h3 style={{ fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, margin: '0 0 12px' }}>{item.title}</h3>
                    <p style={{ fontSize: 16.5, lineHeight: 1.6, color: MUTED, margin: '0 0 18px', maxWidth: 440 }}>{item.body}</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {item.chips.map((c) => <Chip key={c}>{c}</Chip>)}
                    </div>
                  </Reveal>
                  <Reveal delay={120} from={alt ? 'left' : 'right'} style={{ order: alt ? 1 : 2 }}>
                    <RecorridoVisual index={i} />
                  </Reveal>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= SUSTITUCIONES ================= */}
      <section id="sustituciones" style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(76px,9vw,124px) clamp(20px,4vw,44px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 'min(900px,90vw)', height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.24), transparent 66%)', pointerEvents: 'none' }} />
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto clamp(48px,6vw,72px)' }}>
            <Reveal className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#fff', background: ACC, padding: '8px 15px', borderRadius: 999, marginBottom: 22 }}>
              ★ La función estrella de Tentare
            </Reveal>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,62px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 0 18px' }}>Cubre las bajas de instructoras <span style={{ color: '#C08BE8' }}>solo</span>.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 19, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Casi ningún software de estudio lo resuelve de verdad. Cuando una instructora avisa de que no puede, Tentare ejecuta el flujo entero — de la baja a las alumnas avisadas. Tú solo apruebas.</p></Reveal>
          </div>

          <Reveal delay={120} style={{ position: 'relative', background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 26, padding: 'clamp(30px,4vw,50px) clamp(20px,4vw,40px)', overflow: 'hidden' }}>
            <SustitucionesFlow />
          </Reveal>
        </div>
      </section>

      {/* ================= NIVELES DE AUTONOMÍA ================= */}
      <section style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <Eyebrow>Niveles de autonomía</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.8vw,56px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 auto 14px', maxWidth: 640 }}>Tú decides cuánto delega.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, color: MUTED, maxWidth: 520, margin: '0 auto' }}>Del control total a estar en Cancún. Cambia de modo cuando quieras.</p></Reveal>
          </div>
          <Reveal delay={120}>
            <div className="tnt-autbar" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', margin: '0 auto 26px', padding: 6, background: '#fff', border: '1px solid #E7E7E0', borderRadius: 999, width: 'max-content', maxWidth: '100%' }}>
              {AUTONOMY_MODES.map((m) => {
                const active = autonomyMode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setAutonomyMode(m.key)}
                    style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, padding: '11px 20px', borderRadius: 999, background: active ? ACC : 'transparent', color: active ? '#fff' : MUTED, transition: 'background .2s, color .2s' }}
                  >
                    {m.tab}
                  </button>
                );
              })}
            </div>
            {AUTONOMY_MODES.filter((m) => m.key === autonomyMode).map((m) => (
              <div key={m.key} style={{ background: DARK, color: '#E8E8E4', borderRadius: 26, padding: 'clamp(28px,4vw,48px)', minHeight: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: m.levelColor }}>{m.level}</span>
                  <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,.08)' }} />
                </div>
                <h3 style={{ fontSize: 'clamp(24px,3vw,34px)', fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>{m.title}</h3>
                <p style={{ fontSize: 18, lineHeight: 1.6, color: '#B8B8B0', maxWidth: 620, margin: 0 }}>{m.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ================= CENTRO DE CONTROL ================= */}
      <section id="centro-de-control" style={{ background: '#F3F3EF', borderTop: '1px solid #E7E7E0', borderBottom: '1px solid #E7E7E0', padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 720, marginBottom: 'clamp(40px,6vw,58px)' }}>
            <Eyebrow>Centro de Control</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.6vw,54px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 14px' }}>El cerebro de tu estudio.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>No es una pantalla más. Es el sistema que revisa tu estudio cada mañana, detecta lo que necesita tu atención y te lo deja listo para aprobar. Tú decides; él ejecuta. <span style={{ color: '#A8A89F' }}>(Ejemplo con datos ficticios.)</span></p></Reveal>
          </div>

          <Reveal delay={120} style={{ maxWidth: 1000, margin: '0 auto', background: BG, border: '1px solid #E1E1D9', borderRadius: 20, overflow: 'hidden', boxShadow: '0 44px 90px -40px rgba(26,26,26,.34)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#D8C3E0' }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
              <span className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: '#A8A89F' }}>tentare.app/centro-de-control</span>
            </div>
            <div style={{ padding: 'clamp(16px,3vw,26px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span className="lp-mono" style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E8E86' }}>Martes, 8 de julio</span>
                <span className="lp-mono" style={{ fontSize: 12, color: MUTED, border: '1px solid #E1E1D9', background: '#fff', borderRadius: 999, padding: '6px 13px' }}>Analizar ahora</span>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.25, maxWidth: '74%' }}>Buenos días, Marta. Tu estudio va bien — hay 2 cosas que mirar.</div>
                  <span className="lp-mono" style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#D97706', background: '#FFFBEB', borderRadius: 999, padding: '5px 11px' }}>Atención</span>
                </div>
                <div style={{ display: 'flex', gap: 22, marginTop: 12, fontSize: 12.5, color: '#8E8E86', flexWrap: 'wrap' }}>
                  <span>Tiempo estimado <strong style={{ color: '#1A1A1A' }}>6 min</strong></span>
                  <span>Impacto económico <strong style={{ color: '#1A1A1A' }}>+240€/mes</strong></span>
                </div>
              </div>
              <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#A8A89F' }}>Prioridades</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }} className="tnt-g2">
                <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: '#FBEDE8', color: '#C2503A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconAlert(14)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Baja de instructora sin cubrir</span>
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTED, margin: '0 0 12px' }}>Marta no puede el jueves 19:00. 3 candidatas disponibles y ya avisadas.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ flex: 1, textAlign: 'center', background: ACC, color: '#fff', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10 }}>Aprobar sustituta</span>
                    <span style={{ textAlign: 'center', background: '#F3F3EF', color: MUTED, fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 10 }}>Rechazar</span>
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: ACC_SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconUsers(14)}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Socia en riesgo de fuga</span>
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTED, margin: '0 0 12px' }}>Nora no reserva desde hace 3 semanas. Sugerimos un mensaje de reactivación.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ flex: 1, textAlign: 'center', background: ACC, color: '#fff', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10 }}>Aprobar y enviar</span>
                    <span style={{ textAlign: 'center', background: '#F3F3EF', color: MUTED, fontSize: 12, fontWeight: 600, padding: '9px 14px', borderRadius: 10 }}>Rechazar</span>
                  </div>
                </div>
              </div>
              <div style={{ background: DARK, color: '#D8D8D2', borderRadius: 14, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: '#C08BE8' }}>Mientras dormías</span>
                <span style={{ fontSize: 13 }}>2 reservas nuevas · 1 bono renovado · 1 pago reintentado con éxito</span>
              </div>
            </div>
          </Reveal>

          <div className="tnt-g3" style={{ marginTop: 'clamp(34px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {CENTRO_CARDS.map((c, i) => (
              <Reveal key={c.title} delay={(i % 3) * 70} style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 18, padding: 22 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{IconCheck(19)}</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 6px' }}>{c.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: MUTED, margin: 0 }}>{c.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= UN DÍA CON TENTARE ================= */}
      <section style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(76px,9vw,124px) clamp(20px,4vw,44px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-8%', right: '-6%', width: 'min(680px,80vw)', height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.18), transparent 66%)', pointerEvents: 'none' }} />
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
          <div style={{ maxWidth: 700, marginBottom: 'clamp(40px,6vw,64px)' }}>
            <Eyebrow color="#C08BE8">Un día con Tentare · ejemplo</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(32px,4.8vw,56px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 0 16px', color: '#fff' }}>De las 7:00 a las 22:00,<br />sin una sola llamada.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Así se ve un martes cualquiera en un estudio que funciona con Tentare. Cada hora, una automatización distinta trabajando por ti. <span style={{ color: '#7E7E77' }}>(Ejemplo ilustrativo con datos ficticios.)</span></p></Reveal>
          </div>
          <DayTimeline />
        </div>
      </section>

      {/* ================= DISCIPLINAS ================= */}
      <section id="producto" style={{ padding: 'clamp(64px,8vw,100px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto', textAlign: 'center', marginBottom: 'clamp(36px,5vw,52px)' }}>
          <Eyebrow>Para cualquier disciplina</Eyebrow>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.6vw,54px)', lineHeight: 1.05, letterSpacing: '-.04em', margin: '0 auto 14px', maxWidth: 720 }}>Pilates, yoga, boxeo, EMS… cada estudio, a tu manera.</h2></Reveal>
          <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: '0 auto', maxWidth: 560 }}>Da igual qué impartas: Tentare se adapta a tus clases, tus salas y tu forma de cobrar.</p></Reveal>
        </div>
        <Reveal delay={100} style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
          {DISCIPLINAS.map((d, i) => (
            <div key={d} style={{ position: 'relative', flexShrink: 0, width: 184, aspectRatio: '3/4', borderRadius: 18, overflow: 'hidden', boxShadow: '0 14px 28px -14px rgba(26,26,26,.28)', background: DISCIPLINA_GRADIENTS[i % DISCIPLINA_GRADIENTS.length] }}>
              <div style={{ position: 'absolute', top: 10, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.94)', padding: '6px 12px 6px 8px', borderRadius: 999, boxShadow: '0 4px 12px rgba(0,0,0,.14)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap' }}>{d}</span>
              </div>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ================= INTEGRACIONES ================= */}
      <section style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ maxWidth: 700, marginBottom: 44 }}>
            <Eyebrow>Integraciones</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.4vw,52px)', lineHeight: 1.02, letterSpacing: '-.04em', margin: '0 0 14px' }}>Se conecta con lo que ya usas.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, lineHeight: 1.55, color: MUTED, margin: 0 }}>No tienes que tirar tus herramientas. Tentare se conecta con las que usas para cobrar, comunicar y organizar tu estudio — y añadimos nuevas cada mes.</p></Reveal>
          </div>
          <Reveal delay={60} style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            {INTEGRACIONES.map((g) => (
              <div key={g.group}>
                <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 12 }}>{g.group}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  {g.items.map((it) => (
                    <span key={it} style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', background: '#fff', border: it.startsWith('+') ? '1px dashed #E7E7E0' : '1px solid #E7E7E0', borderRadius: 999, padding: '10px 18px', whiteSpace: 'nowrap', opacity: it.startsWith('+') ? 0.7 : 1 }}>{it}</span>
                  ))}
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ================= SIN FORMACIÓN ================= */}
      <section style={{ padding: 'clamp(56px,7vw,96px) clamp(20px,4vw,44px)' }}>
        <Reveal style={{ maxWidth: 1280, margin: '0 auto', background: DARK, color: '#E8E8E4', borderRadius: 28, padding: 'clamp(32px,5vw,60px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-30%', right: '-6%', width: 440, height: 440, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.28), transparent 64%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ maxWidth: 640, marginBottom: 'clamp(28px,4vw,40px)' }}>
              <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C08BE8', marginBottom: 14 }}>Sin curva de aprendizaje</div>
              <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4.2vw,48px)', lineHeight: 1.03, letterSpacing: '-.03em', margin: '0 0 12px', color: '#fff' }}>Hecho para usarlo sin manual.</h2>
              <p style={{ fontSize: 17, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>No necesitas formación ni un técnico. Tentare está pensado para que una propietaria ocupada lo maneje desde el primer día. Si sabes usar WhatsApp, sabes usar Tentare.</p>
            </div>
            <div className="tnt-g3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { title: 'El sistema te dice qué hacer', body: 'El Centro de Control te pone delante lo que necesita tu atención. No buscas nada entre menús: llega solo.', color: '#C08BE8' },
                { title: 'Empieza hoy, aprende sobre la marcha', body: 'Activas lo básico primero y el resto cuando te haga falta. Sin cursos ni configuraciones eternas.', color: '#7BD3A8' },
                { title: 'Migración incluida', body: 'Importas tus datos con asistentes guiados por CSV y te acompañamos en la puesta en marcha. No empiezas de cero ni te dejamos sola.', color: '#C08BE8' },
              ].map((c) => (
                <div key={c.title} style={{ background: CARD_DARK, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, padding: 24 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,.08)', color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{IconCheck(20)}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>{c.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ================= PRECIO ================= */}
      <section id="precio" style={{ background: '#F3F3EF', borderTop: '1px solid #E7E7E0', padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <Eyebrow>Precio</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(30px,4.4vw,52px)', lineHeight: 1, letterSpacing: '-.04em', margin: '0 0 12px' }}>Un software completo. Un solo precio.</h2></Reveal>
            <Reveal delay={140}><p style={{ fontSize: 18, color: MUTED, margin: 0 }}>Sustituciones incluidas desde el primer plan. Sin comisión sobre tus cobros. Cancela cuando quieras.</p></Reveal>
          </div>
          <div className="tnt-pricing" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, alignItems: 'stretch' }}>
            {PLANS.map((plan, i) => (
              <Reveal
                key={plan.name}
                delay={i * 90}
                style={{
                  background: plan.dark ? DARK : '#fff',
                  color: plan.dark ? '#E8E8E4' : undefined,
                  border: plan.dark ? 'none' : '1px solid #E7E7E0',
                  borderRadius: 24,
                  padding: 34,
                  position: 'relative',
                  boxShadow: plan.dark ? '0 30px 60px -22px rgba(26,26,26,.45)' : undefined,
                }}
              >
                {plan.popular && (
                  <div className="lp-mono" style={{ position: 'absolute', top: -12, left: 34, background: ACC, color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '6px 13px', borderRadius: 999 }}>POPULAR</div>
                )}
                <div className="lp-mono" style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: plan.dark ? '#C08BE8' : '#8E8E86', marginBottom: 14 }}>{plan.name}</div>
                <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-.03em', color: plan.dark ? '#fff' : undefined }}>{plan.price}<span style={{ fontSize: 16, fontWeight: 500, color: '#8E8E86' }}>/mes</span></div>
                <p style={{ fontSize: 14, color: plan.dark ? '#8E8E86' : MUTED, margin: '6px 0 22px' }}>{plan.desc}</p>
                <div style={{ borderTop: plan.dark ? '1px solid rgba(255,255,255,.08)' : '1px solid #EDEDE6', paddingTop: 18, fontSize: 14.5, color: plan.dark ? '#D8D8D2' : MUTED, lineHeight: 2 }}>
                  {plan.features.map((f, fi) => <span key={f}>{f}{fi < plan.features.length - 1 && <br />}</span>)}
                </div>
                <Link
                  href="/crear-estudio"
                  className="block hover:brightness-95 transition-all"
                  style={{ textAlign: 'center', marginTop: 24, background: plan.popular ? ACC : plan.dark ? '#F3F3EF' : '#F3F3EF', color: plan.popular ? '#fff' : '#1A1A1A', fontWeight: 700, padding: 14, borderRadius: 14 }}
                >
                  {plan.cta}
                </Link>
              </Reveal>
            ))}
          </div>
          <p className="lp-mono" style={{ textAlign: 'center', fontSize: 11, color: '#A8A89F', marginTop: 26 }}>Sin permanencia · Migración incluida · Pagos vía Stripe, sin comisión extra de Tentare</p>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section id="faq" style={{ padding: 'clamp(72px,9vw,116px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <Eyebrow>Preguntas frecuentes</Eyebrow>
            <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4vw,44px)', lineHeight: 1.05, letterSpacing: '-.04em', margin: 0 }}>Antes de que preguntes.</h2></Reveal>
          </div>
          <Reveal delay={120}><Faq /></Reveal>
        </div>
      </section>

      {/* ================= CTA FINAL ================= */}
      <section style={{ padding: 'clamp(90px,11vw,150px) clamp(20px,4vw,44px)', textAlign: 'center', position: 'relative', overflow: 'hidden', background: '#141026', minHeight: 480, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(720px,92vw)', height: 720, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,139,232,.28), transparent 62%)', pointerEvents: 'none' }} />
        <Reveal style={{ position: 'relative' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(40px,7vw,80px)', lineHeight: .98, letterSpacing: '-.04em', margin: '0 0 22px', color: '#fff' }}>Tu estudio entero.<br />Menos caos.</h2>
          <p style={{ fontSize: 'clamp(17px,1.6vw,20px)', color: 'rgba(255,255,255,.82)', margin: '0 0 34px' }}>Todo el software que necesitas — y el que cubre las bajas de instructoras solo. Importas tus datos con asistentes guiados y te acompañamos. Sin permanencia.</p>
          <Link href="/crear-estudio" className={btnCta} style={{ fontSize: 17, fontWeight: 700, padding: '18px 40px', boxShadow: '0 18px 38px rgba(109,40,217,.36)' }}>
            Crear mi estudio →
          </Link>
        </Reveal>
      </section>

      {/* ================= FOOTER ================= */}
      <footer style={{ background: DARK, color: '#8E8E86', padding: 'clamp(52px,7vw,80px) clamp(20px,4vw,44px) 40px' }}>
        <div className="tnt-wrap" style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div className="tnt-footer" style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(4,1fr)', gap: 34, marginBottom: 52 }}>
            <div>
              <Image src="/logo-mark.png" alt="Tentare" width={38} height={38} style={{ height: 38, width: 'auto', marginBottom: 16 }} />
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED_DARK, maxWidth: 260, margin: '0 0 18px' }}>El software completo para tu estudio de pilates. Y el que cubre las bajas de instructoras solo.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <a href="https://instagram.com/tentare.app" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, background: '#1A1A1A', color: '#C4C4BC' }}>
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}><rect width={20} height={20} x={2} y={2} rx={5} /><circle cx={12} cy={12} r={4} /><circle cx={17.5} cy={6.5} r={1} fill="currentColor" stroke="none" /></svg>
                </a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Producto</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
                <a href="#recorrido" style={{ color: '#8E8E86' }}>Todo lo que hace</a>
                <a href="#sustituciones" style={{ color: '#8E8E86' }}>Sustituciones</a>
                <a href="#precio" style={{ color: '#8E8E86' }}>Precio</a>
                <a href="#faq" style={{ color: '#8E8E86' }}>FAQ</a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Plataforma</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
                <a href="#recorrido" style={{ color: '#8E8E86' }}>Reservas y calendario</a>
                <a href="#recorrido" style={{ color: '#8E8E86' }}>Cobros y bonos</a>
                <a href="#recorrido" style={{ color: '#8E8E86' }}>Instructoras</a>
                <a href="#centro-de-control" style={{ color: '#8E8E86' }}>App de marca</a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Empresa</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
                <a href="#top" style={{ color: '#8E8E86' }}>Sobre Tentare</a>
                <a href="https://instagram.com/tentare.app" target="_blank" rel="noopener noreferrer" style={{ color: '#8E8E86' }}>@tentare.app</a>
                <a href="mailto:hola@tentare.app" style={{ color: '#8E8E86' }}>Contacto</a>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8E4', marginBottom: 14 }}>Legal</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, fontSize: 14 }}>
                <a href="#top" style={{ color: '#8E8E86' }}>Aviso legal</a>
                <a href="#top" style={{ color: '#8E8E86' }}>Privacidad</a>
                <a href="#top" style={{ color: '#8E8E86' }}>Cookies</a>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, paddingTop: 26, borderTop: '1px solid rgba(255,255,255,.07)' }}>
            <span className="lp-mono" style={{ fontSize: 12, color: '#6E6E68' }}>© 2026 Tentare · Software para estudios de Pilates · Hecho en España 🇪🇸</span>
            <div className="lp-mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8E8E86', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: '7px 13px' }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx={12} cy={12} r={10} /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              Español (ES)
            </div>
          </div>
        </div>
      </footer>

      <style>{`
        .lp-mono { font-family: var(--font-plex-mono), ui-monospace, monospace; }
        .tnt-spine::before { content:''; position:absolute; left:3.5px; top:0; bottom:0; width:2px; background:rgba(26,26,26,.12); border-radius:2px; z-index:0; }
        @media (max-width: 1150px) { .tnt-spine { display: none !important; } }
        @media (max-width: 960px) {
          .tnt-hero, .tnt-row { grid-template-columns: 1fr !important; }
          .tnt-row > div { order: unset !important; }
          .tnt-navlinks, .tnt-navcta { display: none !important; }
          .tnt-menubtn { display: inline-flex !important; }
          .tnt-g2, .tnt-g3 { grid-template-columns: 1fr !important; }
          .tnt-pricing { grid-template-columns: 1fr !important; max-width: 440px; margin: 0 auto; }
          .tnt-footer { grid-template-columns: repeat(3,1fr) !important; }
          .tnt-steps4 { grid-template-columns: repeat(2,1fr) !important; gap: 28px; }
          .tnt-flowline { display: none !important; }
        }
        @media (max-width: 600px) {
          .tnt-footer { grid-template-columns: 1fr 1fr !important; }
          .tnt-steps4 { grid-template-columns: 1fr !important; }
          .tnt-herobadge { display: none; }
        }
        @keyframes lp-riseIn { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        @keyframes lp-dash { to { stroke-dashoffset: 0; } }
        @keyframes lp-floatA { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-13px); } }
        @keyframes lp-floatB { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
        @keyframes lp-floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ─── Recorrido visual mockups ───────────────────────────────────────────────

function RecorridoVisual({ index }: { index: number }) {
  const base: React.CSSProperties = { background: '#fff', border: '1px solid #E7E7E0', borderRadius: 22, padding: 20, boxShadow: '0 34px 70px -34px rgba(26,26,26,.28)', maxWidth: 440, margin: '0 auto' };

  if (index === 0) {
    return (
      <div style={base}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Reformer Flow</div>
          <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Hoy · 19:00 · Sala 1</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex' }}>
            {['#D8C3E0', '#A8C7CE', ACC_SOFT].map((c, i) => (
              <span key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: '2px solid #fff', marginLeft: i ? -9 : 0 }} />
            ))}
            <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#EDEDE6', border: '2px solid #fff', marginLeft: -9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#8E8E86' }}>+5</span>
          </div>
          <span className="lp-mono" style={{ fontSize: 12, color: '#4E9E7F', marginLeft: 'auto' }}>8/10 plazas</span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: '#EDEDE6', overflow: 'hidden', marginBottom: 16 }}><div style={{ height: '100%', width: '80%', background: ACC, borderRadius: 99 }} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F1', borderRadius: 12, padding: '11px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, background: ACC_SOFT, color: ACC, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{IconCalendar(12)}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Lista de espera</span>
          </div>
          <span className="lp-mono" style={{ fontSize: 11.5, color: '#8E8E86' }}>2 en espera</span>
        </div>
        <div style={{ textAlign: 'center', background: ACC, color: '#fff', fontSize: 14, fontWeight: 700, padding: 12, borderRadius: 12 }}>Reservar</div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div style={base}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, background: '#F5F5F1', marginBottom: 8 }}>
          <Avatar label="N" bg="#D8C3E0" />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Nora P.</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Bono 8 · 3 sesiones</div></div>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#4E9E7F', background: '#E7F3EC', padding: '5px 9px', borderRadius: 999 }}>Activa</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14, background: '#F5F5F1', marginBottom: 8 }}>
          <Avatar label="C" bg="#A8C7CE" />
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Carla M.</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Mensual ilimitado</div></div>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#B57A8E', background: '#FBEDE8', padding: '5px 9px', borderRadius: 999 }}>Renovar</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: DARK, borderRadius: 14, padding: '11px 14px', marginTop: 12 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,.08)', color: '#C08BE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{IconInvoice(13)}</span>
          <div style={{ fontSize: 12.5, color: '#E8E8E4', flex: 1 }}>&ldquo;Te esperamos mañana en tu Reformer 💜&rdquo;</div>
          <span className="lp-mono" style={{ fontSize: 10, color: '#7BD3A8' }}>Enviado ✓</span>
        </div>
      </div>
    );
  }
  if (index === 2) {
    const cells = [
      { d: 'LUN' }, { d: 'MAR' }, { d: 'MIÉ' }, { d: 'JUE' },
      { bg: ACC_SOFT, bar: ACC, title: 'Reformer', sub: 'Sala 1' },
      { bg: '#EDF3F4', bar: '#3E7C86', title: 'Mat', sub: 'Sala 2' },
      { bg: '#F5F5F1' },
      { bg: ACC_SOFT, bar: ACC, title: 'Reformer', sub: 'Sala 1' },
      { bg: '#F3ECF5', bar: '#8B4F9E', title: 'Prenatal', sub: 'Sala 1' },
      { bg: '#F5F5F1' },
      { bg: '#EDF3F4', bar: '#3E7C86', title: 'Mat', sub: 'Sala 2' },
      { bg: '#F5F5F1' },
    ];
    return (
      <div style={base}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Semana</div>
          <div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>30 jun – 5 jul</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
          {cells.map((c, i) =>
            'd' in c ? (
              <div key={i} className="lp-mono" style={{ fontSize: 10, color: '#A8A89F', textAlign: 'center' }}>{c.d}</div>
            ) : c.title ? (
              <div key={i} style={{ background: c.bg, borderLeft: `3px solid ${c.bar}`, borderRadius: 7, padding: '7px 8px' }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{c.title}</div>
                <div className="lp-mono" style={{ fontSize: 9, color: '#8E8E86' }}>{c.sub}</div>
              </div>
            ) : (
              <div key={i} style={{ background: c.bg, borderRadius: 7, minHeight: 30 }} />
            )
          )}
        </div>
      </div>
    );
  }
  if (index === 3) {
    return (
      <div style={base}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F5F5F1', borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: '#E7F3EC', color: '#4E9E7F', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{IconCheck(17)}</span>
            <div><div style={{ fontSize: 14, fontWeight: 700 }}>Bono 10 sesiones</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>Carla M. · renovado</div></div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>120€</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', border: '1px solid #EDEDE6', borderRadius: 14, marginBottom: 16 }}>
          <div className="lp-mono" style={{ fontSize: 12, color: MUTED }}>Factura #0042</div>
          <span className="lp-mono" style={{ fontSize: 10.5, color: '#4E9E7F', background: '#E7F3EC', padding: '5px 9px', borderRadius: 999 }}>Emitida</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div><div className="lp-mono" style={{ fontSize: 10, textTransform: 'uppercase', color: '#A8A89F' }}>Ingresos mes</div><div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' }}>8.940€</div></div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 38 }}>
            {['40%', '60%', '50%', '80%', '100%'].map((h, i) => (
              <span key={i} style={{ width: 8, height: h, background: i === 4 ? ACC : '#E1DAF3', borderRadius: 3 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (index === 4) {
    const team = [
      { name: 'Ana', spec: 'Reformer · Mat', hours: '24 h', bg: '#D8C3E0', active: true },
      { name: 'Lucía', spec: 'Mat · Prenatal', hours: '18 h', bg: '#A8C7CE', active: true },
      { name: 'Marta', spec: 'Prenatal', hours: '12 h', bg: ACC_SOFT, active: false },
    ];
    return (
      <div style={base}>
        {team.map((m, i) => (
          <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < team.length - 1 ? '1px solid #EDEDE6' : undefined }}>
            <Avatar label={m.name[0]} bg={m.bg} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{m.name}</div><div className="lp-mono" style={{ fontSize: 11, color: '#8E8E86' }}>{m.spec}</div></div>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.active ? '#4E9E7F' : '#E4C65A' }} />
            <span className="lp-mono" style={{ fontSize: 12, color: MUTED, width: 42, textAlign: 'right' }}>{m.hours}</span>
          </div>
        ))}
      </div>
    );
  }
  // index === 5 — panel
  return (
    <div style={{ background: BG, border: '1px solid #E1E1D9', borderRadius: 18, overflow: 'hidden', boxShadow: '0 34px 70px -34px rgba(26,26,26,.3)', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#E9E9E2', borderBottom: '1px solid #E1E1D9' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#D8C3E0' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E1E1D8' }} />
        <span className="lp-mono" style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: '#A8A89F' }}>tentare.app</span>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div className="lp-mono" style={{ fontSize: 10, textTransform: 'uppercase', color: '#A8A89F' }}>Lunes, 6 de julio</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>Buenas tardes 👋</div>
          </div>
          <div style={{ background: ACC, color: '#fff', fontSize: 11, fontWeight: 700, padding: '8px 13px', borderRadius: 999 }}>Abrir caja</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
          <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '11px 12px' }}>
            <div className="lp-mono" style={{ fontSize: 9, textTransform: 'uppercase', color: '#A8A89F' }}>Ingresos mes</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>8.940€</div>
            <div style={{ fontSize: 10, color: '#4E9E7F', fontWeight: 700 }}>▲ 12%</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '11px 12px' }}>
            <div className="lp-mono" style={{ fontSize: 9, textTransform: 'uppercase', color: '#A8A89F' }}>Ocupación</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>87%</div>
            <div style={{ height: 4, borderRadius: 99, background: '#EDEDE6', marginTop: 7, overflow: 'hidden' }}><div style={{ height: '100%', width: '87%', background: ACC, borderRadius: 99 }} /></div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '11px 12px' }}>
            <div className="lp-mono" style={{ fontSize: 9, textTransform: 'uppercase', color: '#A8A89F' }}>Reservas hoy</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>64</div>
            <div style={{ fontSize: 10, color: '#8E8E86' }}>8 clases</div>
          </div>
        </div>
      </div>
    </div>
  );
}
