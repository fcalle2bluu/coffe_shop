// Comprueba qué sale impreso en el papel, interceptando las llamadas que el
// servicio hace a la impresora Sunmi. Así se ve el ticket completo sin necesitar
// la máquina conectada.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app_comandas/services/printer_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final lineas = <String>[];
  const canal = MethodChannel('sunmi_printer_plus');

  setUp(() {
    lineas.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(canal, (llamada) async {
      switch (llamada.method) {
        case 'printText':
          final datos = Map<String, dynamic>.from(
              (llamada.arguments as Map)['data'] as Map);
          lineas.add(datos['text'].toString());
          return 'ok';
        case 'lineWrap':
          lineas.add('');
          return 'ok';
        case 'line':
          lineas.add('--------------------------------');
          return 'ok';
        case 'cutPaper':
          lineas.add('[CORTE DE PAPEL]');
          return 'ok';
        case 'rebindPrinter':
          return true;
        default:
          return 'ok';
      }
    });
  });

  test('la comanda de cocina sale con precios y total', () async {
    await PrinterService.printComanda(
      comandaId: 2932,
      numeroComanda: 22,
      mesa: '11',
      mesero: 'Maria Paco',
      fechaHora: DateTime(2026, 10, 12, 19, 40),
      total: 125.0,
      items: [
        {'nombre': 'Frappe de Cafe', 'cantidad': 2, 'precio_unitario': 25, 'subtotal': 50, 'notas': 'sin azucar'},
        {'nombre': 'Sandwich de Pollo', 'cantidad': 1, 'precio_unitario': 25, 'subtotal': 25},
        {'nombre': 'Hamburguesa Simple', 'cantidad': 1, 'precio_unitario': 50, 'subtotal': 50},
      ],
    );

    // ignore: avoid_print
    print('\n===== TICKET =====\n${lineas.join('\n')}\n==================\n');

    expect(lineas, contains('Bs. 50.00'));
    expect(lineas, contains('Bs. 25.00'));
    expect(lineas.any((l) => l.contains('TOTAL') && l.contains('Bs. 125.00')), isTrue,
        reason: 'el papel debe cerrar con el total');
    expect(lineas, contains('PEDIDO #022'),
        reason: 'el nro de pedido del turno tiene que salir en el papel');
  });

  test('si el servidor no manda el total, se suma lo impreso', () async {
    await PrinterService.printComanda(
      comandaId: 1,
      mesa: '3',
      items: [
        {'nombre': 'Cafe', 'cantidad': 2, 'precio_unitario': '10.00', 'subtotal': '20.00'},
        {'nombre': 'Te', 'cantidad': 1, 'precio_unitario': '8.00', 'subtotal': '8.00'},
      ],
    );
    expect(lineas.any((l) => l.contains('TOTAL') && l.contains('Bs. 28.00')), isTrue);
  });

  test('un producto sin precio no rompe la impresion', () async {
    await PrinterService.printComanda(
      comandaId: 2,
      mesa: '5',
      items: [
        {'nombre': 'Cortesia', 'cantidad': 1},
        {'nombre': 'Cafe', 'cantidad': 1, 'subtotal': 12},
      ],
    );
    expect(lineas.any((l) => l.contains('TOTAL') && l.contains('Bs. 12.00')), isTrue);
    expect(lineas, contains('1 x Cortesia'));
  });
}
