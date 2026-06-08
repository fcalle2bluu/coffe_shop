import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../config/api.dart';
import '../config/theme.dart';

class RecetasScreen extends StatefulWidget {
  const RecetasScreen({super.key});

  @override
  State<RecetasScreen> createState() => _RecetasScreenState();
}

class _RecetasScreenState extends State<RecetasScreen> {
  List<dynamic> _recetas = [];
  bool _isLoading = true;
  String _searchQuery = '';
  String _selectedCategory = 'TODOS';

  @override
  void initState() {
    super.initState();
    _loadRecetas();
  }

  Future<void> _loadRecetas() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/recetas');
      if (res.statusCode == 200) {
        setState(() {
          _recetas = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar recetas: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  List<dynamic> _getFilteredRecetas() {
    List<dynamic> filtered = _recetas;

    if (_selectedCategory != 'TODOS') {
      if (_selectedCategory == 'OTROS') {
        filtered = filtered.where((r) => r['categoria'] != 'PASTELERIA' && r['categoria'] != 'MASA SALADA' && r['categoria'] != 'BEBIDAS CON ALCOHOL').toList();
      } else if (_selectedCategory == 'PASTELERIA') {
        filtered = filtered.where((r) => r['categoria'] == 'PASTELERIA' || r['categoria'] == 'MASA SALADA').toList();
      } else {
        filtered = filtered.where((r) => r['categoria'] == _selectedCategory).toList();
      }
    }

    if (_searchQuery.isNotEmpty) {
      final q = _searchQuery.toLowerCase();
      filtered = filtered.where((r) =>
          r['nombre'].toString().toLowerCase().contains(q) ||
          (r['preparacion'] != null && r['preparacion'].toString().toLowerCase().contains(q))).toList();
    }

    return filtered;
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _getFilteredRecetas();

    return Scaffold(
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                // Buscador
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: TextField(
                    onChanged: (val) => setState(() => _searchQuery = val),
                    decoration: InputDecoration(
                      hintText: 'Buscar receta o ingrediente...',
                      prefixIcon: const Icon(Icons.search, color: AppTheme.textMuted),
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      filled: true,
                      fillColor: AppTheme.secondaryDark,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                // Chips de Categorías
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      _buildCategoryChip('TODOS', 'Todos'),
                      const SizedBox(width: 8),
                      _buildCategoryChip('PASTELERIA', 'Repostería'),
                      const SizedBox(width: 8),
                      _buildCategoryChip('BEBIDAS CON ALCOHOL', 'Cócteles'),
                      const SizedBox(width: 8),
                      _buildCategoryChip('OTROS', 'Otros'),
                    ],
                  ),
                ),
                // Listado de recetas
                Expanded(
                  child: filtered.isEmpty
                      ? const Center(
                          child: Text(
                            'No se encontraron recetas.',
                            style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: filtered.length,
                          itemBuilder: (context, idx) {
                            final r = filtered[idx];
                            return _buildRecipeCard(r);
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildCategoryChip(String catKey, String label) {
    final isSelected = _selectedCategory == catKey;
    return GestureDetector(
      onTap: () => setState(() => _selectedCategory = catKey),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.accentColor : AppTheme.secondaryDark,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? Colors.transparent : Colors.white.withOpacity(0.05),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? Colors.white : AppTheme.textMuted,
            fontWeight: FontWeight.bold,
            fontSize: 12.5,
          ),
        ),
      ),
    );
  }

  Widget _buildRecipeCard(dynamic r) {
    String catText = 'Otros';
    Color catColor = AppTheme.textMuted;
    if (r['categoria'] == 'PASTELERIA' || r['categoria'] == 'MASA SALADA') {
      catText = 'Repostería';
      catColor = Colors.blueAccent;
    } else if (r['categoria'] == 'BEBIDAS CON ALCOHOL') {
      catText = 'Cóctel';
      catColor = Colors.purpleAccent;
    } else if (r['categoria'] != null) {
      catText = r['categoria'];
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (context) => RecetaDetalleScreen(recipeId: r['id']),
            ),
          );
        },
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      r['nombre'],
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.white),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: catColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      catText.toUpperCase(),
                      style: TextStyle(color: catColor, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                r['preparacion'] ?? 'Sin preparación',
                style: const TextStyle(fontSize: 12.5, color: AppTheme.textMuted, height: 1.4),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  const Icon(Icons.people, size: 14, color: AppTheme.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    'Porciones: ${r['porciones'] ?? '1'}',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                  const SizedBox(width: 16),
                  const Icon(Icons.sell, size: 14, color: AppTheme.textMuted),
                  const SizedBox(width: 4),
                  Text(
                    'Precio: ${double.tryParse((r['price'] ?? r['precio'] ?? 0).toString())?.toStringAsFixed(2)} Bs.',
                    style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RecetaDetalleScreen extends StatefulWidget {
  final int recipeId;
  const RecetaDetalleScreen({super.key, required this.recipeId});

  @override
  State<RecetaDetalleScreen> createState() => _RecetaDetalleScreenState();
}

class _RecetaDetalleScreenState extends State<RecetaDetalleScreen> {
  dynamic _receta;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRecetaDetalle();
  }

  Future<void> _loadRecetaDetalle() async {
    setState(() => _isLoading = true);
    try {
      final res = await ApiConfig.get('/recetas/${widget.recipeId}');
      if (res.statusCode == 200) {
        setState(() {
          _receta = jsonDecode(res.body);
        });
      }
    } catch (e) {
      print('Error al cargar detalle de receta: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Map<String, dynamic> _obtenerStockEquivalente(dynamic stockActual, String unidadStock, String unidadReceta) {
    final val = double.tryParse(stockActual.toString()) ?? 0.0;
    final uS = unidadStock.trim().toLowerCase();
    final uR = unidadReceta.trim().toLowerCase();

    if (uS == uR) {
      return {
        'cantidad': val,
        'unidad': unidadStock,
        'glosa': '',
      };
    }

    double stockEnGramosOMl = val;
    if (uS == 'kintales' || uS == 'kintal') {
      stockEnGramosOMl = val * 46000;
    } else if (uS == 'kg' || uS == 'kilo' || uS == 'kilos') {
      stockEnGramosOMl = val * 1000;
    } else if (uS == 'litro' || uS == 'litros' || uS == 'botella' || uS == 'botellas') {
      stockEnGramosOMl = val * 1000;
    } else if (uS == 'botellon') {
      stockEnGramosOMl = val * 20000;
    } else if (uS == 'maples' || uS == 'maple') {
      stockEnGramosOMl = val * 30;
    } else {
      stockEnGramosOMl = val;
    }

    double stockConvertido = 0.0;
    String glosaEquivalencia = '';

    if (uR == 'gr.' || uR == 'gr' || uR == 'g') {
      stockConvertido = stockEnGramosOMl;
      if (uS == 'kintales' || uS == 'kintal') glosaEquivalencia = '1 Kintal = 46 Kg = 46,000 gr';
      else if (uS == 'kg' || uS == 'kilo') glosaEquivalencia = '1 Kg = 1,000 gr';
    } else if (uR == 'ml.' || uR == 'ml') {
      stockConvertido = stockEnGramosOMl;
      if (uS == 'litro' || uS == 'litros' || uS == 'botella' || uS == 'botellas') glosaEquivalencia = '1 L = 1,000 ml';
      else if (uS == 'botellon') glosaEquivalencia = '1 Botellón = 20,000 ml';
    } else if (uR == 'unidades' || uR == 'unidad' || uR == 'u' || uR == 'unid') {
      stockConvertido = stockEnGramosOMl;
      if (uS == 'maples' || uS == 'maple') glosaEquivalencia = '1 Maple = 30 unidades';
    } else if (uR == 'cucharadas' || uR == 'cucharada') {
      stockConvertido = stockEnGramosOMl / 15.0;
      glosaEquivalencia = '1 cucharada = 15 gr';
    } else if (uR == 'cucharaditas' || uR == 'cucharadita') {
      stockConvertido = stockEnGramosOMl / 5.0;
      glosaEquivalencia = '1 cucharadita = 5 gr';
    } else if (uR == 'tazas' || uR == 'taza') {
      stockConvertido = stockEnGramosOMl / 200.0;
      glosaEquivalencia = '1 taza = 200 gr/ml';
    } else if (uR == 'onzas' || uR == 'onza' || uR == 'oz') {
      stockConvertido = stockEnGramosOMl / 30.0;
      glosaEquivalencia = '1 oz = 30 ml';
    } else {
      stockConvertido = val;
    }

    return {
      'cantidad': stockConvertido,
      'unidad': unidadReceta,
      'glosa': glosaEquivalencia,
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isLoading ? 'Cargando receta...' : _receta['nombre']),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Imagen
                  if (_receta['imagen_url'] != null)
                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.network(
                        _receta['imagen_url'],
                        width: double.infinity,
                        height: 200,
                        fit: BoxFit.cover,
                      ),
                    )
                  else
                    Container(
                      width: double.infinity,
                      height: 100,
                      decoration: BoxDecoration(
                        color: AppTheme.secondaryDark,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withOpacity(0.05)),
                      ),
                      alignment: Alignment.center,
                      child: const FaIcon(FontAwesomeIcons.mugHot, size: 36, color: AppTheme.accentColor),
                    ),
                  const SizedBox(height: 16),
                  // Nombre y porciones
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _receta['nombre'],
                              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
                            ),
                            Text(
                              (_receta['categoria'] ?? 'Repostería').toString().toUpperCase(),
                              style: const TextStyle(fontSize: 10, color: AppTheme.textMuted, fontWeight: FontWeight.bold, letterSpacing: 1.0),
                            ),
                          ],
                        ),
                      ),
                      Chip(
                        label: Text(
                          'Rinde: ${_receta['porciones'] ?? '1 porción'}',
                          style: const TextStyle(color: AppTheme.accentColor, fontWeight: FontWeight.bold, fontSize: 11),
                        ),
                        backgroundColor: AppTheme.accentColor.withOpacity(0.1),
                        side: BorderSide.none,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  // Ingredientes
                  const Row(
                    children: [
                      FaIcon(FontAwesomeIcons.basketShopping, size: 14, color: AppTheme.accentColor),
                      SizedBox(width: 8),
                      Text(
                        'Ingredientes y Stock',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _buildIngredientsList(),
                  const SizedBox(height: 24),
                  // Preparación
                  const Row(
                    children: [
                      FaIcon(FontAwesomeIcons.kitchenSet, size: 14, color: AppTheme.accentColor),
                      SizedBox(width: 8),
                      Text(
                        'Preparación',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.secondaryDark,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white.withOpacity(0.05)),
                    ),
                    child: Text(
                      _receta['preparacion'] ?? 'No hay instrucciones registradas para esta receta.',
                      style: const TextStyle(fontSize: 13, color: Colors.white, height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildIngredientsList() {
    final List<dynamic> ingredients = _receta['ingredientes'] ?? [];
    if (ingredients.isEmpty) {
      return const Text('Sin ingredientes registrados.', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted));
    }

    return Column(
      children: List.generate(ingredients.length, (idx) {
        final ing = ingredients[idx];
        final hasInsumo = ing['insumo_id'] != null;

        Color stockColor = Colors.redAccent;
        String stockLabel = 'Sin stock';
        String equivLabel = '';
        IconData statusIcon = Icons.cancel;

        if (hasInsumo) {
          final equiv = _obtenerStockEquivalente(
            ing['insumo_stock_actual'],
            ing['insumo_unidad_medida'],
            ing['unidad_medida'],
          );

          final reqQty = double.tryParse(ing['cantidad'].toString()) ?? 0.0;
          final stockQty = equiv['cantidad'] as double;

          final stockText = stockQty % 1 == 0 ? stockQty.toStringAsFixed(0) : stockQty.toStringAsFixed(2);
          final realStockText = double.tryParse(ing['insumo_stock_actual'].toString())?.toStringAsFixed(1) ?? '0';

          if (stockQty >= reqQty) {
            if (stockQty >= reqQty * 2) {
              stockColor = Colors.green;
              statusIcon = Icons.check_circle;
            } else {
              stockColor = Colors.amber;
              statusIcon = Icons.check_circle;
            }
            stockLabel = 'Stock: $stockText ${ing['unidad_medida']}';
          } else {
            stockColor = Colors.redAccent;
            statusIcon = Icons.remove_circle;
            stockLabel = 'Falta: $stockText ${ing['unidad_medida']}';
          }

          final baseText = 'Inventario: $realStockText ${ing['insumo_unidad_medida']}';
          final equivText = equiv['glosa'] != '' ? ' | (${equiv['glosa']})' : '';
          equivLabel = '$baseText$equivText';
        } else {
          stockLabel = 'Sin vincular';
        }

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.secondaryDark.withOpacity(0.4),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.white.withOpacity(0.04)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(statusIcon, size: 16, color: stockColor),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      ing['nombre_ingrediente'],
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.white),
                    ),
                  ),
                  Text(
                    'Pide: ${double.tryParse(ing['cantidad'].toString())?.toStringAsFixed(0)} ${ing['unidad_medida']}',
                    style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: stockColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      stockLabel,
                      style: TextStyle(color: stockColor, fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
              if (equivLabel.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  equivLabel,
                  style: TextStyle(fontSize: 10, color: AppTheme.textMuted.withOpacity(0.6), fontFamily: 'monospace'),
                ),
              ]
            ],
          ),
        );
      }),
    );
  }
}
