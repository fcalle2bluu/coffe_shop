// CONTROL DIARIO
//
// El encargado de cocina o de barra elige su lista, pone cuánto deja de cada
// producto y lo envía. El administrador lo recibe acá mismo y lo marca
// comprobado. Es la misma pantalla que la web, con los mismos endpoints.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';

const _naranjaCocina = Color(0xFFFB923C);
const _celesteBarra = Color(0xFF38BDF8);

class ControlDiarioScreen extends StatefulWidget {
  const ControlDiarioScreen({super.key});
  @override
  State<ControlDiarioScreen> createState() => _ControlDiarioScreenState();
}

class _ControlDiarioScreenState extends State<ControlDiarioScreen> {
  bool _cargando = true;
  bool _enviando = false;
  bool _esAdmin = false;

  // Cuando hay una lista elegida se muestra el conteo; si es null, el inicio.
  String? _lista;
  List<dynamic> _items = [];
  List<String> _unidades = ['Unidad'];
  final Map<int, TextEditingController> _cantidades = {};
  final Map<int, String> _unidadElegida = {};
  final TextEditingController _nota = TextEditingController();

  List<dynamic> _bandeja = [];
  String _filtroBandeja = 'ENVIADO';

  // Lo vendido hoy de los productos vinculados a la lista. Solo para el admin
  // y solo para mirar: no descuenta stock ni toca el inventario.
  Map<String, dynamic>? _vendidoHoy;

  @override
  void initState() {
    super.initState();
    _inicializar();
  }

  @override
  void dispose() {
    for (final c in _cantidades.values) {
      c.removeListener(_repintar);
      c.dispose();
    }
    _nota.dispose();
    super.dispose();
  }

  Future<void> _inicializar() async {
    final prefs = await SharedPreferences.getInstance();
    final rol = (prefs.getString('usuario_rol') ?? '').toUpperCase();
    _esAdmin = rol.startsWith('ADMIN');
    await _cargarBandeja();
    if (_esAdmin) await _cargarVendidoHoy();
    if (mounted) setState(() => _cargando = false);
  }

  void _repintar() {
    if (mounted) setState(() {});
  }

  void _avisar(String texto, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(texto),
      backgroundColor: error ? Colors.red.shade700 : Colors.green.shade700,
    ));
  }

  // ------------------------------------------------------------- cargar lista
  Future<void> _abrirLista(String lista) async {
    setState(() => _cargando = true);
    try {
      final res = await ApiConfig.get('/control-diario/plantilla?lista=$lista');
      if (res.statusCode != 200) throw Exception(jsonDecode(res.body)['error'] ?? 'Error ${res.statusCode}');
      final d = jsonDecode(res.body);
      for (final c in _cantidades.values) {
        c.removeListener(_repintar);
        c.dispose();
      }
      _cantidades.clear();
      _unidadElegida.clear();
      _items = d['items'] as List<dynamic>;
      _unidades = ((d['unidades'] as List<dynamic>?) ?? ['Unidad']).map((e) => e.toString()).toList();
      for (var i = 0; i < _items.length; i++) {
        // El listener repinta al escribir: así el renglón se marca como cargado,
        // avanza la barra de arriba y el botón dice cuántos va a enviar.
        _cantidades[i] = TextEditingController()..addListener(_repintar);
        _unidadElegida[i] = (_items[i]['unidad_sugerida'] ?? 'Unidad').toString();
      }
      _nota.clear();
      setState(() {
        _lista = lista;
        _cargando = false;
      });
    } catch (e) {
      setState(() => _cargando = false);
      _avisar('No se pudo cargar la lista: $e', error: true);
    }
  }

  Future<void> _cargarBandeja() async {
    try {
      final ruta = _esAdmin
          ? '/control-diario/reportes${_filtroBandeja.isEmpty ? '' : '?estado=$_filtroBandeja'}'
          : '/control-diario/reportes/mios';
      final res = await ApiConfig.get(ruta);
      if (res.statusCode == 200 && mounted) {
        setState(() => _bandeja = jsonDecode(res.body));
      }
    } catch (_) {
      // La bandeja es secundaria: si falla, la pantalla igual sirve para enviar.
    }
  }

  Future<void> _cargarVendidoHoy() async {
    try {
      final res = await ApiConfig.get('/control-diario/vendido-hoy');
      if (res.statusCode == 200 && mounted) {
        setState(() => _vendidoHoy = jsonDecode(res.body) as Map<String, dynamic>);
      }
    } catch (_) {
      // Es un panel de referencia: si no carga, el resto de la pantalla anda igual.
    }
  }

  // ------------------------------------------------------------------- enviar
  Future<void> _enviar() async {
    final items = <Map<String, dynamic>>[];
    for (var i = 0; i < _items.length; i++) {
      final texto = _cantidades[i]!.text.trim().replaceAll(',', '.');
      final cantidad = double.tryParse(texto) ?? 0;
      if (cantidad > 0) {
        items.add({
          'nombre': _items[i]['nombre'],
          'cantidad': cantidad,
          'unidad': _unidadElegida[i] ?? 'Unidad',
        });
      }
    }
    if (items.isEmpty) {
      _avisar('Poné la cantidad de al menos un producto antes de enviar.', error: true);
      return;
    }

    setState(() => _enviando = true);
    try {
      final res = await ApiConfig.post('/control-diario/reportes', {
        'lista': _lista,
        'nota': _nota.text.trim(),
        'items': items,
      });
      final d = jsonDecode(res.body);
      if (res.statusCode != 201) throw Exception(d['error'] ?? 'Error ${res.statusCode}');
      _avisar('${d['mensaje']}  (${d['productos']} producto(s))');
      setState(() {
        _lista = null;
        _enviando = false;
      });
      await _cargarBandeja();
    } catch (e) {
      setState(() => _enviando = false);
      _avisar('No se pudo enviar: $e', error: true);
    }
  }

  Future<void> _comprobar(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: AppTheme.secondaryDark,
        title: const Text('¿Marcar como comprobado?', style: TextStyle(color: Colors.white)),
        content: const Text('El encargado va a ver que ya lo revisaste.',
            style: TextStyle(color: AppTheme.textMuted)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Comprobar')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      final res = await ApiConfig.put('/control-diario/reportes/$id/comprobar', {});
      if (res.statusCode != 200) throw Exception(jsonDecode(res.body)['error'] ?? 'Error ${res.statusCode}');
      _avisar('Comprobado.');
      await _cargarBandeja();
    } catch (e) {
      _avisar('No se pudo comprobar: $e', error: true);
    }
  }

  // ------------------------------------------------- agregar producto a lista
  Future<void> _agregarProducto() async {
    final nombre = TextEditingController();
    var unidad = _unidades.first;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setDlg) => AlertDialog(
          backgroundColor: AppTheme.secondaryDark,
          title: const Text('Agregar producto', style: TextStyle(color: Colors.white)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              controller: nombre,
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(labelText: 'Nombre', labelStyle: TextStyle(color: AppTheme.textMuted)),
            ),
            const SizedBox(height: 12),
            // Las unidades son atajos: se puede escribir una propia y queda
            // guardada para la próxima vez que se abra la lista.
            DropdownButtonFormField<String>(
              value: unidad,
              dropdownColor: AppTheme.secondaryDark,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(labelText: 'Unidad', labelStyle: TextStyle(color: AppTheme.textMuted)),
              items: [
                ..._unidades.map((u) => DropdownMenuItem(value: u, child: Text(u))),
                const DropdownMenuItem(value: '__otra__', child: Text('Otra…')),
              ],
              onChanged: (v) async {
                if (v == '__otra__') {
                  final propia = await _pedirUnidadPropia();
                  if (propia != null && propia.isNotEmpty) {
                    setDlg(() {
                      if (!_unidades.contains(propia)) _unidades.add(propia);
                      unidad = propia;
                    });
                  }
                } else if (v != null) {
                  setDlg(() => unidad = v);
                }
              },
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
            TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Agregar')),
          ],
        ),
      ),
    );
    if (ok != true || nombre.text.trim().isEmpty) return;
    try {
      final res = await ApiConfig.post('/control-diario/plantilla', {
        'lista': _lista,
        'nombre': nombre.text.trim(),
        'unidad_sugerida': unidad,
      });
      if (res.statusCode != 201) throw Exception(jsonDecode(res.body)['error'] ?? 'Error ${res.statusCode}');
      await _abrirLista(_lista!);
      _avisar('Producto agregado a la lista.');
    } catch (e) {
      _avisar('No se pudo agregar: $e', error: true);
    }
  }

  Future<String?> _pedirUnidadPropia() {
    final c = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.secondaryDark,
        title: const Text('Nueva unidad', style: TextStyle(color: Colors.white)),
        content: TextField(
          controller: c,
          autofocus: true,
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(hintText: 'Ej: Jarra', hintStyle: TextStyle(color: AppTheme.textMuted)),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          TextButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('Usar')),
        ],
      ),
    );
  }

  // -------------------------------------------------------------------- vista
  @override
  Widget build(BuildContext context) {
    if (_cargando) return const Center(child: CircularProgressIndicator(color: AppTheme.accentColor));
    return _lista == null ? _vistaInicio() : _vistaConteo();
  }

  Widget _vistaInicio() {
    return RefreshIndicator(
      onRefresh: () async {
        await _cargarBandeja();
        if (_esAdmin) await _cargarVendidoHoy();
      },
      color: AppTheme.accentColor,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('¿Qué vas a registrar?',
              style: GoogleFonts.outfit(color: AppTheme.textLight, fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 12),
          _tarjetaLista('COCINA', 'Cocina', Icons.soup_kitchen_rounded, _naranjaCocina),
          const SizedBox(height: 10),
          _tarjetaLista('BARRA', 'Barra', Icons.local_cafe_rounded, _celesteBarra),
          const SizedBox(height: 24),
          Row(children: [
            Expanded(
              child: Text(_esAdmin ? 'Controles recibidos' : 'Lo que enviaste',
                  style: GoogleFonts.outfit(color: AppTheme.textLight, fontWeight: FontWeight.w700, fontSize: 16)),
            ),
            if (_esAdmin)
              DropdownButton<String>(
                value: _filtroBandeja,
                dropdownColor: AppTheme.secondaryDark,
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                underline: const SizedBox.shrink(),
                items: const [
                  DropdownMenuItem(value: 'ENVIADO', child: Text('Sin comprobar')),
                  DropdownMenuItem(value: '', child: Text('Todos')),
                ],
                onChanged: (v) {
                  setState(() => _filtroBandeja = v ?? 'ENVIADO');
                  _cargarBandeja();
                },
              ),
          ]),
          const SizedBox(height: 8),
          if (_bandeja.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('No hay nada acá todavía.', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            )
          else
            ..._bandeja.map(_filaBandeja),
          if (_esAdmin) ..._panelVendidoHoy(),
        ],
      ),
    );
  }

  // ------------------------------------------------- vendido hoy (solo admin)
  // El panel vive en su propio widget, acá abajo: así se puede probar solo,
  // sin levantar la pantalla entera ni el servidor.
  List<Widget> _panelVendidoHoy() {
    if (_vendidoHoy == null) return [];
    return [PanelVendidoHoy(datos: _vendidoHoy!)];
  }

  Widget _tarjetaLista(String clave, String titulo, IconData icono, Color color) {
    return InkWell(
      onTap: () => _abrirLista(clave),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.secondaryDark,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: color.withOpacity(0.4)),
        ),
        child: Row(children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(14)),
            child: Icon(icono, color: color),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(titulo,
                style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
          ),
          const Icon(Icons.chevron_right_rounded, color: AppTheme.textMuted),
        ]),
      ),
    );
  }

  Widget _filaBandeja(dynamic r) {
    final esCocina = r['lista'] == 'COCINA';
    final color = esCocina ? _naranjaCocina : _celesteBarra;
    final comprobado = r['estado'] == 'COMPROBADO';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.secondaryDark,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderDark),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(8)),
          child: Text(esCocina ? 'Cocina' : 'Barra',
              style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w800)),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (_esAdmin)
              Text('${r['usuario_nombre'] ?? ''}',
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700)),
            Text('${r['productos']} producto(s)',
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
          ]),
        ),
        if (comprobado)
          const Icon(Icons.verified_rounded, color: Colors.greenAccent, size: 20)
        else if (_esAdmin)
          TextButton(
            onPressed: () => _comprobar(r['id'] as int),
            style: TextButton.styleFrom(backgroundColor: Colors.green.shade700, foregroundColor: Colors.white),
            child: const Text('Comprobar', style: TextStyle(fontSize: 12)),
          )
        else
          const Text('Esperando', style: TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.w700)),
      ]),
    );
  }

  // Cuántos renglones ya tienen cantidad. Sirve para el contador del encabezado
  // y para saber si el botón de enviar tiene algo que mandar.
  int get _cargados {
    var n = 0;
    for (final c in _cantidades.values) {
      if ((double.tryParse(c.text.trim().replaceAll(',', '.')) ?? 0) > 0) n++;
    }
    return n;
  }

  Widget _vistaConteo() {
    // En cocina la unidad es siempre "Unidad": el dueño lo pidió así, y mostrar
    // un selector de un solo valor solo estorba en una pantalla chica.
    final soloUnidad = _lista == 'COCINA';
    final color = soloUnidad ? _naranjaCocina : _celesteBarra;
    final cargados = _cargados;

    return Column(children: [
      // ---------------------------------------------------------- encabezado
      Container(
        padding: const EdgeInsets.fromLTRB(4, 10, 10, 10),
        decoration: BoxDecoration(
          color: AppTheme.secondaryDark,
          border: Border(bottom: BorderSide(color: color.withOpacity(0.35), width: 2)),
        ),
        child: Row(children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
            onPressed: () => setState(() => _lista = null),
          ),
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
            child: Icon(soloUnidad ? Icons.soup_kitchen_rounded : Icons.local_cafe_rounded, color: color, size: 19),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(soloUnidad ? 'Cocina' : 'Barra',
                  style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17, height: 1.1)),
              Text('$cargados de ${_items.length} cargados',
                  style: TextStyle(color: cargados == 0 ? AppTheme.textMuted : color, fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
          ),
          // Agregar producto: con texto, que un "+" solo no se entiende.
          TextButton.icon(
            onPressed: _agregarProducto,
            style: TextButton.styleFrom(
              foregroundColor: color,
              backgroundColor: color.withOpacity(0.12),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            icon: const Icon(Icons.add_rounded, size: 16),
            label: const Text('Producto', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ),
        ]),
      ),

      // Barrita de avance: de un vistazo se ve cuánto falta.
      SizedBox(
        height: 3,
        child: LinearProgressIndicator(
          value: _items.isEmpty ? 0 : cargados / _items.length,
          backgroundColor: AppTheme.borderDark,
          valueColor: AlwaysStoppedAnimation(color),
        ),
      ),

      // ------------------------------------------------------------ renglones
      Expanded(
        child: ListView.separated(
          padding: const EdgeInsets.only(bottom: 8),
          itemCount: _items.length + 1,
          separatorBuilder: (_, i) => i < _items.length - 1
              ? Divider(height: 1, thickness: 1, color: AppTheme.borderDark.withOpacity(0.6), indent: 48)
              : const SizedBox.shrink(),
          itemBuilder: (context, i) => i == _items.length
              ? _campoNota()
              : _renglon(i, soloUnidad, color),
        ),
      ),

      // -------------------------------------------------------------- enviar
      Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        decoration: BoxDecoration(
          color: AppTheme.secondaryDark,
          border: Border(top: BorderSide(color: AppTheme.borderDark)),
        ),
        child: SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: (_enviando || cargados == 0) ? null : _enviar,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green.shade700,
              disabledBackgroundColor: AppTheme.borderDark,
              padding: const EdgeInsets.symmetric(vertical: 15),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            icon: _enviando
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            // El botón dice cuántos va a mandar: así nadie envía creyendo que
            // cargó más de lo que cargó.
            label: Text(
              _enviando
                  ? 'Enviando…'
                  : cargados == 0
                      ? 'Poné al menos una cantidad'
                      : 'Enviar $cargados producto${cargados == 1 ? '' : 's'}',
              style: TextStyle(
                color: cargados == 0 ? AppTheme.textMuted : Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 15,
              ),
            ),
          ),
        ),
      ),
    ]);
  }

  Widget _renglon(int i, bool soloUnidad, Color color) {
    final texto = _cantidades[i]!.text.trim().replaceAll(',', '.');
    final cargado = (double.tryParse(texto) ?? 0) > 0;

    return Container(
      // El renglón ya cargado se tiñe y se marca con una barra al costado: en una
      // lista de 22 hay que poder ver de un golpe qué falta.
      decoration: BoxDecoration(
        color: cargado ? color.withOpacity(0.07) : Colors.transparent,
        border: Border(left: BorderSide(color: cargado ? color : Colors.transparent, width: 3)),
      ),
      padding: const EdgeInsets.fromLTRB(9, 10, 12, 10),
      child: Row(children: [
        SizedBox(
          width: 24,
          child: cargado
              ? Icon(Icons.check_circle_rounded, color: color, size: 17)
              : Text('${i + 1}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 12, fontWeight: FontWeight.w600)),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text('${_items[i]['nombre']}',
              style: TextStyle(
                color: cargado ? Colors.white : AppTheme.textLight,
                fontSize: 14,
                fontWeight: cargado ? FontWeight.w700 : FontWeight.w500,
              )),
        ),
        // El casillero se ve como casillero: antes era un "0" suelto y no se
        // entendía que había que escribir ahí.
        Container(
          width: 66,
          decoration: BoxDecoration(
            color: AppTheme.primaryDark,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: cargado ? color.withOpacity(0.7) : AppTheme.borderDark, width: 1.4),
          ),
          child: TextField(
            controller: _cantidades[i],
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textAlign: TextAlign.center,
            style: TextStyle(
              color: cargado ? color : Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
            decoration: const InputDecoration(
              hintText: '—',
              hintStyle: TextStyle(color: AppTheme.textMuted, fontWeight: FontWeight.w400),
              border: InputBorder.none,
              isDense: true,
              contentPadding: EdgeInsets.symmetric(vertical: 10, horizontal: 4),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 86,
          child: soloUnidad
              ? const Text('Unidad',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTheme.textMuted, fontSize: 11, fontWeight: FontWeight.w600))
              : DropdownButton<String>(
                  value: _unidades.contains(_unidadElegida[i]) ? _unidadElegida[i] : _unidades.first,
                  isExpanded: true,
                  isDense: true,
                  dropdownColor: AppTheme.secondaryDark,
                  underline: Container(height: 1, color: AppTheme.borderDark),
                  icon: const Icon(Icons.expand_more_rounded, size: 16, color: AppTheme.textMuted),
                  style: TextStyle(color: cargado ? Colors.white : AppTheme.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
                  items: [
                    ..._unidades.map((u) => DropdownMenuItem(value: u, child: Text(u, overflow: TextOverflow.ellipsis))),
                    // A veces el producto se cuenta en algo que no está
                    // entre las sugeridas (una jarra, un balde).
                    const DropdownMenuItem(
                      value: '__otra__',
                      child: Text('Otra…', style: TextStyle(fontStyle: FontStyle.italic)),
                    ),
                  ],
                  onChanged: (v) async {
                    if (v == '__otra__') {
                      final propia = await _pedirUnidadPropia();
                      if (propia == null || propia.isEmpty) return; // cancelado: queda la de antes
                      setState(() {
                        // La unidad nueva se suma a la lista entera, no solo
                        // a este renglón: casi siempre hay varios productos
                        // que se cuentan igual.
                        if (!_unidades.contains(propia)) _unidades.add(propia);
                        _unidadElegida[i] = propia;
                      });
                    } else if (v != null) {
                      setState(() => _unidadElegida[i] = v);
                    }
                  },
                ),
        ),
      ]),
    );
  }

  Widget _campoNota() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
      child: TextField(
        controller: _nota,
        maxLines: 2,
        style: const TextStyle(color: Colors.white, fontSize: 13),
        decoration: InputDecoration(
          labelText: 'Nota para el administrador (opcional)',
          labelStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
          prefixIcon: const Icon(Icons.sticky_note_2_outlined, color: AppTheme.textMuted, size: 18),
          filled: true,
          fillColor: AppTheme.secondaryDark,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
        ),
      ),
    );
  }
}


// ---------------------------------------------------------------------------
// VENDIDO HOY
//
// Va al pie de la pantalla, debajo de los controles recibidos: la idea es
// leerlo al lado del conteo que mandó el personal. Solo lo ve el administrador
// y es solo de lectura: no descuenta stock ni toca el inventario.
class PanelVendidoHoy extends StatelessWidget {
  const PanelVendidoHoy({super.key, required this.datos});

  final Map<String, dynamic> datos;

  @override
  Widget build(BuildContext context) {
    final cocina = (datos['cocina'] as List?) ?? [];
    final barra = (datos['barra'] as List?) ?? [];
    final fecha = (datos['fecha'] ?? '').toString();

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SizedBox(height: 28),
      const Divider(color: AppTheme.borderDark, height: 1),
      const SizedBox(height: 20),
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Text('Vendido hoy',
              style: GoogleFonts.outfit(
                  color: AppTheme.textLight, fontWeight: FontWeight.w700, fontSize: 16)),
        ),
        if (fecha.isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppTheme.secondaryDark,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.borderDark),
            ),
            child: Text(fecha,
                style: const TextStyle(
                    color: AppTheme.textMuted, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
      ]),
      const SizedBox(height: 4),
      const Text(
        'Solo los productos de la lista que están vinculados a una venta. '
        'Es para comparar con el conteo: no descuenta stock.',
        style: TextStyle(color: AppTheme.textMuted, fontSize: 11, height: 1.4),
      ),
      const SizedBox(height: 14),
      _tarjeta('Cocina', Icons.soup_kitchen_rounded, _naranjaCocina, cocina),
      const SizedBox(height: 12),
      _tarjeta('Barra', Icons.local_cafe_rounded, _celesteBarra, barra),
      const SizedBox(height: 8),
    ]);
  }

  Widget _tarjeta(String titulo, IconData icono, Color color, List<dynamic> filas) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.secondaryDark,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderDark),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                  color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
              child: Icon(icono, color: color, size: 18),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(titulo,
                    style: GoogleFonts.outfit(
                        color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
                Text(
                  filas.isEmpty
                      ? 'Todavía nada'
                      : '${filas.length} producto${filas.length == 1 ? '' : 's'} vendido${filas.length == 1 ? '' : 's'}',
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
                ),
              ]),
            ),
          ]),
        ),
        if (filas.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 0, 14, 16),
            child: Text('No se vendió nada de la lista hoy',
                style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
          )
        else
          ...filas.map((f) => Column(children: [
                const Divider(color: AppTheme.borderDark, height: 1),
                _renglon(f as Map<String, dynamic>, color),
              ])),
      ]),
    );
  }

  Widget _renglon(Map<String, dynamic> f, Color color) {
    final origen = (f['origen'] as List?) ?? [];
    // El detalle solo aporta cuando el renglón sale de más de una venta o de un
    // producto que se llama distinto (ej. "Lomito" <- "Medio Lomo").
    final unico = origen.length == 1 &&
        '${origen.first['producto']}'.toLowerCase() == '${f['nombre']}'.toLowerCase();
    final detalle = unico
        ? ''
        : origen.map((o) => '${o['producto']} ×${numeroCorto(o['vendidos'])}').join(' · ');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${f['nombre']}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white, fontSize: 13.5, fontWeight: FontWeight.w700)),
            if (detalle.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(detalle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
              ),
          ]),
        ),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(numeroCorto(f['cantidad']),
              style: TextStyle(color: color, fontSize: 19, fontWeight: FontWeight.w800)),
          Text('${f['unidad'] ?? 'Unidad'}',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
        ]),
      ]),
    );
  }
}

// Las cantidades llegan como número; se muestran sin el ".0" de más.
String numeroCorto(dynamic v) {
  final n = v is num ? v.toDouble() : (double.tryParse('$v') ?? 0);
  return n == n.roundToDouble() ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
}
