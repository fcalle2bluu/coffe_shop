import 'package:audioplayers/audioplayers.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibration/vibration.dart';

const _kAlertasActivadasKey = 'alertas_sonido_vibracion_activadas';

// Suena por el canal de ALARMA del sistema (no el de música/medios), que en la
// mayoría de los equipos está más alto y no se ve afectado si alguien bajó el
// volumen de medios. Así se escucha fuerte incluso con ruido de cocina.
final _contextoAlarma = AudioContext(
  android: AudioContextAndroid(
    contentType: AndroidContentType.sonification,
    usageType: AndroidUsageType.alarm,
    audioFocus: AndroidAudioFocus.gain,
  ),
);

class AlertService {
  static final AudioPlayer _player = AudioPlayer();

  static Future<bool> estaActivado() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_kAlertasActivadasKey) ?? true;
  }

  static Future<void> setActivado(bool activado) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kAlertasActivadasKey, activado);
  }

  /// Suena y vibra para avisar que llegó una comanda nueva (si está activado).
  static Future<void> nuevaComanda() async {
    if (!await estaActivado()) return;

    try {
      await _player.play(
        AssetSource('sounds/comanda.wav'),
        volume: 1.0,
        ctx: _contextoAlarma,
      );
    } catch (e) {
      print('Error al reproducir sonido de alerta: $e');
    }
    try {
      final tieneVibrador = await Vibration.hasVibrator();
      if (tieneVibrador) {
        Vibration.vibrate(pattern: [0, 500, 200, 500, 200, 500]);
      }
    } catch (e) {
      print('Error al vibrar: $e');
    }
  }
}
