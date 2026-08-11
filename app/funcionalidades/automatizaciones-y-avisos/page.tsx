import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { CanalesPorEvento, TablaDeReglas } from '@/components/funcionalidades/visuales/automatizaciones';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/automatizaciones-y-avisos';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Puede el sistema escribir a mis clientas sin que yo lo apruebe?',
    a: 'Solo si tú enciendes una regla que lo haga, y encenderla pide una confirmación explícita precisamente por eso. Todas nacen apagadas. Las que proponen algo delicado —un descuento, un cobro— dejan la acción esperando tu visto bueno en vez de ejecutarla.',
  },
  {
    q: '¿Necesito WhatsApp Business para los recordatorios?',
    a: 'Para enviar por WhatsApp, sí: conectas tu propio número y tu propia app de Meta desde configuración, no hay una cuenta compartida. Sin ella los avisos siguen saliendo por email y por notificación en la app.',
  },
  {
    q: '¿Puedo cambiar el texto de lo que se envía?',
    a: 'Sí. Las plantillas de correo se editan desde el panel y escribes tú el cuerpo entero, no solo un hueco. La voz del estudio es tuya.',
  },
  {
    q: '¿Y si una clienta no quiere recibir avisos?',
    a: 'Cada persona ajusta sus preferencias por categoría desde su portal. El motor las respeta: la preferencia puede quitar canales, nunca añadirlos.',
  },
  {
    q: '¿Se puede duplicar un aviso por dos vías?',
    a: 'Cada evento declara la lista completa de canales por los que puede salir, y esa lista es la autoridad: un aviso no sale por un canal que no tenga declarado, ni siquiera siendo crítico. Además, un mismo hecho se agrupa para no notificarse dos veces.',
  },
];

export default function AutomatizacionesPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Trabajo que ocurre sin ti"
      h1={<>Lo que se te olvida, ya está hecho.</>}
      intro={<>Recordar la clase de mañana, avisar de un bono que se acaba, preguntar por quien lleva un mes sin venir. Siete reglas que enciendes tú, y un motor de avisos que decide por qué canal sale cada cosa.</>}
      chips={['7 reglas configurables', '37 tipos de aviso', 'App, push, email, WhatsApp y SMS']}
      visual={<CanalesPorEvento />}
    >
      <Seccion id="problema" titulo="Lo que se pierde por no escribir a tiempo">
        <Entradilla>
          Ninguna alumna se va de un estudio por un mal email. Se va porque dejó de venir tres semanas y nadie se dio cuenta.
        </Entradilla>
        <p>
          El seguimiento es de esas cosas que todo el mundo sabe que hay que hacer y casi nadie sostiene, porque compite con
          dar clases, cuadrar el horario y cobrar. Y la primera semana que no lo haces no pasa nada — el coste aparece tres
          meses después, en la cuenta de bajas.
        </p>
        <p>
          Automatizar aquí no es mandar más mensajes. Es mandar <strong>los cuatro o cinco que importan</strong>, en el
          momento en que importan, sin depender de que alguien se acuerde.
        </p>
      </Seccion>

      <Seccion id="reglas" titulo="Las reglas: qué se dispara y con qué umbral">
        <p>
          Una regla es un disparador, una condición y lo que pasa después. Los umbrales son tuyos: si en tu estudio siete
          días sin venir es normal porque la gente viene una vez por semana, lo subes.
        </p>
        <TablaDeReglas />
        <p>
          Fíjate en la última columna. Cinco reglas escriben directamente a la clienta; dos solo te avisan a ti. Esa
          distinción no es cosmética: encender una regla que escribe en nombre de tu estudio, cada mañana y sin volver a
          preguntar, es dar un permiso serio, y el producto te lo pide de forma explícita en vez de darlo por hecho.
        </p>
      </Seccion>

      <Seccion id="avisos" titulo="Los avisos: quién se entera de qué, y por dónde">
        <p>
          Aparte de las reglas que tú enciendes, hay una capa que funciona siempre: cuando pasa algo en el estudio —una
          reserva, una plaza que se libera, un pago que falla, una instructora que da de baja su clase— se publica un evento
          y el motor decide a quién le importa y por qué vía llega.
        </p>
        <Tabla
          cabeceras={['Qué pasa', 'Quién se entera', 'Por dónde']}
          filas={[
            ['Se libera una plaza que esperabas', 'La socia de la lista de espera', 'App + push'],
            ['Un pago falla', 'Mostrador y la socia', 'App + push'],
            ['Una instructora da de baja su clase', 'La propietaria', 'App + push'],
            ['Cambia quién da tu clase', 'Las socias apuntadas', 'App + push'],
            ['Se pierde una disputa de pago', 'Mostrador', 'App + push + email'],
            ['Stripe se desconecta', 'La propietaria', 'Los cinco canales'],
            ['Una clase se queda casi llena', 'La propietaria', 'Solo en la app'],
          ]}
        />
        <p>
          Que los dos únicos casos con los cinco canales sean «se ha caído el cobro» y «el sistema ha fallado» es
          intencionado. Si todo es urgente, nada lo es — y un WhatsApp de tu software a las once de la noche tiene que
          significar algo.
        </p>
      </Seccion>

      <Seccion id="radar" titulo="El radar de ocupación: avisar a quien tiene sentido">
        <p>
          Hay un caso que merece mención aparte porque es donde más se nota la diferencia entre automatizar y hacer spam. El
          radar vigila las próximas 48 horas y te enseña qué clases van por debajo del 70 % de ocupación.
        </p>
        <Rejilla
          items={[
            { titulo: 'No avisa a toda la lista', body: 'Solo a socias con bono activo — pueden reservar de verdad — que ya han hecho antes esa clase.' },
            { titulo: 'Lo lanzas tú', body: 'El radar detecta y propone; el mensaje sale cuando lo mandas. La decisión de escribir sigue siendo tuya.' },
          ]}
        />
        <p>
          Proponerle una clase a alguien que no puede reservarla es peor que no proponerle ninguna: gastas una interrupción
          y entregas una frustración.
        </p>
      </Seccion>

      <Seccion id="limites" titulo="Lo que esto no es">
        <Limite titulo="No es una herramienta de campañas de marketing">
          No hay envíos masivos a una base segmentada, ni constructor de embudos, ni publicación en redes. El módulo de
          marketing y el de contenido existen en el código pero están desactivados mientras el producto se centra en la
          operación del estudio. Lo que sí puedes hacer hoy es lo de esta página: reglas sobre hechos concretos y avisos
          transaccionales.
        </Limite>
        <p>
          Es una diferencia importante a la hora de comparar. Si lo que buscas es una plataforma de email marketing, esta no
          lo es. Si lo que buscas es que nadie se quede sin recordatorio y que te enteres de una ausencia antes de que sea
          una baja, esto es exactamente eso.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
        <p style={{ marginTop: 26 }}>
          Los datos con los que trabajan estas reglas —asistencia, bonos, ausencias— viven en la{' '}
          <Link href="/funcionalidades/ficha-de-clienta">ficha de cada alumna</Link>.
        </p>
      </Seccion>

      <CierreCta
        titulo="Enciende dos reglas y olvídate"
        body="El recordatorio de clase y el aviso de ausencia son los dos que más se notan. El resto, cuando quieras."
      />
    </FeatureShell>
  );
}
