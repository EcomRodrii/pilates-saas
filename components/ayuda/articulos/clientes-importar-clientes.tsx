import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra Clientas > Importar
// (cuenta de demostración).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Exporta tus clientas de tu software actual a un archivo .csv o .xlsx antes de empezar — no hace falta que
        conectes ninguna cuenta ni des permisos a Tentare sobre tu plataforma anterior.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Sube tu archivo">
        <p>Desde Clientas &gt; Importar, arrastra tu CSV o Excel. Las columnas mínimas que necesita son <strong>Nombre</strong> y <strong>Email</strong>; puedes descargar una plantilla de ejemplo si no la tienes clara.</p>
        <AyudaCaptura
          src="/help/clientes/importar-clientes.png"
          alt="Pantalla de importación de clientas: subir archivo CSV o Excel, con enlaces a migración automática, importar bonos e importar plazas fijas"
          caption="Paso 1 de 3 — subir archivo."
        />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Revisa el mapeo de columnas">
        <p>Tentare intenta emparejar tus columnas (nombre, email, teléfono…) automáticamente. Revísalas antes de continuar: es más rápido corregir un mapeo mal detectado ahora que arreglar cientos de fichas después.</p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Corrige lo que salga marcado">
        <p style={{ margin: 0 }}>Filas con un email inválido o duplicado se marcan antes de importar, no después — puedes corregirlas en el propio archivo o decidir ignorarlas.</p>
      </AyudaPaso>

      <AyudaResultado>
        Esta pantalla importa solo los datos de la clienta. Si además quieres traer sus bonos y membresías activas, o
        sus plazas fijas semanales, esta misma pantalla enlaza a esos dos importadores aparte — o, si vienes de otra
        plataforma entera, prueba la migración automática (arrastras tus exports tal cual y Tentare los reconoce
        solos, con deshacer).
      </AyudaResultado>
    </>
  );
}
