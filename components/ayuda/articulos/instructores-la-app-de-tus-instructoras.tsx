import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

// Verificado contra: components/student/shell/BottomNavigation.tsx (las cinco
// pestañas), app/portal/[slug]/equipo/** (cada pantalla), lib/configuracion/
// secciones.ts (dónde está el enlace) y app/portal/[slug]/acceso/elegir
// (la primera entrada). El panel se le cerró: lib/avisos/app-instructora.ts.

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;
const lista = { margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Tu equipo no trabaja en el panel: trabaja en <strong>la app de tu estudio</strong>, desde el móvil, con la
        misma marca que ven tus alumnas. Ahí tiene su agenda, pasa lista, dice cuándo puede cubrir y habla con sus
        alumnas.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>El enlace para dárselo</h2>
      <p>
        En <strong>Configuración</strong> &gt; <strong>Mi equipo</strong> &gt;{' '}
        <strong>«La app de tus instructoras»</strong>, con un botón para copiarlo. Es el enlace que abren para entrar
        con su cuenta a su agenda, sus bajas, su disponibilidad y sus alumnas.
      </p>

      <h2 style={h2}>Cómo entra la primera vez</h2>
      <p>
        Cuando la{' '}
        <Link href="/ayuda/instructores/dar-de-alta-una-instructora" style={enlace}>das de alta en Equipo</Link>,
        recibe un correo de invitación con el botón <strong>«Aceptar invitación»</strong>. Ese enlace la lleva
        directamente a la app de tu estudio.
      </p>
      <p>
        Si esa persona <strong>también es alumna tuya</strong>, la app le pregunta{' '}
        <strong>«¿Cómo quieres entrar?»</strong> y elige entre <strong>«Como instructora»</strong> (su agenda, sus
        alumnas y cuándo puede dar clase) o <strong>«Como alumna»</strong> (reservar clases y ver sus bonos). Si
        entra como alumna no pierde nada: vuelve a su parte de instructora con el enlace del correo.
      </p>
      <p>
        Lo primero que le pide es <strong>marcar su disponibilidad</strong>: hasta que no diga al menos una franja en
        la que puede dar clase, la app la lleva ahí. Es lo que hace que aparezca como candidata cuando busques una
        sustituta.
      </p>

      <h2 style={h2}>Las cinco pestañas</h2>
      <ul style={lista}>
        <li>
          <strong>Hoy</strong> — cuántas clases da hoy, su semana y los próximos días. Aquí le llegan también las
          ofertas de <Link href="/ayuda/instructores/sustituciones" style={enlace}>sustitución</Link>, con dos
          botones: «La cubro» y «No puedo». Y los atajos a crear una clase suya (si lo permites), su disponibilidad,
          sus ausencias y sus alumnas. Desde aquí empieza cada clase («Empezar clase») y ficha su jornada si es
          contratada: lo explica el{' '}
          <Link href="/ayuda/instructores/control-horario" style={enlace}>control horario</Link>.
        </li>
        <li><strong>Agenda</strong> — sus clases, seguidas, día a día.</li>
        <li>
          <strong>Alumnas</strong> — las de sus propias clases, del último mes y el mes que viene. En la ficha de
          cada una ve a cuántas de sus clases ha venido y puede escribirle.
        </li>
        <li><strong>Mensajes</strong> — sus conversaciones con esas alumnas.</li>
        <li>
          <strong>Perfil</strong> — sus datos y su contraseña, su disponibilidad, sus ausencias, sus valoraciones,
          los avisos de ese móvil y, si trabaja en varias sedes tuyas, cuál tiene abierta.
        </li>
      </ul>

      <h2 style={h2}>Pasar lista y la nota de sesión</h2>
      <p>
        Desde la clase, con <strong>«Pasar lista»</strong>: ve quién viene y lo marca desde el móvil, sin pasar por
        recepción. La app le dice a partir de qué hora puede hacerlo.
      </p>
      <p>
        En la ficha de una alumna puede dejar la <strong>nota de la sesión</strong> —qué tal ha ido, qué trabajar la
        próxima vez—, que es justo cuando se acuerda. Solo si esa alumna tiene el consentimiento de salud vigente: sin
        él, la app no le abre esa parte.
      </p>

      <h2 style={h2}>Su tarifa la sigues poniendo tú</h2>
      <p>
        En Perfil ve <strong>su tarifa por hora y su base mensual</strong>, pero solo las lee: las fijas tú desde el
        panel. La app se lo dice así — «la fija el estudio».
      </p>

      <h2 style={h2}>Qué no hace desde la app</h2>
      <p>
        La instructora <strong>ya no entra al panel</strong>: si intenta hacerlo, aterriza en su «Hoy». Lo que es
        trabajo de mostrador se queda en el mostrador y no lo verá:
      </p>
      <ul style={lista}>
        <li>Apuntar o quitar alumnas de una clase, y editar o cancelar una clase ya programada.</li>
        <li>Crear una <Link href="/ayuda/reservas/clases-que-se-repiten" style={enlace}>serie</Link> o renovarla.</li>
        <li>La agenda y la ocupación de sus compañeras, y el teléfono o el email de ellas.</li>
        <li>Cobros, caja y cualquier cosa de dinero que no sea su propia tarifa.</li>
      </ul>
      <p>
        Si además <strong>gestiona en otra de tus sedes</strong>, ahí sí entra al panel con el rol que le hayas dado:
        al abrir, elige entre la app y cambiar de sede. Lo que puede hacer cada rol está en{' '}
        <Link href="/ayuda/instructores/permisos-por-rol" style={enlace}>qué puede hacer cada rol</Link>.
      </p>

      <AyudaResultado>
        Si una instructora te dice que «no ve nada» al entrar, lo más normal es que aún no haya marcado su
        disponibilidad, o que esté entrando con un correo distinto del que tiene en su ficha de Equipo. Comprueba ese
        correo antes de volver a invitarla.
      </AyudaResultado>
    </>
  );
}
