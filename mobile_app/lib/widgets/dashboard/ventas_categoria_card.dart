import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

class VentasCategoriaCard extends StatefulWidget {
  const VentasCategoriaCard({super.key});

  @override
  State<VentasCategoriaCard> createState() => _VentasCategoriaCardState();
}

class _VentasCategoriaCardState extends State<VentasCategoriaCard> {
  bool _cargando = true;
  String _filtro = 'mes';
  bool _porDinero = true;
  List<dynamic> _categorias = [];

  final List<Color> _colores = const [
    Color(0xFF6366F1),
    Color(0xFFF97316),
    Color(0xFF10B981),
    Color(0xFF06B6D4),
    Color(0xFF8B5CF6),
    Color(0xFFEC4899),
    Color(0xFFF59E0B),
    Color(0xFFF43F5E),
    Color(0xFF14B8A6),
    Color(0xFFA855F7),
  ];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    try {
      final metrica = _porDinero ? 'dinero' : 'cantidad';
      final res = await ApiConfig.get('/kpis/ventas-categoria?filtro=$_filtro&metrica=$metrica');
      if (res.statusCode == 200 && mounted) {
        setState(() {
          _categorias = jsonDecode(res.body);
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar ventas por categoría: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  double _valor(dynamic c) => double.tryParse((_porDinero ? c['total_dinero'] : c['total_cantidad']).toString()) ?? 0;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ventas por Categoría', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _chip('hoy', 'Hoy'),
                  _chip('semana', 'Semana'),
                  _chip('mes', 'Mes'),
                  _chip('anio', 'Año'),
                  _chip('todos', 'Histórico'),
                  const SizedBox(width: 12),
                  _chipMetrica(true, 'Bs.'),
                  _chipMetrica(false, 'Cant.'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_cargando)
              const SizedBox(height: 160, child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)))
            else if (_categorias.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(child: Text('Sin datos para este período.', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 12))),
              )
            else ...[
              SizedBox(
                height: 160,
                child: PieChart(
                  PieChartData(
                    sectionsSpace: 3,
                    centerSpaceRadius: 32,
                    sections: List.generate(_categorias.length, (i) {
                      final v = _valor(_categorias[i]);
                      return PieChartSectionData(
                        color: _colores[i % _colores.length],
                        value: v,
                        title: v.toStringAsFixed(0),
                        radius: 36,
                        titleStyle: GoogleFonts.outfit(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.white),
                      );
                    }),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              ...List.generate(_categorias.length, (i) {
                final c = _categorias[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3.0),
                  child: Row(
                    children: [
                      Container(width: 10, height: 10, decoration: BoxDecoration(color: _colores[i % _colores.length], shape: BoxShape.circle)),
                      const SizedBox(width: 8),
                      Expanded(child: Text('${c['categoria']}', style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textLight))),
                      Text(
                        _porDinero ? 'Bs. ${_valor(c).toStringAsFixed(2)}' : '${_valor(c).toStringAsFixed(0)} u.',
                        style: GoogleFonts.outfit(fontSize: 12, fontWeight: FontWeight.bold, color: AppTheme.textMuted),
                      ),
                    ],
                  ),
                );
              }),
            ],
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

  Widget _chipMetrica(bool esDinero, String label) {
    final selected = _porDinero == esDinero;
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
            setState(() => _porDinero = esDinero);
            _cargar();
          }
        },
      ),
    );
  }
}
