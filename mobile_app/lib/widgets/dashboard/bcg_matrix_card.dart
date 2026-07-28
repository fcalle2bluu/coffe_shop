import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:fl_chart/fl_chart.dart';
import '../../config/api.dart';
import '../../config/theme.dart';

class BcgMatrixCard extends StatefulWidget {
  const BcgMatrixCard({super.key});

  @override
  State<BcgMatrixCard> createState() => _BcgMatrixCardState();
}

class _BcgMatrixCardState extends State<BcgMatrixCard> {
  bool _cargando = true;
  List<dynamic> _productos = [];

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final res = await ApiConfig.get('/kpis/stats-avanzadas');
      if (res.statusCode == 200 && mounted) {
        final data = jsonDecode(res.body);
        setState(() {
          _productos = data['bcg'] ?? [];
          _cargando = false;
        });
      }
    } catch (e) {
      print('Error al cargar matriz BCG: $e');
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: CircularProgressIndicator(color: AppTheme.accentColor)),
        ),
      );
    }
    if (_productos.isEmpty) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text('Sin datos suficientes para la matriz BCG.', style: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 12)),
        ),
      );
    }

    final volumenes = _productos.map((p) => double.tryParse(p['volumen'].toString()) ?? 0).toList();
    final ingresos = _productos.map((p) => double.tryParse(p['ingresos'].toString()) ?? 0).toList();
    final avgVolumen = volumenes.reduce((a, b) => a + b) / volumenes.length;
    final avgIngresos = ingresos.reduce((a, b) => a + b) / ingresos.length;
    final maxVolumen = volumenes.reduce((a, b) => a > b ? a : b) * 1.15;
    final maxIngresos = ingresos.reduce((a, b) => a > b ? a : b) * 1.15;

    Color colorPara(double vol, double ing) {
      final altoVolumen = vol >= avgVolumen;
      final altoIngreso = ing >= avgIngresos;
      if (altoVolumen && altoIngreso) return const Color(0xFF10B981); // Estrellas
      if (!altoVolumen && altoIngreso) return const Color(0xFF3B82F6); // Vacas
      if (altoVolumen && !altoIngreso) return const Color(0xFFF59E0B); // Interrogantes
      return const Color(0xFFEF4444); // Huesos
    }

    String cuadrantePara(double vol, double ing) {
      final altoVolumen = vol >= avgVolumen;
      final altoIngreso = ing >= avgIngresos;
      if (altoVolumen && altoIngreso) return '⭐ Estrellas';
      if (!altoVolumen && altoIngreso) return '🐮 Vacas';
      if (altoVolumen && !altoIngreso) return '❓ Interrogantes';
      return '🦴 Huesos';
    }

    final grupos = <String, List<dynamic>>{'⭐ Estrellas': [], '🐮 Vacas': [], '❓ Interrogantes': [], '🦴 Huesos': []};
    for (final p in _productos) {
      final vol = double.tryParse(p['volumen'].toString()) ?? 0;
      final ing = double.tryParse(p['ingresos'].toString()) ?? 0;
      grupos[cuadrantePara(vol, ing)]!.add(p);
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Matriz BCG · Portafolio de Productos', style: GoogleFonts.outfit(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            Text('Volumen vendido vs. ingresos generados', style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted)),
            const SizedBox(height: 16),
            SizedBox(
              height: 220,
              child: ScatterChart(
                ScatterChartData(
                  minX: 0,
                  maxX: maxVolumen == 0 ? 1 : maxVolumen,
                  minY: 0,
                  maxY: maxIngresos == 0 ? 1 : maxIngresos,
                  gridData: const FlGridData(show: false),
                  borderData: FlBorderData(show: false),
                  titlesData: const FlTitlesData(show: false),
                  scatterTouchData: ScatterTouchData(
                    touchTooltipData: ScatterTouchTooltipData(
                      getTooltipItems: (spot) {
                        final idx = _productos.indexWhere((p) =>
                            (double.tryParse(p['volumen'].toString()) ?? 0) == spot.x &&
                            (double.tryParse(p['ingresos'].toString()) ?? 0) == spot.y);
                        final nombre = idx >= 0 ? (_productos[idx]['nombre'] ?? '') : '';
                        return ScatterTooltipItem('$nombre\n${spot.x.toInt()} u. · Bs. ${spot.y.toStringAsFixed(0)}',
                            textStyle: GoogleFonts.outfit(color: Colors.white, fontSize: 10));
                      },
                    ),
                  ),
                  scatterSpots: List.generate(_productos.length, (i) {
                    final vol = double.tryParse(_productos[i]['volumen'].toString()) ?? 0;
                    final ing = double.tryParse(_productos[i]['ingresos'].toString()) ?? 0;
                    return ScatterSpot(
                      vol,
                      ing,
                      dotPainter: FlDotCirclePainter(radius: 6, color: colorPara(vol, ing)),
                    );
                  }),
                ),
              ),
            ),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              childAspectRatio: 1.6,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              children: grupos.entries.map((e) => _buildCuadranteList(e.key, e.value)).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCuadranteList(String titulo, List<dynamic> productos) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppTheme.primaryDark, borderRadius: BorderRadius.circular(14)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(titulo, style: GoogleFonts.outfit(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
          const SizedBox(height: 4),
          Expanded(
            child: productos.isEmpty
                ? Text('—', style: GoogleFonts.outfit(fontSize: 10, color: AppTheme.textMuted))
                : ListView(
                    padding: EdgeInsets.zero,
                    children: productos
                        .take(4)
                        .map((p) => Text(
                              '• ${p['nombre']}',
                              style: GoogleFonts.outfit(fontSize: 9, color: AppTheme.textMuted),
                              overflow: TextOverflow.ellipsis,
                            ))
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }
}
