import 'package:flutter/material.dart';
import '../services/update_service.dart';

/// Muestra el diálogo de actualización disponible. Si [info.obligatoria] es
/// true, el diálogo no se puede cerrar sin actualizar (se usa para versiones
/// que ya no pueden operar, ej. rompieron el login/las sesiones).
Future<void> mostrarDialogoActualizacion(
  BuildContext context,
  InfoActualizacion info,
) {
  return showDialog(
    context: context,
    barrierDismissible: !info.obligatoria,
    builder: (context) => PopScope(
      canPop: !info.obligatoria,
      child: _DialogoActualizacion(info: info),
    ),
  );
}

class _DialogoActualizacion extends StatefulWidget {
  final InfoActualizacion info;
  const _DialogoActualizacion({required this.info});

  @override
  State<_DialogoActualizacion> createState() => _DialogoActualizacionState();
}

class _DialogoActualizacionState extends State<_DialogoActualizacion> {
  bool _descargando = false;
  double? _progreso;
  String? _error;

  Future<void> _actualizar() async {
    setState(() {
      _descargando = true;
      _error = null;
    });
    try {
      await UpdateService.descargarEInstalar(widget.info, (p) {
        if (mounted) setState(() => _progreso = p);
      });
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _descargando = false;
          _error = 'No se pudo instalar la actualización: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.info.obligatoria ? 'Actualización requerida' : 'Actualización disponible'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Nueva versión: ${widget.info.versionName}'),
          if (widget.info.notas.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(widget.info.notas),
          ],
          if (widget.info.obligatoria) ...[
            const SizedBox(height: 8),
            const Text(
              'Tu versión ya no funciona correctamente. Debes actualizar para continuar.',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
          if (_descargando) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(value: _progreso),
            const SizedBox(height: 8),
            Text(_progreso != null ? '${(_progreso! * 100).toStringAsFixed(0)}%' : 'Descargando...'),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
        ],
      ),
      actions: [
        if (!widget.info.obligatoria && !_descargando)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Después'),
          ),
        FilledButton(
          onPressed: _descargando ? null : _actualizar,
          child: Text(_descargando ? 'Actualizando...' : 'Actualizar ahora'),
        ),
      ],
    );
  }
}
