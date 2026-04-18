const fs = require('fs');
let html = fs.readFileSync('frontend/caja.html', 'utf8');

const badString = "        </div>\r\n    </div><div class='solo-admin bg-white rounded shadow border-t-4 border-orange-500 overflow-hidden flex flex-col min-h-[300px] mt-4 hidden' id='seccion-auditoria-cajeros'><div class='p-3 sm:p-4 border-b bg-white shrink-0 bg-orange-50 border-orange-100 flex justify-between items-center'><h2 class='font-bold text-stone-900 text-base sm:text-lg'><i class='fa-solid fa-user-tie mr-2 text-orange-600'></i>Auditoría: Ventas por Cajero</h2></div><div class='overflow-auto flex-1 p-0 sm:p-4 bg-gray-50' id='contenedor-ventas-cajeros'><div class='text-center p-8 text-gray-400'><i class='fa-solid fa-spinner fa-spin text-2xl'></i></div></div></div></div></main>";
const badStringAlt = "        </div>\n    </div><div class='solo-admin bg-white rounded shadow border-t-4 border-orange-500 overflow-hidden flex flex-col min-h-[300px] mt-4 hidden' id='seccion-auditoria-cajeros'><div class='p-3 sm:p-4 border-b bg-white shrink-0 bg-orange-50 border-orange-100 flex justify-between items-center'><h2 class='font-bold text-stone-900 text-base sm:text-lg'><i class='fa-solid fa-user-tie mr-2 text-orange-600'></i>Auditoría: Ventas por Cajero</h2></div><div class='overflow-auto flex-1 p-0 sm:p-4 bg-gray-50' id='contenedor-ventas-cajeros'><div class='text-center p-8 text-gray-400'><i class='fa-solid fa-spinner fa-spin text-2xl'></i></div></div></div></div></main>";

const goodString = `
            </div>

            <!-- NUEVA SECCIÓN AUDITORIA ADMIN -->
            <div class="solo-admin bg-white rounded shadow border-t-4 border-orange-500 overflow-hidden flex flex-col min-h-[300px] hidden" id="seccion-auditoria-cajeros">
                <div class="p-3 sm:p-4 border-b bg-white shrink-0 bg-orange-50 border-orange-100 flex justify-between items-center">
                    <h2 class="font-bold text-stone-900 text-base sm:text-lg"><i class="fa-solid fa-user-tie mr-2 text-orange-600"></i>Auditoría: Ventas por Cajero</h2>
                </div>
                <div class="overflow-auto flex-1 p-0 sm:p-4 bg-gray-50" id="contenedor-ventas-cajeros">
                    <div class="text-center p-8 text-gray-400"><i class="fa-solid fa-spinner fa-spin text-2xl"></i></div>
                </div>
            </div>

        </div>
    </main>`;

if (html.includes(badString)) {
    html = html.replace(badString, goodString);
    console.log("Replaced using CRLF");
} else if (html.includes(badStringAlt)) {
    html = html.replace(badStringAlt, goodString);
    console.log("Replaced using LF");
} else {
    console.log("String not found! Trying RegExp fallback.");
    html = html.replace(/<\/div>\r?\n\s+<\/div><div class='solo-admin.+<\/main>/g, goodString);
}

fs.writeFileSync('frontend/caja.html', html);
console.log("Fixed caja.html layout!");
