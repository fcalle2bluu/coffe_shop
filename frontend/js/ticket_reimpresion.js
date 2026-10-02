// frontend/js/ticket_reimpresion.js
//
// Re-impresión de tickets de ventas ya cobradas, reutilizable en cualquier página.
//
// El módulo se trae su propio modal y su propio CSS de impresión y los inyecta en
// la página, así no hay que duplicar el markup del ticket ni las reglas de @media
// print en cada HTML que quiera reimprimir.
//
// Uso: cargar este script y llamar a reimprimirTicketVenta(idDeLaVenta).

(function () {
    const ID_MODAL = 'modalReimpresionTicket';
    const ID_PAPEL = 'zona-reimpresion';
    const CLASE_PAPEL = 'ticket-papel';
    const CLASE_IMPRIMIENDO = 'imprimiendo-reimpresion';

    // El tema oscuro de security_guard.js pisa .bg-white y .text-stone-* con
    // !important en toda la app, y un ticket armado con esas clases de Tailwind
    // termina con letra casi blanca sobre papel blanco. Por eso el ticket no usa
    // ninguna clase de color de Tailwind: el papel se pinta acá, con sus propias
    // clases y !important, y conserva el aspecto de papel (fondo blanco, tinta negra).
    const CSS_PANTALLA = `
        #${ID_MODAL} {
            position: fixed; inset: 0; z-index: 70;
            display: none; align-items: center; justify-content: center;
            background: rgba(2, 6, 23, 0.7); padding: 16px;
        }
        #${ID_MODAL}.visible { display: flex; }
        #${ID_MODAL} .rt-marco {
            background: #0d1c34; border: 1px solid rgba(96, 165, 250, 0.25);
            border-radius: 12px; box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.6);
            padding: 16px; width: 100%; max-width: 26rem;
            max-height: 95vh; display: flex; flex-direction: column; gap: 14px;
        }
        #${ID_MODAL} .rt-cabecera {
            display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        #${ID_MODAL} .rt-titulo {
            color: #ffffff; font-weight: 700; font-size: 1.05rem; margin: 0;
        }
        #${ID_MODAL} .rt-cerrar {
            background: none; border: 0; cursor: pointer; font-size: 1.25rem;
            line-height: 1; color: #cbd5e1; padding: 2px 6px; border-radius: 6px;
        }
        #${ID_MODAL} .rt-cerrar:hover { color: #f87171; }
        #${ID_MODAL} .rt-visor {
            overflow-y: auto; display: flex; justify-content: center; flex: 1 1 auto;
        }
        #${ID_MODAL} .rt-pie { display: flex; justify-content: center; gap: 8px; }
        #${ID_MODAL} .rt-btn {
            border: 0; cursor: pointer; border-radius: 6px; font-weight: 700;
            font-size: 0.8125rem; padding: 9px 16px;
        }
        #${ID_MODAL} .rt-btn-secundario { background: #cbd5e1; color: #1e293b; }
        #${ID_MODAL} .rt-btn-secundario:hover { background: #94a3b8; }
        #${ID_MODAL} .rt-btn-primario { background: #ea580c; color: #ffffff; }
        #${ID_MODAL} .rt-btn-primario:hover { background: #c2410c; }
        #${ID_MODAL} .rt-btn[disabled] { opacity: 0.6; cursor: default; }

        /* ── El papel ──
           Va por clase (no por id) para que una copia fuera de pantalla reciba
           exactamente el mismo estilo y se pueda medir el largo real del ticket. */
        .${CLASE_PAPEL} {
            background: #ffffff !important; color: #1c1917 !important;
            width: 100%; max-width: 300px; padding: 20px;
            border-top: 8px solid #292524;
            font-family: 'JetBrains Mono', ui-monospace, monospace !important;
            font-size: 12px; line-height: 1.35;
            box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.08);
        }
        .${CLASE_PAPEL} * { color: #1c1917 !important; background: transparent !important; }
        .${CLASE_PAPEL} .rt-centro { text-align: center; }
        .${CLASE_PAPEL} .rt-local { font-size: 20px; font-weight: 900; letter-spacing: 0.15em; margin: 0; }
        .${CLASE_PAPEL} .rt-chico { font-size: 10px; margin: 2px 0 0; }
        .${CLASE_PAPEL} .rt-nro { font-size: 17px; font-weight: 700; margin: 4px 0 0; }
        .${CLASE_PAPEL} .rt-anulada {
            margin: 8px 0 0; padding: 3px 0; font-weight: 900; font-size: 13px;
            letter-spacing: 0.1em; border: 2px solid #1c1917; text-align: center;
        }
        .${CLASE_PAPEL} .rt-separador { border-top: 2px dashed #9ca3af; margin: 9px 0; }
        .${CLASE_PAPEL} table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .${CLASE_PAPEL} th {
            text-align: left; font-weight: 700; padding: 3px 0;
            border-bottom: 1px solid #1c1917;
        }
        .${CLASE_PAPEL} td { padding: 3px 0; border-bottom: 1px dashed #d4d4d4; vertical-align: top; }
        .${CLASE_PAPEL} .rt-cant { width: 34px; text-align: left; }
        .${CLASE_PAPEL} .rt-imp { width: 70px; text-align: right; }
        .${CLASE_PAPEL} .rt-linea {
            display: flex; justify-content: space-between; gap: 10px; font-size: 11px;
        }
        .${CLASE_PAPEL} .rt-total { font-size: 14px; font-weight: 900; }
        .${CLASE_PAPEL} .rt-gracias { margin-top: 20px; font-size: 10px; font-style: italic; text-align: center; }
    `;

    // Rollo de 58 mm (el ancho de las impresoras térmicas del local).
    const ANCHO_PAPEL_MM = 58;

    // Este CSS se inyecta SOLO mientras se imprime y se saca al terminar: la regla
    // @page es global y arruinaría cualquier otra impresión de la página (por
    // ejemplo el libro diario completo en hoja carta) si quedara puesta.
    //
    // OJO con el alto: `size: 58mm auto` NO es sintaxis válida (la especificación
    // acepta una o dos longitudes, o `auto` solo, pero no una longitud + auto).
    // El navegador descarta la declaración completa y vuelve a tamaño Carta, que
    // es por lo que un ticket "de 58 mm" terminaba saliendo en una hoja entera.
    // Por eso el alto se calcula y se escribe explícitamente.
    const cssImpresion = (altoMm) => `
        @page { size: ${ANCHO_PAPEL_MM}mm ${altoMm}mm; margin: 0; }

        body.${CLASE_IMPRIMIENDO} > *:not(#${ID_MODAL}) { display: none !important; }
        /* El <html> también: las páginas fijan el azul oscuro ahí, y si el usuario
           tiene activado "gráficos de fondo" al imprimir, saldría una banda negra
           al pie del ticket. */
        html:has(body.${CLASE_IMPRIMIENDO}),
        body.${CLASE_IMPRIMIENDO} {
            display: block !important; background: #ffffff !important;
            margin: 0 !important; padding: 0 !important; min-height: 0 !important;
        }
        /* El modal deja de ser ventana flotante y el ticket pasa a ser el documento */
        body.${CLASE_IMPRIMIENDO} #${ID_MODAL},
        body.${CLASE_IMPRIMIENDO} #${ID_MODAL} .rt-marco,
        body.${CLASE_IMPRIMIENDO} #${ID_MODAL} .rt-visor {
            display: block !important; position: static !important;
            background: #ffffff !important; border: 0 !important;
            box-shadow: none !important; border-radius: 0 !important;
            padding: 0 !important; margin: 0 !important;
            width: auto !important; max-width: none !important;
            max-height: none !important; overflow: visible !important;
        }
        body.${CLASE_IMPRIMIENDO} .rt-no-imprimir { display: none !important; }
        body.${CLASE_IMPRIMIENDO} .${CLASE_PAPEL} {
            width: 100% !important; max-width: none !important;
            margin: 0 !important; padding: 2mm 1.5mm !important;
            border-top: 0 !important; box-shadow: none !important;
            font-size: 11px !important; line-height: 1.2 !important;
        }
        /* Sólo se evita cortar una línea de producto por la mitad. Poner
           break-inside:avoid en el ticket completo hace lo contrario de lo
           esperado: si no cabe en la hoja, el motor lo empuja y acaba emitiendo
           hojas de más. */
        body.${CLASE_IMPRIMIENDO} .${CLASE_PAPEL} tr {
            page-break-inside: avoid !important; break-inside: avoid !important;
        }
    `;

    const MARCADO = `
        <div class="rt-marco">
            <div class="rt-cabecera rt-no-imprimir">
                <h3 class="rt-titulo">Re-impresión del Ticket</h3>
                <button type="button" class="rt-cerrar" data-rt-cerrar aria-label="Cerrar">&times;</button>
            </div>
            <div class="rt-visor">
                <div id="${ID_PAPEL}" class="${CLASE_PAPEL}">
                    <div class="rt-centro">
                        <h2 class="rt-local">Café La Paz</h2>
                        <p class="rt-chico">Cafetería de Especialidad</p>
                        <p class="rt-chico">La Paz, Bolivia</p>
                        <p class="rt-chico" data-rt="fecha">--/--/---- --:--</p>
                        <p class="rt-nro">TICKET #<span data-rt="numero">0000</span></p>
                    </div>
                    <div class="rt-anulada" data-rt="anulada" hidden>*** ANULADA ***</div>
                    <div class="rt-separador"></div>
                    <table>
                        <thead>
                            <tr>
                                <th class="rt-cant">CANT</th>
                                <th>DESC</th>
                                <th class="rt-imp">IMP</th>
                            </tr>
                        </thead>
                        <tbody data-rt="items"></tbody>
                    </table>
                    <div class="rt-separador"></div>
                    <div class="rt-linea rt-total">
                        <span>TOTAL:</span>
                        <span data-rt="total">Bs. 0.00</span>
                    </div>
                    <div class="rt-linea">
                        <span>PAGO:</span>
                        <span data-rt="pago">EFECTIVO</span>
                    </div>
                    <div class="rt-gracias">
                        <p style="margin:0">¡Gracias por tu compra!</p>
                        <p style="margin:0">Vuelve pronto a Café La Paz</p>
                    </div>
                </div>
            </div>
            <div class="rt-pie rt-no-imprimir">
                <button type="button" class="rt-btn rt-btn-secundario" data-rt-cerrar>Cerrar</button>
                <button type="button" class="rt-btn rt-btn-primario" data-rt-imprimir>Imprimir</button>
            </div>
        </div>
    `;

    let modal = null;

    function montar() {
        if (modal) return modal;

        const estilo = document.createElement('style');
        estilo.id = 'estilo-reimpresion-ticket';
        estilo.textContent = CSS_PANTALLA;
        document.head.appendChild(estilo);

        modal = document.createElement('div');
        modal.id = ID_MODAL;
        // 'no-print' es la clase que ya usan otras páginas para excluir del print propio
        modal.className = 'no-print';
        modal.innerHTML = MARCADO;
        document.body.appendChild(modal);

        modal.querySelectorAll('[data-rt-cerrar]').forEach((b) => { b.onclick = cerrar; });
        modal.querySelector('[data-rt-imprimir]').onclick = imprimir;
        // Clic en el fondo oscuro cierra; clic dentro del ticket, no.
        modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });

        return modal;
    }

    function campo(nombre) {
        return modal.querySelector(`[data-rt="${nombre}"]`);
    }

    function cerrar() {
        if (modal) modal.classList.remove('visible');
        document.removeEventListener('keydown', alPresionarTecla);
    }

    function alPresionarTecla(e) {
        if (e.key === 'Escape') cerrar();
    }

    // Mide cuánto mide el ticket cuando el papel tiene el ancho real del rollo,
    // para que la hoja salga del largo exacto y la impresora no expulse rollo en
    // blanco (ni mande la última línea a una segunda hoja).
    //
    // Se mide sobre una COPIA fuera de pantalla con ancho fijo de 58 mm: medir el
    // original no sirve, porque dentro del modal el papel se adapta al ancho de la
    // ventana y el texto se reparte en otra cantidad de líneas que en el papel.
    function altoTicketMm() {
        const papel = document.getElementById(ID_PAPEL);

        const fuera = document.createElement('div');
        fuera.style.cssText = `position:fixed; left:-10000px; top:0; width:${ANCHO_PAPEL_MM}mm;`;

        const copia = papel.cloneNode(true);
        copia.removeAttribute('id');
        copia.removeAttribute('hidden');
        // Mismas medidas que aplica el CSS de impresión, para que lo medido
        // coincida con lo que sale impreso.
        copia.style.cssText = `width:${ANCHO_PAPEL_MM}mm; max-width:${ANCHO_PAPEL_MM}mm;`
            + 'padding:2mm 1.5mm; border-top:0; box-shadow:none;'
            + 'font-size:11px; line-height:1.2;';

        fuera.appendChild(copia);
        document.body.appendChild(fuera);
        const altoPx = copia.getBoundingClientRect().height;
        document.body.removeChild(fuera);

        // 1 px de CSS = 1/96 de pulgada. Un par de milímetros de holgura para que
        // un redondeo no empuje la última línea a una segunda hoja.
        const mm = (altoPx * 25.4) / 96 + 4;
        return Math.max(40, Math.ceil(mm));
    }

    function imprimir() {
        const estilo = document.createElement('style');
        estilo.id = 'estilo-reimpresion-impresion';
        estilo.textContent = cssImpresion(altoTicketMm());
        document.head.appendChild(estilo);
        document.body.classList.add(CLASE_IMPRIMIENDO);

        const limpiar = () => {
            document.body.classList.remove(CLASE_IMPRIMIENDO);
            if (estilo.parentNode) estilo.parentNode.removeChild(estilo);
            window.removeEventListener('afterprint', limpiar);
        };
        window.addEventListener('afterprint', limpiar);

        window.print();
        // Respaldo: en los navegadores donde print() es bloqueante no llega
        // 'afterprint', y si quedara puesto el @page del ticket rompería la
        // siguiente impresión de la página.
        setTimeout(limpiar, 1000);
    }

    function montoBs(valor) {
        const n = parseFloat(valor);
        return `Bs. ${(isNaN(n) ? 0 : n).toFixed(2)}`;
    }

    function texto(valor) {
        const div = document.createElement('div');
        div.textContent = valor == null ? '' : String(valor);
        return div.innerHTML;
    }

    async function reimprimirTicketVenta(ventaId) {
        montar();

        try {
            const res = await fetch(`/api/comprobantes/${ventaId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo leer el ticket.');

            const t = data.ticket || {};
            campo('numero').textContent = String(t.id).padStart(4, '0');
            campo('fecha').textContent = t.fecha || '';
            campo('total').textContent = montoBs(t.total);
            campo('pago').textContent = t.metodo_pago || 'EFECTIVO';

            // Una venta anulada sigue apareciendo en el libro diario: si se
            // reimprime, el papel tiene que decirlo o se confunde con una venta viva.
            const anulada = (t.estado || '').toUpperCase() === 'ANULADA';
            campo('anulada').hidden = !anulada;

            const cuerpo = campo('items');
            const items = data.items || [];
            cuerpo.innerHTML = items.length
                ? items.map((it) => `
                    <tr>
                        <td class="rt-cant">${texto(it.cantidad)}</td>
                        <td>${texto(it.nombre)}</td>
                        <td class="rt-imp">${montoBs(it.subtotal)}</td>
                    </tr>`).join('')
                : `<tr><td colspan="3" class="rt-centro">(sin detalle de productos)</td></tr>`;

            modal.classList.add('visible');
            document.addEventListener('keydown', alPresionarTecla);
        } catch (error) {
            alert('Error al abrir el ticket: ' + error.message);
        }
    }

    window.reimprimirTicketVenta = reimprimirTicketVenta;
})();
