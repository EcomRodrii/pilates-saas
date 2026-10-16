'use client';

// TEMPORAL — maquetas «clase fija y bonos, ordenados» (6-oct-2026). No se commitea.
import type { CSSProperties, ReactNode } from 'react';
import '../../portal/[slug]/student.css';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

const H = '/zz-hoy';

function Movil({ titulo, nota, children, img, etiqueta }: { titulo: string; nota?: string; children?: ReactNode; img?: string; etiqueta: 'Tentare hoy' | 'Propuesta' }) {
  const color = etiqueta === 'Propuesta' ? '#2E5A3A' : '#666';
  return (
    <figure style={{ margin: 0, width: 280, flex: 'none' }}>
      <span style={{ display: 'inline-block', marginBottom: 8, fontSize: 12, fontWeight: 800, letterSpacing: '.08em', color, textTransform: 'uppercase' }}>{etiqueta}</span>
      <div className="student-app" style={{ width: 280, height: 606, borderRadius: 38, overflow: 'hidden', border: '8px solid #111', background: 'var(--background)', position: 'relative', boxShadow: '0 18px 44px rgba(0,0,0,.16)' }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt="" style={{ width: '100%', display: 'block' }} />
          : (
            <>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9, height: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', fontSize: 11, fontWeight: 700, background: 'var(--background)' }}>
                <span>9:41</span><span style={{ width: 74, height: 20, borderRadius: 20, background: '#000' }} /><span>●●●</span>
              </div>
              <div style={{ height: 818, overflow: 'hidden', zoom: 0.72, position: 'relative' } as CSSProperties}>{children}</div>
            </>
          )}
      </div>
      <figcaption style={{ marginTop: 10, fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.4 }}>
        <b>{titulo}</b>{nota && <span style={{ display: 'block', color: '#666' }}>{nota}</span>}
      </figcaption>
    </figure>
  );
}

const card: CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: 16 };
const label: CSSProperties = { fontSize: 12, letterSpacing: '.1em', fontWeight: 800, color: 'var(--muted-foreground)', margin: 0, textTransform: 'uppercase' };
const meta: CSSProperties = { fontSize: 14, color: 'var(--muted-foreground)', margin: 0, lineHeight: 1.4 };
const enlace: CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--accent)' };
const badge = (t: string, tono: 'ok' | 'aviso' | 'neutro' = 'ok') => (
  <span className="badge" style={{
    background: tono === 'ok' ? 'var(--accent-soft)' : tono === 'aviso' ? '#F6E7B8' : 'var(--muted)',
    color: tono === 'ok' ? 'var(--accent-soft-foreground)' : tono === 'aviso' ? '#6B5310' : 'var(--foreground)',
    fontSize: 12, padding: '4px 9px',
  }}>{t}</span>
);

function Pestanas({ activa }: { activa: number }) {
  const t: [NombreIcono, string][] = [['inicio', 'Inicio'], ['reservar', 'Reservar'], ['mis-clases', 'Mis clases'], ['bono', 'Mi plan'], ['perfil', 'Perfil']];
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, background: 'var(--card)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-around', paddingTop: 10, zIndex: 5 }}>
      {t.map(([n, l], i) => (
        <span key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: i === activa ? 800 : 600, color: i === activa ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
          <Icono nombre={n} tamano={22} />{l}
        </span>
      ))}
    </div>
  );
}

function BarraSuperior() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 6px' }}>
      <span style={{ width: 34, height: 34, borderRadius: 99, background: '#4A3530', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>T</span>
      <b style={{ flex: 1, fontSize: 18 }}>Tentare</b>
      <span style={{ width: 40, height: 40, borderRadius: 99, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icono nombre="campana" tamano={20} /></span>
      <span style={{ width: 40, height: 40, borderRadius: 99, background: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>LM</span>
    </div>
  );
}

function Cabecera({ t, derecha }: { t: string; derecha?: ReactNode }) {
  return (
    <>
    <BarraSuperior />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <p style={{ fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-.02em' }}>{t}</p>{derecha}
    </div>
    </>
  );
}

function Fila({ icono, t, sub, derecha, rojo }: { icono: NombreIcono; t: ReactNode; sub?: ReactNode; derecha?: ReactNode; rojo?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ color: rojo ? '#B42318' : 'var(--accent)' }}><Icono nombre={icono} tamano={20} /></span>
      <span style={{ flex: 1, fontSize: 16, color: rojo ? '#B42318' : undefined, fontWeight: 600 }}>{t}{sub && <span style={{ display: 'block', ...meta, fontWeight: 400 }}>{sub}</span>}</span>
      {derecha ?? <Icono nombre="chevron-derecha" tamano={16} />}
    </div>
  );
}

function Barra({ v, de }: { v: number; de: number }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {Array.from({ length: de }, (_, i) => <span key={i} style={{ flex: 1, height: 8, borderRadius: 9, background: i < v ? 'var(--accent)' : 'var(--muted)' }} />)}
    </div>
  );
}

function Anillo({ quedan, de }: { quedan: number; de: number }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden>
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(quedan / de) * c} ${c}`} transform="rotate(-90 56 56)" />
      <text x="56" y="56" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--foreground)">{quedan}</text>
      <text x="56" y="76" textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">de {de}</text>
    </svg>
  );
}

// ─── Piezas de «Mi plan» ─────────────────────────────────────────────────────
function TarjetaCuota({ conFija = true }: { conFija?: boolean }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={label}>Tu cuota</p>{badge('Al día')}
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Reformer 2 días/semana</p>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Esta semana</span>
          <span style={{ fontSize: 26, fontWeight: 800 }}>1 <span style={{ fontSize: 16, color: 'var(--muted-foreground)' }}>de 2</span></span>
        </div>
        <Barra v={1} de={2} />
        <p style={{ ...meta, marginTop: 6 }}>Te queda 1 clase hasta el domingo.</p>
      </div>
      <p style={meta}>Próxima renovación: 1 nov · 89 €</p>
      {conFija && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--accent-soft)' }}>
          <Icono nombre="calendario" tamano={18} />
          <span style={{ flex: 1, fontSize: 15 }}><b>Tu clase fija:</b> lunes 10:00<span style={{ display: 'block', fontSize: 13 }}>Próxima: mañana</span></span>
          <Icono nombre="chevron-derecha" tamano={16} />
        </div>
      )}
    </div>
  );
}

function TarjetaBono({ secundaria }: { secundaria?: boolean }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={label}>{secundaria ? 'También tienes' : 'Tu bono'}</p>{badge('Caduca en 26 días', 'neutro')}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Anillo quedan={7} de={10} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <b style={{ fontSize: 19 }}>Bono 10 clases</b>
          <span style={meta}>Te quedan 7 · hasta el 31 oct</span>
          <span style={meta}>Para todas las clases</span>
          {secundaria && <span style={{ ...meta, color: 'var(--foreground)' }}>Se usa cuando tu cuota no cubre la clase.</span>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={meta}>2 ya reservadas con este bono</span><span style={enlace}>Movimientos ›</span></div>
    </div>
  );
}

function Recuperaciones() {
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ color: 'var(--accent)' }}><Icono nombre="racha" tamano={22} /></span>
      <span style={{ flex: 1 }}><b style={{ fontSize: 16, display: 'block' }}>2 clases por recuperar</b><span style={meta}>La primera caduca el 20 oct</span></span>
      <span className="btn btn--secondary btn--sm">Elegir clase</span>
    </div>
  );
}

function PieMiPlan() {
  return (
    <div style={{ ...card, padding: '2px 16px' }}>
      <div style={{ borderTop: 'none' }}><Fila icono="mas" t="Tienda" sub="Bonos, cuotas y clases sueltas" /></div>
      <Fila icono="bono" t="Recibos" sub="Último: 1 oct · 89 € · Pagado" />
    </div>
  );
}

function MiPlan({ perfil }: { perfil: 'cuota' | 'bono' | 'ambos' }) {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 110px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Cabecera t="Mi plan" />
        {perfil !== 'bono' && <TarjetaCuota />}
        {perfil === 'bono' && <TarjetaBono />}
        {perfil === 'ambos' && <TarjetaBono secundaria />}
        {perfil !== 'ambos' && <Recuperaciones />}
        <PieMiPlan />
        {perfil === 'bono' && <p style={{ ...meta, textAlign: 'center' }}>Anteriores (2) ›</p>}
      </div>
      <Pestanas activa={3} />
    </div>
  );
}

function MiPlanPendiente() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 110px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Cabecera t="Mi plan" />
        <div style={{ ...card, borderColor: '#C9A227', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={label}>Pago pendiente</p>
          <b style={{ fontSize: 18 }}>Cuota de octubre · 89 €</b>
          <span style={meta}>No se ha podido cobrar sola: no tienes una tarjeta guardada.</span>
          <span className="btn btn--primary btn--full">Pagar 89 €</span>
        </div>
        <div style={{ opacity: 0.55 }}><TarjetaCuota conFija={false} /></div>
        <PieMiPlan />
      </div>
      <Pestanas activa={3} />
    </div>
  );
}

// ─── Mis clases → Clase fija ─────────────────────────────────────────────────
function MisClasesFija() {
  const semanas: [string, string, 'vas' | 'no'][] = [['LUN', '6', 'vas'], ['LUN', '13', 'vas'], ['LUN', '20', 'no'], ['LUN', '27', 'vas'], ['LUN', '3', 'vas']];
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 110px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Cabecera t="Mis clases" />
        <div style={{ display: 'flex', background: 'var(--muted)', borderRadius: 12, padding: 3 }}>
          {['Próximas', 'Clase fija', 'Historial'].map((t, i) => <span key={t} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 10, fontSize: 14, fontWeight: 800, background: i === 1 ? 'var(--card)' : 'transparent' }}>{t}</span>)}
        </div>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><p style={label}>Tu clase fija</p>{badge('Activa')}</div>
          <p style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Lunes · 10:00</p>
          <span style={meta}>Reformer · Sala Sol · con Lucía</span>
          <span style={{ ...meta, color: 'var(--foreground)' }}>Se reserva sola cada semana. Tú solo avisa si un día no vas.</span>
          <span style={meta}>Sin fecha de fin · va con tu cuota</span>
        </div>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><p style={label}>Próximas semanas</p><span style={{ ...meta, fontSize: 12 }}>Toca un día si no vas</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            {semanas.map(([d, n, e]) => (
              <span key={n} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 14, border: `1.5px solid ${e === 'vas' ? 'var(--accent)' : 'var(--border)'}`, background: e === 'vas' ? 'var(--accent-soft)' : 'var(--card)' }}>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 800 }}>{d}</span>
                <span style={{ display: 'block', fontSize: 18, fontWeight: 800 }}>{n}</span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: e === 'vas' ? 'var(--accent-soft-foreground)' : 'var(--muted-foreground)' }}>{e === 'vas' ? 'Vas' : 'No vas'}</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ ...card, padding: '2px 16px' }}>
          <div><Fila icono="calendario" t="Ver el mes entero" sub="Octubre: 4 clases" /></div>
          <Fila icono="reloj" t="Pausar unas semanas" sub="Tu estudio la confirma" />
          <Fila icono="comentario" t="Cambiar de día u hora" sub="Escribe al estudio" />
          <Fila icono="cerrar" t="Dejar mi clase fija" rojo derecha={<span />} />
        </div>
      </div>
      <Pestanas activa={2} />
    </div>
  );
}

// ─── Inicio: una tarjeta «Lo tuyo» ───────────────────────────────────────────
function InicioLoTuyo() {
  const L = ({ i, t, s }: { i: NombreIcono; t: ReactNode; s: string }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--accent)' }}><Icono nombre={i} tamano={20} /></span>
      <span style={{ flex: 1, fontSize: 15 }}>{t}<span style={{ display: 'block', ...meta, fontSize: 13 }}>{s}</span></span>
      <Icono nombre="chevron-derecha" tamano={16} />
    </div>
  );
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 110px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <BarraSuperior />
        <p style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Hola, Lucía</p>
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={label}>Tu próxima clase</p>
          <b style={{ fontSize: 20 }}>Mañana · 10:00</b>
          <span style={meta}>Reformer · Sala Sol · con Lucía</span>
          {badge('Tu clase fija')}
        </div>
        <div style={{ ...card, paddingBottom: 6 }}>
          <p style={{ ...label, marginBottom: 4 }}>Lo tuyo</p>
          <L i="bono" t={<><b>Tu cuota</b> · esta semana 1 de 2</>} s="Próxima renovación: 1 nov" />
          <L i="calendario" t={<><b>Tu clase fija</b> · lunes 10:00</>} s="Próxima: mañana" />
          <L i="racha" t={<><b>2 clases por recuperar</b></>} s="La primera caduca el 20 oct" />
        </div>
        <p style={{ ...meta, textAlign: 'center' }}>(debajo, lo de siempre: huecos de hoy, descubre…)</p>
      </div>
      <Pestanas activa={0} />
    </div>
  );
}

// ─── Recibos con «Pagar» ─────────────────────────────────────────────────────
function Recibos() {
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ padding: '50px 20px 110px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icono nombre="chevron-izquierda" tamano={22} /><p style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Recibos</p></div>
        <div style={{ ...card, borderColor: '#C9A227', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={label}>Te queda por pagar</p>
          <b style={{ fontSize: 26 }}>89 €</b>
          <span style={meta}>Cuota de octubre · vence el 5 oct</span>
          <span className="btn btn--primary btn--full">Pagar 89 €</span>
        </div>
        <p style={label}>Septiembre</p>
        <div style={{ ...card, padding: '2px 16px' }}>
          <div><Fila icono="bono" t="Cuota de septiembre" sub="1 sep · 89 €" derecha={badge('Pagado')} /></div>
          <Fila icono="bono" t="Clase suelta · Barre" sub="12 sep · 20 €" derecha={badge('Pagado')} />
        </div>
      </div>
      <Pestanas activa={3} />
    </div>
  );
}

// ─── Textos ──────────────────────────────────────────────────────────────────
const ORDEN: [string, string][] = [
  ['¿Qué tengo y cuánto me queda?', '«Mi plan» (la pestaña que hoy se llama «Bonos»). Tu cuota, tu bono y tus recuperaciones, en ese orden y con el mismo formato. Arriba lo que pagas primero.'],
  ['¿Cuándo vengo?', '«Mis clases». La clase fija se gestiona SOLO aquí, en su pestaña «Clase fija»: no voy esta semana, pausar, ver el mes, cambiar de día y dejarla.'],
  ['Comprar y pagar', 'Una entrada con un solo nombre, «Tienda», y una sola pantalla de «Recibos» donde también se paga lo pendiente.'],
];

const DONDE: [string, string, string][] = [
  ['Cuota: tope, «Esta semana», vigencia', 'Bonos → bloque de la cuota', 'Mi plan → «Tu cuota» (próxima renovación)'],
  ['Anillo del bono, caducidad, movimientos', 'Bonos → anillo', 'Mi plan → «Tu bono» (o «También tienes» si hay cuota)'],
  ['Tu clase fija (resumen)', 'Inicio, Bonos (fila), Mis clases, ficha: 4 formatos', 'Mismo formato en Inicio y en Mi plan: «lunes 10:00 · próxima: mañana» → abre Mis clases'],
  ['Gestionar la clase fija', 'Mis clases → «Fija» + interruptor de la ficha', 'Mis clases → «Clase fija». El interruptor de la ficha sigue para PEDIRLA y para dejarla (mismo diálogo)'],
  ['«No voy esta semana»', 'Píldora en Fija · «Cancelar» en Próximas · «Gestionar» en la ficha', 'Los mismos tres, con el MISMO diálogo y el mismo texto (ya lo es; se quita la frase que remite a dos sitios)'],
  ['Recuperaciones', '5 sitios (Inicio, Bonos, Fija, Perfil, «Esta semana»)', 'Mi plan + la línea de Inicio. Perfil lleva siempre a Mi plan'],
  ['Comprar', '10 botones con 10 nombres', '«Tienda» en Mi plan y Perfil; «Ver opciones» en la ficha cuando la clase no está cubierta'],
  ['Recibos', '«Pagos», «Recibos y facturas», «Pagos y recibos» (3 nombres)', '«Recibos». Lo pendiente se paga ahí (hoy «Pagar lo pendiente» lleva a una pantalla sin pagar)'],
  ['Renovación pendiente', 'Bonos, arriba', 'Mi plan, arriba (igual) y en Recibos'],
  ['Clases sueltas de la tienda, código, primera clase', 'Comprar', 'Tienda (sin cambios)'],
  ['Pausa de la clase fija', 'Mis clases → Fija', 'Igual'],
  ['Anteriores', 'Bonos → «Anteriores»', 'Mi plan → «Anteriores (N)», plegado'],
  ['Ficha de una clase fija', '«Reservada» + «Es tu clase fija · Incluida en tu cuota» + «Incluida en tu cuota» (3 veces)', 'Una vez: «Tu clase fija · incluida en tu cuota». Sin «no se devuelve la sesión» a quien no gasta sesiones'],
  ['Ficha con bono', 'El bono nombrado 3 veces', 'Una tarjeta del bono; «Reservar las próximas» dentro de ella'],
  ['Hoja sin bono ni cuota', '«Confirmar · Solo con bono» que parece activo + «compra desde Perfil → Comprar»', 'Botón «Ver opciones» que abre la tienda filtrada por esa clase'],
];

const PALABRAS: [string, string][] = [
  ['cuota', 'nunca «mensualidad», «suscripción» ni «plan» para la cuota (la tienda dirá «Cuotas», no «Suscripciones»)'],
  ['bono', 'solo para packs de sesiones; una cuota ya no sale como «Tu bono», «Activando tu bono» ni «Ver el bono»'],
  ['clase fija', 'nunca «plaza», «hueco» ni «auto reservable»; la pestaña dice «Clase fija», no «Fija»'],
  ['Sin máximo semanal', 'en vez de «Sin límite» / «Clases sin límite»'],
  ['Próxima renovación: …', 'la misma idea en la tienda y en Mi plan (hoy una dice «se renueva sola» y la otra solo «vigente hasta»)'],
  ['Tienda / Recibos', 'un nombre cada una, en todas partes'],
];

const DECIDIR: [string, string][] = [
  ['1 · Nombre de la pestaña', '«Mi plan» (recomendado: cabe la cuota y el bono) o dejar «Bonos».'],
  ['2 · Recuperaciones', 'Viven en Mi plan (+ la línea de Inicio). Se quitan de Mis clases → Clase fija y del bloque repetido. ¿OK?'],
  ['3 · Inicio', 'Las tarjetas «Tu ritmo» y «Tu clase fija» se funden en una, «Lo tuyo», con una línea por cosa que lleva a su sitio. ¿OK?'],
  ['4 · Pagar en Recibos', 'Los recibos pendientes se pagan desde «Recibos» (con la misma hoja de pago que ya hay en Bonos). Es dinero: va con revisión de pagos.'],
  ['5 · Pestaña «Clase fija»', 'Solo a quien tiene cuota o ya tiene clase fija. A las demás no les sale (hoy ven un tutorial de 3 pasos). ¿OK?'],
];

export default function Maquetas() {
  const Fila3 = ({ t, children }: { t: string; children: ReactNode }) => (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 14px' }}>{t}</h2>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
    </section>
  );
  const caja: CSSProperties = { background: '#fff', borderRadius: 16, padding: 24 };
  return (
    <main style={{ background: '#EEECE6', minHeight: '100vh', padding: 36, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>Clase fija y bonos, ordenados</h1>
      <p style={{ margin: '0 0 22px', color: '#555', maxWidth: 1100 }}>Hoy lo mismo está en varios sitios con nombres distintos (la clase fija en 4, las recuperaciones en 5, comprar en 10 botones). Propuesta: tres preguntas, tres sitios. No se quita ninguna función: solo cambia dónde vive cada una.</p>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {ORDEN.map(([t, d]) => <div key={t} style={caja}><b style={{ display: 'block', fontSize: 17, marginBottom: 6 }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.5 }}>{d}</span></div>)}
      </section>

      <Fila3 t="1 · Mi plan (hoy «Bonos»)">
        <Movil etiqueta="Tentare hoy" titulo="Bonos con cuota" nota="«Bonos · Tus sesiones y su caducidad» a quien no tiene ni bono ni sesiones." img={`${H}/bonos-cuota.png`} />
        <Movil etiqueta="Tentare hoy" titulo="Bonos con cuota y bono" nota="Dos tarjetas apiladas; nada dice cuál se usa primero." img={`${H}/bonos-ambos.png`} />
        <Movil etiqueta="Propuesta" titulo="Con cuota y clase fija" nota="Cuánto te queda ESTA semana, cuándo se renueva y tu clase fija en una línea."><MiPlan perfil="cuota" /></Movil>
        <Movil etiqueta="Propuesta" titulo="Con bono" nota="El anillo como hoy, con la fecha real de caducidad."><MiPlan perfil="bono" /></Movil>
        <Movil etiqueta="Propuesta" titulo="Con cuota y además un bono" nota="Dice cuál se usa primero."><MiPlan perfil="ambos" /></Movil>
        <Movil etiqueta="Propuesta" titulo="Con un pago pendiente" nota="Lo primero que ves, con el importe en el botón."><MiPlanPendiente /></Movil>
      </Fila3>

      <Fila3 t="2 · Mis clases → Clase fija · 3 · Inicio · 4 · Recibos">
        <Movil etiqueta="Tentare hoy" titulo="Mis clases → Fija" img={`${H}/mis-clases-fija.png`} />
        <Movil etiqueta="Tentare hoy" titulo="«Fija» a quien no tiene cuota" nota="Sale a todas: un tutorial de 3 pasos que mezcla el bono." img={`${H}/fija-sin-cuota.png`} />
        <Movil etiqueta="Propuesta" titulo="Todo lo de tu clase fija, en un sitio" nota="Las cuatro acciones en una lista; sin recuperaciones mezcladas."><MisClasesFija /></Movil>
        <Movil etiqueta="Propuesta" titulo="Inicio: «Lo tuyo»" nota="Una tarjeta en vez de dos; cada línea lleva a su sitio."><InicioLoTuyo /></Movil>
        <Movil etiqueta="Tentare hoy" titulo="Pagos" nota="«Te queda por pagar» sin ninguna acción." img={`${H}/pagos-pendiente.png`} />
        <Movil etiqueta="Propuesta" titulo="Recibos: ver y pagar" nota="Hoy «Pagar lo pendiente» lleva aquí y no deja pagar."><Recibos /></Movil>
      </Fila3>

      <section style={{ ...caja, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Dónde queda cada cosa de hoy · no se quita nada</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>{['Qué', 'Hoy', 'Propuesta'].map((t) => <th key={t} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd' }}>{t}</th>)}</tr></thead>
          <tbody>{DONDE.map(([a, b, c]) => <tr key={a}>{[a, b, c].map((t, i) => <td key={i} style={{ padding: '8px 10px', borderBottom: '1px solid #eee', fontWeight: i === 0 ? 700 : 400, color: i === 1 ? '#666' : '#111', verticalAlign: 'top' }}>{t}</td>)}</tr>)}</tbody>
        </table>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={caja}>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Una palabra para cada cosa</h2>
          {PALABRAS.map(([p, d]) => <p key={p} style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.45 }}><b>{p}</b> — <span style={{ color: '#444' }}>{d}</span></p>)}
        </div>
        <div style={caja}>
          <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Decisiones tuyas</h2>
          {DECIDIR.map(([t, d]) => <div key={t} style={{ marginBottom: 12 }}><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>)}
        </div>
      </section>
    </main>
  );
}
