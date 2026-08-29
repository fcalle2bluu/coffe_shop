import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../config/api_config.dart';
import '../services/alert_service.dart';
import '../services/printer_service.dart';
import 'login_screen.dart';

const _kVersionesPrefsKey = 'comandas_version_impresa';

class CocinaScreen extends StatefulWidget {
  const CocinaScreen({super.key});

  @override
  State<CocinaScreen> createState() => _CocinaScreenState();
}

class _CocinaScreenState extends State<CocinaScreen> with SingleTickerProviderStateMixin {
  static const _pollInterval = Duration(seconds: 7);

  List<dynamic> _pendientes = [];
  // Guarda la última versión de cada comanda que ya se imprimió (en vez de solo
  // el ID) para poder detectar cuándo el mesero editó una comanda ya impresa
  // y así reimprimirla marcando explícitamente que es un cambio, no un pedido nuevo.
  final Map<int, int> _versionesImpresas = {};
  final Set<int> _imprimiendo = {};
  final Set<int> _enCola = {};
  final List<Map<String, dynamic>> _colaImpresion = [];
  bool _procesandoCola = false;
  final Set<int> _errorImpresion = {};
  final Map<int, String> _errorImpresionMensaje = {};
  final Set<int> _procesando = {};
  Timer? _pollTimer;
  bool _loading = true;
  String _nombreUsuario = '';
  EstadoPapel _estadoPapel = EstadoPapel.desconocido;
  bool _alertasActivadas = true;

  // --- Alerta de desconexión ---
  DateTime? _sinConexionDesde;
  int _pollsSinConexion = 0;
  Timer? _relojBannerTimer;
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    WakelockPlus.enable();
    _pulseController = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat(reverse: true);
    // Refresca el contador de "hace X" del banner de desconexión sin depender
    // del poll (que puede tardar en volver a intentar).
    _relojBannerTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_sinConexionDesde != null && mounted) setState(() {});
    });
    // Inicializa/vincula la impresora apenas se abre la pantalla, en vez de
    // esperar a que llegue la primera comanda (evita el primer intento fallido).
    PrinterService.init();
    _cargarNombreUsuario();
    _cargarPreferenciaAlertas();
    _iniciar();
  }

  Future<void> _cargarPreferenciaAlertas() async {
    final activado = await AlertService.estaActivado();
    if (!mounted) return;
    setState(() => _alertasActivadas = activado);
  }

  Future<void> _toggleAlertas() async {
    final nuevoValor = !_alertasActivadas;
    await AlertService.setActivado(nuevoValor);
    if (!mounted) return;
    setState(() => _alertasActivadas = nuevoValor);
    if (nuevoValor) {
      AlertService.nuevaComanda();
    }
  }

  Future<void> _iniciar() async {
    await _cargarImpresasPersistidas();
    _cargarPendientes();
    _chequearPapel();
    _pollTimer = Timer.periodic(_pollInterval, (_) {
      _cargarPendientes();
      _chequearPapel();
    });
  }

  Future<void> _cargarImpresasPersistidas() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kVersionesPrefsKey);
    if (raw == null) return;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      decoded.forEach((k, v) => _versionesImpresas[int.parse(k)] = v as int);
    } catch (_) {
      // Formato viejo o corrupto: se ignora y arranca de cero.
    }
  }

  Future<void> _guardarImpresasPersistidas() async {
    final prefs = await SharedPreferences.getInstance();
    final mapString = {for (final e in _versionesImpresas.entries) e.key.toString(): e.value};
    await prefs.setString(_kVersionesPrefsKey, jsonEncode(mapString));
  }

  Future<void> _chequearPapel() async {
    final estado = await PrinterService.getEstadoPapel();
    if (!mounted) return;
    setState(() => _estadoPapel = estado);
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _relojBannerTimer?.cancel();
    _pulseController.dispose();
    WakelockPlus.disable();
    super.dispose();
  }

  Future<void> _cargarNombreUsuario() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() => _nombreUsuario = prefs.getString('usuario_nombre') ?? '');
  }

  Future<void> _cargarPendientes() async {
    try {
      final res = await ApiConfig.get('/comandas/cocina/pendientes');
      if (res.statusCode != 200) throw Exception('Error del servidor (${res.statusCode})');

      final data = jsonDecode(res.body) as List<dynamic>;

      for (final comanda in data) {
        // Si todavía no se imprimió con éxito (o falló antes), se reintenta en cada poll.
        _encolarImpresion(Map<String, dynamic>.from(comanda));
      }

      // Ya no está pendiente en el servidor (se completó/rechazó): se puede
      // olvidar del registro persistido, así no crece sin límite.
      final idsPendientes = data.map((c) => c['id'] as int).toSet();
      final huerfanas = _versionesImpresas.keys.toSet().difference(idsPendientes);
      if (huerfanas.isNotEmpty) {
        for (final id in huerfanas) {
          _versionesImpresas.remove(id);
        }
        _guardarImpresasPersistidas();
      }

      if (!mounted) return;
      setState(() {
        _pendientes = data;
        _loading = false;
        _sinConexionDesde = null;
        _pollsSinConexion = 0;
      });
    } catch (e) {
      if (!mounted) return;
      final estabaConectado = _sinConexionDesde == null;
      setState(() {
        _loading = false;
        if (estabaConectado) _sinConexionDesde = DateTime.now();
      });
      if (estabaConectado) {
        _pollsSinConexion = 0;
        AlertService.sinConexion();
      } else {
        _pollsSinConexion++;
        // Repite la alerta cada ~35s mientras siga sin conexión, para que no
        // se pierda si nadie estaba mirando la pantalla en el primer aviso.
        if (_pollsSinConexion % 5 == 0) AlertService.sinConexion();
      }
    }
  }

  /// Encola una comanda para imprimir. La impresora térmica solo puede procesar
  /// un trabajo a la vez: si se disparan varias impresiones en paralelo, los
  /// comandos ESC/POS se intercalan y sale un ticket con las 3 comandas mezcladas.
  /// Por eso todo pasa por esta cola y se imprime de a una.
  void _encolarImpresion(Map<String, dynamic> comanda, {bool forzar = false}) {
    final id = comanda['id'] as int;
    final version = (comanda['version'] as int?) ?? 1;
    if (_enCola.contains(id)) return;
    if (!forzar && (_versionesImpresas[id] ?? 0) >= version) return;

    _enCola.add(id);
    _colaImpresion.add(comanda);
    if (!forzar) AlertService.nuevaComanda();
    _procesarCola();
  }

  Future<void> _procesarCola() async {
    if (_procesandoCola) return;
    _procesandoCola = true;
    try {
      while (_colaImpresion.isNotEmpty) {
        final comanda = _colaImpresion.removeAt(0);
        await _imprimirComanda(comanda);
      }
    } finally {
      _procesandoCola = false;
    }
  }

  Future<void> _imprimirComanda(Map<String, dynamic> comanda) async {
    final id = comanda['id'] as int;
    final numeroMostrado = (comanda['numero_comanda'] as int?) ?? id;
    setState(() {
      _imprimiendo.add(id);
      _errorImpresion.remove(id);
    });
    try {
      final itemsRaw = comanda['items'] as List<dynamic>? ?? [];
      final items = itemsRaw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      final fechaRaw = comanda['fecha_hora_cliente'] ?? comanda['fecha_creacion'];
      final version = (comanda['version'] as int?) ?? 1;
      // Si la comanda ya tiene más de una versión, es porque el mesero la editó
      // o pidió reimpresión: se marca explícitamente en el ticket como un cambio.
      final esEdicion = version > 1;
      await PrinterService.printComanda(
        comandaId: id,
        numeroComanda: comanda['numero_comanda'] as int?,
        mesa: comanda['mesa'].toString(),
        items: items,
        mesero: comanda['mesero_nombre']?.toString(),
        fechaHora: fechaRaw != null ? DateTime.tryParse(fechaRaw.toString())?.toLocal() : null,
        esEdicion: esEdicion,
        notasGenerales: comanda['notas']?.toString(),
      );
      _versionesImpresas[id] = version;
      _errorImpresionMensaje.remove(id);
      _guardarImpresasPersistidas();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('✅ Comanda #$numeroMostrado impresa'), duration: const Duration(seconds: 2)),
        );
      }
    } catch (e) {
      final mensaje = e.toString().replaceAll('Exception: ', '');
      debugPrint('Error al imprimir comanda $id: $e');
      if (mounted) {
        setState(() {
          _errorImpresion.add(id);
          _errorImpresionMensaje[id] = mensaje;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('❌ Comanda #$numeroMostrado: $mensaje'), duration: const Duration(seconds: 5)),
        );
      }
    } finally {
      _enCola.remove(id);
      if (mounted) setState(() => _imprimiendo.remove(id));
    }
  }

  Future<void> _actualizarEstado(int id, String estadoCocina) async {
    setState(() => _procesando.add(id));
    try {
      final res = await ApiConfig.put('/comandas/$id/estado-cocina', {'estado_cocina': estadoCocina});
      if (res.statusCode != 200) {
        final data = jsonDecode(res.body);
        throw Exception(data['error'] ?? 'Error al actualizar');
      }
      if (!mounted) return;
      setState(() {
        _pendientes.removeWhere((c) => c['id'] == id);
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString().replaceAll('Exception: ', '')}')),
      );
    } finally {
      if (mounted) setState(() => _procesando.remove(id));
    }
  }

  Future<void> _cerrarSesion() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (!mounted) return;
    Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        toolbarHeight: 64,
        title: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Cocina', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14, color: Colors.white70)),
            Text(_nombreUsuario, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          ],
        ),
        actions: [
          _buildIndicadorPapel(),
          const SizedBox(width: 8),
          IconButton(
            icon: Icon(_alertasActivadas ? Icons.notifications_active : Icons.notifications_off),
            color: _alertasActivadas ? Colors.white : Colors.white38,
            tooltip: _alertasActivadas ? 'Sonido y vibración activados' : 'Sonido y vibración desactivados',
            onPressed: _toggleAlertas,
          ),
          IconButton(icon: const Icon(Icons.logout), onPressed: _cerrarSesion),
        ],
      ),
      body: Column(
        children: [
          if (_sinConexionDesde != null) _buildBannerSinConexion(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFFF97316)))
                : RefreshIndicator(
                    onRefresh: _cargarPendientes,
                    child: _pendientes.isEmpty
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              SizedBox(height: MediaQuery.of(context).size.height * 0.35),
                              const Icon(Icons.check_circle_outline, size: 72, color: Colors.white24),
                              const SizedBox(height: 16),
                              const Center(
                                child: Text(
                                  'No hay comandas pendientes',
                                  style: TextStyle(color: Colors.white38, fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          )
                        : ListView.builder(
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: const EdgeInsets.all(12),
                            itemCount: _pendientes.length,
                            itemBuilder: (context, index) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _buildComandaCard(_pendientes[index]),
                            ),
                          ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildBannerSinConexion() {
    final segundos = DateTime.now().difference(_sinConexionDesde!).inSeconds;
    final tiempoTexto = segundos < 60 ? 'hace ${segundos}s' : 'hace ${(segundos / 60).floor()} min';

    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        final color = Color.lerp(const Color(0xFFB91C1C), const Color(0xFFEF4444), _pulseController.value)!;
        return Material(
          color: color,
          child: InkWell(
            onTap: _cargarPendientes,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
              child: SafeArea(
                bottom: false,
                child: Row(
                  children: [
                    const Icon(Icons.wifi_off_rounded, color: Colors.white, size: 30),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            '⚠️ SIN CONEXIÓN',
                            style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 0.3),
                          ),
                          Text(
                            'No se reciben comandas nuevas ($tiempoTexto) — revisa el internet',
                            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: _cargarPendientes,
                      icon: const Icon(Icons.refresh, color: Colors.white),
                      tooltip: 'Reintentar ahora',
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildIndicadorPapel() {
    late final Color color;
    late final IconData icono;
    late final String texto;

    switch (_estadoPapel) {
      case EstadoPapel.ok:
        color = Colors.green;
        icono = Icons.receipt_long;
        texto = 'Papel OK';
        break;
      case EstadoPapel.sinPapel:
        color = Colors.redAccent;
        icono = Icons.error_outline;
        texto = 'SIN PAPEL';
        break;
      case EstadoPapel.desconocido:
        color = Colors.white38;
        icono = Icons.help_outline;
        texto = 'Verificando...';
        break;
    }

    return GestureDetector(
      onTap: _chequearPapel,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icono, size: 14, color: color),
            const SizedBox(width: 6),
            Text(texto, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  String _formatearFechaHoraComanda(Map<String, dynamic> comanda) {
    final raw = comanda['fecha_hora_cliente'] ?? comanda['fecha_creacion'];
    final fecha = raw != null ? DateTime.tryParse(raw.toString())?.toLocal() : null;
    if (fecha == null) return '';
    String dos(int n) => n.toString().padLeft(2, '0');
    return '${dos(fecha.day)}/${dos(fecha.month)} ${dos(fecha.hour)}:${dos(fecha.minute)}';
  }

  Widget _buildComandaCard(Map<String, dynamic> comanda) {
    final id = comanda['id'] as int;
    final numeroComanda = (comanda['numero_comanda'] as int?) ?? id;
    final procesando = _procesando.contains(id);
    final enCola = _enCola.contains(id);
    final errorImpresion = _errorImpresion.contains(id);
    final itemsRaw = comanda['items'] as List<dynamic>? ?? [];
    final esEdicion = ((comanda['version'] as int?) ?? 1) > 1;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: esEdicion ? Colors.amber.withValues(alpha: 0.06) : Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          width: esEdicion ? 1.5 : 1,
          color: errorImpresion
              ? Colors.redAccent.withValues(alpha: 0.5)
              : (esEdicion ? Colors.amber.withValues(alpha: 0.6) : Colors.white.withValues(alpha: 0.08)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'MESA ${comanda['mesa']}',
                    style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900),
                  ),
                  Text(
                    'Comanda #$numeroComanda',
                    style: const TextStyle(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              Row(
                children: [
                  if (enCola)
                    const Padding(
                      padding: EdgeInsets.only(right: 8),
                      child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white38)),
                    ),
                  IconButton(
                    onPressed: enCola ? null : () => _encolarImpresion(comanda, forzar: true),
                    icon: Icon(Icons.print, size: 20, color: errorImpresion ? Colors.redAccent : Colors.white38),
                    tooltip: 'Reimprimir',
                    visualDensity: VisualDensity.compact,
                  ),
                  if (esEdicion)
                    Container(
                      margin: const EdgeInsets.only(right: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text('MODIFICADO', style: TextStyle(color: Colors.amber, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF97316).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('PENDIENTE', style: TextStyle(color: Color(0xFFF97316), fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ],
          ),
          if (esEdicion)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.amber.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                '⚠️ PEDIDO MODIFICADO — revisa los productos, cambió desde la última vez',
                style: TextStyle(color: Colors.amber, fontSize: 13, fontWeight: FontWeight.w900),
              ),
            ),
          if ((comanda['mesero_nombre'] ?? '').toString().isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                'Mesero: ${comanda['mesero_nombre']}',
                style: const TextStyle(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              _formatearFechaHoraComanda(comanda),
              style: const TextStyle(color: Colors.white70, fontSize: 15, fontWeight: FontWeight.w700),
            ),
          ),
          if (errorImpresion)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                '⚠️ No se pudo imprimir: ${_errorImpresionMensaje[id] ?? 'error desconocido'}',
                style: const TextStyle(color: Colors.redAccent, fontSize: 11, fontWeight: FontWeight.bold),
              ),
            ),
          const Divider(color: Colors.white12, height: 20),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: itemsRaw.map((item) {
              final m = item as Map;
              final notaItem = (m['notas'] as String?) ?? '';
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${m['cantidad']} x ${m['nombre']}',
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                    if (notaItem.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 8, top: 2),
                        child: Text(
                          '📝 $notaItem',
                          style: const TextStyle(color: Colors.amber, fontSize: 16, fontWeight: FontWeight.w700, fontStyle: FontStyle.italic),
                        ),
                      ),
                  ],
                ),
              );
            }).toList(),
          ),
          if ((comanda['notas'] as String?)?.isNotEmpty == true)
            Container(
              margin: const EdgeInsets.only(top: 4, bottom: 4),
              padding: const EdgeInsets.all(10),
              width: double.infinity,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '📝 Nota del pedido: ${comanda['notas']}',
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700, fontStyle: FontStyle.italic),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: procesando ? null : () => _actualizarEstado(id, 'RECHAZADA'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.redAccent,
                    side: const BorderSide(color: Colors.redAccent),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: const Text('Rechazar', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  onPressed: procesando ? null : () => _actualizarEstado(id, 'COMPLETADA'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                  child: procesando
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Completada', style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
