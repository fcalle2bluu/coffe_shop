import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

const Map<String, Color> _coloresMetodo = {
  'EFECTIVO': Color(0xFF10B981),
  'QR': Color(0xFF6366F1),
  'TARJETA': Color(0xFFF59E0B),
  'CONSUME LO NUESTRO': Color(0xFFEF4444),
  'BILLETERA MOVIL': Color(0xFF8B5CF6),
};

const Map<String, String> _emojiMetodo = {
  'EFECTIVO': '💵',
  'QR': '📱',
  'TARJETA': '💳',
  'CONSUME LO NUESTRO': '🇧🇴',
  'BILLETERA MOVIL': '📲',
};

class MetodosPagoCard extends StatefulWidget {
  const MetodosPagoCard({super.key});

  @override
  State<MetodosPagoCard> createState() => _MetodosPagoCardState();
}

class _MetodosPagoCardState extends State<MetodosPagoCard> {
  bool _cargando = true;
  String _filtro = 'mes';
  bool _porMonto = true;
  List<dynamic> _metodos = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    try {
      final res = await ApiConfig.get('/libro-diario/stats/metodos-pago?filtro=$_filtro');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _metodos = jsonDecode(res.body);
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar métodos de pago: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  double _valor(dynamic m) => double.tryParse((_porMonto ? m['total_monto'] : m['cantidad']).toString()) ?? 0;

  void _verDetalle(dynamic metodo) {
    final items = (metodo['items'] as List<dynamic>? ?? []);
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.secondaryDark,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        maxChildSize: 0.85,
        expand: false,
        builder: (context, scrollController) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${_emojiMetodo[metodo['metodo']] ?? '💰'} ${metodo['metodo']}',
                  style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
              Text('${items.length} transacciones', style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted)),
              const SizedBox(height: 12),
              Expanded(
                child: ListView.separated(
                  controller: scrollController,
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(color: AppTheme.borderDark, height: 1),
                  itemBuilder: (context, i) {
                    final it = items[i];
                    return ListTile(
                      dense: true,
                      title: Text('Bs. ${double.tryParse(it['total'].toString())?.toStringAsFixed(2) ?? it['total']}',
                          style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
                      trailing: Text('${it['fecha']}', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 11)),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final maxVal = _metodos.isEmpty ? 1.0 : _metodos.map(_valor).fold<double>(0, (a, b) => a > b ? a : b);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Métodos de Pago más Usados', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _chip('hoy', 'Hoy'),
                  _chip('mes', 'Mes'),
                  _chip('anio', 'Año'),
                  _chip('todos', 'Histórico'),
                  const SizedBox(width: 12),
                  _chipMetrica(true, 'Monto'),
                  _chipMetrica(false, 'Cantidad'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_cargando)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)))
            else if (_metodos.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('Sin datos para este período.', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 12))),
              )
            else
              SizedBox(
                height: 180,
                child: BarChart(
                  BarChartData(
                    alignment: BarChartAlignment.spaceAround,
                    maxY: maxVal * 1.2,
                    gridData: const FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      bottomTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          getTitlesWidget: (value, meta) {
                            final i = value.toInt();
                            if (i < 0 || i >= _metodos.length) return const SizedBox.shrink();
                            final metodo = (_metodos[i]['metodo'] ?? '').toString();
                            return Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(_emojiMetodo[metodo] ?? '💰', style: const TextStyle(fontSize: 16)),
                            );
                          },
                        ),
                      ),
                    ),
                    barTouchData: BarTouchData(
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipItem: (group, groupIndex, rod, rodIndex) {
                          final metodo = _metodos[groupIndex];
                          return BarTooltipItem(
                            '${metodo['metodo']}\n${_porMonto ? 'Bs. ${rod.toY.toStringAsFixed(2)}' : '${rod.toY.toInt()}'}',
                            GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                          );
                        },
                      ),
                      touchCallback: (event, response) {
                        if (event is FlTapUpEvent && response?.spot != null) {
                          _verDetalle(_metodos[response!.spot!.touchedBarGroupIndex]);
                        }
                      },
                    ),
                    barGroups: List.generate(_metodos.length, (i) {
                      final metodo = (_metodos[i]['metodo'] ?? '').toString();
                      final color = _coloresMetodo[metodo] ?? AppTheme.textMuted;
                      return BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(toY: _valor(_metodos[i]), width: 28, borderRadius: BorderRadius.circular(6), color: color),
                        ],
                      );
                    }),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String value, String label) {
    final selected = _filtro == value;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: AppTheme.accentColor,
        backgroundColor: AppTheme.primaryDark,
        labelStyle: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, color: selected ? Colors.white : AppTheme.textMuted),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        onSelected: (v) {
          if (v) {
            setState(() => _filtro = value);
            _cargar();
          }
        },
      ),
    );
  }

  Widget _chipMetrica(bool esMonto, String label) {
    final selected = _porMonto == esMonto;
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        selectedColor: AppTheme.adminColor,
        backgroundColor: AppTheme.primaryDark,
        labelStyle: GoogleFonts.outfit(fontSize: 10, fontWeight: FontWeight.bold, color: selected ? Colors.white : AppTheme.textMuted),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        onSelected: (v) {
          if (v) {
            setState(() => _porMonto = esMonto);
          }
        },
      ),
    );
  }
}
