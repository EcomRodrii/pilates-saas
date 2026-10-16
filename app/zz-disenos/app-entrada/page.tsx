'use client';

// TEMPORAL — maquetas de la entrada de la app de iOS para capturas. No se commitea.
import type { ReactNode } from 'react';
import '../../portal/[slug]/student.css';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { Icono } from '@/components/student/ui/Icono';
import { urlMonograma } from '@/lib/monograma-estudio';

const EST = [
  { nombre: 'Alba Pilates', ciudad: 'Valencia', color: '#7A8B6F', como: 'Alumna', ultimo: true },
  { nombre: 'Núcleo Reformer', ciudad: 'Madrid · Chamberí', color: '#B4537E', como: 'Alumna e instructora' },
  { nombre: 'Estudio Brisa', ciudad: 'Alicante', color: '#3E6B8A', como: 'Alumna' },
];
const ico = (n: string, c: string) => urlMonograma(n, c, 192);

const DECISIONES: [string, string, string][] = [
  ['1', 'Se entra con el email y un código, no con contraseña', 'Una sola pantalla: email → «Continuar» → código de 6 cifras que iOS rellena solo desde Mail. Es lo que hizo Mindbody en 2025 y quita las dos quejas más repetidas de todas: «no recuerdo la contraseña» y «el estudio me dio de alta y nunca tuve contraseña» (bsport obliga a pasar por «la he olvidado»). Quien ya tiene contraseña la sigue usando con «Usar mi contraseña».'],
  ['2', 'Entrar y darse de alta es lo mismo', 'Ya no hay «¿tienes cuenta?». Escribe su email: si ya está, entra; si no, se crea su cuenta Tentare con ese código. Tampoco revela quién tiene cuenta. El consentimiento del estudio se sigue dando DENTRO del estudio (como hoy), con su nombre y sus textos.'],
  ['3', 'Te reconocemos aunque nunca hayas entrado', 'Hoy, la socia que dio de alta el estudio (o que vino importada) y no ha entrado nunca ve «Tu cuenta no está en ningún estudio». Ahora, con el email verificado por el código, salen también los estudios que ya la tienen en su ficha con ese email, y al entrar se vincula sola (lo mismo que ya hace la app del estudio). Es justo donde fallan bsport y Momence.'],
  ['4', 'Un estudio: directa a su app. Varios: «Tus estudios»', 'Con su logo de verdad (el favicon que sube el estudio, que hoy no se usa aquí: solo el logo o la inicial), su nombre, su ciudad y su papel. El último abierto arriba, marcado. Nunca aparece un estudio que no la tenga dada de alta (queja de bsport: estudios que se añaden solos y no se pueden quitar).'],
  ['5', 'Cambiar de estudio sin cerrar sesión', 'Dentro de la app del estudio, en Perfil: «Cambiar de estudio» vuelve a «Tus estudios». Hoy no hay forma de volver a la lista sin salir (queja de Glofox y TIMP).'],
  ['6', 'Tres formas de llegar a tu estudio, sin pedir ubicación', 'El enlace o el QR que comparte el estudio abre la app directamente dentro de él. El buscador por nombre ignora tildes y mayúsculas y enseña logo y ciudad. Nunca se exige la ubicación (Momence, Eversports y Glofox fallan por eso).'],
  ['7', 'Ver el estudio antes de crear la cuenta', 'Del buscador se va a la ficha del estudio: su logo, ciudad y «Ver horario», que abre el horario público. La cuenta se pide al reservar. bsport lo estrenó en 2026.'],
  ['8', 'Apple sí, Google todavía no', 'Sign in with Apple ya está. Si Apple da un email oculto, «¿Tu estudio te tiene con otro email?» pide ese email y un código para vincularlo, sin crear una cuenta paralela (fallo de Mindbody y Eversports). Google llega después (lo pide la norma 4.8 junto a Apple, no al revés).'],
  ['9', 'Borrar tu cuenta, desde la app', 'Perfil → «Borrar mi cuenta de Tentare»: se borra la cuenta al momento y se explica qué guarda cada estudio por ley (facturas). Apple lo exige (5.1.1(v)); hoy solo se puede pedir al estudio.'],
  ['10', '«¿No puedes entrar?» siempre a mano', 'Abajo en la puerta: qué hacer si no llega el código y cómo hablar con tu estudio o con Tentare. La falta de ayuda es queja fija de Momence, bsport y TIMP.'],
  ['11', 'Dentro del estudio, solo el estudio', 'Ni Tentare ni otros estudios ni anuncios: lo contrario de Mindbody (anuncios tras reservar, «explora» otros negocios). La marca Tentare se queda en la puerta.'],
  ['12', 'La sesión no caduca', 'Se queda abierta mientras se use; actualizar la app no echa a nadie. Es la queja nº 1 de las cuatro apps.'],
];

const HOY: [string, string][] = [
  ['Email + contraseña', 'Sigue: «Usar mi contraseña» bajo el código (decisión 1).'],
  ['«No tengo contraseña — mándame un enlace»', 'Pasa a ser la forma principal: el código (y el enlace del mismo correo sigue funcionando).'],
  ['Código de 6 cifras del correo', 'Sigue, ahora con autocompletado y «reenviar en 30 s».'],
  ['Iniciar sesión con Apple', 'Sigue, en la puerta.'],
  ['Elegir estudio (lista con icono y rol)', 'Sigue, con favicon, ciudad y «último» marcado.'],
  ['Entrar directo al último estudio', 'Sigue.'],
  ['«Salir» desde la lista', 'Sigue, abajo en «Tus estudios».'],
  ['«¿Primera vez? Busca tu estudio»', 'Sigue como «Buscar mi estudio», sin tildes ni mayúsculas.'],
  ['Alta en el estudio con consentimiento', 'Sigue igual, dentro del estudio (con la cuenta ya creada pide nombre y consentimiento).'],
  ['«Tu cuenta no está en ningún estudio»', 'Pasa a «Aún no tienes estudio» con el buscador y el enlace del estudio; ya no sale a quien su estudio sí tiene.'],
];

function Movil({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <figure style={{ margin: 0, width: 300, flex: 'none' }}>
      <div className="student-app" style={{ width: 300, height: 650, borderRadius: 40, overflow: 'hidden', border: '9px solid #111', background: 'var(--background)', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,.18)' }}>
        <div style={{ height: 34, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 22px', fontSize: 12, fontWeight: 700 }}>
          <span>9:41</span><span style={{ width: 80, height: 22, borderRadius: 20, background: '#111' }} /><span>●●●</span>
        </div>
        <div style={{ height: 616 - 34, overflow: 'hidden', zoom: 0.78 } as React.CSSProperties}>{children}</div>
      </div>
      <figcaption style={{ marginTop: 12, fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.4 }}>
        <b>{titulo}</b>{nota && <span style={{ display: 'block', color: '#666' }}>{nota}</span>}
      </figcaption>
    </figure>
  );
}

const pila = { display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 22px' } as const;
const enlace = { border: 'none', background: 'none', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', padding: '4px 0', textAlign: 'center' } as const;

function CampoFalso({ label, valor, placeholder }: { label: string; valor?: string; placeholder?: string }) {
  return (
    <div>
      <label className="t-meta" style={{ display: 'block', fontWeight: 700, margin: '0 0 4px 2px' }}>{label}</label>
      <div className="input" style={{ display: 'flex', alignItems: 'center', color: valor ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{valor ?? placeholder}</div>
    </div>
  );
}

function BotonAppleFalso() {
  return (
    <div className="btn btn--full" style={{ background: '#000', color: '#fff', gap: 8 }}>
      <svg width="16" height="18" viewBox="0 0 17 20" fill="currentColor" aria-hidden><path d="M14.1 10.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8C4.2 5.1 2.6 6.1 1.8 7.6c-1.7 2.9-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.5-3.9zM11.7 3.5c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4z" /></svg>
      Continuar con Apple
    </div>
  );
}

function Puerta() {
  return (
    <div style={{ ...pila, paddingTop: 40, minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><LogoTentare alto={30} /></div>
      <div>
        <h1 className="t-h1">Reserva en tu estudio</h1>
        <p className="t-meta" style={{ marginTop: 4 }}>Escribe tu email. Si ya vas a un estudio con Tentare, te reconocemos.</p>
      </div>
      <CampoFalso label="Email" valor="nombre@example.com" />
      <div className="btn btn--primary btn--full">Continuar</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-foreground)', fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />o<span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <BotonAppleFalso />
      <div style={{ marginTop: 6, padding: 14, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)' }}>
        <p style={{ fontWeight: 800, margin: 0 }}>¿Tu estudio te ha pasado un enlace o un QR?</p>
        <p className="t-meta" style={{ margin: '4px 0 0' }}>Ábrelo en este móvil y entrarás directa en su app.</p>
      </div>
      <div style={{ ...enlace, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icono nombre="buscar" tamano={16} /> Buscar mi estudio</div>
      <p className="t-meta" style={{ textAlign: 'center', margin: 0 }}>¿No puedes entrar? <b style={{ color: 'var(--accent)' }}>Te ayudamos</b></p>
    </div>
  );
}

function Codigo() {
  const cifras = ['4', '8', '2', '', '', ''];
  return (
    <div style={pila}>
      <div style={{ ...enlace, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}><Icono nombre="chevron-izquierda" tamano={16} /> Cambiar email</div>
      <div>
        <h1 className="t-h1">Mira tu correo</h1>
        <p className="t-meta" style={{ marginTop: 4 }}>Hemos mandado un código a <b>nombre@example.com</b>. Caduca en 10 minutos.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
        {cifras.map((c, i) => (
          <div key={i} style={{ width: 44, height: 54, borderRadius: 12, border: `1.5px solid ${i === 3 ? 'var(--accent)' : 'var(--border-strong)'}`, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 }}>{c}</div>
        ))}
      </div>
      <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="t-meta">Del correo · <b>482 913</b></span><b style={{ color: 'var(--accent)', fontSize: 13 }}>Rellenar</b>
      </div>
      <p className="t-meta" style={{ textAlign: 'center', fontSize: 11, margin: '-6px 0 0' }}>↑ Sugerencia del teclado de iOS</p>
      <div className="btn btn--primary btn--full">Entrar</div>
      <div style={enlace}>No me ha llegado · reenviar en 30 s</div>
      <div style={{ ...enlace, color: 'var(--muted-foreground)' }}>Usar mi contraseña</div>
    </div>
  );
}

function TusEstudios() {
  return (
    <div style={pila}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><LogoTentare alto={24} /></div>
      <div>
        <h1 className="t-h1">Hola, Lucía</h1>
        <p className="t-meta" style={{ marginTop: 4 }}>Estos estudios ya te tienen. ¿A cuál entras?</p>
      </div>
      {EST.map((e) => (
        <div key={e.nombre} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `1.5px solid ${e.ultimo ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 18, background: 'var(--card)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ico(e.nombre, e.color)} alt="" width={48} height={48} style={{ borderRadius: 13 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 800 }}>{e.nombre}</span>
            <span className="t-meta" style={{ display: 'block' }}>{e.ciudad}</span>
            <span className="t-meta" style={{ display: 'block', fontSize: 11 }}>{e.como}{e.ultimo ? ' · la última que abriste' : ''}</span>
          </span>
          <Icono nombre="chevron-derecha" tamano={18} />
        </div>
      ))}
      <div style={{ ...enlace, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icono nombre="mas" tamano={16} /> Añadir otro estudio</div>
      <div className="btn btn--secondary btn--full" style={{ marginTop: 8 }}>Salir</div>
    </div>
  );
}

function Buscar() {
  return (
    <div style={pila}>
      <div style={{ ...enlace, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}><Icono nombre="chevron-izquierda" tamano={16} /> Volver</div>
      <h1 className="t-h1">Busca tu estudio</h1>
      <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icono nombre="buscar" tamano={18} /> nucleo</div>
      <p className="t-meta" style={{ margin: 0 }}>Da igual las tildes o las mayúsculas.</p>
      {[EST[1], { nombre: 'Núcleo Pilates Getafe', ciudad: 'Getafe', color: '#8A6E3E' }].map((e) => (
        <div key={e.nombre} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ico(e.nombre, e.color)} alt="" width={42} height={42} style={{ borderRadius: 11 }} />
          <span style={{ flex: 1 }}><b style={{ display: 'block' }}>{e.nombre}</b><span className="t-meta">{e.ciudad}</span></span>
          <Icono nombre="chevron-derecha" tamano={18} />
        </div>
      ))}
      <div style={{ padding: 14, borderRadius: 16, background: 'var(--muted)' }}>
        <p style={{ fontWeight: 800, margin: 0 }}>¿No sale el tuyo?</p>
        <p className="t-meta" style={{ margin: '4px 0 0' }}>Puede que tu estudio todavía no use Tentare. Pídele el enlace de su app.</p>
      </div>
    </div>
  );
}

function FichaEstudio() {
  const e = EST[1];
  return (
    <div>
      <div style={{ height: 190, background: `linear-gradient(160deg, ${e.color}, #2a1a22)`, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 14, left: 18, color: '#fff', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 800, fontSize: 13 }}><Icono nombre="chevron-izquierda" tamano={16} /> Buscar</div>
        <span style={{ position: 'absolute', right: 14, top: 14, fontSize: 10, color: 'rgba(255,255,255,.7)' }}>foto de portada del estudio</span>
      </div>
      <div style={{ ...pila, marginTop: -44 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ico(e.nombre, e.color)} alt="" width={76} height={76} style={{ borderRadius: 20, border: '4px solid var(--background)' }} />
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>{e.nombre}</h1>
          <p className="t-meta" style={{ marginTop: 4 }}>{e.ciudad} · Reformer y suelo</p>
        </div>
        <div className="btn btn--primary btn--full">Ver horario</div>
        <div className="btn btn--secondary btn--full">Ya voy aquí: entrar</div>
        <p className="t-meta" style={{ margin: 0 }}>Puedes mirar las clases sin cuenta. Te la pedimos al reservar.</p>
      </div>
    </div>
  );
}

function AltaEnEstudio() {
  const e = EST[1];
  return (
    <div>
      <div style={{ height: 150, background: `linear-gradient(160deg, ${e.color}, #2a1a22)`, position: 'relative', color: '#fff' }}>
        <div style={{ position: 'absolute', left: 20, bottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ico(e.nombre, e.color)} alt="" width={36} height={36} style={{ borderRadius: 10 }} />
          <b style={{ fontSize: 18 }}>{e.nombre}</b>
        </div>
      </div>
      <div style={pila}>
        <div>
          <h1 className="t-h1">Es tu primera vez aquí</h1>
          <p className="t-meta" style={{ marginTop: 4 }}>Tu cuenta ya está. Solo falta tu nombre y tu consentimiento para {e.nombre}.</p>
        </div>
        <CampoFalso label="Nombre" valor="Lucía" />
        <CampoFalso label="Teléfono (opcional)" placeholder="Para avisarte si se libera una plaza" />
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--accent)', color: 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icono nombre="hecho" tamano={14} grosor={2} /></span>
          <span className="t-meta">Acepto la política de privacidad de {e.nombre}. <b>Qué acepto</b></span>
        </div>
        <div className="btn btn--primary btn--full">Entrar en {e.nombre}</div>
      </div>
    </div>
  );
}

function Perfil() {
  return (
    <div style={pila}>
      <h1 className="t-h1">Perfil</h1>
      <p className="t-meta" style={{ margin: 0 }}>Dentro de la app del estudio · abajo del todo</p>
      {['Mis datos', 'Avisos', 'Mis pagos y facturas'].map((t) => (
        <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}><span>{t}</span><Icono nombre="chevron-derecha" tamano={16} /></div>
      ))}
      <div style={{ marginTop: 8, padding: 14, borderRadius: 16, background: 'var(--card)', border: '1.5px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'flex' }}>
          {EST.slice(0, 3).map((e, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={e.nombre} src={ico(e.nombre, e.color)} alt="" width={28} height={28} style={{ borderRadius: 8, marginLeft: i ? -8 : 0, border: '2px solid var(--card)' }} />
          ))}
        </span>
        <span style={{ flex: 1 }}><b style={{ display: 'block' }}>Cambiar de estudio</b><span className="t-meta">Sin cerrar sesión</span></span>
        <Icono nombre="chevron-derecha" tamano={16} />
      </div>
      <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>Cerrar sesión</div>
      <div style={{ padding: '14px 0', color: 'var(--destructive, #b42318)', fontWeight: 700 }}>Borrar mi cuenta de Tentare</div>
      <p className="t-meta" style={{ margin: 0, fontSize: 11 }}>Se borra al momento. Cada estudio guarda solo lo que la ley le obliga (tus facturas).</p>
    </div>
  );
}

export default function Maquetas() {
  return (
    <main style={{ background: '#EEECE6', minHeight: '100vh', padding: 40, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>App Tentare · entrar, darse de alta y elegir estudio</h1>
      <p style={{ margin: '0 0 28px', color: '#555', maxWidth: 900 }}>Comparado con bsport, TIMP, Momence y Mindbody (fichas, centros de ayuda y ~950 reseñas recientes del App Store, 4-oct-2026). Lo que mejor valoran: una cuenta para todos tus estudios, alta y primera reserva en 2 minutos, ver clases sin cuenta, entrar sin contraseña. Lo que peor: la sesión que se cierra, bucles de login, cuentas duplicadas, la socia que dio de alta el estudio y no sabe entrar, no encontrar el estudio, estudios fantasma y anuncios.</p>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Movil titulo="1 · La puerta" nota="Un solo campo. Apple. El enlace del estudio. Ayuda."><Puerta /></Movil>
        <Movil titulo="2 · El código" nota="iOS lo rellena desde Mail. La contraseña, como plan B."><Codigo /></Movil>
        <Movil titulo="3 · Tus estudios" nota="Te reconocemos aunque nunca hayas entrado. Con un solo estudio, entra directa."><TusEstudios /></Movil>
        <Movil titulo="4 · Buscar mi estudio" nota="Sin ubicación. Sin tildes. Logo y ciudad."><Buscar /></Movil>
        <Movil titulo="5 · La ficha del estudio" nota="Mirar el horario sin cuenta."><FichaEstudio /></Movil>
        <Movil titulo="6 · Primera vez en un estudio" nota="La cuenta ya existe: nombre y consentimiento del estudio."><AltaEnEstudio /></Movil>
        <Movil titulo="7 · Perfil, dentro del estudio" nota="Cambiar de estudio y borrar la cuenta."><Perfil /></Movil>
      </div>

      <section style={{ marginTop: 40, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Decisiones</h2>
          {DECISIONES.map(([n, t, d]) => (
            <div key={n} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <b style={{ width: 24, flex: 'none', color: '#B4537E' }}>{n}</b>
              <div><b style={{ display: 'block' }}>{t}</b><span style={{ color: '#444', fontSize: 14, lineHeight: 1.45 }}>{d}</span></div>
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 20 }}>Dónde queda cada cosa de hoy · no se quita nada</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
            <tbody>
              {HOY.map(([a, b]) => (
                <tr key={a} style={{ borderTop: '1px solid #eee' }}><td style={{ padding: '9px 10px 9px 0', fontWeight: 700, verticalAlign: 'top', width: '42%' }}>{a}</td><td style={{ padding: '9px 0', color: '#444' }}>{b}</td></tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ margin: '22px 0 8px', fontSize: 16 }}>Para la revisión de Apple (no se ve)</h3>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#444', fontSize: 14, lineHeight: 1.6 }}>
            <li>Cuenta de prueba para el revisor, con un estudio de demo con clases (con solo código, sin ella no puede entrar).</li>
            <li>Llavero de iOS: el mismo dominio en la app y en la web, para que se rellenen solas las contraseñas.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
