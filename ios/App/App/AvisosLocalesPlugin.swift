import Foundation
import UserNotifications
import Capacitor

/// Programa en el iPhone los avisos «tu clase empieza en 15 minutos».
///
/// Lo llama `programarAvisosLocales()` (lib/nativo/puente.ts). Salta aunque no
/// haya red y la app esté cerrada: son avisos locales de `UNUserNotificationCenter`.
///
/// ⚠️ NO pide permiso: usa el que la alumna ya dio a los avisos de la app. Sin
/// permiso (o denegado) no programa nada y contesta `programados: 0`.
/// ⚠️ Solo toca lo que empieza por `prefijo` (el mismo que `PREFIJO_AVISO_LOCAL`
/// en lib/nativo/avisos-locales.ts): los avisos push del servidor ni se ven.
@objc(AvisosLocalesPlugin)
public class AvisosLocalesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AvisosLocalesPlugin"
    public let jsName = "AvisosLocales"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "programar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "borrar", returnType: CAPPluginReturnPromise)
    ]

    static let prefijo = "clase-local-"
    private static let maximo = 20

    private struct Paquete: Decodable { let avisos: [Aviso] }
    private struct Aviso: Decodable {
        let id: String
        let titulo: String
        let cuerpo: String
        let cuando: String
    }

    /// `{ json: string }` con `{ version, avisos: [{ id, titulo, cuerpo, cuando }] }`.
    @objc func programar(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let datos = json.data(using: .utf8),
              let paquete = try? JSONDecoder().decode(Paquete.self, from: datos) else {
            call.reject("Datos no válidos para los avisos", "DATOS_NO_VALIDOS")
            return
        }
        let centro = UNUserNotificationCenter.current()
        centro.getNotificationSettings { ajustes in
            let permitido = ajustes.authorizationStatus == .authorized
                || ajustes.authorizationStatus == .provisional
                || ajustes.authorizationStatus == .ephemeral
            guard permitido else {
                call.resolve(["programados": 0])
                return
            }
            // Primero se quita lo nuestro de antes (una clase cancelada no puede avisar)
            // y después se programa lo vigente.
            centro.getPendingNotificationRequests { pendientes in
                let propios = pendientes.map { $0.identifier }.filter { $0.hasPrefix(Self.prefijo) }
                centro.removePendingNotificationRequests(withIdentifiers: propios)
                let formato = ISO8601DateFormatter()
                var programados = 0
                let grupo = DispatchGroup()
                for aviso in paquete.avisos.prefix(Self.maximo) {
                    guard aviso.id.hasPrefix(Self.prefijo), let cuando = formato.date(from: aviso.cuando) else { continue }
                    let segundos = cuando.timeIntervalSinceNow
                    guard segundos > 1 else { continue }
                    let contenido = UNMutableNotificationContent()
                    contenido.title = aviso.titulo
                    contenido.body = aviso.cuerpo
                    contenido.sound = .default
                    let disparador = UNTimeIntervalNotificationTrigger(timeInterval: segundos, repeats: false)
                    grupo.enter()
                    centro.add(UNNotificationRequest(identifier: aviso.id, content: contenido, trigger: disparador)) { error in
                        if error == nil { programados += 1 }
                        grupo.leave()
                    }
                }
                grupo.notify(queue: .main) { call.resolve(["programados": programados]) }
            }
        }
    }

    /// Al cerrar sesión o apagarlos: no queda ningún aviso de la alumna anterior.
    @objc func borrar(_ call: CAPPluginCall) {
        let centro = UNUserNotificationCenter.current()
        centro.getPendingNotificationRequests { pendientes in
            let propios = pendientes.map { $0.identifier }.filter { $0.hasPrefix(Self.prefijo) }
            centro.removePendingNotificationRequests(withIdentifiers: propios)
            call.resolve()
        }
    }
}
