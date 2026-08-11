import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion } from '@/components/funcionalidades/bloques';
import { CuatroFormasDeMarcar, RiesgoDePlanton, VentanaDelPase } from '@/components/funcionalidades/visuales/asistencia';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/control-de-asistencia';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Hace falta una tablet en la entrada?',
    a: 'No, y no la hay: no existe una pantalla de kiosko donde tu alumna fiche sola. El pase lo lee el estudio desde el móvil o el ordenador del mostrador, o directamente no se lee nada y la asistencia se marca sola al terminar la clase.',
  },
  {
    q: '¿Y si mi estudio no tiene a nadie en recepción?',
    a: 'Entonces desactivas el check-in por QR y listo: quien reserva y no cancela cuenta como asistida cuando la clase termina. Es el modo que usa la mayoría de estudios pequeños, y sigue permitiendo marcar «no asistió» a mano en la excepción puntual.',
  },
  {
    q: '¿El lector de QR funciona en un iPad?',
    a: 'Sí. Donde el navegador trae lector nativo se usa ese, y donde no —Safari no lo implementa en ninguna versión— entra un lector propio que hace el mismo trabajo. No hay pantalla de «tu navegador no es compatible».',
  },
  {
    q: '¿Puede alguien colarse con una captura del QR de otra?',
    a: 'No le serviría de mucho: el código del QR va firmado y caduca a los dos minutos, renovándose mientras tiene la pantalla abierta. Para cuando esa captura llegue a otro móvil ya no vale. Importa porque en los estudios con Kisi el escaneo abre la puerta.',
  },
  {
    q: '¿Puedo cobrar por no presentarse?',
    a: 'Sí, es opcional y se configura junto al resto de la política de cancelación. Aquí solo se detecta quién no vino; qué haces con esa información se decide en cancelaciones y no-shows.',
  },
];

export default function AsistenciaPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="Quién vino de verdad"
      h1={<>Reservar no es venir.</>}
      intro={<>Marca la asistencia con un QR en la puerta, con un código corto o sin hacer absolutamente nada. Y entérate de quién reserva y falla antes de que se te note en el aforo.</>}
      chips={['QR firmado o código corto', 'Marcado automático al terminar', 'Riesgo de plantón graduado']}
      visual={<VentanaDelPase />}
    >
      <Seccion id="problema" titulo="La diferencia entre plazas vendidas y plazas ocupadas">
        <Entradilla>
          Una clase con diez reservas y siete personas en la sala no es una clase llena: es una clase en la que tres plazas
          se quedaron sin nadie y sin nadie a quien ofrecérselas.
        </Entradilla>
        <p>
          Mientras la asistencia no se registra, esa diferencia no existe en ningún sitio. La ocupación que ves en los
          informes es la de las reservas, tu lista de espera no se entera de que había hueco, y quien falla tres veces
          seguidas sigue reservando con la misma facilidad que quien no ha faltado nunca.
        </p>
        <p>
          Y registrarla tiene un problema práctico: casi ningún estudio de Pilates tiene a alguien en recepción a las siete
          de la mañana. Cualquier sistema que exija un gesto humano en cada clase se abandona en dos semanas.
        </p>
      </Seccion>

      <Seccion id="formas" titulo="Cuatro formas, y una de ellas es no hacer nada">
        <CuatroFormasDeMarcar />
        <p>
          La cuarta merece un párrafo porque es la que resuelve el problema de arriba. Si activas el modo sin check-in,
          quien reservó y no canceló cuenta como asistida <strong>cuando la clase termina</strong> — no cuando reserva. La
          diferencia no es cosmética: marcarla al reservar rompería la cancelación normal y permitiría sumar racha y
          recompensas sin pisar la sala nunca.
        </p>
        <p>
          Y el modo automático no pisa lo que ya hayáis marcado a mano: si alguien puso «no asistió» desde la lista de
          asistentes, esa reserva se queda como está.
        </p>
      </Seccion>

      <Seccion id="pase" titulo="El pase: por qué caduca">
        <p>
          Cuando sí hay alguien leyendo, la alumna enseña un QR desde su móvil. Ese código va firmado y{' '}
          <strong>caduca a los dos minutos</strong>, renovándose solo mientras tiene la pantalla abierta.
        </p>
        <p>
          No es exceso de celo. En los estudios que tienen la cerradura conectada, escanear el pase{' '}
          <strong>abre la puerta</strong>: sin caducidad, una captura de pantalla reenviada por WhatsApp daría acceso al
          local. Dos minutos deja esa captura inservible antes de que llegue a ningún sitio.
        </p>
        <Rejilla
          items={[
            { titulo: 'El código corto no caduca', body: 'Seis caracteres para cuando la cámara falla. No rota, porque un código que cambia mientras la instructora lo teclea es un código que no se usa — pero solo sirve dentro de la ventana de su clase y desde una sesión del estudio.' },
            { titulo: 'Enseñarlo no marca nada', body: 'Marcar la asistencia lo hace el estudio al leerlo, nunca la alumna desde su móvil. La asistencia da recompensas, y lo que da algo no puede otorgárselo quien lo recibe.' },
          ]}
        />
      </Seccion>

      <Seccion id="riesgo" titulo="Quién falla, y cuánto de eso importa">
        <p>
          Con la asistencia registrada aparece la pregunta útil: <em>¿de quién puedo fiarme cuando reserva?</em> No se
          responde con un contador de plantones, porque un contador trata igual a quien falló tres de cuatro veces la
          semana pasada y a quien falló tres de cuarenta hace tres meses.
        </p>
        <RiesgoDePlanton />
        <p>
          Este dato no castiga a nadie por su cuenta: alimenta los avisos del sistema y te sirve para decidir. Si quieres
          que además tenga consecuencias —perder la sesión, un cargo—, eso se configura aparte, en{' '}
          <Link href="/funcionalidades/cancelaciones-y-politicas">cancelaciones y no-shows</Link>.
        </p>
      </Seccion>

      <Seccion id="limites" titulo="Lo que no vas a encontrar aquí">
        <Limite titulo="No hay pantalla de kiosko en tablet">
          La que ficha es la persona del mostrador leyendo un pase, no la alumna en un iPad de la entrada. Si tu operativa
          depende de que la gente fiche sola al entrar, esto no la cubre hoy — y es mejor saberlo antes que descubrirlo el
          primer lunes.
        </Limite>
        <p>
          Tampoco es un control de accesos completo: la apertura de puerta funciona a través de una cerradura conectada de
          terceros, no de un lector propio. Y la asistencia registrada tampoco es un control horario de tu equipo — las
          horas de las instructoras salen de las clases impartidas, en{' '}
          <Link href="/funcionalidades/gestion-de-instructoras">gestión de instructoras</Link>.
        </p>
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
        <p style={{ marginTop: 26 }}>
          Lo que hace con esta información el resto del producto —ocupación real, retención, margen por clase— está en{' '}
          <Link href="/funcionalidades/informes-y-rentabilidad">informes y rentabilidad</Link>.
        </p>
      </Seccion>

      <CierreCta
        titulo="Empieza sin escanear nada"
        body="Deja el marcado automático puesto y añade el pase el día que tengas a alguien en la puerta."
      />
    </FeatureShell>
  );
}
