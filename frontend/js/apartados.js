// frontend/js/apartados.js
let productosDisponibles = [];
let carrito = [];
let totalApartado = 0;
let apartadoSeleccionado = null;

document.addEventListener('DOMContentLoaded', () => {
    cargarApartados();
    cargarProductos();
});

async function cargarApartados() {
    try {
        const res = await fetch('/api/apartados');
        const data = await res.json();
        const tbody = document.getElementById('tabla-apartados');
        tbody.innerHTML = '';

        data.forEach(ap => {
            const colorEstado = ap.estado === 'PENDIENTE' ? 'bg-yellow-100 text-yellow-800' :
                                ap.estado === 'PAGADO' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';

            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="px-4 py-3 font-bold text-gray-700">APT-${ap.id.toString().padStart(4,'0')}</td>
                    <td class="px-4 py-3 font-medium">${ap.nombre_cliente} <br><span class="text-xs text-gray-400">${ap.telefono_cliente}</span></td>
                    <td class="px-4 py-3 text-gray-600"><i class="fa-regular fa-calendar text-red-400 mr-1"></i>${ap.limite}</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-800">S/ ${ap.total}</td>
                    <td class="px-4 py-3 text-right font-black ${ap.saldo_pendiente > 0 ? 'text-red-500' : 'text-green-500'}">S/ ${ap.saldo_pendiente}</td>
                    <td class="px-4 py-3 text-center"><span class="px-2 py-1 rounded text-xs font-bold ${colorEstado}">${ap.estado}</span></td>
                    <td class="px-4 py-3 text-center space-x-2">
                        ${ap.estado === 'PENDIENTE' ? `<button onclick="abrirModalAbono(${ap.id}, ${ap.saldo_pendiente})" class="bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600"><i class="fa-solid fa-hand-holding-dollar mr-1"></i> Abonar</button>` : ''}
                        ${ap.estado === 'PAGADO' ? `<button onclick="entregarApartado(${ap.id})" class="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600"><i class="fa-solid fa-box-open mr-1"></i> Entregar</button>` : ''}
                    </td>
                </tr>
            `;
        });
    } catch (e) { console.error("Error al cargar:", e); }
}

async function cargarProductos() {
    const res = await fetch('/api/ventas/productos'); // Reutilizamos ruta de ventas
    productosDisponibles = await res.json();
    const select = document.getElementById('selProducto');
    select.innerHTML = '<option value="">-- Selecciona --</option>';
    productosDisponibles.forEach(p => select.innerHTML += `<option value="${p.id}">${p.nombre} - S/ ${p.precio_venta}</option>`);
}

// LÓGICA DE CREACIÓN
function abrirModalNuevo() {
    carrito = [];
    actualizarCarrito();
    document.getElementById('modalNuevo').classList.remove('hidden');
}
function cerrarModalNuevo() { document.getElementById('modalNuevo').classList.add('hidden'); }

function agregarAlApartado() {
    const pId = document.getElementById('selProducto').value;
    const cant = parseInt(document.getElementById('inpCant').value);
    if (!pId || cant < 1) return;
    
    const prod = productosDisponibles.find(p => p.id == pId);
    carrito.push({ producto_id: prod.id, nombre: prod.nombre, cantidad: cant, precio_unitario: prod.precio_venta, subtotal: cant * prod.precio_venta });
    actualizarCarrito();
}

function actualizarCarrito() {
    const lista = document.getElementById('lista-productos');
    lista.innerHTML = '';
    totalApartado = 0;
    carrito.forEach((c, i) => {
        totalApartado += c.subtotal;
        lista.innerHTML += `<tr class="border-b"><td class="p-2">${c.nombre}</td><td class="p-2 text-center">x${c.cantidad}</td><td class="p-2 text-right font-bold">S/ ${c.subtotal.toFixed(2)}</td><td class="p-2 text-center"><button onclick="carrito.splice(${i},1); actualizarCarrito()" class="text-red-500"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    });
    document.getElementById('lblTotal').innerText = totalApartado.toFixed(2);
}

async function guardarApartado() {
    if(carrito.length === 0) return alert("Agrega productos");
    const data = {
        cliente: document.getElementById('inpCliente').value,
        telefono: document.getElementById('inpTel').value,
        total: totalApartado,
        abono_inicial: parseFloat(document.getElementById('inpAbono').value) || 0,
        metodo_pago: document.getElementById('selPago').value,
        fecha_limite: document.getElementById('inpFecha').value,
        detalles: carrito
    };

    if(data.abono_inicial > data.total) return alert("El abono no puede ser mayor al total");
    if(!data.fecha_limite) return alert("Selecciona fecha límite");

    const res = await fetch('/api/apartados', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if(res.ok) { cerrarModalNuevo(); cargarApartados(); }
}

// LÓGICA DE ABONOS Y ENTREGA
function abrirModalAbono(id, saldo) {
    apartadoSeleccionado = id;
    document.getElementById('lblSaldoModal').innerText = `S/ ${saldo}`;
    document.getElementById('inpMontoAbono').value = '';
    document.getElementById('modalAbono').classList.remove('hidden');
}

async function procesarAbono() {
    const monto = parseFloat(document.getElementById('inpMontoAbono').value);
    const metodo = document.getElementById('selPagoAbono').value;
    if (!monto || monto <= 0) return alert("Monto inválido");

    const res = await fetch(`/api/apartados/${apartadoSeleccionado}/abonos`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ monto, metodo_pago: metodo }) });
    if(res.ok) {
        document.getElementById('modalAbono').classList.add('hidden');
        cargarApartados();
    } else { alert("Error al registrar abono"); }
}

async function entregarApartado(id) {
    if(!confirm("¿Confirmas que entregaste el producto al cliente?")) return;
    await fetch(`/api/apartados/${id}/entregar`, { method: 'PUT' });
    cargarApartados();
}