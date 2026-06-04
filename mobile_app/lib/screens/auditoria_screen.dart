import 'dart:convert';
import 'package:flutter/material';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/api.dart';
import '../config/theme.dart';

class AuditoriaScreen extends StatefulWidget {
  const AuditoriaScreen({super.key});

  @override
  State<AuditoriaScreen> createState() => _AuditoriaScreenState();
}

class _AuditoriaScreenState extends State<AuditoriaScreen> {
  List<dynamic> _historial = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadHistorial();
  }

  Future<void> _loadHistorial() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/parametros/historial');
      if (res.statusCode == 200) {
        setState(() {
          _historial = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar historial auditoría: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _historial.isEmpty
              ? const Center(child: Text('No hay registros en la bitácora.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)))
              : RefreshIndicator(
                  onRefresh: _loadHistorial,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _historial.length,
                    itemBuilder: (context, idx) {
                      final h = _historial[idx];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 32,
                                    height: 32,
                                    decoration: BoxDecoration(
                                      color: AppTheme.accentColor.withOpacity(0.1),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    alignment: Alignment.center,
                                    child: Text(
                                      h['usuario'].toString().isNotEmpty ? h['usuario'].toString().substring(0, 1).toUpperCase() : 'U',
                                      style: const TextStyle(fontWeight: FontWeight.black, color: AppTheme.accentColor, fontSize: 13),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        h['usuario'] ?? 'Desconocido',
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        'Acceso: ${h['fecha_formateada']}',
                                        style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                              const Divider(color: Colors.white10, height: 20),
                              
                              // Detalles de IP, Ubicación y Navegador
                              Row(
                                children: [
                                  const FaIcon(FontAwesomeIcons.solidDesktop, size: 10, color: AppTheme.adminColor),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      h['dispositivo'] ?? 'Desconocido',
                                      style: const TextStyle(fontSize: 11.5, color: AppTheme.textLight),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const FaIcon(FontAwesomeIcons.locationDot, size: 10, color: Colors.orangeAccent),
                                  const SizedBox(width: 8),
                                  Text(
                                    h['ubicacion'] ?? 'Desconocida',
                                    style: const TextStyle(fontSize: 11.5, color: AppTheme.textLight),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const FaIcon(FontAwesomeIcons.globe, size: 10, color: Colors.greenAccent),
                                  const SizedBox(width: 8),
                                  Text(
                                    'IP: ${h['ip']}',
                                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontFamily: 'monospace'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
