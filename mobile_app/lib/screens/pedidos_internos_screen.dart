import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../widgets/bouncing_widget.dart';
import '../widgets/pulsing_coffee_loader.dart';
import '../widgets/fade_in_slide.dart';

class PedidosInternosScreen extends StatefulWidget {
  const PedidosInternosScreen({super.key});

  @override
  State<PedidosInternosScreen> createState() => _PedidosInternosScreenState();
}

class _PedidosInternosScreenState extends State<PedidosInternosScreen> {
  List<dynamic> _pedidos = [];
  List<dynamic> _insumos = [];
  bool _isLoading = true;
  bool _isAdmin = false;
  int _userId = 1;
  String _userRol = 'CAJERO';

  // Request form state
  int? _selectedInsumoId;
  final _cantidadController = TextEditingController();
  final _notasController = TextEditingController();
  final _imagenUrlController = TextEditingController();
  bool _isUploadingImage = false;

  // New state variables for WhatsApp & Custom items
  List<dynamic> _administradores = [];
  int? _selectedAdminId;
  String _userName = '';
  bool _isCustom = false;
  final _customNameController = TextEditingController();

  // Dispatch dialog state
  final _despacharCantidadController = TextEditingController();

  Future<void> _pickAndUploadImage(ImageSource source, Function setDialogState) async {
    final ImagePicker picker = ImagePicker();
    try {
      final XFile? file = await picker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (file == null) return;

      setDialogState(() {
        _isUploadingImage = true;
      });

      final String? uploadedUrl = await ApiConfig.uploadImage(file.path);
      
      setDialogState(() {
        _isUploadingImage = false;
        if (uploadedUrl != null) {
          _imagenUrlController.text = uploadedUrl;
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Error al subir la imagen')),
          );
        }
      });
    } catch (e) {
      setDialogState(() {
        _isUploadingImage = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al seleccionar imagen: $e')),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _loadUserSession().then((_) {
      _loadPedidos();
      _loadInsumos();
      _loadAdministradores();
    });
  }

  @override
  void dispose() {
    _cantidadController.dispose();
    _notasController.dispose();
    _imagenUrlController.dispose();
    _customNameController.dispose();
    _despacharCantidadController.dispose();
    super.dispose();
  }

  Future<void> _loadUserSession() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userId = prefs.getInt('usuario_id') ?? 1;
      _userName = prefs.getString('usuario_nombre') ?? 'Un cajero';
      _userRol = prefs.getString('usuario_rol') ?? 'CAJERO';
      _isAdmin = _userRol.toUpperCase() == 'ADMIN' || _userRol.toUpperCase() == 'ADMINISTRADOR';
    });
  }

  Future<void> _loadAdministradores() async {
    try {
      final res = await ApiConfig.get('/parametros/usuarios');
      if (res.statusCode == 200) {
        final List<dynamic> users = jsonDecode(res.body);
        setState(() {
          _administradores = users.where((u) {
            final rol = (u['rol'] ?? '').toString().toUpperCase();
            final isAdm = rol == 'ADMIN' || rol == 'ADMINISTRADOR';
            final isActivo = u['activo'] == true;
            final tel = (u['telefono'] ?? '').toString().trim();
            final hasId = u['id'] != null;
            return isAdm && isActivo && tel.isNotEmpty && hasId;
          }).toList();
          if (_administradores.isNotEmpty) {
            _selectedAdminId = int.tryParse(_administradores.first['id']?.toString() ?? '');
          } else {
            _selectedAdminId = null;
          }
        });
      }
    } catch (e) {
      print('Error al cargar administradores para WhatsApp: $e');
    }
  }

  String _formatWhatsAppPhone(String phone) {
    if (phone.isEmpty) return '';
    String cleaned = phone.replaceAll(RegExp(r'\D'), '');
    if (cleaned.startsWith('00')) {
      cleaned = cleaned.substring(2);
    }
    if (cleaned.length == 8 && (cleaned.startsWith('6') || cleaned.startsWith('7'))) {
      cleaned = '591' + cleaned;
    }
    return cleaned;
  }

  Future<void> _loadPedidos() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/pedidos_internos?usuario_id=$_userId&rol=$_userRol');
      if (res.statusCode == 200) {
        setState(() {
          _pedidos = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar pedidos: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadInsumos() async {
    try {
      final res = await ApiConfig.get('/almacen/insumos');
      if (res.statusCode == 200) {
        setState(() {
          _insumos = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar insumos: $e');
    }
  }

  Future<void> _crearPedido() async {
    final qty = double.tryParse(_cantidadController.text) ?? 0.0;
    final notas = _notasController.text.trim();
    final imageUrl = _imagenUrlController.text.trim();

    if (qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Introduce una cantidad válida')),
      );
      return;
    }

    int? insumoId;
    String insumoNombre = '';
    String unit = 'unid';

    if (_isCustom) {
      insumoNombre = _customNameController.text.trim();
      if (insumoNombre.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Introduce el nombre del insumo personalizado')),
        );
        return;
      }
      insumoId = null;
    } else {
      if (_selectedInsumoId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Selecciona un insumo o marca la opción de insumo personalizado')),
        );
        return;
      }
      final matchedInsumo = _insumos.firstWhere((element) => element['id'] == _selectedInsumoId);
      insumoId = _selectedInsumoId;
      insumoNombre = matchedInsumo['nombre'] ?? '';
      unit = matchedInsumo['unidad_medida'] ?? 'unid';
    }

    Navigator.pop(context);
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.post('/pedidos_internos', {
        'usuario_id': _userId,
        'insumo_id': insumoId,
        'insumo_nombre': insumoNombre,
        'cantidad': qty,
        'notas': notas,
        'imagen_url': imageUrl.isNotEmpty ? imageUrl : null,
      });

      if (res.statusCode == 201) {
        // Redirigir a WhatsApp si se seleccionó un administrador
        if (_selectedAdminId != null) {
          final matchedAdmin = _administradores.firstWhere(
            (element) => int.tryParse(element['id']?.toString() ?? '') == _selectedAdminId,
            orElse: () => null,
          );
          if (matchedAdmin != null && matchedAdmin['telefono'] != null) {
            final telStr = matchedAdmin['telefono'].toString().trim();
            if (telStr.isNotEmpty) {
              final adminPhone = _formatWhatsAppPhone(telStr);
              final notesStr = notas.isNotEmpty ? '\n*Notas:* $notas' : '';
              final text = '*Nuevo Pedido Interno* ☕\n\n'
                  'Hola, he registrado un requerimiento de compra:\n'
                  '• *Insumo:* $insumoNombre\n'
                  '• *Cantidad:* $qty $unit\n'
                  '• *Solicitado por:* $_userName$notesStr';

              final url = Uri.parse('https://wa.me/$adminPhone?text=${Uri.encodeComponent(text)}');
              try {
                await launchUrl(url, mode: LaunchMode.externalApplication);
              } catch (e) {
                print('Error al abrir WhatsApp: $e');
              }
            }
          }
        }

        _cantidadController.clear();
        _notasController.clear();
        _imagenUrlController.clear();
        _customNameController.clear();
        _loadPedidos();
      } else {
        throw Exception('Error al registrar pedido');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al registrar pedido.')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cambiarEstadoPedido(int id, String nuevoEstado) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.put('/pedidos_internos/$id/estado', {
        'estado': nuevoEstado,
      });

      if (res.statusCode == 200) {
        _loadPedidos();
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al actualizar estado del pedido.')),
      );
      setState(() => _isLoading = false);
    }
  }

  Future<void> _despacharPedido(int id, double cantidadPedida, int insumoId) async {
    _despacharCantidadController.text = cantidadPedida.toString();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirmar Despacho de Insumo'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Confirma la cantidad entregada al cajero. Este valor se descontará del stock actual de almacén.',
              style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _despacharCantidadController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Cantidad Entregada'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () async {
              final entregado = double.tryParse(_despacharCantidadController.text) ?? 0.0;
              if (entregado <= 0) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Introduce una cantidad válida')),
                );
                return;
              }

              Navigator.pop(context);
              setState(() => _isLoading = true);

              try {
                final res = await ApiConfig.put('/pedidos_internos/$id/despachar', {
                  'cantidad_entregada': entregado,
                  'insumo_id': insumoId,
                });

                if (res.statusCode == 200) {
                  _loadPedidos();
                } else {
                  final err = jsonDecode(res.body);
                  throw Exception(err['error'] ?? 'Error');
                }
              } catch (e) {
                showDialog(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Error al despachar'),
                    content: Text(e.toString().replaceAll('Exception: ', '')),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar')),
                    ],
                  ),
                );
                setState(() => _isLoading = false);
              }
            },
            child: const Text('Despachar'),
          ),
        ],
      ),
    );
  }

  Future<void> _eliminarPedido(int id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar Solicitud'),
        content: const Text('¿Estás seguro de cancelar esta solicitud de insumo?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      try {
        final res = await ApiConfig.delete('/pedidos_internos/$id');
        if (res.statusCode == 200) {
          _loadPedidos();
        } else {
          final err = jsonDecode(res.body);
          throw Exception(err['error'] ?? 'Error');
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No se pudo cancelar el pedido.')),
        );
        setState(() => _isLoading = false);
      }
    }
  }

  void _showAddDialog() {
    if (_insumos.isNotEmpty && _selectedInsumoId == null) {
      _selectedInsumoId = _insumos.first['id'];
    }
    _cantidadController.clear();
    _notasController.clear();
    _imagenUrlController.clear();
    _customNameController.clear();
    _isCustom = false;

    if (_administradores.isNotEmpty) {
      _selectedAdminId = int.tryParse(_administradores.first['id']?.toString() ?? '');
    } else {
      _selectedAdminId = null;
    }

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          scrollable: true,
          title: const Text(
            'Nueva Solicitud de Insumo',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20, color: Colors.white),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Switch for Custom/Catalog Insumo
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Expanded(
                    child: Text(
                      'Insumo Especial (No en catálogo)',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Switch(
                    value: _isCustom,
                    activeColor: AppTheme.accentColor,
                    onChanged: (val) {
                      setDialogState(() {
                        _isCustom = val;
                      });
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              
              if (_isCustom) ...[
                TextField(
                  controller: _customNameController,
                  style: const TextStyle(fontSize: 16, color: Colors.white),
                  decoration: const InputDecoration(
                    labelText: 'Nombre del Insumo Especial',
                    labelStyle: TextStyle(fontSize: 16, color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                    hintText: 'Ej: Servilletas de papel, tazas, etc.',
                  ),
                ),
              ] else ...[
                if (_insumos.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8.0),
                    child: Text(
                      'No hay insumos en catálogo. Activa la opción personalizada.',
                      style: TextStyle(color: Colors.redAccent, fontSize: 14, fontWeight: FontWeight.bold),
                    ),
                  )
                else
                  DropdownButtonFormField<int>(
                    isExpanded: true,
                    value: _selectedInsumoId,
                    decoration: const InputDecoration(
                      labelText: 'Insumo / Ingrediente',
                      labelStyle: TextStyle(fontSize: 16, color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                    ),
                    items: _insumos
                        .map((i) => DropdownMenuItem<int>(
                              value: i['id'],
                              child: Text(
                                '${i['nombre']} (${i['unidad_medida']})',
                                style: const TextStyle(fontSize: 16, color: Colors.white),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ))
                        .toList(),
                    onChanged: (val) {
                      setDialogState(() => _selectedInsumoId = val);
                    },
                  ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: _cantidadController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(fontSize: 16, color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Cantidad Solicitada',
                  labelStyle: TextStyle(fontSize: 16, color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notasController,
                maxLines: 2,
                style: const TextStyle(fontSize: 16, color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Notas / Observaciones',
                  labelStyle: TextStyle(fontSize: 16, color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 12),
              
              // Dropdown for WhatsApp notification
              DropdownButtonFormField<int?>(
                isExpanded: true,
                value: _selectedAdminId,
                decoration: const InputDecoration(
                  labelText: 'Notificar Admin por WhatsApp',
                  labelStyle: TextStyle(fontSize: 16, color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                ),
                items: [
                  const DropdownMenuItem<int?>(
                    value: null,
                    child: Text(
                      '-- No notificar --',
                      style: TextStyle(fontSize: 16, color: Colors.white),
                    ),
                  ),
                  ..._administradores.map((adm) {
                    final adminId = int.tryParse(adm['id']?.toString() ?? '');
                    return DropdownMenuItem<int?>(
                      value: adminId,
                      child: Text(
                        '${adm['nombre']} (${adm['telefono']})',
                        style: const TextStyle(fontSize: 16, color: Colors.white),
                        overflow: TextOverflow.ellipsis,
                      ),
                    );
                  }).toList(),
                ],
                onChanged: (val) {
                  setDialogState(() {
                    _selectedAdminId = val;
                  });
                },
              ),
              const SizedBox(height: 16),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Foto de Respaldo', style: TextStyle(fontSize: 14, color: AppTheme.textLight, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withOpacity(0.3), width: 1.5),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isUploadingImage ? null : () => _pickAndUploadImage(ImageSource.camera, setDialogState),
                      icon: const Icon(Icons.camera_alt, size: 20, color: AppTheme.accentColor),
                      label: const Text('Cámara', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withOpacity(0.3), width: 1.5),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isUploadingImage ? null : () => _pickAndUploadImage(ImageSource.gallery, setDialogState),
                      icon: const Icon(Icons.photo_library, size: 20, color: AppTheme.accentColor),
                      label: const Text('Galería', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _imagenUrlController,
                style: const TextStyle(fontSize: 16, color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'URL de la Foto (Opcional)',
                  labelStyle: TextStyle(fontSize: 16, color: Colors.orangeAccent, fontWeight: FontWeight.bold),
                ),
                onChanged: (val) {
                  setDialogState(() {});
                },
              ),
              const SizedBox(height: 12),
              if (_isUploadingImage) ...[
                Container(
                  height: 120,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                  ),
                  child: const Center(
                    child: PulsingCoffeeLoader(message: 'Subiendo imagen...'),
                  ),
                ),
                const SizedBox(height: 12),
              ] else if (_imagenUrlController.text.trim().isNotEmpty) ...[
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        _imagenUrlController.text.trim(),
                        height: 120,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            height: 120,
                            color: Colors.black12,
                            child: const Center(
                              child: Icon(Icons.broken_image_outlined, color: Colors.white24, size: 30),
                            ),
                          );
                        },
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return Container(
                            height: 120,
                            color: Colors.black12,
                            child: const Center(
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: GestureDetector(
                        onTap: () {
                          setDialogState(() {
                            _imagenUrlController.clear();
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.black54,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.close, size: 16, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.bold)),
            ),
            ElevatedButton(
              onPressed: _crearPedido,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accentColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Enviar Solicitud', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStateBadge(String estado) {
    Color bg = Colors.white10;
    Color text = AppTheme.textMuted;
    if (estado == 'PENDIENTE') {
      bg = Colors.amber.withOpacity(0.15);
      text = Colors.amber;
    } else if (estado == 'COMPRADO') {
      bg = const Color(0xFF10B981).withOpacity(0.15);
      text = const Color(0xFF10B981);
    } else if (estado == 'RECHAZADO') {
      bg = Colors.redAccent.withOpacity(0.15);
      text = Colors.redAccent;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: text.withOpacity(0.4), width: 1.5),
      ),
      child: Text(
        estado,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: text, letterSpacing: 0.5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: _isAdmin
          ? null
          : FloatingActionButton.extended(
              onPressed: _showAddDialog,
              backgroundColor: AppTheme.accentColor,
              icon: const Icon(Icons.send, size: 20, color: Colors.white),
              label: const Text('PEDIR INSUMO', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            ),
      body: _isLoading
          ? const Center(child: PulsingCoffeeLoader(message: 'Cargando solicitudes...'))
          : _pedidos.isEmpty
              ? const Center(child: Text('No hay solicitudes de insumos.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted, fontSize: 18)))
              : RefreshIndicator(
                  onRefresh: () async {
                    _loadPedidos();
                    _loadInsumos();
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _pedidos.length,
                    itemBuilder: (context, idx) {
                      final p = _pedidos[idx];
                      final estado = p['estado'] ?? 'PENDIENTE';
                      final qty = double.tryParse(p['cantidad'].toString()) ?? 0.0;
                      final unidad = p['unidad_medida'] ?? '';
                      final hasImage = p['imagen_url'] != null && p['imagen_url'].toString().trim().isNotEmpty;
                      final imageUrl = p['imagen_url']?.toString().trim();

                      return FadeInSlide(
                        index: idx,
                        child: Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: Padding(
                            padding: const EdgeInsets.all(16.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (hasImage) ...[
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(10),
                                        child: Image.network(
                                          imageUrl!,
                                          width: 80,
                                          height: 80,
                                          fit: BoxFit.cover,
                                          errorBuilder: (context, error, stackTrace) => Container(
                                            width: 80,
                                            height: 80,
                                            color: Colors.black26,
                                            child: const Icon(Icons.broken_image_outlined, color: Colors.white24, size: 30),
                                          ),
                                          loadingBuilder: (context, child, loadingProgress) {
                                            if (loadingProgress == null) return child;
                                            return Container(
                                              width: 80,
                                              height: 80,
                                              color: Colors.black26,
                                              child: const Center(
                                                child: SizedBox(
                                                  width: 20,
                                                  height: 20,
                                                  child: CircularProgressIndicator(strokeWidth: 2),
                                                ),
                                              ),
                                            );
                                          },
                                        ),
                                      ),
                                      const SizedBox(width: 14),
                                    ],
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  p['insumo_nombre'] ?? 'Insumo',
                                                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                              const SizedBox(width: 8),
                                              _buildStateBadge(estado),
                                            ],
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            'Cantidad: $qty $unidad',
                                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.orangeAccent),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                                if (p['notes'] != null && p['notes'].toString().trim().isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.05),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: Colors.white.withOpacity(0.1)),
                                    ),
                                    child: Text(
                                      'Notas: ${p['notes']}',
                                      style: const TextStyle(fontSize: 14, color: Colors.white, fontStyle: FontStyle.italic),
                                    ),
                                  ),
                                ] else if (p['notas'] != null && p['notas'].toString().trim().isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.05),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(color: Colors.white.withOpacity(0.1)),
                                    ),
                                    child: Text(
                                      'Notas: ${p['notas']}',
                                      style: const TextStyle(fontSize: 14, color: Colors.white, fontStyle: FontStyle.italic),
                                    ),
                                  ),
                                ],
                                const Divider(color: Colors.white10, height: 24),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Solicitado por: ${p['solicitante']}',
                                            style: const TextStyle(fontSize: 13, color: Colors.white70, fontWeight: FontWeight.w500),
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            'Fecha: ${p['fecha_pedido']}',
                                            style: const TextStyle(fontSize: 12, color: Colors.white70),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    
                                    // Acciones de Cajero / Admin
                                    if (estado == 'PENDIENTE') ...[
                                      if (_isAdmin)
                                        Row(
                                          children: [
                                            TextButton(
                                              onPressed: () => _cambiarEstadoPedido(p['id'], 'RECHAZADO'),
                                              style: TextButton.styleFrom(
                                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                              ),
                                              child: const Text('Rechazar', style: TextStyle(color: Colors.redAccent, fontSize: 14, fontWeight: FontWeight.bold)),
                                            ),
                                            const SizedBox(width: 8),
                                            ElevatedButton(
                                              onPressed: () => _despacharPedido(p['id'], qty, p['insumo_id'] ?? 0),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor: Colors.green,
                                                foregroundColor: Colors.white,
                                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                                                minimumSize: Size.zero,
                                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                                shape: RoundedRectangleBorder(
                                                  borderRadius: BorderRadius.circular(10),
                                                ),
                                              ),
                                              child: const Text('Entregar', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                                            ),
                                          ],
                                        )
                                      else
                                        TextButton.icon(
                                          onPressed: () => _eliminarPedido(p['id']),
                                          style: TextButton.styleFrom(
                                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                          ),
                                          icon: const Icon(Icons.cancel, color: Colors.redAccent, size: 20),
                                          label: const Text('Eliminar', style: TextStyle(color: Colors.redAccent, fontSize: 14, fontWeight: FontWeight.bold)),
                                        )
                                    ]
                                  ],
                                )
                              ],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
