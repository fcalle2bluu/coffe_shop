import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiConfig {
  static const String baseUrl = 'https://coffe-shop-4ffg.onrender.com/api';

  // Helper para peticiones GET
  static Future<http.Response> get(String endpoint) async {
    final url = Uri.parse('$baseUrl$endpoint');
    print('GET: $url');
    try {
      final response = await http.get(
        url,
        headers: {'Content-Type': 'application/json'},
      );
      print('Response Status: ${response.statusCode}');
      return response;
    } catch (e) {
      print('Error en GET a $endpoint: $e');
      rethrow;
    }
  }

  // Helper para peticiones POST
  static Future<http.Response> post(String endpoint, Map<String, dynamic> body) async {
    final url = Uri.parse('$baseUrl$endpoint');
    print('POST: $url');
    print('Body: ${jsonEncode(body)}');
    try {
      final response = await http.post(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      print('Response Status: ${response.statusCode}');
      return response;
    } catch (e) {
      print('Error en POST a $endpoint: $e');
      rethrow;
    }
  }

  // Helper para peticiones PUT
  static Future<http.Response> put(String endpoint, Map<String, dynamic> body) async {
    final url = Uri.parse('$baseUrl$endpoint');
    print('PUT: $url');
    print('Body: ${jsonEncode(body)}');
    try {
      final response = await http.put(
        url,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(body),
      );
      print('Response Status: ${response.statusCode}');
      return response;
    } catch (e) {
      print('Error en PUT a $endpoint: $e');
      rethrow;
    }
  }

  // Helper para peticiones DELETE
  static Future<http.Response> delete(String endpoint) async {
    final url = Uri.parse('$baseUrl$endpoint');
    print('DELETE: $url');
    try {
      final response = await http.delete(
        url,
        headers: {'Content-Type': 'application/json'},
      );
      print('Response Status: ${response.statusCode}');
      return response;
    } catch (e) {
      print('Error en DELETE a $endpoint: $e');
      rethrow;
    }
  }

  // Helper para subir archivos (Multipart POST)
  static Future<String?> uploadImage(String filePath) async {
    final url = Uri.parse('$baseUrl/upload');
    print('UPLOAD: $url with file $filePath');
    try {
      final request = http.MultipartRequest('POST', url);
      request.files.add(await http.MultipartFile.fromPath('imagen', filePath));
      
      final streamedResponse = await request.send();
      final response = await http.Response.fromStream(streamedResponse);
      
      print('Upload Response Status: ${response.statusCode}');
      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        if (data['success'] == true) {
          return data['url'];
        }
      }
      return null;
    } catch (e) {
      print('Error al subir imagen: $e');
      return null;
    }
  }
}
