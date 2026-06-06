import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../config/api.dart';
import '../config/theme.dart';
import 'main_navigation.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  final TextEditingController _usernameController = TextEditingController();
  final FocusNode _usernameFocus = FocusNode();
  String _pin = '';
  bool _isLoading = false;
  String _errorMessage = '';
  late AnimationController _fadeController;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _fadeAnimation = CurvedAnimation(parent: _fadeController, curve: Curves.easeIn);
    _fadeController.forward();
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _usernameFocus.dispose();
    _fadeController.dispose();
    super.dispose();
  }

  void _onKeyPress(String val) {
    setState(() {
      _errorMessage = '';
      if (val == 'clear') {
        _pin = '';
      } else if (val == 'back') {
        if (_pin.isNotEmpty) {
          _pin = _pin.substring(0, _pin.length - 1);
        }
      } else {
        if (_pin.length < 6) {
          _pin += val;
        }
      }
    });

    if (_pin.length >= 4 && _usernameController.text.trim().isNotEmpty) {
      // Auto submit o esperar a que el usuario presione el botón?
      // Mejor esperar al botón o enviar si es longitud completa
    }
  }

  Future<void> _login() async {
    final username = _usernameController.text.trim();
    if (username.isEmpty) {
      setState(() => _errorMessage = 'Introduce el identificador de usuario');
      _usernameFocus.requestFocus();
      return;
    }
    if (_pin.isEmpty) {
      setState(() => _errorMessage = 'Introduce tu PIN de seguridad');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final response = await ApiConfig.post('/auth/login', {
        'username': username,
        'pin': _pin,
      });

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['usuario'] != null) {
          final user = data['usuario'];
          
          // Guardar sesión y permisos en SharedPreferences
          final prefs = await SharedPreferences.getInstance();
          await prefs.setInt('usuario_id', user['id']);
          await prefs.setString('usuario_nombre', user['nombre']);
          await prefs.setString('usuario_rol', user['rol']);
          await prefs.setString('perm_stock', (user['perm_stock'] ?? false).toString());
          await prefs.setString('perm_compras', (user['perm_compras'] ?? false).toString());
          await prefs.setString('perm_proveedores', (user['perm_proveedores'] ?? false).toString());
          await prefs.setString('perm_auditoria', (user['perm_auditoria'] ?? false).toString());
          await prefs.setString('perm_parametros', (user['perm_parametros'] ?? false).toString());
          await prefs.setString('perm_informe', (user['perm_informe'] ?? false).toString());

          // Registrar token de dispositivo FCM de forma asíncrona
          _registerFCMToken(user['id']);

          if (!mounted) return;
          
          // Animación de entrada al dashboard
          Navigator.pushReplacement(
            context,
            PageRouteBuilder(
              pageBuilder: (context, animation, secondaryAnimation) => const MainNavigation(),
              transitionsBuilder: (context, animation, secondaryAnimation, child) {
                return FadeTransition(opacity: animation, child: child);
              },
              transitionDuration: const Duration(milliseconds: 600),
            ),
          );
        } else {
          setState(() => _errorMessage = 'Error inesperado de inicio de sesión');
        }
      } else {
        final errData = jsonDecode(response.body);
        setState(() => _errorMessage = errData['error'] ?? 'Usuario o PIN incorrectos');
      }
    } catch (e) {
      setState(() => _errorMessage = 'Error de conexión con el servidor.');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _registerFCMToken(int userId) async {
    try {
      final fcm = FirebaseMessaging.instance;
      // Solicitar permisos de notificación
      await fcm.requestPermission(
        alert: true,
        announcement: false,
        badge: true,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
        sound: true,
      );
      final token = await fcm.getToken();
      if (token != null) {
        print('FCM Token obtenido: $token');
        final response = await ApiConfig.post('/auth/registrar-token', {
          'usuario_id': userId,
          'token': token,
        });
        if (response.statusCode == 200) {
          print('FCM Token registrado con éxito en el backend.');
        } else {
          print('FCM Token falló al registrarse en el backend: ${response.body}');
        }
      }
    } catch (e) {
      print('FCM desactivado o error al registrar token: $e');
    }
  }

  Widget _buildKeypadButton(String label, {FaIconData? icon, String? value}) {
    final val = value ?? label;
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.all(6.0),
        child: InkWell(
          onTap: () => _onKeyPress(val),
          borderRadius: BorderRadius.circular(16),
          child: Container(
            height: 55,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            alignment: Alignment.center,
            child: icon != null
                ? FaIcon(icon, size: 18, color: AppTheme.textLight)
                : Text(
                    label,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: AppTheme.textLight,
                    ),
                  ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isTablet = size.width > 600;

    return Scaffold(
      body: Stack(
        children: [
          // Background coffee styling
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF0F172A), // Slate 900
                  Color(0xFF020617), // Slate 950
                ],
              ),
            ),
          ),
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.accentColor.withOpacity(0.04),
                // blur radial
              ),
            ),
          ),
          
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 40.0),
              child: FadeTransition(
                opacity: _fadeAnimation,
                child: Container(
                  width: isTablet ? 450 : double.infinity,
                  padding: const EdgeInsets.all(32.0),
                  decoration: BoxDecoration(
                    color: AppTheme.secondaryDark.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(32),
                    border: Border.all(color: Colors.white.withOpacity(0.08)),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Logo Area
                      Container(
                        width: 65,
                        height: 65,
                        decoration: BoxDecoration(
                          color: AppTheme.accentColor,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.accentColor.withOpacity(0.3),
                              blurRadius: 20,
                              offset: const Offset(0, 8),
                            )
                          ],
                        ),
                        alignment: Alignment.center,
                        child: const FaIcon(
                          FontAwesomeIcons.mugHot,
                          size: 30,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 16),
                      RichText(
                        text: const TextSpan(
                          text: 'CAFÉ ',
                          style: TextStyle(
                            fontFamily: 'Outfit',
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            fontStyle: FontStyle.italic,
                            color: Colors.white,
                            letterSpacing: -1,
                          ),
                          children: [
                            TextSpan(
                              text: 'LA PAZ',
                              style: TextStyle(color: AppTheme.accentColor),
                            )
                          ],
                        ),
                      ),
                      const Text(
                        'GESTIÓN DE CAFETERÍA',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 2.0,
                          color: AppTheme.textMuted,
                        ),
                      ),
                      const SizedBox(height: 32),
                      
                      // Identificador Input
                      TextFormField(
                        controller: _usernameController,
                        focusNode: _usernameFocus,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                        decoration: InputDecoration(
                          hintText: 'Identificador (Ej: admin)',
                          prefixIcon: Padding(
                            padding: const EdgeInsets.only(left: 18.0, right: 12.0),
                            child: Icon(Icons.person, color: Colors.white.withOpacity(0.4)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),

                      // PIN Preview Area
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryDark,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white.withOpacity(0.04)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'PIN:',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                color: AppTheme.textMuted,
                                letterSpacing: 1.0,
                              ),
                            ),
                            Text(
                              _pin.isEmpty ? '••••' : '• ' * _pin.length,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.accentColor,
                                letterSpacing: 4.0,
                              ),
                            ),
                          ],
                        ),
                      ),
                      
                      if (_errorMessage.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: Colors.redAccent.withOpacity(0.2)),
                          ),
                          child: Text(
                            _errorMessage,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.redAccent,
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                      
                      const SizedBox(height: 24),
                      
                      // Keypad
                      Column(
                        children: [
                          Row(
                            children: [
                              _buildKeypadButton('1'),
                              _buildKeypadButton('2'),
                              _buildKeypadButton('3'),
                            ],
                          ),
                          Row(
                            children: [
                              _buildKeypadButton('4'),
                              _buildKeypadButton('5'),
                              _buildKeypadButton('6'),
                            ],
                          ),
                          Row(
                            children: [
                              _buildKeypadButton('7'),
                              _buildKeypadButton('8'),
                              _buildKeypadButton('9'),
                            ],
                          ),
                          Row(
                            children: [
                              _buildKeypadButton('C', value: 'clear'),
                              _buildKeypadButton('0'),
                              _buildKeypadButton('⌫', icon: FontAwesomeIcons.backspace, value: 'back'),
                            ],
                          ),
                        ],
                      ),
                      
                      const SizedBox(height: 24),
                      
                      ElevatedButton(
                        onPressed: _isLoading ? null : _login,
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size.fromHeight(55),
                          backgroundColor: Colors.white,
                          foregroundColor: AppTheme.primaryDark,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  color: AppTheme.primaryDark,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    'ENTRAR AL SISTEMA',
                                    style: TextStyle(
                                      fontFamily: 'Outfit',
                                      fontWeight: FontWeight.w900,
                                      fontSize: 13,
                                      letterSpacing: 1.5,
                                      color: AppTheme.primaryDark,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  const FaIcon(FontAwesomeIcons.chevronRight, size: 10),
                                ],
                              ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
