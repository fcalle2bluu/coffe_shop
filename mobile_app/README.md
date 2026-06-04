# Café La Paz - Aplicación Móvil (Android & iOS)

Esta es la aplicación móvil multiplataforma completa para **Café La Paz**, construida en **Flutter**. El diseño e interfaz implementan animaciones nativas fluidas, soporte responsivo para teléfonos y tabletas (menú lateral drawer adaptativo), y conexión en tiempo real con la API del servidor en Render.

---

## 🛠️ Requisitos de Desarrollo

Para compilar y ejecutar esta aplicación en tu Mac, necesitarás:

1. **Flutter SDK**: El motor de desarrollo móvil.
2. **Android Studio**: Para compilar y probar en dispositivos/emuladores de Android.
3. **Xcode** (Opcional): Si deseas compilar para dispositivos/simuladores de iOS.

---

## 🚀 Guía de Instalación Rápida

### Paso 1: Instalar Flutter mediante Homebrew (en tu Terminal de macOS)
Ejecuta el siguiente comando para instalar Flutter de forma global en tu Mac:
```bash
brew install --cask flutter
```

Una vez instalado, verifica que el entorno esté listo ejecutando:
```bash
flutter doctor
```

### Paso 2: Importar el Proyecto en Android Studio
1. Abre **Android Studio**.
2. Selecciona **Open** (Abrir) y busca la carpeta:
   `/Users/agz/Documents/coffe_shop/mobile_app`
3. Si Android Studio te lo solicita, instala el Plugin de **Flutter** y **Dart** desde *Preferences -> Plugins*.

### Paso 3: Descargar las Dependencias
Desde la terminal en el directorio `mobile_app` (o el botón *Pub get* en Android Studio), ejecuta:
```bash
flutter pub get
```

### Paso 4: Ejecutar en un Dispositivo o Emulador
Conecta tu teléfono Android (con depuración USB activa) o inicia un Emulador virtual desde el Device Manager de Android Studio, y ejecuta:
```bash
flutter run
```

---

## 📱 Pantallas y Características Incluidas

*   **Acceso Seguro (Login)**: Ingreso mediante identificador de usuario y un teclado PIN táctil numérico fluido y moderno. Guarda la sesión y los privilegios en SharedPreferences.
*   **Punto de Venta (POS)**:
    *   Buscador rápido de productos en tiempo real.
    *   **Catálogo agrupado y separado por categorías** con indicadores visuales y contadores.
    *   Administración de productos (Crear, Editar y Borrar) para usuarios administradores directamente desde las tarjetas de producto.
    *   Carrito de compras interactivo (Ticket) deslizable con sumatoria y checkout animado para elegir método de pago (Efectivo / QR / Tarjeta).
*   **Control de Caja**: Formulario interactivo para abrir turno (saldo inicial) y cerrar turno (efectivo real en caja), mostrando el efectivo esperado y las ventas acumuladas del turno por método de pago. Incluye bitácora de turnos anteriores.
*   **Stock Actual (Inventario)**: Listado de insumos con alertas visuales de **Stock Bajo** si la cantidad actual es inferior a la cantidad mínima configurada, junto con un Kardex (historial de movimientos de almacén).
*   **Reabastecimiento (Compras)**: Formulario multi-ítem para registrar compras a proveedores incrementando el inventario automáticamente.
*   **Directorio de Proveedores**: Directorio con tarjetas de contacto que permiten archivar y gestionar los proveedores de insumos de la cafetería.
*   **Bitácora (Auditoría)**: Registro histórico de accesos mostrando el usuario, fecha y hora de ingreso, dirección IP, ubicación y tipo de dispositivo utilizado.
*   **Parámetros y Roles**: Panel de configuración de información de la empresa (nit, moneda, ticket) y el **gestor de personal con switches modernos** para activar/desactivar privilegios de acceso a las diferentes secciones en tiempo real.
