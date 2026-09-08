import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        El tablón de tu estudio. Publicas algo aquí y lo ven tus alumnas en su portal, sin que tengas que montar
        un grupo de WhatsApp con ochenta personas para contar una cosa.
      </AyudaAntesDeEmpezar>

      <p>
        Sirve para lo de siempre: el cierre de agosto, un cambio de horario, la foto de la clase del sábado, un
        taller nuevo. Puedes acompañarlo de una imagen.
      </p>
      <p>
        <strong>No todo va para todas.</strong> Antes de publicar eliges a quién se lo enseñas: a todas, a las
        activas, a las que están en prueba, a las que llevan tiempo sin venir. Un aviso de horario y una promoción
        para recuperar a alguien no tienen el mismo público.
      </p>
      <p style={{ margin: 0 }}>
        Si lo que publicas es un <strong>evento</strong>, lleva su fecha, su sitio y su aforo, y ellas pueden
        apuntarse desde el propio tablón.
      </p>

      <AyudaResultado>
        Tus alumnas pueden reaccionar y comentar, y tú lo ves aquí mismo. La misma pantalla está en Mensajería:
        es el mismo tablón, no dos sitios distintos que se puedan quedar diciendo cosas diferentes.
      </AyudaResultado>
    </>
  );
}
