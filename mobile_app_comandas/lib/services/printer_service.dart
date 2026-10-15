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
    double? total,
  }) async {
    await _imprimir(numeroComanda ?? comandaId, mesa, items, mesero, fechaHora, esEdicion, comandaYaEntregada, notasGenerales, total).timeout(
      const Duration(seconds: 20),
      onTimeout: () => throw Exception('La impresora no respondió (tiempo de espera agotado)'),
    );
  }

  /// Convierte a número lo que venga del servidor: los importes llegan como
  /// texto ("36.00") porque Postgres manda los NUMERIC así.
  static double _aNumero(dynamic valor) {
    if (valor == null) return 0;
    if (valor is num) return valor.toDouble();
    return double.tryParse(valor.toString()) ?? 0;
  }

  static String _bs(double monto) => 'Bs. ${monto.toStringAsFixed(2)}';

  static Future<void> _imprimirItem(Map<String, dynamic> item) async {
    final cant = item['cantidad']?.toString() ?? '1';
    final nombre = (item['nombre'] ?? 'Producto').toString();
    final notaItem = (item['notas'] as String?) ?? '';
    await _printer.printText(
      text: '$cant x $nombre',
      style: SunmiTextStyle(bold: true, fontSize: 34, align: SunmiPrintAlign.LEFT),
    );
    if (notaItem.isNotEmpty) {
      await _printer.printText(
        text: '  >> $notaItem',
        style: SunmiTextStyle(bold: true, fontSize: 26, align: SunmiPrintAlign.LEFT),
      );
    }
    // El importe va en su propia línea, alineado a la derecha: en una sola línea
    // junto al nombre se cortaría, porque los nombres de producto son largos y el
    // papel es de 58 mm.
    final importe = _aNumero(item['subtotal']) != 0
        ? _aNumero(item['subtotal'])
        : _aNumero(item['precio_unitario']) * (int.tryParse(cant) ?? 1);
    if (importe > 0) {
      await _printer.printText(
        text: _bs(importe),
        style: SunmiTextStyle(bold: true, fontSize: 26, align: SunmiPrintAlign.RIGHT),
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
    double? total,
  ) async {
    await init();

    // El nombre del local y la mesa van en UN SOLO renglón, en dos columnas que
    // la impresora reparte sola (62% y 38% del ancho del papel).
    // La mesa conserva el marco negro (video invertido: blanco sobre negro) para
    // que resalte igual, aunque ahora comparta la línea.
    final textoMesa = nombreMesa(mesa).toUpperCase();
    // Va lo más grande que entre en su columna: "MESA 10" entra a 30; nombres
    // largos como "PARA LLEVAR" necesitan bajar a 24 y quedarse sin el espaciado.
    final mesaCorta = textoMesa.length <= 7;
    await _printer.printRow(cols: [
      SunmiColumn(
        text: 'CAFÉ LA PAZ - COCINA',
        width: 20,
        style: SunmiTextStyle(bold: true, fontSize: 20, align: SunmiPrintAlign.LEFT),
      ),
      SunmiColumn(
        text: mesaCorta ? ' $textoMesa ' : textoMesa,
        width: 12,
        style: SunmiTextStyle(
          bold: true,
          fontSize: mesaCorta ? 30 : 24,
          align: SunmiPrintAlign.RIGHT,
          reverse: true,
        ),
      ),
    ]);

    // Aviso muy explícito de que esto NO es un pedido nuevo, sino un cambio
    // sobre uno que cocina ya podría estar preparando o haber visto antes.
    if (esEdicion) {
      await _printer.printText(
        text: ' *** PEDIDO MODIFICADO *** ',
        style: SunmiTextStyle(bold: true, fontSize: 27, align: SunmiPrintAlign.CENTER, reverse: true),
      );
      await _printer.printText(
        text: 'Revisar cambios en la mesa',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.CENTER),
      );
      await _printer.lineWrap(times: 1);
    }

    await _printer.printText(
      text: 'PEDIDO #${numeroComanda.toString().padLeft(3, '0')}',
      style: SunmiTextStyle(bold: true, fontSize: 25, align: SunmiPrintAlign.CENTER),
    );
    await _printer.printText(
      text: _formatearFechaHora(fechaHora ?? DateTime.now()),
      style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.CENTER),
    );
    if (mesero != null && mesero.isNotEmpty) {
      await _printer.printText(
        text: 'Mesero: $mesero',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.CENTER),
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
          style: SunmiTextStyle(bold: true, fontSize: 23, align: SunmiPrintAlign.CENTER, reverse: true),
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
          style: SunmiTextStyle(bold: true, fontSize: 20, align: SunmiPrintAlign.CENTER),
        );
        await _printer.lineWrap(times: 1);
      }

      if (viejos.isNotEmpty) {
        await _printer.printText(
          text: comandaYaEntregada ? 'YA ENTREGADO ANTES' : 'YA ENVIADO A COCINA',
          style: SunmiTextStyle(bold: true, fontSize: 19, align: SunmiPrintAlign.CENTER),
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
        style: SunmiTextStyle(bold: true, fontSize: 23, align: SunmiPrintAlign.LEFT),
      );
    }

    await _printer.lineWrap(times: 1);
    await _printer.line();

    // Total del pedido. Con esto la comanda de cocina sirve también como ticket
    // de cobro y no hay que imprimir un segundo papel.
    // Se usa el total que manda el servidor; si no viniera, se suma lo impreso,
    // así el papel nunca sale sin total.
    final totalItems = items.fold<double>(
      0,
      (suma, it) => suma + (_aNumero(it['subtotal']) != 0
          ? _aNumero(it['subtotal'])
          : _aNumero(it['precio_unitario']) * (_aNumero(it['cantidad']) == 0 ? 1 : _aNumero(it['cantidad']))),
    );
    final totalAImprimir = (total != null && total > 0) ? total : totalItems;
    if (totalAImprimir > 0) {
      await _printer.printText(
        text: '  TOTAL  ${_bs(totalAImprimir)}  ',
        style: SunmiTextStyle(bold: true, fontSize: 37, align: SunmiPrintAlign.CENTER, reverse: true),
      );
    }

    // Cierre del marco negro, pegado al total a propósito: así los dos bloques
    // negros se leen como uno solo y el pedido termina de forma inconfundible.
    await _printer.printText(
      text: '   *** FIN DE COMANDA ***   ',
      style: SunmiTextStyle(bold: true, fontSize: 25, align: SunmiPrintAlign.CENTER, reverse: true),
    );

    await _printer.lineWrap(times: 2);
    await _printer.cutPaper();
  }
}
