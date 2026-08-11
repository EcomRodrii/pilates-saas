import { MUTED } from '@/components/landing/theme';
import { PanelClaro, PanelOscuro, PasoVertical } from './comunes';

// ── Dibujos propios de /funcionalidades/sustituciones ────────────────────────
// Todo lo que se pinta aquí sale del motor real:
//   · elegibilidad y scoring → RPC `rankear_candidatas` (migr 0038)
//   · ventanas de escalado   → lib/sustituciones/ventanas.ts (VENTANA_MIN/MAX)
//   · modos de autonomía     → lib/sustituciones/baja.ts
// Si alguno de esos cambia, esta página miente. Es el precio de contar cómo
// funciona de verdad en vez de decir "inteligencia artificial".

export function ResumenSustitucion() {
  return (
    <PanelOscuro titulo="Una baja, de principio a fin">
      <PasoVertical tono="oscuro" indice="1" titulo="Marta avisa desde su móvil">
        Un enlace firmado. Sin instalar nada, sin crear cuenta.
      </PasoVertical>
      <PasoVertical tono="oscuro" indice="2" titulo="Se calculan las candidatas">
        Quién puede dar esa clase, a esa hora, sin chocar con otra suya.
      </PasoVertical>
      <PasoVertical tono="oscuro" indice="3" titulo="Se contacta y se escala">
        Email primero; si no contesta, recordatorio y siguiente candidata.
      </PasoVertical>
      <PasoVertical tono="oscuro" indice="4" titulo="Lucía acepta" ultimo>
        Calendario y horas al día, y las alumnas ya saben quién les da la clase.
      </PasoVertical>
    </PanelOscuro>
  );
}

const ELEGIBILIDAD = [
  { t: 'Cubre la franja', d: 'Su disponibilidad semanal incluye esa hora — o tiene una excepción de tipo «extra» ese día.' },
  { t: 'No está bloqueada', d: 'Sin bloqueo esa fecha. Las vacaciones y las bajas médicas se materializan como bloqueos diarios.' },
  { t: 'No choca con otra clase', d: 'No tiene ya otra sesión suya solapando ese hueco.' },
];

const PESOS = [
  { t: 'Ya ha dado este tipo de clase', d: 'Suma. Y si no lo ha dado nunca, resta fuerte: cubrir un reformer con quien solo ha dado mat no es cubrirlo.', signo: 'suma' as const },
  { t: 'Va holgada de horas este mes', d: 'Suma, comparando sus horas con la media de las candidatas elegibles. Reparte la carga en vez de quemar siempre a la misma.', signo: 'suma' as const },
  { t: 'Hace más de tres semanas que no sustituye', d: 'Suma. Evita que la sustitución caiga siempre sobre quien más dice que sí.', signo: 'suma' as const },
];

export function ComoSeEligeLaCandidata() {
  return (
    <PanelClaro
      titulo="Cómo se elige a quién avisar"
      nota="La propietaria nunca ve una puntuación. Ve el motivo escrito: «ya ha dado esta clase 4 veces — las alumnas la conocen», «este mes va holgada de horas». Un número sin respaldo no ayuda a decidir."
    >
      <div style={{ display: 'grid', gap: 22 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#C2503A', marginBottom: 10 }}>Primero, quién PUEDE — tres comprobaciones, todas obligatorias</div>
          <div style={{ display: 'grid', gap: 9 }}>
            {ELEGIBILIDAD.map((e, i) => (
              <div key={e.t} style={{ display: 'flex', gap: 12, background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 12, padding: '13px 15px' }}>
                <span className="lp-mono" style={{ flexShrink: 0, fontSize: 11, color: '#A8A89F', paddingTop: 2 }}>0{i + 1}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{e.t}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>{e.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#4E9E7F', marginBottom: 10 }}>Después, a quién CONVIENE avisar antes — tres pesos</div>
          <div style={{ display: 'grid', gap: 9 }}>
            {PESOS.map((p) => (
              <div key={p.t} style={{ display: 'flex', gap: 12, background: '#F4F8F5', border: '1px solid #DFEBE3', borderRadius: 12, padding: '13px 15px' }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: '#DDEDE3', color: '#3B7D64', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, marginTop: 1 }}>+</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{p.t}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: MUTED }}>{p.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#0F0F0F', borderRadius: 14, padding: '16px 18px', color: '#D6DAC6', fontSize: 13.5, lineHeight: 1.55 }}>
          De ahí sale un <strong style={{ color: '#fff' }}>top&nbsp;3</strong>. No se avisa a todo el equipo a la vez: se avisa por orden, y solo se pasa a la siguiente si la anterior no contesta.
        </div>
      </div>
    </PanelClaro>
  );
}

export function EscaladoEnElTiempo() {
  return (
    <PanelClaro
      titulo="Qué pasa si la primera candidata no contesta"
      nota="Las esperas se calculan sobre lo que falta para la clase, no con un temporizador fijo: dos tramos de un tercio del tiempo restante, con un suelo de 2 minutos y un techo de 45. Una baja a tres días escala con calma; una a dos horas, comprimida."
    >
      <div style={{ display: 'grid', gap: 0 }}>
        <PasoVertical indice="→" titulo="Se avisa a la primera candidata" color="#5A6142">
          Por email, con un enlace para aceptar o rechazar de un toque.
        </PasoVertical>
        <PasoVertical indice="⏱" titulo="Pasada la primera ventana, recordatorio" color="#8E8E86">
          Y esta vez también por WhatsApp o SMS si tiene teléfono. Un email a las 23:00 no se lee; un WhatsApp sí.
        </PasoVertical>
        <PasoVertical indice="⏱" titulo="Pasada la segunda, se pasa a la siguiente" color="#8E8E86">
          La anterior deja de ser la candidata activa. Nadie tiene que decidir cuándo rendirse.
        </PasoVertical>
        <PasoVertical indice="!" titulo="Si se agota el top 3, avisa a la propietaria" color="#C2503A" ultimo>
          Con las opciones sobre la mesa: reprogramar, cancelar avisando a las alumnas, o cubrirla tú. Nunca te enteras al llegar al estudio.
        </PasoVertical>
      </div>
    </PanelClaro>
  );
}

const MODOS = [
  { n: 'Manual', nivel: 'Nivel 1', body: 'El sistema te propone a quién avisar. Tú das cada paso.', quien: 'Todos los planes' },
  { n: 'Asistido', nivel: 'Nivel 2', body: 'Contacta a las candidatas y gestiona los recordatorios. Cuando una acepta, tú lo apruebas.', quien: 'Todos los planes' },
  { n: 'Autónomo', nivel: 'Nivel 3', body: 'Cubre la baja solo y te lo cuenta después.', quien: 'Plan Estudio o Cadena' },
  { n: 'Vacaciones', nivel: 'Nivel 3+', body: 'Opera de principio a fin sin molestarte, mientras estás fuera.', quien: 'Plan Estudio o Cadena' },
];

export function NivelesDeAutonomia() {
  return (
    <PanelClaro
      titulo="Cuánto le dejas decidir — cuatro niveles"
      nota="El nivel es del estudio y se cambia cuando quieras. Si un estudio baja de plan con el modo autónomo puesto, el motor cae a asistido en vez de seguir operando una función que ya no está contratada."
    >
      <div className="sust-modos" style={{ display: 'grid', gap: 12 }}>
        {MODOS.map((m, i) => (
          <div key={m.n} style={{ background: i >= 2 ? '#22251A' : '#FAFAF6', border: `1px solid ${i >= 2 ? '#22251A' : '#EDEDE5'}`, borderRadius: 14, padding: '16px 17px' }}>
            <div className="lp-mono" style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: i >= 2 ? '#A8B080' : '#A8A89F', marginBottom: 8 }}>{m.nivel}</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', color: i >= 2 ? '#fff' : '#1A1A1A', marginBottom: 6 }}>{m.n}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: i >= 2 ? 'rgba(255,255,255,.7)' : MUTED, marginBottom: 10 }}>{m.body}</div>
            <div className="lp-mono" style={{ fontSize: 10.5, color: i >= 2 ? 'rgba(255,255,255,.45)' : '#A8A89F' }}>{m.quien}</div>
          </div>
        ))}
      </div>
      <style>{`
        .sust-modos { grid-template-columns: repeat(4,1fr); }
        @media (max-width: 860px) { .sust-modos { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 480px) { .sust-modos { grid-template-columns: 1fr; } }
      `}</style>
    </PanelClaro>
  );
}
