import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../widgets/pulsing_coffee_loader.dart';

class IaAssistantScreen extends StatefulWidget {
  const IaAssistantScreen({super.key});

  @override
  State<IaAssistantScreen> createState() => _IaAssistantScreenState();
}

class _IaAssistantScreenState extends State<IaAssistantScreen> {
  final List<ChatMessage> _messages = [];
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isLoading = false;
  String _userName = 'Admin';

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
    // Mensaje de bienvenida inicial
    _messages.add(
      ChatMessage(
        text: '¡Hola! Soy tu asistente de base de datos de Café La Paz. Puedes hacerme preguntas en lenguaje natural sobre ventas, inventario, gastos de caja, compras o el rendimiento de tus productos.\n\nEjemplo: "¿Qué método de pago se usó más hoy?" o "¿Cuáles son los 5 productos con más volumen de venta?"',
        isUser: false,
      ),
    );
  }

  Future<void> _loadUserInfo() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userName = prefs.getString('usuario_nombre') ?? 'Admin';
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _enviarMensaje(String text) async {
    final prompt = text.trim();
    if (prompt.isEmpty) return;

    _textController.clear();
    
    setState(() {
      _messages.add(ChatMessage(text: prompt, isUser: true));
      _isLoading = true;
    });
    
    _scrollToBottom();

    try {
      final res = await ApiConfig.post('/ia/consultar', {'mensaje': prompt});
      
      if (!mounted) return;

      setState(() {
        _isLoading = false;
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          if (data['success'] == true) {
            _messages.add(
              ChatMessage(
                text: data['mensajeIa'] ?? 'Sin respuesta',
                isUser: false,
                rows: data['filas'],
                sql: data['sql'],
              ),
            );
          } else {
            _messages.add(
              ChatMessage(
                text: data['error'] ?? 'Ocurrió un error inesperado al procesar la respuesta.',
                isUser: false,
                isError: true,
              ),
            );
          }
        } else {
          final data = jsonDecode(res.body);
          _messages.add(
            ChatMessage(
              text: data['error'] ?? 'Error de servidor (${res.statusCode})',
              isUser: false,
              isError: true,
            ),
          );
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _messages.add(
          ChatMessage(
            text: 'Error de conexión con el servidor. Por favor verifica tu conexión a internet.',
            isUser: false,
            isError: true,
          ),
        );
      });
    }

    _scrollToBottom();
  }

  void _preguntarSugerencia(String sugerencia) {
    // Mapeo amigable para el backend para respuestas más naturales y precisas
    String consulta = sugerencia;
    if (sugerencia == "Ventas de Hoy") {
      consulta = "¿Cuáles son las ventas totales y por método de pago de hoy?";
    } else if (sugerencia == "Producto Estrella") {
      consulta = "¿Cuáles son los 3 productos más vendidos con su cantidad y subtotal total?";
    } else if (sugerencia == "Alerta de Stock Bajo") {
      consulta = "¿Qué insumos tienen stock actual menor o igual a su stock mínimo y cuál es el stock faltante?";
    } else if (sugerencia == "Gastos del Mes") {
      consulta = "¿Cuánto se ha gastado en total este mes y cuáles son los gastos registrados?";
    } else if (sugerencia == "Lista de Cajeros") {
      consulta = "¿Qué usuarios tienen rol de CAJERO y están activos actualmente?";
    }

    _enviarMensaje(consulta);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const FaIcon(FontAwesomeIcons.brain, size: 18, color: AppTheme.accentColor),
            const SizedBox(width: 8),
            Text(
              'Asistente IA Moka',
              style: GoogleFonts.outfit(fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Listado de mensajes del chat
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.all(16.0),
                itemCount: _messages.length,
                itemBuilder: (context, index) {
                  final msg = _messages[index];
                  return _buildMessageBubble(msg);
                },
              ),
            ),

            // Cargando indicador
            if (_isLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 8.0),
                child: PulsingCoffeeLoader(
                  message: 'Moka está consultando la base de datos...',
                ),
              ),

            // Chips de Sugerencias
            _buildSuggestionChips(),

            // Caja de Entrada de Texto
            _buildInputSection(),
          ],
        ),
      ),
    );
  }

  Widget _buildMessageBubble(ChatMessage msg) {
    final isUser = msg.isUser;
    
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: msg.isError ? Colors.redAccent.withOpacity(0.2) : AppTheme.accentColor.withOpacity(0.15),
                shape: BoxShape.circle,
                border: Border.all(
                  color: msg.isError ? Colors.redAccent : AppTheme.accentColor,
                  width: 1.5,
                ),
              ),
              alignment: Alignment.center,
              child: FaIcon(
                msg.isError ? FontAwesomeIcons.circleExclamation : FontAwesomeIcons.brain,
                size: 14,
                color: msg.isError ? Colors.redAccent : AppTheme.accentColor,
              ),
            ),
            const SizedBox(width: 8),
          ],
          
          Flexible(
            child: Container(
              padding: const EdgeInsets.all(16.0),
              decoration: BoxDecoration(
                color: isUser 
                    ? AppTheme.accentColor 
                    : (msg.isError ? Colors.redAccent.withOpacity(0.08) : AppTheme.secondaryDark),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: isUser ? const Radius.circular(16) : Radius.zero,
                  bottomRight: isUser ? Radius.zero : const Radius.circular(16),
                ),
                border: Border.all(
                  color: isUser 
                      ? Colors.transparent 
                      : (msg.isError ? Colors.redAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isUser ? 'Tú ($_userName)' : 'Moka IA',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: isUser ? Colors.white.withOpacity(0.7) : AppTheme.accentColor,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 6),
                  _buildFormattedText(msg.text, isUser),
                  
                  // Render de Tabla si viene en la respuesta
                  if (msg.rows != null && msg.rows!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _buildDynamicTable(msg.rows!),
                  ] else if (msg.rows != null && msg.rows!.isEmpty && msg.sql != null && !msg.isError) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.03),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: Colors.white.withOpacity(0.05)),
                      ),
                      child: Row(
                        children: [
                          const FaIcon(FontAwesomeIcons.circleInfo, size: 12, color: Colors.blueAccent),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'La consulta no devolvió registros en este momento.',
                              style: GoogleFonts.outfit(fontSize: 11, color: AppTheme.textMuted),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  
                  // Render de SQL si está presente
                  if (msg.sql != null && msg.sql!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _buildCollapsibleSql(msg.sql!),
                  ]
                ],
              ),
            ),
          ),
          
          if (isUser) ...[
            const SizedBox(width: 8),
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white.withOpacity(0.1)),
              ),
              alignment: Alignment.center,
              child: Text(
                _userName.isNotEmpty ? _userName.substring(0, 1).toUpperCase() : 'A',
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                  color: AppTheme.accentColor,
                ),
              ),
            ),
          ]
        ],
      ),
    );
  }

  // Generador inteligente de texto con soporte simple para negritas (**texto**)
  Widget _buildFormattedText(String text, bool isUser) {
    final List<TextSpan> spans = [];
    final regExp = RegExp(r'\*\*(.*?)\*\*');
    
    int start = 0;
    for (final match in regExp.allMatches(text)) {
      if (match.start > start) {
        spans.add(TextSpan(text: text.substring(start, match.start)));
      }
      spans.add(
        TextSpan(
          text: match.group(1),
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
      );
      start = match.end;
    }
    
    if (start < text.length) {
      spans.add(TextSpan(text: text.substring(start)));
    }
    
    return RichText(
      text: TextSpan(
        style: GoogleFonts.outfit(
          fontSize: 13.5,
          height: 1.4,
          color: isUser ? Colors.white : AppTheme.textLight,
        ),
        children: spans,
      ),
    );
  }

  // Genera un scrollable horizontal DataTable para ver resultados de BD
  Widget _buildDynamicTable(List<dynamic> rows) {
    final List<String> columns = (rows[0] as Map<String, dynamic>).keys.toList();

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.primaryDark,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.08)),
      ),
      clipBehavior: Clip.antiAlias,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: MaterialStateProperty.all(Colors.white.withOpacity(0.04)),
          dataRowMinHeight: 32,
          dataRowMaxHeight: 42,
          horizontalMargin: 12,
          columnSpacing: 16,
          dividerThickness: 0.5,
          columns: columns.map((col) {
            final label = col.replaceAll('_', ' ').toUpperCase();
            return DataColumn(
              label: Text(
                label,
                style: GoogleFonts.outfit(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.accentColor,
                  letterSpacing: 0.5,
                ),
              ),
            );
          }).toList(),
          rows: rows.map((row) {
            final rowMap = row as Map<String, dynamic>;
            return DataRow(
              cells: columns.map((col) {
                var val = rowMap[col];
                String cellText = '';
                Widget? customCellWidget;

                if (val == null) {
                  cellText = 'null';
                } else if (val is bool) {
                  customCellWidget = Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: val ? Colors.green.withOpacity(0.15) : Colors.grey.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      val ? 'SÍ' : 'NO',
                      style: GoogleFonts.outfit(
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        color: val ? Colors.greenAccent : Colors.grey,
                      ),
                    ),
                  );
                } else if (val is num && (col.toLowerCase().contains('total') || col.toLowerCase().contains('monto') || col.toLowerCase().contains('precio') || col.toLowerCase().contains('saldo') || col.toLowerCase().contains('subtotal') || col.toLowerCase().contains('costo'))) {
                  cellText = 'Bs. ${val.toStringAsFixed(2)}';
                } else if (val is String && val.contains('T') && val.contains('Z') && DateTime.tryParse(val) != null) {
                  final dt = DateTime.parse(val);
                  cellText = '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
                } else {
                  cellText = val.toString();
                }

                return DataCell(
                  customCellWidget ?? Text(
                    cellText,
                    style: GoogleFonts.outfit(
                      fontSize: 12,
                      color: val == null ? AppTheme.textMuted : AppTheme.textLight,
                    ),
                  ),
                );
              }).toList(),
            );
          }).toList(),
        ),
      ),
    );
  }

  // Genera un panel colapsable que esconde la query SQL ejecutada
  Widget _buildCollapsibleSql(String sql) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.2),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          iconColor: AppTheme.accentColor,
          collapsedIconColor: AppTheme.textMuted,
          title: Row(
            children: [
              const FaIcon(FontAwesomeIcons.code, size: 12, color: AppTheme.accentColor),
              const SizedBox(width: 8),
              Text(
                'Ver consulta SQL ejecutada',
                style: GoogleFonts.outfit(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12.0),
              margin: const EdgeInsets.only(left: 12, right: 12, bottom: 12),
              decoration: BoxDecoration(
                color: const Color(0xFF020617),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.black),
              ),
              child: SelectableText(
                sql,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: Colors.greenAccent,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Chips horizontales deslizables para sugerencias rápidas
  Widget _buildSuggestionChips() {
    final sugerencias = [
      {'label': 'Ventas de Hoy', 'icon': FontAwesomeIcons.chartLine},
      {'label': 'Producto Estrella', 'icon': FontAwesomeIcons.burger},
      {'label': 'Alerta de Stock Bajo', 'icon': FontAwesomeIcons.boxOpen},
      {'label': 'Gastos del Mes', 'icon': FontAwesomeIcons.sackDollar},
      {'label': 'Lista de Cajeros', 'icon': FontAwesomeIcons.users},
    ];

    return Container(
      height: 48,
      padding: const EdgeInsets.symmetric(vertical: 4.0),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        itemCount: sugerencias.length,
        itemBuilder: (context, index) {
          final sug = sugerencias[index];
          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: ActionChip(
              onPressed: () => _preguntarSugerencia(sug['label'] as String),
              backgroundColor: AppTheme.secondaryDark,
              side: BorderSide(color: Colors.white.withOpacity(0.05)),
              avatar: FaIcon(
                sug['icon'] as FaIconData?,
                size: 10,
                color: AppTheme.accentColor,
              ),
              label: Text(
                sug['label'] as String,
                style: GoogleFonts.outfit(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textLight,
                ),
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          );
        },
      ),
    );
  }

  // Caja de texto con botón enviar
  Widget _buildInputSection() {
    return Container(
      padding: const EdgeInsets.all(12.0),
      decoration: BoxDecoration(
        color: AppTheme.secondaryDark.withOpacity(0.5),
        border: Border(
          top: BorderSide(
            color: Colors.white.withOpacity(0.04),
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _textController,
              onSubmitted: _enviarMensaje,
              style: GoogleFonts.outfit(fontSize: 14, color: AppTheme.textLight),
              decoration: InputDecoration(
                hintText: 'Pregunta a Moka sobre Café La Paz...',
                hintStyle: GoogleFonts.outfit(color: AppTheme.textMuted, fontSize: 13),
                fillColor: AppTheme.primaryDark,
                filled: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          CircleAvatar(
            radius: 22,
            backgroundColor: AppTheme.accentColor,
            child: IconButton(
              icon: const FaIcon(
                FontAwesomeIcons.paperPlane,
                size: 14,
                color: Colors.white,
              ),
              onPressed: () => _enviarMensaje(_textController.text),
            ),
          ),
        ],
      ),
    );
  }
}

class ChatMessage {
  final String text;
  final bool isUser;
  final List<dynamic>? rows;
  final String? sql;
  final bool isError;

  ChatMessage({
    required this.text,
    required this.isUser,
    this.rows,
    this.sql,
    this.isError = false,
  });
}
