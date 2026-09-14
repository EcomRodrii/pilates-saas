import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        El tablón de tu estudio. Lo publicas desde Mensajería, pestaña Comunidad, y lo ven tus alumnas en su app,
        sin que tengas que montar un grupo de WhatsApp con ochenta personas para contar una cosa.
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
        Tus alumnas pueden reaccionar y comentar, y tú lo ves en esa misma pestaña. Comunidad ya no tiene entrada
        propia en el menú: es un solo tablón, no dos sitios que se puedan quedar diciendo cosas diferentes.
      </AyudaResultado>
    </>
  );
}
