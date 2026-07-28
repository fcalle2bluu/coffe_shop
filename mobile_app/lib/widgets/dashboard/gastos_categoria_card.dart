import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

const Map<String, Color> _coloresGasto = {
  'Gastos Fijos': Color(0xFFEF4444),
  'Gastos Operativos': Color(0xFFF59E0B),
  'Costos de Producción/Insumos': Color(0xFF10B981),
};

const Map<String, String> _emojiGasto = {
  'Gastos Fijos': '🏢',
  'Gastos Operativos': '⚙️',
  'Costos de Producción/Insumos': '🧪',
};

class GastosCategoriaCard extends StatefulWidget {
  const GastosCategoriaCard({super.key});

  @override
  State<GastosCategoriaCard> createState() => _GastosCategoriaCardState();
}

class _GastosCategoriaCardState extends State<GastosCategoriaCard> {
  bool _cargando = true;
  String _filtro = 'mes';
  List<dynamic> _categorias = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    try {
      final res = await ApiConfig.get('/libro-diario/stats/gastos-categorias?filtro=$_filtro');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _categorias = jsonDecode(res.body);
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar gastos por categoría: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  double _monto(dynamic c) => double.tryParse(c['total_monto'].toString()) ?? 0;

  void _verDetalle(dynamic categoria) {
    final items = (categoria['items'] as List<dynamic>? ?? []);
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
              Text('${_emojiGasto[categoria['categoria']] ?? '📦'} ${categoria['categoria']}',
                  style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
              Text('${items.length} registros', style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted)),
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
                      title: Text('${it['descripcion'] ?? ''}', style: GoogleFonts.outfit(color: Colors.white)),
                      subtitle: Text('${it['metodo_pago'] ?? ''} · ${it['fecha']}', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 11)),
                      trailing: Text('Bs. ${double.tryParse(it['monto'].toString())?.toStringAsFixed(2) ?? it['monto']}',
                          style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
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
    final maxVal = _categorias.isEmpty ? 1.0 : _categorias.map(_monto).fold<double>(0, (a, b) => a > b ? a : b);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Gastos por Categoría (Libro Diario)', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _chip('hoy', 'Hoy'),
                  _chip('mes', 'Mes'),
                  _chip('anio', 'Año'),
                  _chip('todos', 'Histórico'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_cargando)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)))
            else if (_categorias.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('Sin gastos para este período.', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 12))),
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
                            if (i < 0 || i >= _categorias.length) return const SizedBox.shrink();
                            final cat = (_categorias[i]['categoria'] ?? '').toString();
                            return Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(_emojiGasto[cat] ?? '📦', style: const TextStyle(fontSize: 16)),
                            );
                          },
                        ),
                      ),
                    ),
                    barTouchData: BarTouchData(
                      touchTooltipData: BarTouchTooltipData(
                        getTooltipItem: (group, groupIndex, rod, rodIndex) {
                          final cat = _categorias[groupIndex];
                          return BarTooltipItem(
                            '${cat['categoria']}\nBs. ${rod.toY.toStringAsFixed(2)}',
                            GoogleFonts.outfit(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                          );
                        },
                      ),
                      touchCallback: (event, response) {
                        if (event is FlTapUpEvent && response?.spot != null) {
                          _verDetalle(_categorias[response!.spot!.touchedBarGroupIndex]);
                        }
                      },
                    ),
                    barGroups: List.generate(_categorias.length, (i) {
                      final cat = (_categorias[i]['categoria'] ?? '').toString();
                      final color = _coloresGasto[cat] ?? AppTheme.adminColor;
                      return BarChartGroupData(
                        x: i,
                        barRods: [
                          BarChartRodData(toY: _monto(_categorias[i]), width: 28, borderRadius: BorderRadius.circular(6), color: color),
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
}
