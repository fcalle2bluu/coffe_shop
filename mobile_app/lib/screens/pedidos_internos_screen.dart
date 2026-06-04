import 'dart:convert';
import 'package:flutter/material';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';

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

  // Dispatch dialog state
  final _despacharCantidadController = TextEditingController();

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
      });

      if (res.statusCode == 201) {
        _cantidadController.clear();
        _notasController.clear();
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

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Nueva Solicitud de Insumo'),
          content: SingleChildScrollView(
            child: Column(
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
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
            ),
            TextButton(
              onPressed: _crearPedido,
              child: const Text('Enviar Solicitud'),
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
      bg = Colors.emerald.withOpacity(0.08);
      text = Colors.emerald;
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
          : FloatingActionButton.extended(
              onPressed: _showAddDialog,
              backgroundColor: AppTheme.accentColor,
              icon: const Icon(Icons.send, size: 16, color: Colors.white),
              label: const Text('PEDIR INSUMO', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
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
                              if (p['notas'] != null && p['notas'].toString().trim().isNotEmpty) ...[
                                const SizedBox(height: 6),
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
                                          TextButton(
                                            onPressed: () => _cambiarEstadoPedido(p['id'], 'RECHAZADO'),
                                            child: const Text('Rechazar', style: TextStyle(color: Colors.redAccent, fontSize: 12)),
                                          ),
                                          const SizedBox(width: 8),
                                          ElevatedButton(
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
                                        ],
                                      )
                                    else
                                      IconButton(
                                        padding: EdgeInsets.zero,
                                        constraints: const BoxConstraints(),
                                        icon: const Icon(Icons.cancel, color: Colors.redAccent, size: 20),
                                        onPressed: () => _eliminarPedido(p['id']),
                                      )
                                  ]
                                ],
                              )
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
