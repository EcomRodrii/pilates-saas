// La frase del estudio, escrita a mano.
//
// Sale de la guía de marca: una tarjeta en color con una frase corta en
// caligráfica («Un cuerpo feliz hace una mente tranquila»). La escribe cada
// estudio en Configuración; sin frase, esto no se pinta — ni tarjeta vacía ni
// frase de fábrica, por lo mismo que el lema y la frase del héroe: trece
// estudios diciendo lo mismo no es marca blanca.
//
// ⚠️ En la guía es la quinta pieza de la fila de baldosas. Aquí va DEBAJO y a
// todo lo ancho: a 393 px, cinco columnas dejan 63 px por baldosa y una
// caligráfica ahí no se lee. La guía está dibujada para una pantalla ancha; lo
// que se conserva es lo que significa —la tinta de marca es para esto, no para
// un atajo— y no el número de columnas.
//
// El color es la pareja `--accent` / `--accent-foreground` del sistema, así que
// el contraste está garantizado sea cual sea la marca del estudio. Es
// exactamente la trampa que ya costó cara con la barra del bono en verde
// (#1832) y el ✓ sobre un muro (#1827): un color elegido por lo que significa,
// puesto sobre una superficie que no controla.

export function CitaManuscrita({ frase }: { frase: string | null }) {
  const texto = frase?.trim();
  if (!texto) return null;

  return (
    // ⚠️ Sin `aria-label`, y menos «Del estudio»: ya hay un bloque en esta misma
    // pantalla que se llama así —el del tablón (`DelEstudio`)—, y dos regiones
    // con el mismo nombre son, para quien navega con lector, dos cosas
    // indistinguibles. La frase se lee igual dentro; una <section> sin nombre no
    // es un landmark. Para los tests, `data-testid`, que es el idioma del repo.
    <section className="px a-up" style={{ marginTop: 14 }} data-testid="cita-manuscrita">
      <div
        style={{
          borderRadius: 18,
          background: 'var(--accent)',
          color: 'var(--accent-foreground)',
          padding: '20px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 96,
        }}
      >
        {/* 26 px: una caligráfica a 15 px no se lee, se adivina. Y sin comillas
            —la letra ya dice que es una frase, no una instrucción de la app. */}
        <p
          className="t-manuscrita"
          style={{ margin: 0, fontSize: 26, textAlign: 'center', textWrap: 'balance' }}
        >
          {texto}
        </p>
      </div>
    </section>
  );
}
