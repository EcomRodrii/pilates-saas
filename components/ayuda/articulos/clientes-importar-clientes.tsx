import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Exporta tus clientas de tu software actual a un archivo .csv o .xlsx antes de empezar — no hace falta que
        conectes ninguna cuenta ni des permisos a Tentare sobre tu plataforma anterior.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Sube tu archivo">
        <p>Desde Clientas &gt; Importar, sube el .csv o .xlsx exportado. Tentare lee la primera fila como cabecera.</p>
        <AyudaCaptura alt="Pantalla de importación, subida de archivo" pendiente="paso 1 de importación" />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Revisa el mapeo de columnas">
        <p>Tentare intenta emparejar tus columnas (nombre, email, teléfono…) automáticamente. Revísalas antes de continuar: es más rápido corregir un mapeo mal detectado ahora que arreglar cientos de fichas después.</p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Corrige lo que salga marcado">
        <p style={{ margin: 0 }}>Filas con un email inválido o duplicado se marcan antes de importar, no después — puedes corregirlas en el propio archivo o decidir ignorarlas.</p>
      </AyudaPaso>

      <AyudaResultado>
        Las clientas importadas quedan como fichas normales, listas para asignarles un plan o bono. Un dato mal
        exportado desde tu plataforma anterior (fechas, teléfonos con formato distinto) es el motivo más habitual de
        que algo no se mapee bien — repasa siempre unas cuantas filas al azar después de importar.
      </AyudaResultado>
    </>
  );
}
