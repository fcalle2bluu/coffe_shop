import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../config/api.dart';
import '../config/theme.dart';

class LibroDiarioScreen extends StatefulWidget {
  const LibroDiarioScreen({super.key});

  @override
  State<LibroDiarioScreen> createState() => _LibroDiarioScreenState();
}

class _LibroDiarioScreenState extends State<LibroDiarioScreen> {
  bool _isLoading = true;
  int _selectedMes = DateTime.now().month;
  int _selectedAnio = DateTime.now().year;
  
  List<dynamic> _asientos = [];
  double _totalDebe = 0.0;
  double _totalHaber = 0.0;

  final List<String> _meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  final List<int> _anios = [2025, 2026, 2027, 2028, 2029, 2030];
  final _currencyFormat = NumberFormat.currency(locale: 'es_BO', symbol: 'Bs. ');

  @override
  void initState() {
    super.initState();
    _loadLibroDiario();
  }

  Future<void> _loadLibroDiario() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/libro-diario?mes=$_selectedMes&anio=$_selectedAnio');
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        
        double debeAcum = 0.0;
        double haberAcum = 0.0;

        final list = data['asientos'] as List<dynamic>;
        for (var asiento in list) {
          final cuentas = asiento['cuentas'] as List<dynamic>;
          for (var c in cuentas) {
            final double val = double.tryParse(c['importe'].toString()) ?? 0.0;
            if (c['tipo'] == 'DEBE') {
              debeAcum += val;
            } else {
              haberAcum += val;
            }
          }
        }

        setState(() {
          _asientos = list;
          _totalDebe = debeAcum;
          _totalHaber = haberAcum;
        });
      }
    } catch (e) {
      print('Error al cargar libro diario: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Error al conectar con el servidor contable.')),
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
        title: const Text('Libro Diario'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadLibroDiario,
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark.withOpacity(0.3),
              border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.05))),
            ),
            child: Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    value: _selectedMes,
                    decoration: const InputDecoration(
                      labelText: 'Mes',
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    dropdownColor: AppTheme.secondaryDark,
                    items: List.generate(12, (index) {
                      return DropdownMenuItem(
                        value: index + 1,
                        child: Text(_meses[index]),
                      );
                    }),
                    onChanged: (val) {
                      setState(() => _selectedMes = val!);
                      _loadLibroDiario();
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    value: _selectedAnio,
                    decoration: const InputDecoration(
                      labelText: 'Año',
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                    dropdownColor: AppTheme.secondaryDark,
                    items: _anios.map((y) {
                      return DropdownMenuItem(
                        value: y,
                        child: Text(y.toString()),
                      );
                    }).toList(),
                    onChanged: (val) {
                      setState(() => _selectedAnio = val!);
                      _loadLibroDiario();
                    },
                  ),
                ),
              ],
            ),
          ),

          // Main List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _asientos.isEmpty
                    ? const Center(
                        child: Text(
                          'No hay registros contables en este período.',
                          style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _asientos.length,
                        itemBuilder: (context, index) {
                          final asiento = _asientos[index];
                          final int nro = asiento['asiento_nro'] ?? 0;
                          final String fecha = asiento['fecha'] ?? '';
                          final String dia = asiento['dia_semana'] ?? '';
                          final String glosa = asiento['glosa'] ?? '';
                          final cuentas = asiento['cuentas'] as List<dynamic>;

                          double totalDebeLocal = 0;
                          double totalHaberLocal = 0;

                          return Card(
                            margin: const EdgeInsets.only(bottom: 16),
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Asiento Header
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: AppTheme.accentColor.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(color: AppTheme.accentColor.withOpacity(0.2)),
                                        ),
                                        child: Text(
                                          'Asiento N° $nro',
                                          style: const TextStyle(
                                            fontFamily: 'Outfit',
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12,
                                            color: AppTheme.accentColor,
                                          ),
                                        ),
                                      ),
                                      Text(
                                        '$fecha ($dia)',
                                        style: const TextStyle(
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.bold,
                                          color: AppTheme.textMuted,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const Divider(color: Colors.white10, height: 24),

                                  // Entries
                                  ...cuentas.map((c) {
                                    final double importe = double.tryParse(c['importe'].toString()) ?? 0.0;
                                    final bool isDebe = c['tipo'] == 'DEBE';
                                    
                                    if (isDebe) {
                                      totalDebeLocal += importe;
                                    } else {
                                      totalHaberLocal += importe;
                                    }

                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 4),
                                      child: Row(
                                        children: [
                                          // Indent if Credit (Haber)
                                          if (!isDebe) const SizedBox(width: 20),
                                          
                                          // Account Type tag
                                          Container(
                                            width: 4,
                                            height: 18,
                                            decoration: BoxDecoration(
                                              color: isDebe ? Colors.blueAccent : Colors.amber,
                                              borderRadius: BorderRadius.circular(2),
                                            ),
                                          ),
                                          const SizedBox(width: 8),

                                          // Account Name
                                          Expanded(
                                            child: Text(
                                              c['nombre'] ?? '',
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: FontWeight.bold,
                                                color: isDebe ? Colors.white70 : Colors.white60,
                                              ),
                                            ),
                                          ),

                                          // Importe
                                          Text(
                                            _currencyFormat.format(importe),
                                            style: TextStyle(
                                              fontSize: 13,
                                              fontFamily: 'JetBrains Mono',
                                              fontWeight: FontWeight.bold,
                                              color: isDebe ? Colors.blueAccent : Colors.amber,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),

                                  // Glosa
                                  const SizedBox(height: 12),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(10),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withOpacity(0.02),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      'Glosa: $glosa',
                                      style: const TextStyle(
                                        fontSize: 11.5,
                                        fontStyle: FontStyle.italic,
                                        color: AppTheme.textMuted,
                                      ),
                                    ),
                                  ),

                                  // Asiento Totals Underline
                                  const SizedBox(height: 12),
                                  const Divider(color: Colors.white10, height: 1),
                                  const SizedBox(height: 6),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      Text(
                                        'Debe: ${_currencyFormat.format(totalDebeLocal)}',
                                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.blueAccent),
                                      ),
                                      const SizedBox(width: 16),
                                      Text(
                                        'Haber: ${_currencyFormat.format(totalHaberLocal)}',
                                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.amber),
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

          // Grand Totals Bottom Card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark,
              border: Border(top: BorderSide(color: Colors.white.withOpacity(0.08))),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 15,
                  offset: const Offset(0, -5),
                ),
              ],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'SUMAS DEL PERÍODO',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.0, color: AppTheme.textMuted),
                        ),
                        Text(
                          'Totales del mes',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'Debe: ${_currencyFormat.format(_totalDebe)}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.blueAccent, fontFamily: 'JetBrains Mono'),
                      ),
                      Text(
                        'Haber: ${_currencyFormat.format(_totalHaber)}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.amber, fontFamily: 'JetBrains Mono'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
