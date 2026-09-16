import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

// Verificado contra: components/configuracion/pagina-publica.tsx (la pantalla),
// lib/configuracion/pagina-publica.ts (clave y confirmaciones),
// lib/publico/acceso-pagina.ts (qué se rechaza y el pase de 30 días) y
// app/api/pagina-publica/route.ts (solo la propietaria).

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;
const lista = { margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Estás montando el estudio y todavía no quieres que nadie reserve, o cierras una temporada. En vez de borrar
        las clases, ocultas la página: quien entre verá un aviso, y tú puedes seguir preparándolo todo por dentro.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Dónde se activa</h2>
      <p>
        En <strong>Configuración</strong> &gt; <strong>«Mi app y mi web»</strong> &gt;{' '}
        <strong>«Ocultar tu página»</strong>. Es un ajuste que <strong>solo cambia la propietaria</strong>: ni la
        gerencia ni recepción pueden tocarlo, porque apaga la entrada de dinero del estudio.
      </p>
      <p>
        Eliges entre <strong>«Visible»</strong> —cualquiera con tu enlace reserva y tus alumnas entran en su app— y{' '}
        <strong>«Oculta»</strong>.
      </p>

      <h2 style={h2}>Qué pasa con la página oculta</h2>
      <ul style={lista}>
        <li><strong>Nadie reserva, compra ni se da de alta desde fuera.</strong></li>
        <li>
          <strong>Tus alumnas también ven el aviso</strong> al abrir su app, aunque ya tengan cuenta. No es solo para
          los de fuera.
        </li>
        <li>
          Los <Link href="/ayuda/widget/que-es-el-widget" style={enlace}>widgets de tu web</Link> enseñan el aviso,
          también el calendario incrustado.
        </li>
        <li>Si sales en Tentare Network, sigues apareciendo, pero tu enlace lleva al aviso.</li>
        <li>Le pedimos a Google que no la enseñe.</li>
      </ul>
      <p>
        El aviso que ve la gente es: «Estamos preparando esta página. Vuelve dentro de poco.»
      </p>
      <p>
        Lo que <strong>sí</strong> sigue funcionando: cancelar una reserva que ya tenía, valorar una clase, pagar un
        recibo pendiente, y todo tu panel. Ocultar la página cierra la puerta de entrada, no deja a nadie a medias.
      </p>

      <h2 style={h2}>La clave, para dejar entrar a quien tú quieras</h2>
      <p>
        Puedes poner una <strong>clave</strong> (mínimo 6 caracteres) y dársela a quien quieras que entre: tus
        primeras alumnas, una amiga que te ayuda a probarlo. Quien la tenga reserva con normalidad; el resto, no.{' '}
        <strong>Sin clave no entra nadie</strong>, que es lo que querrás si de verdad estás cerrado.
      </p>
      <p>
        Dos cosas que conviene saber antes de repartirla:
      </p>
      <ul style={lista}>
        <li>
          <strong>Cambiarla o quitarla deja fuera a quien ya había entrado.</strong> El pase que se guarda en su móvil
          va atado a la clave que estaba puesta, así que en cuanto la cambias deja de servir y tendrán que pedirte la
          nueva. La pantalla te lo confirma antes de hacerlo.
        </li>
        <li>
          <strong>Desde el calendario incrustado en tu web no se reserva ni con la clave.</strong> Ahí el navegador no
          puede llevar el pase. Para entrar con clave hay que abrir tu página de reservas de Tentare.
        </li>
      </ul>
      <p>El pase dura 30 días; pasados, vuelve a pedirla.</p>

      <AyudaResultado>
        Si lo que quieres es cerrar unos días concretos y no esconder el estudio entero, no es esto: son los{' '}
        <Link href="/ayuda/configuracion/cierres-del-centro" style={enlace}>cierres del centro</Link>, que además
        cancelan las clases de esas fechas y alargan los bonos.
      </AyudaResultado>
    </>
  );
}
