import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../widgets/pulsing_coffee_loader.dart';

class AsistenciaScreen extends StatefulWidget {
  const AsistenciaScreen({super.key});

  @override
  State<AsistenciaScreen> createState() => _AsistenciaScreenState();
}

class _AsistenciaScreenState extends State<AsistenciaScreen> {
  bool _isAdmin = false;
  int _userId = 0;
  String _userRol = '';
  bool _isLoading = true;
  List<dynamic> _historial = [];

  // Filtros de Admin
  String _filtroMes = '';
  String _filtroAnio = '';
  List<dynamic> _empleados = [];
  String _filtroEmpleadoId = '';
  String _qrToken = '';

  @override
  void initState() {
    super.initState();
    _filtroMes = DateTime.now().month.toString();
    _filtroAnio = DateTime.now().year.toString();
    _loadUserSession().then((_) {
      _cargarDatos();
    });
  }

  Future<void> _loadUserSession() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userId = prefs.getInt('usuario_id') ?? 0;
      _userRol = prefs.getString('usuario_rol') ?? 'CAJERO';
      _isAdmin = _userRol.toUpperCase() == 'ADMIN' || _userRol.toUpperCase() == 'ADMINISTRADOR';
    });
  }

  Future<void> _cargarDatos() async {
    setState(() => _isLoading = true);
    try {
      if (_isAdmin) {
        // Cargar empleados para el dropdown
        final empRes = await ApiConfig.get('/parametros/usuarios');
        if (empRes.statusCode == 200) {
          _empleados = jsonDecode(empRes.body);
        }
        
        // Cargar token QR desde el servidor seguro
        final tokenRes = await ApiConfig.get('/asistencia/qr-token?usuario_id=$_userId');
        if (tokenRes.statusCode == 200) {
          final tokenData = jsonDecode(tokenRes.body);
          if (tokenData['success'] == true) {
            _qrToken = tokenData['token'] ?? '';
          }
        }
        
        // Cargar historial completo filtrado
        await _cargarHistorialAdmin();
      } else {
        // Cargar historial personal
        final res = await ApiConfig.get('/asistencia/mi-historial/$_userId');
        if (res.statusCode == 200) {
          _historial = jsonDecode(res.body);
        }
      }
    } catch (e) {
      print('Error al cargar datos de asistencia: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _cargarHistorialAdmin() async {
    String query = '/asistencia?anio=$_filtroAnio';
    if (_filtroMes.isNotEmpty) query += '&mes=$_filtroMes';
    if (_filtroEmpleadoId.isNotEmpty) query += '&usuario_id=$_filtroEmpleadoId';

    final res = await ApiConfig.get(query);
    if (res.statusCode == 200) {
      setState(() {
        _historial = jsonDecode(res.body);
      });
    }
  }

  // Genera el token esperado de hoy en Bolivia (GMT-4)
  String _getTodayToken() {
    final ahora = DateTime.now().toUtc().subtract(const Duration(hours: 4));
    final yyyy = ahora.year;
    final mm = ahora.month.toString().padLeft(2, '0');
    final dd = ahora.day.toString().padLeft(2, '0');
    return 'asistencia_${yyyy}_${mm}_${dd}';
  }

  // Formateador de fecha local amigable
  String _getFechaLegible() {
    final ahora = DateTime.now().toUtc().subtract(const Duration(hours: 4));
    final format = DateFormat('EEEE d \'de\' MMMM, yyyy', 'es_ES');
    return format.format(ahora);
  }

  Future<void> _abrirEscaneo() async {
    if (!mounted) return;
    // Pequeño delay para que Android tenga lista la cámara antes de inicializar
    // el MobileScannerController. Sin esto aparece "Called state before initializing".
    await Future.delayed(const Duration(milliseconds: 350));
    if (!mounted) return;
    final tokenEscaneado = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (context) => const QrScannerScreen()),
    );
    if (tokenEscaneado != null) {
      _registrarAsistencia(tokenEscaneado);
    }
  }

  Future<void> _registrarAsistencia(String token) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.post('/asistencia/marcar', {
        'usuario_id': _userId,
        'token': token,
      });

      if (!mounted) return;

      final data = jsonDecode(res.body);

      if (res.statusCode == 200 && data['success'] == true) {
        _mostrarAlertaExito(data['mensaje'], data['detalles'], data['tipo'] == 'ENTRADA');
        _cargarDatos(); // Recargar historial
      } else {
        _mostrarAlertaError(data['error'] ?? 'Error al procesar el código QR.');
      }
    } catch (e) {
      _mostrarAlertaError('Error de conexión con el servidor. Reintenta de nuevo.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _mostrarAlertaExito(String titulo, String detalles, bool esEntrada) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: AppTheme.secondaryDark,
        title: Column(
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                color: Colors.green.withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Icon(
                esEntrada ? Icons.login : Icons.logout,
                size: 28,
                color: Colors.greenAccent,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              esEntrada ? '¡Entrada Registrada!' : '¡Salida Registrada!',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.white),
              textAlign: TextAlign.center,
            ),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              titulo,
              style: GoogleFonts.outfit(fontSize: 13, color: AppTheme.textLight),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              detalles,
              style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
          ],
        ),
        actions: [
          Center(
            child: SizedBox(
              width: 120,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentColor,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                ),
                child: Text('OK', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
              ),
            ),
          )
        ],
      ),
    );
  }

  void _mostrarAlertaError(String error) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: AppTheme.secondaryDark,
        title: Column(
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: BoxDecoration(
                color: Colors.red.withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const Icon(
                Icons.error_outline,
                size: 28,
                color: Colors.redAccent,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'No se pudo registrar',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.white),
              textAlign: TextAlign.center,
            ),
          ],
        ),
        content: Text(
          error,
          style: GoogleFonts.outfit(fontSize: 13, color: AppTheme.textLight),
          textAlign: TextAlign.center,
        ),
        actions: [
          Center(
            child: SizedBox(
              width: 120,
              child: ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryDark,
                  side: const BorderSide(color: AppTheme.borderDark),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                ),
                child: Text('Cerrar', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: AppTheme.textLight)),
              ),
            ),
          )
        ],
      ),
    );
  }

  Future<void> _confirmarEliminar(int id) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: AppTheme.secondaryDark,
        title: Text(
          '¿Eliminar marcación?',
          style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        content: Text(
          '¿Estás seguro de que deseas eliminar este registro de asistencia? Esta acción no se puede deshacer.',
          style: GoogleFonts.outfit(color: AppTheme.textLight, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text('Cancelar', style: GoogleFonts.outfit(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.redAccent,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text('Eliminar', style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmar == true) {
      _eliminarRegistro(id);
    }
  }

  Future<void> _eliminarRegistro(int id) async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.delete('/asistencia/$id');

      if (!mounted) return;

      final data = jsonDecode(res.body);

      if (res.statusCode == 200 && data['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data['mensaje'] ?? 'Registro de asistencia eliminado.'),
            backgroundColor: Colors.green,
          ),
        );
        _cargarDatos();
      } else {
        _mostrarAlertaError(data['error'] ?? 'Error al eliminar el registro.');
      }
    } catch (e) {
      _mostrarAlertaError('Error de conexión al eliminar la marcación.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FaIcon(FontAwesomeIcons.userClock, size: 16, color: AppTheme.accentColor),
            const SizedBox(width: 8),
            Text(
              'Control Asistencia',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: PulsingCoffeeLoader(message: 'Cargando asistencia...'))
          : _isAdmin
              ? _buildAdminView()
              : _buildEmployeeView(),
    );
  }

  // VISTA PARA ADMINISTRADORES
  Widget _buildAdminView() {
    return Column(
      children: [
        // Tarjeta del Código QR
        Container(
          width: double.infinity,
          margin: const EdgeInsets.all(16.0),
          padding: const EdgeInsets.all(20.0),
          decoration: BoxDecoration(
            color: AppTheme.secondaryDark,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withOpacity(0.04)),
          ),
          child: Column(
            children: [
              Text(
                'Código QR de Hoy',
                style: GoogleFonts.outfit(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
              ),
              const SizedBox(height: 4),
              Text(
                _getFechaLegible(),
                style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.accentColor, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              Container(
                width: 180,
                height: 180,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Image.network(
                  'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${_qrToken.isNotEmpty ? _qrToken : _getTodayToken()}',
                  fit: BoxFit.contain,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Muestra este QR a los empleados en sus turnos.',
                style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),

        // Filtros no-print en App
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _filtroEmpleadoId.isEmpty ? null : _filtroEmpleadoId,
                  dropdownColor: AppTheme.secondaryDark,
                  decoration: InputDecoration(
                    labelText: 'Empleado',
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: [
                    const DropdownMenuItem(value: null, child: Text('Todos')),
                    ..._empleados.map((u) => DropdownMenuItem(
                      value: u['id'].toString(),
                      child: Text(u['nombre'] as String),
                    )),
                  ],
                  onChanged: (val) {
                    setState(() {
                      _filtroEmpleadoId = val ?? '';
                    });
                    _cargarHistorialAdmin();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _filtroMes,
                  dropdownColor: AppTheme.secondaryDark,
                  decoration: InputDecoration(
                    labelText: 'Mes',
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  items: const [
                    DropdownMenuItem(value: '', child: Text('Todos')),
                    DropdownMenuItem(value: '1', child: Text('Ene')),
                    DropdownMenuItem(value: '2', child: Text('Feb')),
                    DropdownMenuItem(value: '3', child: Text('Mar')),
                    DropdownMenuItem(value: '4', child: Text('Abr')),
                    DropdownMenuItem(value: '5', child: Text('May')),
                    DropdownMenuItem(value: '6', child: Text('Jun')),
                    DropdownMenuItem(value: '7', child: Text('Jul')),
                    DropdownMenuItem(value: '8', child: Text('Ago')),
                    DropdownMenuItem(value: '9', child: Text('Sep')),
                    DropdownMenuItem(value: '10', child: Text('Oct')),
                    DropdownMenuItem(value: '11', child: Text('Nov')),
                    DropdownMenuItem(value: '12', child: Text('Dic')),
                  ],
                  onChanged: (val) {
                    setState(() {
                      _filtroMes = val ?? '';
                    });
                    _cargarHistorialAdmin();
                  },
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // Listado de asistencias de empleados
        Expanded(
          child: _historial.isEmpty
              ? Center(
                  child: Text(
                    'No hay registros de asistencia.',
                    style: GoogleFonts.outfit(color: AppTheme.textMuted),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _historial.length,
                  itemBuilder: (context, index) {
                    final r = _historial[index];
                    final hasSalida = r['salida'] != null;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    r['empleado'] ?? 'Empleado',
                                    style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13.5),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'Fecha: ${_formatearFechaIso(r['fecha'])}',
                                    style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted),
                                  ),
                                  const SizedBox(height: 6),
                                  Row(
                                    children: [
                                      const Icon(Icons.login, size: 10, color: Colors.greenAccent),
                                      const SizedBox(width: 4),
                                      Text(
                                        'Entrada: ${r['entrada']}',
                                        style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textLight),
                                      ),
                                      const SizedBox(width: 12),
                                      Icon(Icons.logout, size: 10, color: hasSalida ? Colors.redAccent : Colors.grey),
                                      const SizedBox(width: 4),
                                      Text(
                                        'Salida: ${hasSalida ? r['salida'] : 'Pendiente'}',
                                        style: GoogleFonts.outfit(
                                          fontSize: 11,
                                          color: hasSalida ? AppTheme.textLight : Colors.greenAccent,
                                          fontWeight: hasSalida ? FontWeight.normal : FontWeight.bold,
                                        ),
                                      ),
                                    ],
                                  )
                                ],
                              ),
                            ),
                            if (r['horas_trabajadas'] != null) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppTheme.accentColor.withOpacity(0.08),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: AppTheme.accentColor.withOpacity(0.2)),
                                ),
                                child: Column(
                                  children: [
                                    Text(
                                      double.parse(r['horas_trabajadas'].toString()).toStringAsFixed(2),
                                      style: GoogleFonts.outfit(fontWeight: FontWeight.w900, color: AppTheme.accentColor, fontSize: 14),
                                    ),
                                    Text(
                                      'horas',
                                      style: GoogleFonts.outfit(fontSize: 9, color: AppTheme.textMuted),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            const SizedBox(width: 8),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 20),
                              onPressed: () => _confirmarEliminar(int.parse(r['id'].toString())),
                              tooltip: 'Eliminar Registro',
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  // VISTA PARA EMPLEADOS (CAJEROS / BARISTAS)
  Widget _buildEmployeeView() {
    // Determinar si hay un turno abierto
    final tieneTurnoAbierto = _historial.isNotEmpty && _historial[0]['salida'] == null;

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          // Banner de Estado
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: tieneTurnoAbierto ? Colors.green.withOpacity(0.08) : AppTheme.secondaryDark,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: tieneTurnoAbierto ? Colors.green.withOpacity(0.2) : Colors.white.withOpacity(0.04),
              ),
            ),
            child: Column(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: tieneTurnoAbierto ? Colors.green.withOpacity(0.15) : AppTheme.accentColor.withOpacity(0.15),
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: FaIcon(
                    tieneTurnoAbierto ? FontAwesomeIcons.solidClock : FontAwesomeIcons.clock,
                    color: tieneTurnoAbierto ? Colors.greenAccent : AppTheme.accentColor,
                    size: 16,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  tieneTurnoAbierto ? 'TURNO ACTIVO ACTUALMENTE' : 'TURNO CERRADO',
                  style: GoogleFonts.outfit(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    color: tieneTurnoAbierto ? Colors.greenAccent : AppTheme.accentColor,
                    letterSpacing: 1.0,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  tieneTurnoAbierto 
                      ? 'Iniciaste sesión hoy a las ${_historial[0]['entrada']}. Escanea el QR para registrar tu salida.'
                      : 'No has marcado entrada hoy. Escanea el QR del mostrador para registrar tu ingreso.',
                  style: GoogleFonts.outfit(fontSize: 12, color: AppTheme.textMuted),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // Botón Escanear QR
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: _abrirEscaneo,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accentColor,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              icon: const FaIcon(FontAwesomeIcons.camera, size: 16, color: Colors.white),
              label: Text(
                tieneTurnoAbierto ? 'ESCANEAR SALIDA' : 'ESCANEAR ENTRADA',
                style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white, letterSpacing: 0.5),
              ),
            ),
          ),

          if (_userRol.toUpperCase() != 'CAJERO') ...[
            const SizedBox(height: 24),
            // Historial Personal
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Mis Marcaciones Recientes (Últimos 30 días)',
                style: GoogleFonts.outfit(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
              ),
            ),
            const SizedBox(height: 10),

            Expanded(
              child: _historial.isEmpty
                  ? Center(
                      child: Text(
                        'No tienes registros de marcaciones.',
                        style: GoogleFonts.outfit(color: AppTheme.textMuted),
                      ),
                    )
                  : ListView.builder(
                      itemCount: _historial.length,
                      itemBuilder: (context, index) {
                        final r = _historial[index];
                        final hasSalida = r['salida'] != null;

                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            title: Text(
                              'Fecha: ${r['fecha']}',
                              style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4.0),
                              child: Row(
                                children: [
                                  const Icon(Icons.login, size: 10, color: Colors.greenAccent),
                                  const SizedBox(width: 4),
                                  Text('Entrada: ${r['entrada']}', style: GoogleFonts.outfit(fontSize: 11)),
                                  const SizedBox(width: 14),
                                  Icon(Icons.logout, size: 10, color: hasSalida ? Colors.redAccent : Colors.grey),
                                  const SizedBox(width: 4),
                                  Text(
                                    'Salida: ${hasSalida ? r['salida'] : 'Pendiente'}',
                                    style: GoogleFonts.outfit(
                                      fontSize: 11,
                                      color: hasSalida ? AppTheme.textLight : Colors.greenAccent,
                                      fontWeight: hasSalida ? FontWeight.normal : FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            trailing: r['horas_trabajadas'] != null
                                ? Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    children: [
                                      Text(
                                        '${double.parse(r['horas_trabajadas'].toString()).toStringAsFixed(2)} hrs',
                                        style: GoogleFonts.outfit(fontWeight: FontWeight.w900, color: AppTheme.accentColor, fontSize: 12),
                                      ),
                                      Text('Trabajado', style: GoogleFonts.outfit(fontSize: 8, color: AppTheme.textMuted)),
                                    ],
                                  )
                                : const Icon(Icons.lock_clock, size: 18, color: Colors.grey),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ],
      ),
    );
  }

  // Convierte fecha ISO YYYY-MM-DD a formato amigable DD/MM/YYYY
  String _formatearFechaIso(String? fechaIso) {
    if (fechaIso == null) return '';
    final partes = fechaIso.split('-');
    if (partes.length < 3) return fechaIso;
    return '${partes[2]}/${partes[1]}/${partes[0]}';
  }
}

// ----------------------------------------------------
// PANTALLA SECUNDARIA: LECTOR DE CÁMARA (QR SCANNER)
// ----------------------------------------------------
class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  bool _detected = false;
  int _retryKey = 0; // Incrementar fuerza rebuild del MobileScanner

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: Text(
          'Escanear QR Asistencia',
          style: GoogleFonts.outfit(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          // MobileScanner sin controller externo — maneja su propio ciclo de vida
          MobileScanner(
            key: ValueKey(_retryKey),
            onDetect: (capture) {
              if (_detected) return;
              final List<Barcode> barcodes = capture.barcodes;
              for (final barcode in barcodes) {
                if (barcode.rawValue != null) {
                  _detected = true;
                  Navigator.pop(context, barcode.rawValue!);
                  break;
                }
              }
            },
          ),

          // Marco de enfoque visual
          Center(
            child: Container(
              width: 260,
              height: 260,
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.accentColor, width: 3),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),

          // Texto guía
          Positioned(
            bottom: 60,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.75),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  'Apunta la cámara al código QR de asistencia',
                  style: GoogleFonts.outfit(color: Colors.white, fontSize: 13),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

