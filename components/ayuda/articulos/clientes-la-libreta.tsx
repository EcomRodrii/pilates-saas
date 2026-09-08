import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Tus clientas en una hoja, siempre al día. Cada una con su plan, las sesiones que le quedan, sus
        recuperaciones vivas y su plaza fija si la tiene. La imprimes o la guardas en PDF.
      </AyudaAntesDeEmpezar>

      <p>
        Sirve para el día tonto: se cae internet, se queda sin batería el iPad del mostrador, o tienes que
        llamar a diez personas para avisar de que hoy no hay clase y no te apetece ir abriendo fichas.
      </p>
      <p>
        Y sirve para algo menos evidente, que es a propósito: <strong>es tu copia</strong>. Si algún día dejas
        Tentare, tus datos no se quedan aquí dentro. Puedes sacarlos en cualquier momento, sin pedir permiso ni
        abrir una incidencia.
      </p>

      <AyudaResultado>
        Las recuperaciones que salen son las que siguen vivas <em>hoy</em>, calculadas con la hora de tu estudio.
        Una libreta sacada a las doce y veinte de la noche no descuenta las que caducan hoy.
      </AyudaResultado>
    </>
  );
}
