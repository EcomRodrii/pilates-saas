import Foundation
import WidgetKit
import Capacitor

/// Le pasa al widget las próximas clases de la alumna.
///
/// Lo llama `guardarClasesParaElWidget()` (lib/nativo/puente.ts). Guarda en el
/// grupo de apps (lo que lee el widget, `Compartido/ProximasClases.swift`) y
/// pide a iOS que refresque sus líneas de tiempo.
///
/// Vive dentro de la app, como `SignInWithApplePlugin`: está registrado en
/// `TentareBridgeViewController`. Si el widget no está en la pantalla de inicio,
/// guardar y recargar no cuesta nada ni enseña nada.
@objc(ProximaClasePlugin)
public class ProximaClasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ProximaClasePlugin"
    public let jsName = "ProximaClase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "guardar", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "borrar", returnType: CAPPluginReturnPromise)
    ]

    /// `{ json: string }` con las clases en el formato de `ProximasClases`.
    @objc func guardar(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else {
            call.reject("Falta el json", "SIN_DATOS")
            return
        }
        guard ProximasClasesAlmacen.guardar(json: json) else {
            call.reject("Datos no válidos para el widget", "DATOS_NO_VALIDOS")
            return
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Al cerrar sesión: nada de la alumna se queda en la pantalla de inicio.
    @objc func borrar(_ call: CAPPluginCall) {
        ProximasClasesAlmacen.borrar()
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
