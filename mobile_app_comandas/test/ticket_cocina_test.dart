// Comprueba qué sale impreso en el papel, interceptando las llamadas que el
// servicio hace a la impresora Sunmi. Así se ve el ticket completo sin necesitar
// la máquina conectada.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app_comandas/services/printer_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final lineas = <String>[];
  final tamanos = <String, int>{}; // texto impreso -> fontSize con el que salió
  const canal = MethodChannel('sunmi_printer_plus');

  setUp(() {
    lineas.clear();
    tamanos.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(canal, (llamada) async {
      switch (llamada.method) {
        case 'printText':
          final datos = Map<String, dynamic>.from(
              (llamada.arguments as Map)['data'] as Map);
          final texto = datos['text'].toString();
          lineas.add(texto);
          // El plugin manda el tamaño suelto dentro de 'data', no anidado.
          final f = datos['fontSize'];
          if (f is int) tamanos[texto] = f;
          return 'ok';
        case 'printRow':
          final datos = Map<String, dynamic>.from(
              (llamada.arguments as Map)['data'] as Map);
          final textos = (datos['text'] as List).map((e) => e.toString()).toList();
          final fuentes = (datos['style'] as List)
              .map((e) => e == null ? null : (e as Map)['fontSize'])
              .toList();
          // Un solo renglón: las columnas van separadas por " | " para poder leerlo.
          final renglon = textos.join(' | ');
          lineas.add(renglon);
          for (var i = 0; i < textos.length; i++) {
            if (fuentes[i] is int) tamanos[textos[i]] = fuentes[i] as int;
          }
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

  test('el encabezado y el cierre van pegados, y las MAYUSCULAS mas chicas', () async {
    await PrinterService.printComanda(
      comandaId: 1,
      numeroComanda: 1,
      mesa: '10',
      mesero: 'Jorge Antonio Ticona Calderon',
      fechaHora: DateTime(2026, 10, 15, 7, 59),
      total: 35.0,
      items: [
        {'nombre': 'Desayuno Yungueño', 'cantidad': 1, 'precio_unitario': 35, 'subtotal': 35},
      ],
    );

    // Lo que sigue inmediatamente a una línea dada, sin nada en el medio.
    String siguienteA(String texto) => lineas[lineas.indexOf(texto) + 1];

    // 1. El local y la mesa, en UN SOLO renglón de dos columnas.
    expect(lineas.first, 'CAFÉ LA PAZ - COCINA |  MESA 10 ');
    expect(lineas, isNot(contains('  MESA 10  '))); // ya no va en su propia línea

    // 3. El cierre, pegado al total: los dos bloques negros seguidos.
    expect(siguienteA('  TOTAL  Bs. 35.00  '), '   *** FIN DE COMANDA ***   ');

    // 2. Todo lo que va en mayúscula, 3 puntos más chico que antes.
    // El encabezado y la mesa comparten renglón: tienen que entrar los dos en
    // los 58 mm, así que bajan más que los 3 puntos del resto.
    expect(tamanos['CAFÉ LA PAZ - COCINA'], 20); // antes 34
    expect(tamanos[' MESA 10 '], 30); // antes 48
    expect(tamanos['PEDIDO #001'], 25); // antes 28
    expect(tamanos['  TOTAL  Bs. 35.00  '], 37); // antes 40
    expect(tamanos['   *** FIN DE COMANDA ***   '], 25); // antes 28

    // Lo que NO está en mayúscula se queda igual: el producto y la hora son lo
    // que la cocina lee de lejos, achicarlos sería un problema.
    expect(tamanos['1 x Desayuno Yungueño'], 34);
    expect(tamanos['15/10/2026 07:59'], 24);
    expect(tamanos['Mesero: Jorge Antonio Ticona Calderon'], 24);
  });

  test('Para Llevar entra en la columna: sin espacios y mas chico', () async {
    await PrinterService.printComanda(
      comandaId: 2, numeroComanda: 5, mesa: 'Para Llevar', total: 20.0,
      items: [{'nombre': 'Cafe', 'cantidad': 1, 'precio_unitario': 20, 'subtotal': 20}],
    );
    // "PARA LLEVAR" son 11 caracteres contra los 7 de "MESA 10": con el mismo
    // tamaño y el espaciado se saldría de su columna y la impresora lo cortaría.
    expect(lineas.first, 'CAFÉ LA PAZ - COCINA | PARA LLEVAR');
    expect(tamanos['PARA LLEVAR'], 24);
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
