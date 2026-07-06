import 'dart:typed_data';
import 'package:sunmi_printer_plus/sunmi_printer_plus.dart';

class SunmiPrinterService {
  static final SunmiPrinterPlus _printer = SunmiPrinterPlus();
  static bool _isInitialized = false;

  /// Inicializa o reconecta la conexión con la impresora Sunmi
  static Future<void> init() async {
    if (_isInitialized) return;
    try {
      // Intentar rebind para asegurar la conexión
      await _printer.rebindPrinter();
      _isInitialized = true;
    } catch (e) {
      print('Error al inicializar/conectar impresora Sunmi: $e');
    }
  }

  /// Verifica si la impresora está disponible
  static Future<bool> isAvailable() async {
    try {
      await init();
      final status = await _printer.getStatus();
      return status != null && status != 'OFFLINE' && status != 'UNKNOWN';
    } catch (_) {
      return false;
    }
  }

  /// Imprime un ticket de venta completo
  static Future<void> printTicketVenta({
    required int ventaId,
    required String fecha,
    required List<Map<String, dynamic>> items,
    required double total,
    required String metodoPago,
    String? estado,
  }) async {
    try {
      await init();

      // Header
      await _printer.printText(
        text: 'CAFÉ LA PAZ',
        style: SunmiTextStyle(bold: true, fontSize: 32, align: SunmiPrintAlign.CENTER),
      );
      await _printer.printText(
        text: 'La Paz - Bolivia',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.CENTER),
      );
      await _printer.lineWrap(times: 1);

      // Info del ticket
      await _printer.printText(
        text: 'Ticket #${ventaId.toString().padLeft(5, '0')}',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.LEFT),
      );
      await _printer.printText(
        text: 'Fecha: $fecha',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.LEFT),
      );
      if (estado != null) {
        await _printer.printText(
          text: 'Estado: $estado',
          style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.LEFT),
        );
      }
      await _printer.line();

      // Cabecera de tabla
      await _printer.printRow(cols: [
        SunmiColumn(text: 'CANT', width: 4, style: SunmiTextStyle(bold: true, fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'DESCRIPCION', width: 16, style: SunmiTextStyle(bold: true, fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'IMP', width: 10, style: SunmiTextStyle(bold: true, fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.line();

      // Items
      for (final item in items) {
        final cant = item['cantidad']?.toString() ?? '1';
        final nombre = (item['nombre'] ?? 'Producto').toString();
        final subtotal = double.tryParse(item['subtotal']?.toString() ?? '0') ?? 0.0;

        final nombreCorto = nombre.length > 16 ? nombre.substring(0, 16) : nombre;

        await _printer.printRow(cols: [
          SunmiColumn(text: cant, width: 4, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
          SunmiColumn(text: nombreCorto, width: 16, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
          SunmiColumn(text: subtotal.toStringAsFixed(2), width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
        ]);
      }

      await _printer.line();

      // Total
      await _printer.printText(
        text: 'TOTAL: Bs. ${total.toStringAsFixed(2)}',
        style: SunmiTextStyle(bold: true, fontSize: 28, align: SunmiPrintAlign.RIGHT),
      );

      await _printer.printText(
        text: 'Método: $metodoPago',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.LEFT),
      );

      await _printer.lineWrap(times: 1);

      // Pie
      await _printer.printText(
        text: '¡Gracias por su compra!',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.CENTER),
      );
      await _printer.printText(
        text: 'Café La Paz - Vuelva pronto',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.CENTER),
      );

      await _printer.lineWrap(times: 3);
      await _printer.cutPaper();
    } catch (e) {
      print('Error al imprimir ticket: $e');
      rethrow;
    }
  }

  /// Imprime una comanda de cocina
  static Future<void> printComanda({
    required String mesa,
    required List<Map<String, dynamic>> items,
    String? mesero,
  }) async {
    try {
      await init();

      await _printer.printText(
        text: '*** COMANDA ***',
        style: SunmiTextStyle(bold: true, fontSize: 32, align: SunmiPrintAlign.CENTER),
      );
      await _printer.printText(
        text: 'Mesa: $mesa',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.CENTER),
      );
      if (mesero != null) {
        await _printer.printText(
          text: 'Mesero: $mesero',
          style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.CENTER),
        );
      }
      await _printer.line();

      for (final item in items) {
        final cant = item['cantidad']?.toString() ?? '1';
        final nombre = item['nombre'] ?? 'Producto';
        await _printer.printText(
          text: '$cant x $nombre',
          style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.LEFT),
        );
      }

      await _printer.line();
      await _printer.lineWrap(times: 3);
      await _printer.cutPaper();
    } catch (e) {
      print('Error al imprimir comanda: $e');
      rethrow;
    }
  }

  /// Imprime un resumen de arqueo de caja
  static Future<void> printArqueoCaja({
    required int turnoId,
    required String cajero,
    required String apertura,
    required String cierre,
    required double saldoInicial,
    required double ventasEfectivo,
    required double ventasQr,
    required double ventasTarjeta,
    required double ventasCln,
    required double totalGastos,
    required double saldoFinal,
    required double diferencia,
  }) async {
    try {
      await init();

      await _printer.printText(
        text: 'CAFÉ LA PAZ',
        style: SunmiTextStyle(bold: true, fontSize: 32, align: SunmiPrintAlign.CENTER),
      );
      await _printer.printText(
        text: 'ARQUEO DE CAJA',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.CENTER),
      );
      await _printer.lineWrap(times: 1);

      await _printer.printText(
        text: 'Turno #$turnoId',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.LEFT),
      );
      await _printer.printText(
        text: 'Cajero: $cajero',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.LEFT),
      );
      await _printer.printText(
        text: 'Apertura: $apertura',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.LEFT),
      );
      await _printer.printText(
        text: 'Cierre: $cierre',
        style: SunmiTextStyle(fontSize: 20, align: SunmiPrintAlign.LEFT),
      );
      await _printer.line();

      // Resumen de ventas
      await _printer.printRow(cols: [
        SunmiColumn(text: 'Fondo Inicial:', width: 20, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'Bs. ${saldoInicial.toStringAsFixed(2)}', width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.printRow(cols: [
        SunmiColumn(text: 'Ventas Efectivo:', width: 20, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'Bs. ${ventasEfectivo.toStringAsFixed(2)}', width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.printRow(cols: [
        SunmiColumn(text: 'Ventas QR:', width: 20, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'Bs. ${ventasQr.toStringAsFixed(2)}', width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.printRow(cols: [
        SunmiColumn(text: 'Ventas Tarjeta:', width: 20, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'Bs. ${ventasTarjeta.toStringAsFixed(2)}', width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.printRow(cols: [
        SunmiColumn(text: 'Consume Lo Ntro:', width: 20, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'Bs. ${ventasCln.toStringAsFixed(2)}', width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.printRow(cols: [
        SunmiColumn(text: 'Total Gastos:', width: 20, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.LEFT)),
        SunmiColumn(text: 'Bs. ${totalGastos.toStringAsFixed(2)}', width: 10, style: SunmiTextStyle(fontSize: 18, align: SunmiPrintAlign.RIGHT)),
      ]);
      await _printer.line();

      final totalVentas = ventasEfectivo + ventasQr + ventasTarjeta + ventasCln;
      await _printer.printText(
        text: 'TOTAL VENTAS: Bs. ${totalVentas.toStringAsFixed(2)}',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.LEFT),
      );
      await _printer.printText(
        text: 'EFECTIVO REAL: Bs. ${saldoFinal.toStringAsFixed(2)}',
        style: SunmiTextStyle(bold: true, fontSize: 24, align: SunmiPrintAlign.LEFT),
      );

      final diffLabel = diferencia > 0.01
          ? 'SOBRANTE'
          : (diferencia < -0.01 ? 'FALTANTE' : 'CUADRADO');
      await _printer.printText(
        text: 'DIFERENCIA: Bs. ${diferencia.toStringAsFixed(2)} ($diffLabel)',
        style: SunmiTextStyle(bold: true, fontSize: 20, align: SunmiPrintAlign.LEFT),
      );

      await _printer.lineWrap(times: 3);
      await _printer.cutPaper();
    } catch (e) {
      print('Error al imprimir arqueo: $e');
      rethrow;
    }
  }
}
