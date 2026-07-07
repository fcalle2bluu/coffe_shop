import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiConfig {
  static const String baseUrl = 'https://coffe-shop-4ffg.onrender.com/api';

  static Future<Map<String, String>> _headers() async {
    final prefs = await SharedPreferences.getInstance();
    final usuarioId = prefs.getInt('usuario_id');
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'CafeLaPazCocinaApp/1.0',
      if (usuarioId != null) 'x-usuario-id': usuarioId.toString(),
    };
  }

  static Future<http.Response> get(String endpoint) async {
    final url = Uri.parse('$baseUrl$endpoint');
    final headers = await _headers();
    return http.get(url, headers: headers).timeout(const Duration(seconds: 15));
  }

  static Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    final url = Uri.parse('$baseUrl$endpoint');
    final headers = await _headers();
    return http
        .post(url, headers: headers, body: jsonEncode(body))
        .timeout(const Duration(seconds: 15));
  }

  static Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    final url = Uri.parse('$baseUrl$endpoint');
    final headers = await _headers();
    return http
        .put(url, headers: headers, body: jsonEncode(body))
        .timeout(const Duration(seconds: 15));
  }
}
