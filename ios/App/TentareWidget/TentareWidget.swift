import WidgetKit
import SwiftUI

// «Mi próxima clase»: el widget de la pantalla de inicio y de la de bloqueo.
//
// Enseña la próxima clase reservada (y la siguiente en el tamaño mediano) con
// su hora y su estudio. Los datos los guarda la app en el grupo de apps
// (`Compartido/ProximasClases.swift`); el widget solo los lee, no llama a
// ninguna red. Sin sesión o sin clases reservadas, lo dice y lleva a la app.

// MARK: - Línea de tiempo

struct EntradaClases: TimelineEntry {
    let date: Date
    /// Las clases que aún no han terminado en `date`, por orden de inicio.
    let clases: [ClaseProxima]
    /// `true` cuando no hay nada guardado (sin sesión, o datos caducados).
    let sinDatos: Bool
}

struct ProveedorClases: TimelineProvider {
    func placeholder(in context: Context) -> EntradaClases {
        EntradaClases(date: Date(), clases: [Self.ejemplo(en: 3600)], sinDatos: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (EntradaClases) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
        } else {
            completion(Self.entradas(ahora: Date()).first ?? placeholder(in: context))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EntradaClases>) -> Void) {
        let ahora = Date()
        let entradas = Self.entradas(ahora: ahora)
        // Se vuelve a pedir en cuanto cambie lo que hay que enseñar (cuando acabe
        // la primera clase) y, como mucho, cada 6 horas. La app además recarga el
        // widget cada vez que guarda clases nuevas.
        let seis = ahora.addingTimeInterval(6 * 3600)
        let fin = entradas.dropFirst().first?.date ?? seis
        completion(Timeline(entries: entradas, policy: .after(min(fin, seis))))
    }

    /// Una entrada ahora y una más al terminar cada clase, para que pase sola
    /// a la siguiente sin esperar a que la app despierte.
    static func entradas(ahora: Date) -> [EntradaClases] {
        guard let datos = ProximasClasesAlmacen.leer(ahora: ahora) else {
            return [EntradaClases(date: ahora, clases: [], sinDatos: true)]
        }
        let vigentes = datos.clases.filter { $0.fin > ahora }.sorted { $0.inicio < $1.inicio }
        var instantes = [ahora]
        instantes += vigentes.map(\.fin).filter { $0 > ahora }
        return instantes.map { instante in
            EntradaClases(date: instante, clases: vigentes.filter { $0.fin > instante }, sinDatos: false)
        }
    }

    static func ejemplo(en segundos: TimeInterval) -> ClaseProxima {
        ClaseProxima(
            id: "ejemplo", titulo: "Pilates Reformer",
            inicio: Date().addingTimeInterval(segundos), fin: Date().addingTimeInterval(segundos + 3300),
            estudio: "Tu estudio", instructora: "Ana", sala: nil
        )
    }
}

// MARK: - Textos

enum TextosWidget {
    /// «Hoy · 18:30», «Mañana · 09:00» o «mié 25 · 18:30».
    static func cuando(_ fecha: Date, ahora: Date = Date()) -> String {
        let cal = Calendar.current
        let hora = fecha.formatted(date: .omitted, time: .shortened)
        if cal.isDate(fecha, inSameDayAs: ahora) { return "Hoy · \(hora)" }
        if let manana = cal.date(byAdding: .day, value: 1, to: ahora), cal.isDate(fecha, inSameDayAs: manana) {
            return "Mañana · \(hora)"
        }
        let dia = fecha.formatted(.dateTime.weekday(.abbreviated).day())
        return "\(dia) · \(hora)"
    }

    static func detalle(_ c: ClaseProxima) -> String {
        [c.instructora, c.sala].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Dónde cae el toque: la app de la alumna (enlace universal de la web).
    static let enlaceApp = URL(string: "https://www.tentare.app/app")!
}

// MARK: - Vistas

struct VistaTentareWidget: View {
    let entrada: EntradaClases
    @Environment(\.widgetFamily) private var familia

    var body: some View {
        contenido
            .widgetURL(TextosWidget.enlaceApp)
            .tentareFondo()
    }

    @ViewBuilder
    private var contenido: some View {
        switch familia {
        case .systemMedium:
            medio
        case .accessoryRectangular:
            if #available(iOSApplicationExtension 16.0, *) { bloqueoRectangular } else { pequeno }
        case .accessoryInline:
            if #available(iOSApplicationExtension 16.0, *) { bloqueoEnLinea } else { pequeno }
        default:
            pequeno
        }
    }

    // Pequeño: la próxima clase.
    private var pequeno: some View {
        VStack(alignment: .leading, spacing: 4) {
            Etiqueta(texto: "Próxima clase")
            if let c = entrada.clases.first {
                Spacer(minLength: 0)
                Text(c.titulo).font(.headline).lineLimit(2).minimumScaleFactor(0.8)
                Text(TextosWidget.cuando(c.inicio, ahora: entrada.date))
                    .font(.subheadline.weight(.semibold)).foregroundColor(.accentColor)
                Text(c.estudio).font(.caption).foregroundColor(.secondary).lineLimit(1)
            } else {
                Spacer(minLength: 0)
                Vacio(sinDatos: entrada.sinDatos)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // Mediano: la próxima clase a la izquierda y la siguiente a la derecha.
    private var medio: some View {
        HStack(alignment: .top, spacing: 14) {
            pequeno
            if entrada.clases.count > 1 {
                Divider()
                VStack(alignment: .leading, spacing: 4) {
                    Etiqueta(texto: "Después")
                    Spacer(minLength: 0)
                    Text(entrada.clases[1].titulo).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Text(TextosWidget.cuando(entrada.clases[1].inicio, ahora: entrada.date))
                        .font(.caption).foregroundColor(.secondary)
                    let d = TextosWidget.detalle(entrada.clases[1])
                    if !d.isEmpty { Text(d).font(.caption2).foregroundColor(.secondary).lineLimit(1) }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
        }
    }

    // Pantalla de bloqueo: rectángulo y línea.
    @available(iOSApplicationExtension 16.0, *)
    private var bloqueoRectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let c = entrada.clases.first {
                Text(c.titulo).font(.headline).lineLimit(1)
                Text(TextosWidget.cuando(c.inicio, ahora: entrada.date)).font(.caption)
                Text(c.estudio).font(.caption2).lineLimit(1)
            } else {
                Text("Sin clases reservadas").font(.headline).lineLimit(1)
                Text("Reserva en la app").font(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @available(iOSApplicationExtension 16.0, *)
    private var bloqueoEnLinea: some View {
        if let c = entrada.clases.first {
            return Text("\(c.titulo) · \(TextosWidget.cuando(c.inicio, ahora: entrada.date))")
        }
        return Text("Sin clases reservadas")
    }
}

private struct Etiqueta: View {
    let texto: String
    var body: some View {
        Text(texto.uppercased())
            .font(.system(size: 10, weight: .bold))
            .tracking(0.6)
            .foregroundColor(.secondary)
    }
}

private struct Vacio: View {
    let sinDatos: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(sinDatos ? "Abre la app" : "Sin clases reservadas").font(.headline).lineLimit(2)
            Text(sinDatos ? "Entra para ver tu próxima clase" : "Reserva tu próxima clase").font(.caption).foregroundColor(.secondary)
        }
    }
}

private extension View {
    /// iOS 17 exige `containerBackground`; antes, el fondo va dentro de la vista.
    @ViewBuilder
    func tentareFondo() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.containerBackground(.fill.tertiary, for: .widget)
        } else {
            self.padding().background(Color(UIColor.secondarySystemBackground))
        }
    }
}

// MARK: - Widget

@main
struct TentareWidget: Widget {
    let kind = "TentareProximaClase"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ProveedorClases()) { entrada in
            VistaTentareWidget(entrada: entrada)
        }
        .configurationDisplayName("Mi próxima clase")
        .description("Tu próxima clase reservada, siempre a la vista.")
        .supportedFamilies(Self.familias)
    }

    static var familias: [WidgetFamily] {
        if #available(iOSApplicationExtension 16.0, *) {
            return [.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline]
        }
        return [.systemSmall, .systemMedium]
    }
}
