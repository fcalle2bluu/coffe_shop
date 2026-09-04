// frontend/js/facturas.js
let archivoSeleccionado = null;

document.addEventListener('DOMContentLoaded', () => {
    const dropzone = document.getElementById('dropzone');
    const input = document.getElementById('input-pdf');
    const btnProcesar = document.getElementById('btn-procesar');

    dropzone.addEventListener('click', () => input.click());

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('arrastrando');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('arrastrando'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('arrastrando');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            seleccionarArchivo(e.dataTransfer.files[0]);
        }
    });

    input.addEventListener('change', () => {
        if (input.files && input.files[0]) seleccionarArchivo(input.files[0]);
    });

    btnProcesar.addEventListener('click', reformatearFactura);
});

function seleccionarArchivo(archivo) {
    if (archivo.type !== 'application/pdf') {
        mostrarEstado('El archivo debe ser un PDF.', true);
        return;
    }
    archivoSeleccionado = archivo;
    document.getElementById('nombre-archivo').textContent = archivo.name;
    document.getElementById('btn-procesar').disabled = false;
    mostrarEstado('');
}

function mostrarEstado(mensaje, esError = false) {
    const el = document.getElementById('estado');
    el.textContent = mensaje;
    el.className = 'text-xs mt-3 ' + (esError ? 'text-red-400' : 'text-slate-400');
}

async function reformatearFactura() {
    if (!archivoSeleccionado) return;
    const btn = document.getElementById('btn-procesar');
    btn.disabled = true;
    mostrarEstado('Leyendo el PDF y recortando el QR...');

    try {
        const formData = new FormData();
        formData.append('pdf', archivoSeleccionado);

        // Primero pedimos los campos detectados, para mostrarlos y que el usuario
        // pueda verificar que la lectura del PDF salió bien.
        const resAnalisis = await fetch('/api/facturas/analizar', { method: 'POST', body: formData });
        const analisis = await resAnalisis.json();
        if (!resAnalisis.ok) throw new Error(analisis.error || 'Error al analizar el PDF');

        mostrarCamposDetectados(analisis);

        // Luego pedimos el PDF final ya reformateado a 58mm.
        const formData2 = new FormData();
        formData2.append('pdf', archivoSeleccionado);
        const resPdf = await fetch('/api/facturas/reformatear', { method: 'POST', body: formData2 });
        if (!resPdf.ok) {
            const err = await resPdf.json().catch(() => ({}));
            throw new Error(err.error || 'Error al generar el ticket');
        }
        const blob = await resPdf.blob();
        const url = URL.createObjectURL(blob);

        const frame = document.getElementById('frame-preview');
        frame.src = url;
        frame.classList.remove('hidden');
        document.getElementById('preview-vacio').classList.add('hidden');

        const btnDescargar = document.getElementById('btn-descargar');
        btnDescargar.href = url;
        btnDescargar.download = `ticket_factura_${analisis.campos.facturaNumero || 'nuevo'}.pdf`;
        btnDescargar.classList.remove('hidden');

        mostrarEstado('Listo. Ticket generado correctamente.');
    } catch (error) {
        console.error(error);
        mostrarEstado('Error: ' + error.message, true);
    } finally {
        btn.disabled = false;
    }
}

function mostrarCamposDetectados(analisis) {
    const panel = document.getElementById('panel-campos');
    const lista = document.getElementById('lista-campos');
    const c = analisis.campos;

    const filas = [
        ['Emisor', c.razonSocialEmisor],
        ['NIT emisor', c.nitEmisor],
        ['N° Factura', c.facturaNumero],
        ['CUF', c.cuf ? c.cuf.slice(0, 20) + '…' : null],
        ['Fecha', c.fecha],
        ['Cliente', c.clienteNombre],
        ['NIT/CI cliente', c.clienteNitCi],
        ['Items detectados', c.items ? c.items.length : 0],
        ['Total Bs', c.total],
        ['QR detectado', analisis.qrDetectado ? 'Sí' : 'No'],
    ];

    lista.innerHTML = filas.map(([etiqueta, valor]) => `
        <div class="flex justify-between gap-2">
            <dt class="text-slate-500">${etiqueta}</dt>
            <dd class="text-slate-200 truncate max-w-[60%] text-right">${valor ?? '—'}</dd>
        </div>
    `).join('');

    panel.classList.remove('hidden');
}
