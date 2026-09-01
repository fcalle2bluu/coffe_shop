import 'package:sunmi_printer_plus/sunmi_printer_plus.dart';
import '../utils/mesa_utils.dart';

enum EstadoPapel { ok, sinPapel, desconocido }

class PrinterService {
  static final SunmiPrinterPlus _printer = SunmiPrinterPlus();
  static bool _isInitialized = false;

  static Future<void> init() async {
    if (_isInitialized) return;
    try {
      await _printer.rebindPrinter().timeout(const Duration(seconds: 10));
      _isInitialized = true;
    } catch (e) {
      print('Error al inicializar impresora Sunmi: $e');
      rethrow;
    }
  }

  /// Consulta el estado físico del papel directo al hardware (sensor de la Sunmi).
  static Future<EstadoPapel> getEstadoPapel() async {
    try {
      await init();
      final status = (await _printer.getStatus().timeout(const Duration(seconds: 8))) ?? '';
      final upper = status.toUpperCase();
      if (upper.contains('PAPER_OUT') || (upper.contains('WARN_') && upper.contains('PAPER'))) {
        return EstadoPapel.sinPapel;
      }
      if (upper.contains('READY') || upper.contains('NORMAL')) {
        return EstadoPapel.ok;
      }
      return EstadoPapel.desconocido;
    } catch (e) {
      print('Error al consultar estado de papel: $e');
      return EstadoPapel.desconocido;
    }
  }

  static Future<void> printComanda({
    required int comandaId,
    int? numeroComanda,
    required String mesa,
    required List<Map<String, dynamic>> items,
    String? mesero,
    DateTime? fechaHora,
    bool esEdicion = false,
    bool comandaYaEntregada = false,
    String? notasGenerales,
  }) async {
    await _imprimir(numeroComanda ?? comandaId, mesa, items, mesero, fechaHora, esEdicion, comandaYaEntregada, notasGenerales).timeout(
      const Duration(seconds: 20),
      onTimeout: () => throw Exception('La impresora no respondió (tiempo de espera agotado)'),
    );
  }

  static Future<void> _imprimirItem(Map<String, dynamic> item) async {
    final cant = item['cantidad']?.toString() ?? '1';
    final nombre = (item['nombre'] ?? 'Producto').toString();
    final notaItem = (item['notas'] as String?) ?? '';
    await _printer.printText(
      text: '$cant x $nombre',
      style: SunmiTextStyle(bold: true, fontSize: 36, align: SunmiPrintAlign.LEFT),
    );
    if (notaItem.isNotEmpty) {
      await _printer.printText(
        text: '  >> $notaItem',
        style: SunmiTextStyle(bold: true, fontSize: 28, align: SunmiPrintAlign.LEFT),
      );
    }
  }

  static String _formatearFechaHora(DateTime fecha) {
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(fecha.day)}/${dos(fecha.month)}/${fecha.year} ${dos(fecha.hour)}:${dos(fecha.minute)}';
  }

  static Future<void> _imprimir(
    int numeroComanda,
    String mesa,
    List<Map<String, dynamic>> items,
    String? mesero,
    DateTime? fechaHora,
    bool esEdicion,
    bool comandaYaEntregada,
    String? notasGenerales,
  ) async {
    await init();

    await _printer.printText(
      text: 'CAFÉ LA PAZ - COCINA',
      style: SunmiTextStyle(bold: true, fontSize: 36, align: SunmiPrintAlign.CENTER),
    );
    await _printer.lineWrap(times: 1);

    // Aviso muy explícito de que esto NO es un pedido nuevo, sino un cambio
    // sobre uno que cocina ya podría estar preparando o haber visto antes.
    if (esEdicion) {
      await _printer.printText(
        text: ' *** PEDIDO MODIFICADO *** ',
        style: SunmiTextStyle(bold: true, fontSize: 32, align: SunmiPrintAlign.CENTER, reverse: true),
      );
      await _printer.printText(
        text: 'Revisar cambios en la mesa',
        style: SunmiTextStyle(bold: true, fontSize: 26, align: SunmiPrintAlign.CENTER),
      );
      await _printer.lineWrap(times: 1);
    }

    // Marco negro (video invertido: texto blanco sobre fondo negro) para que la
    // mesa resalte al instante, incluso con la vista cansada o el cabezal gastado.
    await _printer.printText(
      text: '  ${nombreMesa(mesa).toUpperCase()}  ',
      style: SunmiTextStyle(bold: true, fontSize: 48, align: SunmiPrintAlign.CENTER, reverse: true),
    );

    await _printer.printText(
      text: 'Comanda #${numeroComanda.toString().padLeft(3, '0')}',
      style: SunmiTextStyle(bold: true, fontSize: 30, align: SunmiPrintAlign.CENTER),
    );
    await _printer.printText(
      text: _formatearFechaHora(fechaHora ?? DateTime.now()),
      style: SunmiTextStyle(bold: true, fontSize: 26, align: SunmiPrintAlign.CENTER),
    );
    if (mesero != null && mesero.isNotEmpty) {
      await _printer.printText(
        text: 'Mesero: $mesero',
        style: SunmiTextStyle(bold: true, fontSize: 26, align: SunmiPrintAlign.CENTER),
      );
    }
    await _printer.line();
    await _printer.lineWrap(times: 1);

    // Solo tiene sentido dividir nuevo/ya-enviado cuando esta impresión es de
    // una edición: en un pedido recién creado todo es igual de nuevo.
    if (esEdicion) {
      final nuevos = items.where((it) => it['es_nuevo'] == true).toList();
      final viejos = items.where((it) => it['es_nuevo'] != true).toList();

      if (nuevos.isNotEmpty) {
        await _printer.printText(
          text: ' >>> NUEVO EN ESTE PEDIDO <<< ',
          style: SunmiTextStyle(bold: true, fontSize: 28, align: SunmiPrintAlign.CENTER, reverse: true),
        );
        await _printer.lineWrap(times: 1);
        for (final item in nuevos) {
          await _imprimirItem(item);
        }
      }

      if (nuevos.isNotEmpty && viejos.isNotEmpty) {
        await _printer.lineWrap(times: 1);
        await _printer.printText(
          text: '- - - - - - - - - - - - - - - -',
          style: SunmiTextStyle(bold: true, fontSize: 22, align: SunmiPrintAlign.CENTER),
        );
        await _printer.lineWrap(times: 1);
      }

      if (viejos.isNotEmpty) {
        await _printer.printText(
          text: comandaYaEntregada ? 'YA ENTREGADO ANTES' : 'YA ENVIADO A COCINA',
          style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.CENTER),
        );
        await _printer.lineWrap(times: 1);
        for (final item in viejos) {
          await _imprimirItem(item);
        }
      }
    } else {
      for (final item in items) {
        await _imprimirItem(item);
      }
    }

    if (notasGenerales != null && notasGenerales.isNotEmpty) {
      await _printer.lineWrap(times: 1);
      await _printer.printText(
        text: 'NOTA: $notasGenerales',
        style: SunmiTextStyle(bold: true, fontSize: 28, align: SunmiPrintAlign.LEFT),
      );
    }

    await _printer.lineWrap(times: 1);
    await _printer.line();

    // Cierre del marco negro, como remate visual del pedido.
    await _printer.printText(
      text: '   *** FIN DE COMANDA ***   ',
      style: SunmiTextStyle(bold: true, fontSize: 30, align: SunmiPrintAlign.CENTER, reverse: true),
    );

    await _printer.lineWrap(times: 3);
    await _printer.cutPaper();
  }
}
