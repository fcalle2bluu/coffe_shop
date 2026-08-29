import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../config/api_config.dart';
import 'cocina_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameController = TextEditingController();
  final _pinController = TextEditingController();
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _usernameController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  // Modelo/SO del celular y versión de la app instalada, para la bitácora
  // de accesos. Si algo falla no corta el login, simplemente no se manda.
  Future<Map<String, dynamic>> _getInfoDispositivo() async {
    final datos = <String, dynamic>{};
    try {
      final deviceInfo = DeviceInfoPlugin();
      if (Platform.isAndroid) {
        final info = await deviceInfo.androidInfo;
        datos['modelo_dispositivo'] = '${info.manufacturer} ${info.model}'.trim();
        datos['so_dispositivo'] = 'Android ${info.version.release}';
      } else if (Platform.isIOS) {
        final info = await deviceInfo.iosInfo;
        datos['modelo_dispositivo'] = info.utsname.machine;
        datos['so_dispositivo'] = 'iOS ${info.systemVersion}';
      }
    } catch (e) {
      print('No se pudo obtener info del dispositivo: $e');
    }
    try {
      final paquete = await PackageInfo.fromPlatform();
      datos['version_app'] = paquete.version;
    } catch (e) {
      print('No se pudo obtener la versión de la app: $e');
    }
    return datos;
  }

  Future<void> _login() async {
    final username = _usernameController.text.trim();
    final pin = _pinController.text.trim();
    if (username.isEmpty || pin.isEmpty) {
      setState(() => _error = 'Ingresa usuario y PIN.');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = null;
    });

    final infoDispositivo = await _getInfoDispositivo();

    try {
      final res = await ApiConfig.post('/auth/login', {'username': username, 'pin': pin, ...infoDispositivo});

      final data = jsonDecode(res.body);
      if (res.statusCode != 200) {
        throw Exception(data['error'] ?? 'Usuario o PIN incorrectos');
      }

      final usuario = data['usuario'];
      final rol = (usuario['rol'] ?? '').toString().toUpperCase();
      if (rol != 'COCINERO') {
        throw Exception('Esta app es solo para el personal de cocina.');
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('token', data['token'] ?? '');
      await prefs.setInt('usuario_id', usuario['id']);
      await prefs.setString('usuario_nombre', usuario['nombre']);
      await prefs.setString('usuario_rol', rol);

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const CocinaScreen()),
      );
    } catch (e) {
      setState(() => _error = e.toString().replaceAll('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.soup_kitchen, size: 72, color: Color(0xFFF97316)),
                const SizedBox(height: 12),
                const Text(
                  'Café La Paz',
                  style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900),
                ),
                const Text(
                  'PANTALLA DE COCINA',
                  style: TextStyle(color: Color(0xFFF97316), fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 2),
                ),
                const SizedBox(height: 32),
                TextField(
                  controller: _usernameController,
                  style: const TextStyle(color: Colors.white),
                  decoration: _inputDecoration('Usuario'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _pinController,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  style: const TextStyle(color: Colors.white),
                  decoration: _inputDecoration('PIN'),
                  onSubmitted: (_) => _login(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(_error!, style: const TextStyle(color: Colors.redAccent), textAlign: TextAlign.center),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _isLoading ? null : _login,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF97316),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: _isLoading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : const Text('INGRESAR', style: TextStyle(fontWeight: FontWeight.w900, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      labelStyle: const TextStyle(color: Colors.white54),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.05),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
    );
  }
}
