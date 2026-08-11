import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { RejillaDeSala, SemanaEnSalas } from '@/components/funcionalidades/visuales/calendario';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/calendario-y-salas';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Puedo tener dos salas con clases a la misma hora?',
    a: 'Sí, y es el caso normal en cuanto tienes reformer y mat. Cada clase pertenece a una sala, con su capacidad propia, y el calendario avisa si dos clases intentan ocupar la misma sala a la vez.',
  },
  {
    q: '¿Cómo creo el horario de todo un trimestre?',
    a: 'Con series recurrentes: defines la clase una vez y se generan todas las sesiones. Después puedes editar solo una, o esa y todas las siguientes, sin tocar las que ya pasaron.',
  },
  {
    q: '¿Qué pasa si se rompe un reformer?',
    a: 'Lo marcas fuera de servicio con las fechas que sepas —o sin fecha de fin si aún no sabes cuándo vuelve— y la capacidad de todas las clases que solapan ese periodo baja sola. No hay que editar clase por clase.',
  },
  {
    q: '¿Las alumnas eligen puesto?',
    a: 'La sala puede tener su mapa de puestos con posición y tipo, así que una reserva puede quedar asociada a un reformer concreto. Si prefieres no gestionarlo a ese nivel, trabajas solo con el aforo de la sala.',
  },
  {
    q: '¿Puedo reprogramar una clase arrastrándola?',
    a: 'Sí. El calendario permite mover clases y ajustar horarios directamente, y desde ahí mismo se dispara lo que corresponda: avisar a las alumnas reservadas si el cambio les afecta.',
  },
];

export default function CalendarioPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Horario y capacidad"
      h1={<>Tu semana cuadrada, puesto a puesto.</>}
      intro={<>Series recurrentes, varias salas a la vez y capacidad contada por máquina — no un número de aforo que hay que corregir a mano cada vez que algo se rompe.</>}
      chips={['Series recurrentes', 'Multi-sala', 'Capacidad por reformer']}
      gradient="linear-gradient(140deg,#16180F 0%,#2C3021 58%,#4A5138 100%)"
      visual={<SemanaEnSalas />}
    >
      <Seccion id="problema" titulo="El aforo de un estudio de Pilates no es un número">
        <Entradilla>
          En un gimnasio, una clase de veinte plazas son veinte plazas. En un estudio de reformer, son diez máquinas — y si
          una se rompe el martes, esa semana son nueve.
        </Entradilla>
        <p>
          La mayoría del software de gestión de clases viene del mundo del fitness generalista y modela la capacidad como un
          entero suelto. Funciona hasta el día en que hay una avería, y entonces alguien tiene que acordarse de bajar el
          aforo en cada una de las clases afectadas — y de volver a subirlo cuando el técnico pase.
        </p>
        <p>
          Casi nadie se acuerda de lo segundo. El resultado es un estudio que vende nueve plazas durante meses porque nunca
          restauró el aforo.
        </p>
      </Seccion>

      <Seccion id="capacidad" titulo="Cómo se calcula la capacidad de verdad">
        <p>
          La sala tiene su aforo y, si quieres, su mapa de puestos: cada reformer con su número, su posición en la rejilla y
          su tipo. Una avería no se apunta en una clase: se apunta en la máquina, con las fechas que ocupa.
        </p>
        <RejillaDeSala />
        <p>
          Que la avería pueda no tener fecha de fin es deliberado. Cuando se rompe un reformer casi nunca sabes cuándo
          vuelve, y obligarte a inventar una fecha es la vía rápida a que el aforo se restaure solo antes de tiempo.
        </p>
      </Seccion>

      <Seccion id="series" titulo="Series: montar un trimestre sin montarlo clase a clase">
        <p>
          El horario de un estudio es, en su mayor parte, el mismo cada semana. Una serie define la clase una vez y genera
          todas sus sesiones; a partir de ahí lo interesante es cómo se edita.
        </p>
        <Tabla
          cabeceras={['Lo que quieres cambiar', 'Qué se toca']}
          filas={[
            ['Una clase concreta de la semana que viene', 'Solo esa sesión — la serie sigue igual'],
            ['El horario a partir de septiembre', 'Esa sesión y todas las siguientes'],
            ['La instructora de todo el trimestre', 'Esa sesión y las siguientes, en una operación'],
            ['Una clase que ya pasó', 'Nada: el histórico no se reescribe'],
          ]}
        />
        <p>
          Editar una serie toca muchas filas a la vez, así que ocurre como una sola operación: o cambian todas o no cambia
          ninguna. Es la diferencia entre reprogramar un trimestre y quedarte con medio trimestre movido y medio no.
        </p>
      </Seccion>

      <Seccion id="dia-a-dia" titulo="Lo que usas cada día">
        <Rejilla
          columnas={2}
          items={[
            { titulo: 'Vista lista, semana o día', body: 'La misma agenda desde tres ángulos, según si estás cuadrando el trimestre o mirando qué hay esta tarde.' },
            { titulo: 'Arrastrar para reprogramar', body: 'Mover una clase de hora o de sala sin abrir un formulario.' },
            { titulo: 'Filtros por tipo, instructora y sala', body: 'Para responder «¿qué da Marta esta semana?» sin leer la rejilla entera.' },
            { titulo: 'Incidencias por clase', body: 'Una nota abierta en una sesión concreta —la calefacción, una alumna que avisó— que se resuelve y se cierra.' },
            { titulo: 'Aviso de solape de sala', body: 'Dos clases no pueden ocupar la misma sala a la vez sin que te enteres al crearlas.' },
            { titulo: 'Pase de acceso por QR', body: 'Para marcar la asistencia de quien entra, sin lista en papel.' },
          ]}
        />
      </Seccion>

      <Seccion id="conecta" titulo="Con qué se conecta">
        <p>
          El calendario no es una pantalla aislada; es de donde salen los datos del resto del producto:
        </p>
        <ul style={{ fontSize: 17, lineHeight: 1.66, color: '#3A3A34', paddingLeft: 22, margin: '0 0 17px' }}>
          <li style={{ marginBottom: 8 }}>
            La capacidad real es la que ven las alumnas al{' '}
            <Link href="/funcionalidades/reservas-online">reservar</Link>, y la que decide cuándo entra la{' '}
            <Link href="/funcionalidades/lista-de-espera">lista de espera</Link>.
          </li>
          <li style={{ marginBottom: 8 }}>
            Quién da cada clase alimenta el motor de{' '}
            <Link href="/funcionalidades/sustituciones">sustituciones</Link> y el cómputo de horas de{' '}
            <Link href="/funcionalidades/gestion-de-instructoras">tu equipo</Link>.
          </li>
          <li>Las clases pasadas son el historial con el que se sabe quién ha dado antes cada tipo de clase.</li>
        </ul>
        <Limite titulo="Lo que no hace">
          No hay pantalla de kiosko en tablet para que la alumna fiche al entrar: la asistencia se marca desde el calendario
          o con el pase por QR. Y las series se crean desde el panel, no desde la app de la instructora.
        </Limite>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Monta tu horario una vez"
        body="Salas, series y capacidad real. Y cuando algo se rompa, lo apuntas en la máquina y el resto se ajusta solo."
      />
    </FeatureShell>
  );
}
