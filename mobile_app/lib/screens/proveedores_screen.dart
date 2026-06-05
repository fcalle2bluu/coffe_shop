import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/api.dart';
import '../config/theme.dart';

class ProveedoresScreen extends StatefulWidget {
  const ProveedoresScreen({super.key});

  @override
  State<ProveedoresScreen> createState() => _ProveedoresScreenState();
}

class _ProveedoresScreenState extends State<ProveedoresScreen> {
  List<dynamic> _proveedores = [];
  bool _isLoading = true;

  // Controllers for Add Provider Dialog
  final _provNombreController = TextEditingController();
  final _provTelController = TextEditingController();
  final _provEmailController = TextEditingController();
  final _provDireccionController = TextEditingController();
  final _provLugarController = TextEditingController();
  final _provOtrosController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadProveedores();
  }

  @override
  void dispose() {
    _provNombreController.dispose();
    _provTelController.dispose();
    _provEmailController.dispose();
    _provDireccionController.dispose();
    _provLugarController.dispose();
    _provOtrosController.dispose();
    super.dispose();
  }

  Future<void> _loadProveedores() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/proveedores');
      if (res.statusCode == 200) {
        setState(() {
          _proveedores = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar proveedores: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _crearProveedor() async {
    final nombre = _provNombreController.text.trim();
    final telefono = _provTelController.text.trim();
    final email = _provEmailController.text.trim();
    final direccion = _provDireccionController.text.trim();
    final lugar = _provLugarController.text.trim();
    final otros = _provOtrosController.text.trim();

    if (nombre.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('El nombre del proveedor es obligatorio')),
      );
      return;
    }

    Navigator.pop(context); // Close dialog
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.post('/proveedores', {
        'nombre': nombre,
        'telefono': telefono,
        'email': email,
        'direccion': direccion,
        'lugar': lugar,
        'otros': otros,
      });

      if (res.statusCode == 200 || res.statusCode == 201) {
        _provNombreController.clear();
        _provTelController.clear();
        _provEmailController.clear();
        _provDireccionController.clear();
        _provLugarController.clear();
        _provOtrosController.clear();
        _loadProveedores();
      } else {
        throw Exception('Error al guardar');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al crear proveedor.')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _eliminarProveedor(int id, String nombre) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar Proveedor'),
        content: Text('¿Estás seguro de eliminar el proveedor "$nombre"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Eliminar', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      try {
        final res = await ApiConfig.delete('/proveedores/$id');
        if (res.statusCode == 200) {
          _loadProveedores();
        } else {
          final err = jsonDecode(res.body);
          throw Exception(err['error'] ?? 'Error al eliminar');
        }
      } catch (e) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('No se puede eliminar'),
            content: Text(e.toString().replaceAll('Exception: ', '')),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cerrar'),
              ),
            ],
          ),
        );
        setState(() => _isLoading = false);
      }
    }
  }

  void _showAddDialog() {
    _provNombreController.clear();
    _provTelController.clear();
    _provEmailController.clear();
    _provDireccionController.clear();
    _provLugarController.clear();
    _provOtrosController.clear();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nuevo Proveedor'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _provNombreController,
                decoration: const InputDecoration(labelText: 'Nombre o Razón Social *'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _provTelController,
                decoration: const InputDecoration(labelText: 'Teléfono de Contacto'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _provEmailController,
                decoration: const InputDecoration(labelText: 'Email'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _provLugarController,
                decoration: const InputDecoration(labelText: 'Lugar / Ubicación'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _provDireccionController,
                decoration: const InputDecoration(labelText: 'Dirección Completa'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _provOtrosController,
                decoration: const InputDecoration(labelText: 'Otros / Notas Adicionales'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: _crearProveedor,
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: _showAddDialog,
        backgroundColor: AppTheme.accentColor,
        child: const Icon(Icons.add, color: Colors.white),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _proveedores.isEmpty
              ? const Center(child: Text('No hay proveedores registrados.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _proveedores.length,
                  itemBuilder: (context, idx) {
                    final p = _proveedores[idx];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(
                                    p['nombre'],
                                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                IconButton(
                                  icon: const FaIcon(FontAwesomeIcons.trashCan, size: 14, color: AppTheme.textMuted),
                                  onPressed: () => _eliminarProveedor(p['id'], p['nombre']),
                                ),
                              ],
                            ),
                            const Divider(color: Colors.white10, height: 16),
                            if (p['telefono'] != null && p['telefono'].toString().isNotEmpty) ...[
                              _buildInfoRow(FontAwesomeIcons.phone, 'Teléfono:', p['telefono']),
                              const SizedBox(height: 6),
                            ],
                            if (p['email'] != null && p['email'].toString().isNotEmpty) ...[
                              _buildInfoRow(FontAwesomeIcons.envelope, 'Email:', p['email']),
                              const SizedBox(height: 6),
                            ],
                            if (p['lugar'] != null && p['lugar'].toString().isNotEmpty) ...[
                              _buildInfoRow(FontAwesomeIcons.locationDot, 'Ubicación:', p['lugar']),
                              const SizedBox(height: 6),
                            ],
                            if (p['direccion'] != null && p['direccion'].toString().isNotEmpty) ...[
                              _buildInfoRow(FontAwesomeIcons.map, 'Dirección:', p['direccion']),
                              const SizedBox(height: 6),
                            ],
                            if (p['otros'] != null && p['otros'].toString().isNotEmpty) ...[
                              _buildInfoRow(FontAwesomeIcons.noteSticky, 'Notas:', p['otros']),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
    );
  }

  Widget _buildInfoRow(FaIconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FaIcon(icon, size: 11, color: AppTheme.accentColor.withOpacity(0.8)),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textMuted),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(fontSize: 12, color: AppTheme.textLight),
          ),
        ),
      ],
    );
  }
}
