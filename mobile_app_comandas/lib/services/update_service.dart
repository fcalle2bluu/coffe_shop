import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_file/open_file.dart';
import '../config/api_config.dart';

class InfoActualizacion {
  final int versionCode;
  final String versionName;
  final String apkUrl;
  final String notas;
  final bool obligatoria;

  InfoActualizacion({
    required this.versionCode,
    required this.versionName,
    required this.apkUrl,
    required this.notas,
    required this.obligatoria,
  });

  factory InfoActualizacion.fromJson(Map<String, dynamic> json) {
    return InfoActualizacion(
      versionCode: json['versionCode'] ?? 0,
      versionName: json['versionName']?.toString() ?? '',
      apkUrl: json['apkUrl'] ?? '',
      notas: json['notas'] ?? '',
      obligatoria: json['obligatoria'] == true,
    );
  }
}

class UpdateService {
  // ApiConfig.baseUrl termina en "/api"; el host base sirve tanto la API como los .apk
  static String get _baseHost => ApiConfig.baseUrl.replaceFirst(RegExp(r'/api/?$'), '');

  /// Devuelve la info de la última versión si es MÁS NUEVA que la instalada,
  /// o null si ya está actualizado o no se pudo consultar (sin bloquear la app).
  static Future<InfoActualizacion?> buscarActualizacion() async {
    try {
      final response = await http
          .get(Uri.parse('$_baseHost/api/version/comandas'))
          .timeout(const Duration(seconds: 6));

      if (response.statusCode != 200) return null;

      final info = InfoActualizacion.fromJson(jsonDecode(response.body));
      final paquete = await PackageInfo.fromPlatform();
      final versionActual = int.tryParse(paquete.buildNumber) ?? 0;

      if (info.versionCode > versionActual) {
        return info;
      }
      return null;
    } catch (e) {
      print('No se pudo verificar actualizaciones: $e');
      return null;
    }
  }

  /// Descarga el APK e invoca al instalador del sistema. [onProgreso] recibe
  /// un valor de 0.0 a 1.0 (o null si el servidor no manda content-length).
  static Future<void> descargarEInstalar(
    InfoActualizacion info,
    void Function(double? progreso) onProgreso,
  ) async {
    final url = info.apkUrl.startsWith('http') ? info.apkUrl : '$_baseHost${info.apkUrl}';
    final request = http.Request('GET', Uri.parse(url));
    final response = await http.Client().send(request);

    if (response.statusCode != 200) {
      throw Exception('No se pudo descargar la actualización (HTTP ${response.statusCode}).');
    }

    final total = response.contentLength;
    var recibido = 0;
    final bytes = <int>[];

    await for (final chunk in response.stream) {
      bytes.addAll(chunk);
      recibido += chunk.length;
      onProgreso(total != null && total > 0 ? recibido / total : null);
    }

    final dir = await getTemporaryDirectory();
    final archivo = File('${dir.path}/cafelapaz_comandas_${info.versionCode}.apk');
    await archivo.writeAsBytes(bytes, flush: true);

    final resultado = await OpenFile.open(archivo.path);
    if (resultado.type != ResultType.done) {
      throw Exception(resultado.message.isNotEmpty
          ? resultado.message
          : 'No se pudo abrir el instalador.');
    }
  }
}
