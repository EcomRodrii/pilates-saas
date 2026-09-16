import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

// Verificado contra: lib/configuracion/secciones.ts (dónde vive la fila),
// components/configuracion/tab-estudio-horario.tsx (campos y confirmaciones),
// lib/cierres/aplicar-cierre.ts (qué hace), lib/cierres/quitar-cierre.ts (qué
// no se deshace) y la RPC prorrogar_por_cierre (los días se suman una vez).

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;
const lista = { margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Cierras en agosto, cae un puente o tienes la sala en obras. En vez de ir clase por clase cancelando y luego
        acordarte de compensar los bonos, marcas las fechas una vez y Tentare hace las tres cosas: cancela, avisa y
        alarga los bonos.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Dónde se pone</h2>
      <p>
        En <strong>Configuración</strong> &gt; <strong>Mi estudio</strong> &gt; <strong>«Cerrar el centro»</strong>.
        Puede hacerlo la propietaria y la gerencia de esa sede.
      </p>
      <p>
        Un cierre tiene tres campos: <strong>«Desde»</strong>, <strong>«Hasta (incluido)»</strong> —el último día
        también está cerrado— y un <strong>motivo</strong> opcional, para que dentro de seis meses sepas por qué
        cerraste esa semana.
      </p>

      <h2 style={h2}>Qué pasa al cerrar</h2>
      <p>Antes de confirmar te resume lo que va a ocurrir, y ocurre esto:</p>
      <ul style={lista}>
        <li>
          <strong>Nadie puede reservar</strong> esos días. No es que se escondan las clases: la reserva se rechaza
          en la propia base de datos, así que tampoco entra nadie desde tu web ni desde la app.
        </li>
        <li>
          <strong>Se cancelan las clases</strong> de esas fechas y <strong>se avisa a quien tenía reserva</strong>. Si
          le devuelve o no la sesión del bono lo decide tu ajuste de siempre para una clase cancelada entera, y el
          resumen previo te dice cuál de las dos cosas va a pasar.
        </li>
        <li>
          <strong>Los bonos y las recuperaciones duran esos días más</strong>. Y no solo los de quien tenía clase
          reservada: los de <strong>todas</strong> tus alumnas. Si cierras siete días, cualquier bono pierde siete
          días de vigencia, hubiera reservado o no.
        </li>
      </ul>
      <p>
        Los días se suman <strong>una sola vez</strong>. Si vuelves a cerrar unas fechas que ya habías cerrado —o
        amplías un cierre existente—, a los bonos no se les regala dos veces: Tentare lleva la cuenta de qué días ya
        se prorrogaron y te lo dice en el resultado.
      </p>
      <p>
        Al terminar te dice cuántos días has cerrado, cuántas clases se han cancelado y cuántos bonos se han
        prorrogado.
      </p>

      <h2 style={h2}>Ver, quitar y reabrir</h2>
      <p>
        En esa misma fila tienes <strong>«Cierres que vienen»</strong>, con las fechas de cada uno, su motivo y
        cuántas clases canceló; los ya pasados están plegados. Según cuándo sea el cierre puedes hacer una cosa u
        otra:
      </p>
      <ul style={lista}>
        <li><strong>Un cierre futuro</strong>: «Quitar este cierre». Tus alumnas podrán volver a reservar esos días.</li>
        <li><strong>Un cierre en curso</strong>: «Reabrir desde hoy». Se reabre de hoy en adelante, no hacia atrás.</li>
        <li><strong>Un cierre pasado</strong>: no se toca. Ya ocurrió.</li>
      </ul>

      <h2 style={h2}>Lo que quitar un cierre NO deshace</h2>
      <p>
        Esto importa antes de cerrar, porque no hay marcha atrás completa. Al quitarlo vuelven a poder reservarse
        esos días, y vuelven a funcionar ahí las plazas fijas y la renovación de series. Pero:
      </p>
      <ul style={lista}>
        <li><strong>Las clases canceladas no vuelven, ni sus reservas.</strong> Si las quieres, se crean otra vez.</li>
        <li><strong>Los bonos se quedan con sus días de más</strong>, y no se avisa a nadie de que el cierre se ha quitado.</li>
        <li>Si vuelves a cerrar esas mismas fechas, a los bonos <strong>no</strong> se les suman otra vez.</li>
      </ul>

      <h2 style={h2}>Cierres y clases que se repiten</h2>
      <p>
        Al{' '}
        <Link href="/ayuda/reservas/clases-que-se-repiten" style={enlace}>renovar una serie</Link>, las fechas que
        caen en un cierre <strong>no se crean</strong>, y se te dice antes de confirmar: «el centro está cerrado ese
        día». Si la serie se renueva sola y el cierre le come fechas, tampoco lo hace en silencio — te avisa para que
        la mires.
      </p>

      <AyudaResultado>
        Si solo quieres regalar días de bono sin cerrar —una compensación, un detalle con un grupo—, eso es otra
        cosa: se hace desde{' '}
        <Link href="/ayuda/bonos/ampliar-caducidades-en-lote" style={enlace}>Clientas, ampliando la caducidad</Link>{' '}
        a quien tú elijas. El cierre es para cuando de verdad no hay clases.
      </AyudaResultado>
    </>
  );
}
