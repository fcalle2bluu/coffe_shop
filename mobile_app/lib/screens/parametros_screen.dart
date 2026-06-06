import 'dart:convert';
import 'package:flutter/material.dart';
import '../config/api.dart';
import '../config/theme.dart';

class ParametrosScreen extends StatefulWidget {
  const ParametrosScreen({super.key});

  @override
  State<ParametrosScreen> createState() => _ParametrosScreenState();
}

class _ParametrosScreenState extends State<ParametrosScreen> {
  bool _isLoading = true;

  // Company parameters state
  final _empresaController = TextEditingController();
  final _documentoController = TextEditingController();
  final _dirController = TextEditingController();
  final _telController = TextEditingController();
  final _monedaController = TextEditingController();
  final _msgSupController = TextEditingController();
  final _msgInfController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadParametros();
  }

  @override
  void dispose() {
    _empresaController.dispose();
    _documentoController.dispose();
    _dirController.dispose();
    _telController.dispose();
    _monedaController.dispose();
    _msgSupController.dispose();
    _msgInfController.dispose();
    super.dispose();
  }

  Future<void> _loadParametros() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/parametros');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _empresaController.text = data['nombre_empresa'] ?? '';
          _documentoController.text = data['documento_empresa'] ?? '';
          _dirController.text = data['direccion'] ?? '';
          _telController.text = data['telefono'] ?? '';
          _monedaController.text = data['moneda'] ?? '';
          _msgSupController.text = data['mensaje_ticket_superior'] ?? '';
          _msgInfController.text = data['mensaje_ticket_inferior'] ?? '';
        });
      }
    } catch (e) {
      print('Error al cargar parametros: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _guardarParametros() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.put('/parametros', {
        'nombre_empresa': _empresaController.text,
        'documento_empresa': _documentoController.text,
        'direccion': _dirController.text,
        'telefono': _telController.text,
        'moneda': _monedaController.text,
        'mensaje_ticket_superior': _msgSupController.text,
        'mensaje_ticket_inferior': _msgInfController.text,
        'impuesto_nombre': 'IVA',
        'impuesto_porcentaje': 0,
        'impresora_papel': '80mm',
      });

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ Configuración de empresa guardada.')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al guardar configuración.')),
      );
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Parámetros del Sistema'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Información Comercial', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, fontFamily: 'Outfit')),
                        const Divider(color: Colors.white10, height: 24),
                        TextField(
                          controller: _empresaController,
                          decoration: const InputDecoration(labelText: 'Nombre de la Empresa'),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _documentoController,
                          decoration: const InputDecoration(labelText: 'NIT / Documento Identificador'),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _dirController,
                          decoration: const InputDecoration(labelText: 'Dirección Comercial'),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _telController,
                          decoration: const InputDecoration(labelText: 'Teléfono de Contacto'),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _monedaController,
                          decoration: const InputDecoration(labelText: 'Moneda (Símbolo de dinero, Ej: Bs.)'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Impresión de Ticket / Recibo', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, fontFamily: 'Outfit')),
                        const Divider(color: Colors.white10, height: 24),
                        TextField(
                          controller: _msgSupController,
                          maxLines: 2,
                          decoration: const InputDecoration(labelText: 'Mensaje Superior (Encabezado)'),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _msgInfController,
                          maxLines: 2,
                          decoration: const InputDecoration(labelText: 'Mensaje Inferior (Pie de Página)'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  onPressed: _guardarParametros,
                  icon: const Icon(Icons.save, size: 18),
                  label: const Text('GUARDAR CAMBIOS', style: TextStyle(letterSpacing: 1.0)),
                  style: ElevatedButton.styleFrom(
                    minimumSize: const Size.fromHeight(55),
                    backgroundColor: AppTheme.accentColor,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
    );
  }
}
