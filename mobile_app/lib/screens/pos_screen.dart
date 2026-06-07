import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api.dart';
import '../config/theme.dart';
import '../models/product.dart';
import '../models/category.dart';
import '../widgets/bouncing_widget.dart';
import '../widgets/pulsing_coffee_loader.dart';
import '../widgets/fade_in_slide.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  List<Product> _allProducts = [];
  List<Product> _filteredProducts = [];
  List<Category> _categories = [];
  
  final Map<int, int> _cart = {}; // Map of product ID to quantity
  bool _isLoading = true;
  bool _isAdmin = false;
  String _searchQuery = '';
  final Set<String> _expandedCategories = {};
  int? _selectedCajaId;

  // Controllers for Product dialog
  final _prodNameController = TextEditingController();
  final _prodPriceController = TextEditingController();
  final _prodImageUrlController = TextEditingController();
  int? _selectedCategoryId;
  bool _isUploadingImage = false;

  Future<void> _pickAndUploadImage(ImageSource source, Function setDialogState) async {
    final ImagePicker picker = ImagePicker();
    try {
      final XFile? file = await picker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (file == null) return;

      setDialogState(() {
        _isUploadingImage = true;
      });

      final String? uploadedUrl = await ApiConfig.uploadImage(file.path);
      
      setDialogState(() {
        _isUploadingImage = false;
        if (uploadedUrl != null) {
          _prodImageUrlController.text = uploadedUrl;
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Error al subir la imagen')),
          );
        }
      });
    } catch (e) {
      setDialogState(() {
        _isUploadingImage = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error al seleccionar imagen: $e')),
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _checkRole();
    _loadData();
    _loadCajaId();
  }

  @override
  void dispose() {
    _prodNameController.dispose();
    _prodPriceController.dispose();
    _prodImageUrlController.dispose();
    super.dispose();
  }

  Future<void> _checkRole() async {
    final prefs = await SharedPreferences.getInstance();
    final rol = prefs.getString('usuario_rol') ?? 'CAJERO';
    setState(() {
      _isAdmin = rol.toUpperCase() == 'ADMIN' || rol.toUpperCase() == 'ADMINISTRADOR';
    });
  }

  Future<void> _loadCajaId() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _selectedCajaId = prefs.getInt('caja_id');
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final prodRes = await ApiConfig.get('/ventas/productos');
      final catRes = await ApiConfig.get('/ventas/categorias');

      if (prodRes.statusCode == 200 && catRes.statusCode == 200) {
        final List prodData = jsonDecode(prodRes.body);
        final List catData = jsonDecode(catRes.body);

        setState(() {
          _allProducts = prodData.map((e) => Product.fromJson(e)).toList();
          _filteredProducts = List.from(_allProducts);
          _categories = catData.map((e) => Category.fromJson(e)).toList();
        });
      }
    } catch (e) {
      print('Error al cargar datos POS: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _filterProducts(String query) {
    setState(() {
      _searchQuery = query;
      _filteredProducts = _allProducts
          .where((p) => p.nombre.toLowerCase().contains(query.toLowerCase()))
          .toList();
    });
  }

  // Cart operations
  void _addToCart(Product product) {
    setState(() {
      _cart[product.id] = (_cart[product.id] ?? 0) + 1;
    });
  }

  void _removeFromCart(Product product) {
    setState(() {
      if (_cart.containsKey(product.id)) {
        if (_cart[product.id] == 1) {
          _cart.remove(product.id);
        } else {
          _cart[product.id] = _cart[product.id]! - 1;
        }
      }
    });
  }

  void _clearCart() {
    setState(() => _cart.clear());
  }

  double get _cartTotal {
    double total = 0.0;
    _cart.forEach((id, qty) {
      final p = _allProducts.firstWhere((prod) => prod.id == id);
      total += p.precioVenta * qty;
    });
    return total;
  }

  // Group products by category
  Map<String, List<Product>> get _groupedProducts {
    final Map<String, List<Product>> groups = {};
    for (var p in _filteredProducts) {
      final cat = p.categoria;
      if (!groups.containsKey(cat)) {
        groups[cat] = [];
      }
      groups[cat]!.add(p);
    }
    return groups;
  }

  // Deletion
  Future<void> _deleteProduct(Product product) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Eliminar Producto'),
        content: Text('¿Estás seguro de eliminar "${product.nombre}"? Esto también borrará su historial de ventas.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Eliminar', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        final res = await ApiConfig.delete('/ventas/productos/${product.id}');
        if (res.statusCode == 200) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Producto "${product.nombre}" eliminado.')),
          );
          _loadData();
        } else {
          throw Exception('Error del servidor');
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Error al eliminar producto.')),
        );
      }
    }
  }

  // Product Add / Edit Dialog
  void _showProductDialog({Product? product}) {
    if (product != null) {
      _prodNameController.text = product.nombre;
      _prodPriceController.text = product.precioVenta.toString();
      _prodImageUrlController.text = product.imagenUrl ?? '';
      final matchedCat = _categories.firstWhere(
        (c) => c.nombre == product.categoria,
        orElse: () => Category(id: 0, nombre: ''),
      );
      _selectedCategoryId = matchedCat.id != 0 ? matchedCat.id : null;
    } else {
      _prodNameController.clear();
      _prodPriceController.clear();
      _prodImageUrlController.clear();
      _selectedCategoryId = _categories.isNotEmpty ? _categories.first.id : null;
    }

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          scrollable: true,
          title: Text(product != null ? 'Editar Producto' : 'Nuevo Producto'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _prodNameController,
                decoration: const InputDecoration(labelText: 'Nombre del Producto'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _prodPriceController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Precio de Venta (Bs.)'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                value: _selectedCategoryId,
                decoration: const InputDecoration(labelText: 'Categoría'),
                items: _categories
                    .map((c) => DropdownMenuItem<int>(
                          value: c.id,
                          child: Text(c.nombre),
                        ))
                    .toList(),
                onChanged: (val) {
                  setDialogState(() => _selectedCategoryId = val);
                },
              ),
              const SizedBox(height: 16),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Foto del Producto', style: TextStyle(fontSize: 12, color: AppTheme.textMuted)),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withOpacity(0.1)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isUploadingImage ? null : () => _pickAndUploadImage(ImageSource.camera, setDialogState),
                      icon: const Icon(Icons.camera_alt, size: 16, color: AppTheme.accentColor),
                      label: const Text('Cámara', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: BorderSide(color: Colors.white.withOpacity(0.1)),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isUploadingImage ? null : () => _pickAndUploadImage(ImageSource.gallery, setDialogState),
                      icon: const Icon(Icons.photo_library, size: 16, color: AppTheme.accentColor),
                      label: const Text('Galería', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _prodImageUrlController,
                decoration: const InputDecoration(labelText: 'URL de la Imagen (Opcional)'),
                onChanged: (val) {
                  setDialogState(() {});
                },
              ),
              const SizedBox(height: 12),
              if (_isUploadingImage) ...[
                Container(
                  height: 120,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                  ),
                  child: const Center(
                    child: PulsingCoffeeLoader(message: 'Subiendo imagen...'),
                  ),
                ),
                const SizedBox(height: 12),
              ] else if (_prodImageUrlController.text.trim().isNotEmpty) ...[
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(
                        _prodImageUrlController.text.trim(),
                        height: 120,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          return Container(
                            height: 120,
                            color: Colors.black12,
                            child: const Center(
                              child: Icon(Icons.broken_image_outlined, color: Colors.white24, size: 30),
                            ),
                          );
                        },
                        loadingBuilder: (context, child, loadingProgress) {
                          if (loadingProgress == null) return child;
                          return Container(
                            height: 120,
                            color: Colors.black12,
                            child: const Center(
                              child: SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: GestureDetector(
                        onTap: () {
                          setDialogState(() {
                            _prodImageUrlController.clear();
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.black54,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.close, size: 16, color: Colors.white),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
            ),
            TextButton(
              onPressed: () async {
                final name = _prodNameController.text.trim();
                final price = double.tryParse(_prodPriceController.text) ?? 0.0;
                final catId = _selectedCategoryId;
                final imageUrl = _prodImageUrlController.text.trim();

                if (name.isEmpty || price <= 0 || catId == null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Llene todos los campos correctamente.')),
                  );
                  return;
                }

                try {
                  final Map<String, dynamic> body = {
                    'nombre': name,
                    'precio_venta': price,
                    'categoria_id': catId,
                    'imagen_url': imageUrl.isNotEmpty ? imageUrl : null,
                  };

                  final res = product != null
                      ? await ApiConfig.put('/ventas/productos/${product.id}', body)
                      : await ApiConfig.post('/ventas/productos', body);

                  if (res.statusCode == 200 || res.statusCode == 201) {
                    Navigator.pop(context);
                    _loadData();
                  } else {
                    throw Exception('Error al guardar');
                  }
                } catch (e) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Error al procesar producto.')),
                  );
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }

  // Checkout process
  void _checkout() {
    if (_cart.isEmpty) return;

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Procesar Pago'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Total a pagar: Bs. ${_cartTotal.toStringAsFixed(2)}',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.accentColor),
            ),
            const SizedBox(height: 16),
            const Text('Selecciona el método de pago:'),
            const SizedBox(height: 12),
            _buildPaymentMethodButton('EFECTIVO', FontAwesomeIcons.moneyBillWave),
            const SizedBox(height: 8),
            _buildPaymentMethodButton('QR DIGITAL', FontAwesomeIcons.qrcode),
            const SizedBox(height: 8),
            _buildPaymentMethodButton('CONSUME LO NUESTRO', FontAwesomeIcons.wallet),
            const SizedBox(height: 8),
            _buildPaymentMethodButton('TARJETA DE DÉBITO/CRÉDITO', FontAwesomeIcons.creditCard),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar', style: TextStyle(color: AppTheme.textMuted)),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentMethodButton(String method, FaIconData icon) {
    return ElevatedButton.icon(
      onPressed: () => _confirmPayment(method),
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        alignment: Alignment.centerLeft,
      ),
      icon: FaIcon(icon, size: 16, color: AppTheme.accentColor),
      label: Text(method, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
    );
  }

  Future<void> _confirmPayment(String method) async {
    Navigator.pop(context); // Close checkout dialog
    setState(() => _isLoading = true);

    try {
      final prefs = await SharedPreferences.getInstance();
      final userId = prefs.getInt('usuario_id') ?? 1;

      final List detalles = [];
      _cart.forEach((id, qty) {
        final p = _allProducts.firstWhere((prod) => prod.id == id);
        detalles.add({
          'producto_id': id,
          'cantidad': qty,
          'precio_unitario': p.precioVenta,
          'subtotal': p.precioVenta * qty,
        });
      });

      final response = await ApiConfig.post('/', {
        'usuario_id': userId,
        'caja_id': _selectedCajaId,
        'total': _cartTotal,
        'metodo_pago': method,
        'detalles': detalles,
      });

      if (response.statusCode == 201) {
        _clearCart();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('✅ ¡Venta registrada exitosamente!')),
        );
      } else {
        final err = jsonDecode(response.body);
        throw Exception(err['error'] ?? 'Error desconocido');
      }
    } catch (e) {
      showDialog(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Error al vender'),
          content: Text(e.toString().replaceAll('Exception: ', '')),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cerrar'),
            ),
          ],
        ),
      );
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isTablet = size.width > 900;
    final groups = _groupedProducts;

    Widget productsGrid() {
      if (_isLoading) {
        return const Center(child: PulsingCoffeeLoader(message: 'Cargando catálogo...'));
      }
      if (groups.isEmpty) {
        return const Center(
          child: Text('No hay productos en el catálogo', style: TextStyle(fontStyle: FontStyle.italic, color: AppTheme.textMuted)),
        );
      }

      return ListView(
        padding: const EdgeInsets.only(bottom: 80),
        children: groups.keys.map((catName) {
          final prods = groups[catName]!;
          final isExpanded = _searchQuery.isNotEmpty || _expandedCategories.contains(catName);

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InkWell(
                onTap: () {
                  setState(() {
                    if (_expandedCategories.contains(catName)) {
                      _expandedCategories.remove(catName);
                    } else {
                      _expandedCategories.add(catName);
                    }
                  });
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 4.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 4,
                            height: 12,
                            decoration: BoxDecoration(
                              color: AppTheme.accentColor,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            catName.toUpperCase(),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.5, color: AppTheme.textMuted),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '(${prods.length})',
                            style: const TextStyle(fontSize: 10, color: Colors.white24, fontWeight: FontWeight.normal),
                          ),
                        ],
                      ),
                      Icon(
                        isExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                        color: AppTheme.textMuted,
                        size: 18,
                      ),
                    ],
                  ),
                ),
              ),
              if (isExpanded) ...[
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: isTablet ? 3 : 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: isTablet ? 1.05 : 0.85,
                  ),
                  itemCount: prods.length,
                  itemBuilder: (context, idx) {
                    final p = prods[idx];
                    final inCartQty = _cart[p.id] ?? 0;
                    return FadeInSlide(
                      index: idx,
                      child: BouncingWidget(
                        onTap: () => _addToCart(p),
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppTheme.secondaryDark,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: inCartQty > 0 ? AppTheme.accentColor : Colors.white.withOpacity(0.04),
                              width: inCartQty > 0 ? 1.5 : 1,
                            ),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Stack(
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    flex: 6,
                                    child: Container(
                                      width: double.infinity,
                                      color: Colors.white.withOpacity(0.02),
                                      child: p.imagenUrl != null && p.imagenUrl!.isNotEmpty
                                          ? Image.network(
                                              p.imagenUrl!,
                                              fit: BoxFit.cover,
                                              errorBuilder: (context, error, stackTrace) {
                                                return Container(
                                                  color: Colors.black12,
                                                  child: const Center(
                                                    child: Icon(
                                                      Icons.broken_image_outlined,
                                                      color: Colors.white24,
                                                      size: 24,
                                                    ),
                                                  ),
                                                );
                                              },
                                            )
                                          : Container(
                                              color: Colors.white.withOpacity(0.02),
                                              child: const Center(
                                                child: FaIcon(
                                                  FontAwesomeIcons.mugHot,
                                                  color: Colors.white24,
                                                  size: 32,
                                                ),
                                              ),
                                            ),
                                    ),
                                  ),
                                  Expanded(
                                    flex: 4,
                                    child: Padding(
                                      padding: const EdgeInsets.all(10.0),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            p.nombre,
                                            style: const TextStyle(
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.bold,
                                              color: Colors.white,
                                            ),
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Text(
                                                'Bs. ${p.precioVenta.toStringAsFixed(2)}',
                                                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white),
                                              ),
                                              if (inCartQty > 0)
                                                Container(
                                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                                                  decoration: BoxDecoration(
                                                    color: AppTheme.accentColor.withOpacity(0.15),
                                                    borderRadius: BorderRadius.circular(6),
                                                  ),
                                                  child: Text(
                                                    'x$inCartQty',
                                                    style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: AppTheme.accentColor),
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              // Admin controls inside card
                              if (_isAdmin)
                                Positioned(
                                  top: 4,
                                  right: 4,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      color: Colors.black54,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        IconButton(
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                                          icon: const FaIcon(FontAwesomeIcons.solidPenToSquare, size: 11, color: Colors.white70),
                                          onPressed: () => _showProductDialog(product: p),
                                        ),
                                        IconButton(
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                                          icon: const FaIcon(FontAwesomeIcons.trashCan, size: 11, color: Colors.redAccent),
                                          onPressed: () => _deleteProduct(p),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 12),
              ],
            ],
          );
        }).toList(),
      );
    }

    Widget ticketPanel() {
      final cartItems = _cart.keys.toList();
      return Container(
        color: AppTheme.secondaryDark,
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(20.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Detalle del Ticket',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, fontFamily: 'Outfit'),
                  ),
                  if (_cart.isNotEmpty)
                    TextButton(
                      onPressed: _clearCart,
                      child: const Text('Limpiar', style: TextStyle(color: Colors.redAccent, fontSize: 13)),
                    ),
                ],
              ),
            ),
            const Divider(color: Colors.white10, height: 1),
            // Items list
            Expanded(
              child: _cart.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          FaIcon(FontAwesomeIcons.receipt, size: 36, color: Colors.white.withOpacity(0.1)),
                          const SizedBox(height: 12),
                          Text('El ticket está vacío', style: TextStyle(fontStyle: FontStyle.italic, color: Colors.white.withOpacity(0.3))),
                        ],
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: cartItems.length,
                      separatorBuilder: (context, index) => const Divider(color: Colors.white10),
                      itemBuilder: (context, index) {
                        final id = cartItems[index];
                        final qty = _cart[id]!;
                        final p = _allProducts.firstWhere((prod) => prod.id == id);
                        return Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                  const SizedBox(height: 2),
                                  Text('Bs. ${p.precioVenta.toStringAsFixed(2)}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 11)),
                                ],
                              ),
                            ),
                            Row(
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.remove_circle_outline, size: 18),
                                  onPressed: () => _removeFromCart(p),
                                ),
                                Text('$qty', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                                IconButton(
                                  icon: const Icon(Icons.add_circle_outline, size: 18, color: AppTheme.accentColor),
                                  onPressed: () => _addToCart(p),
                                ),
                              ],
                            ),
                            Container(
                              width: 65,
                              alignment: Alignment.centerRight,
                              child: Text(
                                'Bs. ${(p.precioVenta * qty).toStringAsFixed(2)}',
                                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
            ),
            const Divider(color: Colors.white10, height: 1),
            // Payment Area
            Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total:', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      Text(
                        'Bs. ${_cartTotal.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppTheme.accentColor),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _cart.isEmpty ? null : _checkout,
                    style: ElevatedButton.styleFrom(
                      minimumSize: const Size.fromHeight(55),
                      backgroundColor: AppTheme.accentColor,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('PROCESAR VENTA', style: TextStyle(letterSpacing: 1.5)),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Scaffold(
      floatingActionButton: isTablet || _cart.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () {
                showModalBottomSheet(
                  context: context,
                  builder: (context) => ticketPanel(),
                );
              },
              backgroundColor: AppTheme.accentColor,
              icon: const FaIcon(FontAwesomeIcons.receipt, size: 14),
              label: Text('TICKET (Bs. ${_cartTotal.toStringAsFixed(2)})', style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
      body: Row(
        children: [
          // Catálogo de Productos
          Expanded(
            flex: 2,
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                children: [
                  // Search & Add Header
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          onChanged: _filterProducts,
                          decoration: InputDecoration(
                            hintText: 'Buscar producto...',
                            prefixIcon: Icon(Icons.search, color: Colors.white.withOpacity(0.3)),
                            contentPadding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                      if (_isAdmin) ...[
                        const SizedBox(width: 12),
                        ElevatedButton.icon(
                          onPressed: () => _showProductDialog(),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.white,
                            foregroundColor: AppTheme.primaryDark,
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                          ),
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('NUEVO', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w900)),
                        ),
                      ]
                    ],
                  ),
                  const SizedBox(height: 12),
                  Expanded(child: productsGrid()),
                ],
              ),
            ),
          ),
          
          // Ticket Lateral en Tablets
          if (isTablet)
            Container(
              width: 380,
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: Colors.white.withOpacity(0.04), width: 1)),
              ),
              child: ticketPanel(),
            ),
        ],
      ),
    );
  }
}
