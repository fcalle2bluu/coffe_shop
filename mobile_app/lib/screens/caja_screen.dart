import 'dart:convert';
import 'package:flutter/material';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';

class CajaScreen extends StatefulWidget {
  const CajaScreen({super.key});

  @override
  State<CajaScreen> createState() => _CajaScreenState();
}

class _CajaScreenState extends State<CajaScreen> {
  bool _isLoading = true;
  bool _isCajaAbierta = false;
  
  Map<String, dynamic>? _cajaActiva;
  Map<String, dynamic>? _ventasActivas;
  double _efectivoEsperado = 0.0;
  List<dynamic> _historialCajas = [];

  final _montoInicialController = TextEditingController();
  final _montoFinalController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCajaStatus();
  }

  @override
  void dispose() {
    _montoInicialController.dispose();
    _montoFinalController.dispose();
    super.dispose();
  }

  Future<void> _loadCajaStatus() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/caja/estado');
      final histRes = await ApiConfig.get('/caja/historial');

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _isCajaAbierta = data['abierta'] == true;
          if (_isCajaAbierta) {
            _cajaActiva = data['caja'];
            _ventasActivas = data['ventas'];
            _efectivoEsperado = double.tryParse(data['efectivo_esperado'].toString()) ?? 0.0;
          } else {
            _cajaActiva = null;
            _ventasActivas = null;
            _efectivoEsperado = 0.0;
          }
        });
      }

      if (histRes.statusCode == 200) {
        setState(() {
          _historialCajas = jsonDecode(histRes.body);
        });
      }
    } catch (e) {
      print('Error al cargar estado de caja: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _abrirCaja() async {
    final montoInicial = double.tryParse(_montoInicialController.text) ?? -1.0;
    if (montoInicial < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Introduce un monto inicial válido (mínimo Bs. 0)')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;

      final res = await ApiConfig.post('/caja/abrir', {
        'saldo_inicial': montoInicial,
        'usuario_id': userId,
      });

      if (res.statusCode == 201) {
        final data = jsonDecode(res.body);
        await prefs.setInt('caja_id', data['id']);
        _montoInicialController.clear();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error al abrir caja');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}')),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cerrarCaja() async {
    final montoFinal = double.tryParse(_montoFinalController.text) ?? -1.0;
    if (montoFinal < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Introduce el saldo final en caja (efectivo real)')),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;
      final cajaId = _cajaActiva?['id'];

      final res = await ApiConfig.post('/caja/cerrar', {
        'caja_id': cajaId,
        'saldo_final': montoFinal,
        'usuario_id': userId,
      });

      if (res.statusCode == 200) {
        await prefs.remove('caja_id');
        _montoFinalController.clear();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error al cerrar caja');
      }
    } catch (e) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Error al cerrar caja'),
          content: Text(e.toString().replaceAll('Exception: ', '')),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cerrar'),
            ),
          ],
        ),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Widget _buildStateCard() {
    if (_isCajaAbierta) {
      final username = _cajaActiva?['usuario_nombre'] ?? 'Cajero';
      final fecha = _cajaActiva?['fecha_apertura_formateada'] ?? '';
      final inicial = double.tryParse(_cajaActiva?['saldo_inicial'].toString() ?? '0.0') ?? 0.0;
      final ventasEfectivo = double.tryParse(_ventasActivas?['total_efectivo'].toString() ?? '0.0') ?? 0.0;
      final ventasQr = double.tryParse(_ventasActivas?['total_qr'].toString() ?? '0.0') ?? 0.0;
      final ventasTarjeta = double.tryParse(_ventasActivas?['total_tarjeta'].toString() ?? '0.0') ?? 0.0;
      final totalVentas = double.tryParse(_ventasActivas?['total_ventas'].toString() ?? '0.0') ?? 0.0;

      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: const BoxDecoration(color: Colors.emerald, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'TURNO ACTIVO DE CAJA',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.black, letterSpacing: 1.0, color: Colors.emerald),
                      ),
                    ],
                  ),
                  Text('ID: #${_cajaActiva?['id']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                'Abierto por $username',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                'Iniciado el $fecha',
                style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
              ),
              const Divider(color: Colors.white10, height: 32),
              
              // Montos resumidos
              _buildAmountRow('Monto Inicial en Caja', inicial),
              _buildAmountRow('Ventas en Efectivo (+)', ventasEfectivo),
              _buildAmountRow('Ventas en QR (Digital)', ventasQr, isMuted: true),
              _buildAmountRow('Ventas en Tarjeta (Pos)', ventasTarjeta, isMuted: true),
              _buildAmountRow('Ventas Totales', totalVentas, isMuted: true),
              const Divider(color: Colors.white10, height: 24),
              
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Efectivo Esperado en Caja:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  Text(
                    'Bs. ${_efectivoEsperado.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.black, color: Colors.greenAccent),
                  ),
                ],
              ),
              
              const Divider(color: Colors.white10, height: 32),
              
              // Close Shift form
              const Text('Cierre de Turno', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _montoFinalController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        hintText: 'Bs. 0.00',
                        labelText: 'Efectivo Real en Caja',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _cerrarCaja,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.redAccent,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('CERRAR CAJA', style: TextStyle(letterSpacing: 1.0, fontSize: 12)),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    } else {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: const BoxDecoration(color: Colors.redAccent, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'CAJA CERRADA',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.black, letterSpacing: 1.0, color: Colors.redAccent),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'No hay ningún turno abierto actualmente',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const Text(
                'Debe abrir un turno ingresando el dinero base en efectivo.',
                style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
              ),
              const Divider(color: Colors.white10, height: 32),
              
              // Open Shift Form
              const Text('Apertura de Turno', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _montoInicialController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        hintText: 'Bs. 0.00',
                        labelText: 'Saldo Inicial en Caja',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _abrirCaja,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentColor,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('ABRIR CAJA', style: TextStyle(letterSpacing: 1.0, fontSize: 12)),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }
  }

  Widget _buildAmountRow(String label, double val, {bool isMuted = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: isMuted ? AppTheme.textMuted.withOpacity(0.7) : AppTheme.textMuted,
            ),
          ),
          Text(
            'Bs. ${val.toStringAsFixed(2)}',
            style: TextStyle(
              fontSize: 13,
              fontWeight: isMuted ? FontWeight.normal : FontWeight.bold,
              color: isMuted ? AppTheme.textMuted : AppTheme.textLight,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryList() {
    if (_historialCajas.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24.0),
          child: Center(
            child: Text(
              'No hay registros históricos de cajas cerradas.',
              style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted),
            ),
          ),
        ),
      );
    }

    return Card(
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: _historialCajas.length,
        separatorBuilder: (context, idx) => const Divider(color: Colors.white10, height: 1),
        itemBuilder: (context, idx) {
          final h = _historialCajas[idx];
          final saldoInicial = double.tryParse(h['saldo_inicial'].toString()) ?? 0.0;
          final saldoFinal = double.tryParse(h['saldo_final'].toString()) ?? 0.0;
          final diff = double.tryParse(h['diferencia'].toString()) ?? 0.0;
          final diffText = diff >= 0 ? '+Bs. ${diff.toStringAsFixed(2)}' : 'Bs. ${diff.toStringAsFixed(2)}';
          final diffColor = diff >= 0 ? Colors.emerald : Colors.redAccent;

          return ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            title: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Turno #${h['id']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                Text(
                  diffText,
                  style: TextStyle(fontWeight: FontWeight.black, fontSize: 13.5, color: diffColor),
                ),
              ],
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Apertura: ${h['apertura']} | Cierre: ${h['cierre']}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Efectivo Inicial: Bs. ${saldoInicial.toStringAsFixed(2)} | Final: Bs. ${saldoFinal.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _loadCajaStatus,
        child: ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            _buildStateCard(),
            const SizedBox(height: 24),
            Row(
              children: [
                Container(
                  width: 4,
                  height: 12,
                  decoration: BoxDecoration(
                    color: AppTheme.accentColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(width: 8),
                const Text(
                  'HISTORIAL DE TURNOS DE CAJA',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.black, letterSpacing: 1.5, color: AppTheme.textMuted),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildHistoryList(),
          ],
        ),
      ),
    );
  }
}
