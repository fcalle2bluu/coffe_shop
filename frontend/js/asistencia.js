// frontend/js/asistencia.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar datos de usuario y sidebar
    const nombreActual = localStorage.getItem('usuario_nombre');
    const rolActual = localStorage.getItem('usuario_rol');
    
    if (nombreActual) {
        document.getElementById('nombre-usuario').innerText = nombreActual;
        const avatar = document.getElementById('avatar-letra');
        if (avatar) avatar.innerText = nombreActual.charAt(0).toUpperCase();
    }
    if (rolActual) {
        document.getElementById('rol-usuario').innerText = rolActual;
    }

    // 2. Generar el Token y cargar el Código QR
    inicializarQR();

    // 3. Inicializar los filtros y cargar los datos
    inicializarFiltros();
    cargarEmpleados();
    cargarHistorialAsistencia();

    // Registrar manejadores de filtros
    document.getElementById('filtro-empleado').addEventListener('change', cargarHistorialAsistencia);
    document.getElementById('filtro-anio').addEventListener('change', cargarHistorialAsistencia);
    document.getElementById('filtro-mes').addEventListener('change', () => {
        actualizarDiasDelMes();
        cargarHistorialAsistencia();
    });
    document.getElementById('filtro-dia').addEventListener('change', cargarHistorialAsistencia);
    
    // Inyectar fecha actual en el reporte de impresión
    document.getElementById('print-fecha-reporte').innerText = `Generado el: ${new Date().toLocaleDateString('es-ES', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    })}`;

    // Auto-actualizar silenciosamente cada 5 segundos
    setInterval(() => {
        cargarHistorialAsistencia(true);
    }, 5000);
});

// Calcula el token del día en base a la zona horaria de Bolivia (GMT-4) y carga la imagen QR
function inicializarQR() {
    const ahora = new Date();
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const horaBolivia = new Date(utc + (3600000 * -4));
    
    const yyyy = horaBolivia.getFullYear();
    const mm = String(horaBolivia.getMonth() + 1).padStart(2, '0');
    const dd = String(horaBolivia.getDate()).padStart(2, '0');
    
    const token = `asistencia_${yyyy}_${mm}_${dd}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${token}`;
    
    document.getElementById('qr-image').src = qrUrl;
    document.getElementById('label-fecha-qr').innerText = `${horaBolivia.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
}

// Configura los valores iniciales de los filtros
function inicializarFiltros() {
    const ahora = new Date();
    // Establecer año actual por defecto
    document.getElementById('filtro-anio').value = ahora.getFullYear().toString();
    // Establecer mes actual por defecto
    document.getElementById('filtro-mes').value = (ahora.getMonth() + 1).toString();
    
    actualizarDiasDelMes();
}

// Llena el selector de días según el mes seleccionado
function actualizarDiasDelMes() {
    const mes = parseInt(document.getElementById('filtro-mes').value);
    const anio = parseInt(document.getElementById('filtro-anio').value);
    const diaSelect = document.getElementById('filtro-dia');
    
    diaSelect.innerHTML = '<option value="">Todos los días</option>';
    
    if (!mes) return;
    
    // Obtener cantidad de días en el mes
    const diasEnMes = new Date(anio, mes, 0).getDate();
    
    for (let d = 1; d <= diasEnMes; d++) {
        const option = document.createElement('option');
        option.value = d.toString();
        option.innerText = d.toString().padStart(2, '0');
        diaSelect.appendChild(option);
    }
}

// Carga la lista de usuarios para el filtro dropdown
async function cargarEmpleados() {
    try {
        const res = await fetch('/api/parametros/usuarios');
        const usuarios = await res.json();
        
        const select = document.getElementById('filtro-empleado');
        usuarios.forEach(u => {
            const option = document.createElement('option');
            option.value = u.id;
            option.innerText = `${u.nombre} (${u.rol})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error al cargar lista de empleados:', error);
    }
}

// Recupera y renderiza las asistencias filtradas de la base de datos
async function cargarHistorialAsistencia(silent) {
    const esSilencioso = silent === true;
    const empleado = document.getElementById('filtro-empleado').value;
    const anio = document.getElementById('filtro-anio').value;
    const mes = document.getElementById('filtro-mes').value;
    const dia = document.getElementById('filtro-dia').value;
    
    let url = `/api/asistencia?anio=${anio}`;
    if (empleado) url += `&usuario_id=${empleado}`;
    if (mes) url += `&mes=${mes}`;
    if (dia) url += `&dia=${dia}`;
    
    const tbody = document.getElementById('tabla-asistencia-body');
    if (!esSilencioso) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-slate-400 font-semibold">Cargando marcaciones...</td></tr>';
    }
    
    try {
        const res = await fetch(url);
        const registros = await res.json();
        
        tbody.innerHTML = '';
        document.getElementById('print-total-rows').innerText = registros.length;
        
        if (registros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-slate-400 font-semibold">No se encontraron registros de asistencia para los filtros seleccionados.</td></tr>';
            return;
        }
        
        registros.forEach(r => {
            const salidaText = r.salida 
                ? `<span class="font-bold text-slate-700">${r.salida}</span>` 
                : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[9px] uppercase tracking-wider animate-pulse">En Turno</span>`;
                
            const horasText = r.horas_trabajadas 
                ? `<span class="font-black text-slate-800">${parseFloat(r.horas_trabajadas).toFixed(2)} hrs</span>` 
                : '<span class="text-slate-400">-</span>';

            const fila = document.createElement('tr');
            fila.className = 'hover:bg-slate-50 transition-colors border-b border-slate-100';
            fila.innerHTML = `
                <td class="px-4 py-3 font-bold text-slate-800">${r.empleado}</td>
                <td class="px-4 py-3 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">${r.rol}</td>
                <td class="px-4 py-3 font-mono text-[11px] text-slate-600">${formatearFechaIso(r.fecha)}</td>
                <td class="px-4 py-3 text-center font-bold text-slate-700">${r.entrada}</td>
                <td class="px-4 py-3 text-center">${salidaText}</td>
                <td class="px-4 py-3 text-right">${horasText}</td>
            `;
            tbody.appendChild(fila);
        });
    } catch (error) {
        console.error('Error al cargar historial de asistencia:', error);
        if (!esSilencioso) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-red-500 font-semibold">Error al cargar el historial de asistencia.</td></tr>';
        }
    }
}

// Convierte fecha ISO YYYY-MM-DD a formato amigable DD/MM/YYYY
function formatearFechaIso(fechaIso) {
    if (!fechaIso) return '';
    const partes = fechaIso.split('-');
    if (partes.length < 3) return fechaIso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// --- MODAL DE ASISTENCIA MANUAL ---
function abrirModalAsistenciaManual() {
    const modal = document.getElementById('modalAsistenciaManual');
    
    // Rellenar select de empleados
    const selEmpleado = document.getElementById('manual-empleado');
    selEmpleado.innerHTML = '<option value="" disabled selected>-- Selecciona un empleado --</option>';
    
    // Obtener los empleados cargados en el filtro
    const filtro = document.getElementById('filtro-empleado');
    const options = Array.from(filtro.options).filter(o => o.value !== '');
    options.forEach(o => {
        selEmpleado.innerHTML += `<option value="${o.value}">${o.innerText}</option>`;
    });

    // Rellenar fecha con la fecha local de hoy en Bolivia
    const ahora = new Date();
    const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
    const horaBolivia = new Date(utc + (3600000 * -4));
    const yyyy = horaBolivia.getFullYear();
    const mm = String(horaBolivia.getMonth() + 1).padStart(2, '0');
    const dd = String(horaBolivia.getDate()).padStart(2, '0');
    document.getElementById('manual-fecha').value = `${yyyy}-${mm}-${dd}`;
    
    // Reset de horas
    document.getElementById('manual-entrada').value = '';
    document.getElementById('manual-salida').value = '';
    
    modal.classList.remove('hidden');
}

function cerrarModalAsistenciaManual() {
    document.getElementById('modalAsistenciaManual').classList.add('hidden');
}

async function guardarAsistenciaManual() {
    const usuario_id = document.getElementById('manual-empleado').value;
    const fecha = document.getElementById('manual-fecha').value;
    const hora_entrada = document.getElementById('manual-entrada').value;
    const hora_salida = document.getElementById('manual-salida').value;
    const editor_rol = localStorage.getItem('usuario_rol');

    if (!usuario_id) return alert('Por favor, selecciona un empleado.');
    if (!fecha) return alert('Por favor, selecciona una fecha.');
    if (!hora_entrada) return alert('Por favor, introduce la hora de entrada.');

    const btn = document.getElementById('btnGuardarManual');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';

    try {
        const res = await fetch('/api/asistencia/manual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                usuario_id,
                fecha,
                hora_entrada,
                hora_salida: hora_salida || null,
                editor_rol
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error en servidor');

        alert(data.mensaje || 'Registro guardado correctamente.');
        cerrarModalAsistenciaManual();
        cargarHistorialAsistencia();
    } catch (error) {
        alert('Error al guardar asistencia manual: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk text-[10px]"></i> Guardar Registro';
    }
}
