import 'dart:convert';
import 'package:flutter/material.dart';
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
  double _totalGastos = 0.0;
  double _totalConsumeLoNuestro = 0.0;
  List<dynamic> _historialCajas = [];

  final _montoInicialController = TextEditingController();
  final _montoFinalController = TextEditingController();
  final _gastoMontoController = TextEditingController();
  final _gastoDescController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadCajaStatus();
  }

  @override
  void dispose() {
    _montoInicialController.dispose();
    _montoFinalController.dispose();
    _gastoMontoController.dispose();
    _gastoDescController.dispose();
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
            _totalGastos = double.tryParse(data['total_gastos'].toString()) ?? 0.0;
            _totalConsumeLoNuestro = double.tryParse(data['ventas']['total_consume_lo_nuestro'].toString()) ?? 0.0;
          } else {
            _cajaActiva = null;
            _ventasActivas = null;
            _efectivoEsperado = 0.0;
            _totalGastos = 0.0;
            _totalConsumeLoNuestro = 0.0;
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

  Future<void> _registrarGasto() async {
    final monto = double.tryParse(_gastoMontoController.text) ?? 0.0;
    final desc = _gastoDescController.text.trim();
    final cajaId = _cajaActiva?['id'];

    if (monto <= 0 || desc.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Llene todos los campos correctamente.')),
      );
      return;
    }

    Navigator.pop(context);
    setState(() => _isLoading = true);

    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;

      final res = await ApiConfig.post('/caja/gastos', {
        'caja_id': cajaId,
        'usuario_id': userId,
        'monto': monto,
        'descripcion': desc,
      });

      if (res.statusCode == 200 || res.statusCode == 201) {
        _gastoMontoController.clear();
        _gastoDescController.clear();
        _loadCajaStatus();
      } else {
        final err = jsonDecode(res.body);
        throw Exception(err['error'] ?? 'Error');
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al registrar gasto: $e')),
      );
      setState(() => _isLoading = false);
    }
  }

  void _showGastoDialog() {
    _gastoMontoController.clear();
    _gastoDescController.clear();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Registrar Gasto del Turno'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _gastoMontoController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Monto del Gasto (Bs.)',
                hintText: '0.00',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _gastoDescController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Descripción / Concepto',
                hintText: 'Ej: Compra de servilletas',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: _registrarGasto,
            child: const Text('Registrar'),
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardStatCard(String title, double value, Color bgColor, Color textColor, dynamic icon, {String? subtitle}) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: textColor.withOpacity(0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title.toUpperCase(),
                  style: TextStyle(fontSize: 8.5, fontWeight: FontWeight.w900, color: textColor, letterSpacing: 0.5),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              FaIcon(icon, size: 11, color: textColor.withOpacity(0.6)),
            ],
          ),
          const SizedBox(height: 4),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Bs. ${value.toStringAsFixed(2)}',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: textColor),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 7.2, color: textColor.withOpacity(0.85), fontWeight: FontWeight.w700),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBigEfectivoCard(String title, double value, double gastos) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.orangeAccent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.orangeAccent.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title.toUpperCase(),
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.orangeAccent, letterSpacing: 1.0),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Saldo Neto (Fondo + Ventas Efectivo - Gastos)',
                  style: TextStyle(fontSize: 9, color: AppTheme.textMuted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'Bs. ${value.toStringAsFixed(2)}',
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.orangeAccent),
          ),
        ],
      ),
    );
  }

  Widget _buildStateCard() {
    if (_isCajaAbierta) {
      final username = _cajaActiva?['usuario_nombre'] ?? 'Cajero';
      final fecha = _cajaActiva?['fecha_apertura_formateada'] ?? '';
      final inicial = double.tryParse(_cajaActiva?['saldo_inicial'].toString() ?? '0.0') ?? 0.0;
      final ventasEfectivo = double.tryParse(_ventasActivas?['total_efectivo'].toString() ?? '0.0') ?? 0.0;
      final ventasQr = double.tryParse(_ventasActivas?['total_qr'].toString() ?? '0.0') ?? 0.0;
      final ventasTarjeta = double.tryParse(_ventasActivas?['total_tarjeta'].toString() ?? '0.0') ?? 0.0;

      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(color: const Color(0xFF10B981), shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'TURNO ACTIVO DE CAJA',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: const Color(0xFF10B981)),
                      ),
                    ],
                  ),
                  Text('ID: #${_cajaActiva?['id']}', style: const TextStyle(fontSize: 11, color: AppTheme.textMuted, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Abierto por $username',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 2),
              Text(
                'Iniciado el $fecha',
                style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
              ),
              const Divider(color: Colors.white10, height: 24),
              
              // Grid de Tableros (Fondo Inicial, Ventas Efectivo, Ventas Digitales, Gastos)
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.35,
                children: [
                  _buildDashboardStatCard('Fondo Inicial', inicial, Colors.blueAccent.withOpacity(0.08), Colors.blueAccent, FontAwesomeIcons.wallet),
                  _buildDashboardStatCard('Ventas Efectivo', ventasEfectivo, const Color(0xFF10B981).withOpacity(0.08), const Color(0xFF10B981), FontAwesomeIcons.moneyBillWave),
                  _buildDashboardStatCard(
                    'Ventas Digitales',
                    ventasQr + ventasTarjeta + _totalConsumeLoNuestro,
                    Colors.purpleAccent.withOpacity(0.08),
                    Colors.purpleAccent,
                    FontAwesomeIcons.creditCard,
                    subtitle: 'QR: ${ventasQr.toStringAsFixed(2)} | Tarj: ${ventasTarjeta.toStringAsFixed(2)} | CLN: ${_totalConsumeLoNuestro.toStringAsFixed(2)}',
                  ),
                  _buildDashboardStatCard('Gastos Turno', _totalGastos, Colors.redAccent.withOpacity(0.08), Colors.redAccent, FontAwesomeIcons.handHoldingDollar),
                ],
              ),
              const SizedBox(height: 16),
              
              // Efectivo en Cajón (Esperado)
              _buildBigEfectivoCard('Efectivo en Cajón', _efectivoEsperado, _totalGastos),
              
              const Divider(color: Colors.white10, height: 24),
              
              // Acciones del Turno
              const Text('Operaciones de Turno', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _showGastoDialog,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.redAccent,
                        side: const BorderSide(color: Colors.redAccent),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                      icon: const FaIcon(FontAwesomeIcons.handHoldingDollar, size: 14),
                      label: const Text('REGISTRAR GASTO', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                    ),
                  ),
                ],
              ),
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
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('CERRAR CAJA', style: TextStyle(letterSpacing: 0.5, fontSize: 11, fontWeight: FontWeight.bold)),
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
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: Colors.redAccent),
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
          final diffColor = diff >= 0 ? const Color(0xFF10B981) : Colors.redAccent;

          return ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            title: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Turno #${h['id']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
                Text(
                  diffText,
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13.5, color: diffColor),
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
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: AppTheme.textMuted),
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
