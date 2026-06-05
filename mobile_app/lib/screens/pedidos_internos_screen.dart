import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
    });
  }

  @override
  void dispose() {
    _cantidadController.dispose();
    _notasController.dispose();
    _imagenUrlController.dispose();
    _despacharCantidadController.dispose();
    super.dispose();
  }

  Future<void> _loadUserSession() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userId = prefs.getInt('usuario_id') ?? 1;
      _userRol = prefs.getString('usuario_rol') ?? 'CAJERO';
      _isAdmin = _userRol.toUpperCase() == 'ADMIN' || _userRol.toUpperCase() == 'ADMINISTRADOR';
    });
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
    if (_selectedInsumoId == null) return;
    final qty = double.tryParse(_cantidadController.text) ?? 0.0;
    final notas = _notasController.text.trim();
    final imageUrl = _imagenUrlController.text.trim();

    if (qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Introduce una cantidad válida')),
      );
      return;
    }

    final matchedInsumo = _insumos.firstWhere((element) => element['id'] == _selectedInsumoId);

    Navigator.pop(context);
    setState(() => _isLoading = true);

    try {
      final res = await ApiConfig.post('/pedidos_internos', {
        'usuario_id': _userId,
        'insumo_id': _selectedInsumoId,
        'insumo_nombre': matchedInsumo['nombre'],
        'cantidad': qty,
        'notas': notas,
        'imagen_url': imageUrl.isNotEmpty ? imageUrl : null,
      });

      if (res.statusCode == 201) {
        _cantidadController.clear();
        _notasController.clear();
        _imagenUrlController.clear();
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
    if (_insumos.isEmpty) return;
    _selectedInsumoId = _insumos.first['id'];
    _cantidadController.clear();
    _notasController.clear();
    _imagenUrlController.clear();

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          scrollable: true,
          title: const Text('Nueva Solicitud de Insumo'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                value: _selectedInsumoId,
                decoration: const InputDecoration(labelText: 'Insumo / Ingrediente'),
                items: _insumos
                    .map((i) => DropdownMenuItem<int>(
                          value: i['id'],
                          child: Text('${i['nombre']} (${i['unidad_medida']})'),
                        ))
                    .toList(),
                onChanged: (val) {
                  setDialogState(() => _selectedInsumoId = val);
                },
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _cantidadController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Cantidad Solicitada'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notasController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Notas / Observaciones'),
              ),
              const SizedBox(height: 16),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Foto de Respaldo', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withOpacity(0.1)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isUploadingImage ? null : () => _pickAndUploadImage(ImageSource.camera, setDialogState),
                      icon: const Icon(Icons.camera_alt, size: 16, color: AppTheme.accentColor),
                      label: const Text('Cámara', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withOpacity(0.1)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isUploadingImage ? null : () => _pickAndUploadImage(ImageSource.gallery, setDialogState),
                      icon: const Icon(Icons.photo_library, size: 16, color: AppTheme.accentColor),
                      label: const Text('Galería', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _imagenUrlController,
                decoration: const InputDecoration(labelText: 'URL de la Foto (Opcional)'),
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
              child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
            ),
            BouncingWidget(
              onTap: _crearPedido,
              child: TextButton(
                onPressed: _crearPedido,
                child: const Text('Enviar Solicitud'),
              ),
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
      bg = Colors.amber.withOpacity(0.08);
      text = Colors.amber;
    } else if (estado == 'COMPRADO') {
      bg = const Color(0xFF10B981).withOpacity(0.08);
      text = const Color(0xFF10B981);
    } else if (estado == 'RECHAZADO') {
      bg = Colors.redAccent.withOpacity(0.08);
      text = Colors.redAccent;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        estado,
        style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.bold, color: text, letterSpacing: 0.5),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: _isAdmin
          ? null
          : BouncingWidget(
              onTap: _showAddDialog,
              child: FloatingActionButton.extended(
                onPressed: _showAddDialog,
                backgroundColor: AppTheme.accentColor,
                icon: const Icon(Icons.send, size: 16, color: Colors.white),
                label: const Text('PEDIR INSUMO', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ),
      body: _isLoading
          ? const Center(child: PulsingCoffeeLoader(message: 'Cargando solicitudes...'))
          : _pedidos.isEmpty
              ? const Center(child: Text('No hay solicitudes de insumos.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)))
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
                                        width: 70,
                                        height: 70,
                                        fit: BoxFit.cover,
                                        errorBuilder: (context, error, stackTrace) => Container(
                                          width: 70,
                                          height: 70,
                                          color: Colors.black26,
                                          child: const Icon(Icons.broken_image_outlined, color: Colors.white24, size: 20),
                                        ),
                                        loadingBuilder: (context, child, loadingProgress) {
                                          if (loadingProgress == null) return child;
                                          return Container(
                                            width: 70,
                                            height: 70,
                                            color: Colors.black26,
                                            child: const Center(
                                              child: SizedBox(
                                                width: 16,
                                                height: 16,
                                                child: CircularProgressIndicator(strokeWidth: 2),
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                    const SizedBox(width: 12),
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
                                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            _buildStateBadge(estado),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Cantidad: $qty $unidad',
                                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textLight),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              if (p['notas'] != null && p['notas'].toString().trim().isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Text(
                                  'Notas: ${p['notas']}',
                                  style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontStyle: FontStyle.italic),
                                ),
                              ],
                              const Divider(color: Colors.white10, height: 20),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text('Solicitado por: ${p['solicitante']}', style: const TextStyle(fontSize: 10.5, color: AppTheme.textMuted)),
                                      Text('Fecha: ${p['fecha_pedido']}', style: const TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                                    ],
                                  ),
                                  
                                  // Acciones de Cajero / Admin
                                  if (estado == 'PENDIENTE') ...[
                                    if (_isAdmin)
                                      Row(
                                        children: [
                                          BouncingWidget(
                                            onTap: () => _cambiarEstadoPedido(p['id'], 'RECHAZADO'),
                                            child: TextButton(
                                              onPressed: () => _cambiarEstadoPedido(p['id'], 'RECHAZADO'),
                                              child: const Text('Rechazar', style: TextStyle(color: Colors.redAccent, fontSize: 12)),
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          BouncingWidget(
                                            onTap: () => _despacharPedido(p['id'], qty, p['insumo_id'] ?? 0),
                                            child: ElevatedButton(
                                              onPressed: () => _despacharPedido(p['id'], qty, p['insumo_id'] ?? 0),
                                              style: ElevatedButton.styleFrom(
                                                backgroundColor: AppTheme.accentColor,
                                                foregroundColor: Colors.white,
                                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                                minimumSize: Size.zero,
                                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                              ),
                                              child: const Text('Entregar', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                            ),
                                          ),
                                        ],
                                      )
                                    else
                                      BouncingWidget(
                                        onTap: () => _eliminarPedido(p['id']),
                                        child: IconButton(
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(),
                                          icon: const Icon(Icons.cancel, color: Colors.redAccent, size: 20),
                                          onPressed: () => _eliminarPedido(p['id']),
                                        ),
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
