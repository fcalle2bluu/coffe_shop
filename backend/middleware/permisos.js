// Identidad y permisos derivados SIEMPRE del token de sesión ya verificado
// (`req.usuario`, que deja el middleware `verificarSesion`), nunca de lo que
// manda el navegador.
//
// Antes cada archivo de rutas tenía su propia copia de estos chequeos y leía el
// usuario de `x-usuario-id` / `?usuario_id` / body — valores que el cliente podía
// mandar a gusto. Eso abría dos problemas reales:
//   1. Seguridad: cualquiera con una sesión válida podía actuar "como" otro
//      usuario simplemente cambiando ese parámetro.
//   2. Sesiones cruzadas: si en la misma PC alguien abría otra pestaña y entraba
//      con su usuario, pisaba los datos guardados del navegador y la pestaña que
//      seguía abierta empezaba a operar (y a quedar registrada en bitácora) a
//      nombre de la persona equivocada.
//
// Como `verificarSesion` ya trae el rol del usuario desde la BD, estos chequeos
// no vuelven a consultar la base: son solo comparaciones en memoria.

const ROLES_ADMIN = ['ADMIN', 'ADMINISTRADOR'];

function rolDe(req) {
    return ((req.usuario && req.usuario.rol) || '').toUpperCase();
}

function esAdmin(req) {
    return ROLES_ADMIN.includes(rolDe(req));
}

function usuarioId(req) {
    return req.usuario ? req.usuario.id : null;
}

// Exige que el rol del token esté entre los indicados. Un administrador siempre
// pasa, así que no hace falta repetir 'ADMIN' en cada llamada.
function exigirRol(...rolesPermitidos) {
    const permitidos = new Set([...ROLES_ADMIN, ...rolesPermitidos.map((r) => r.toUpperCase())]);
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ error: 'Sesión requerida.' });
        }
        if (!permitidos.has(rolDe(req))) {
            return res.status(403).json({ error: 'Acceso denegado: No tienes permisos suficientes.' });
        }
        next();
    };
}

const soloAdmin = exigirRol();

module.exports = { exigirRol, soloAdmin, esAdmin, rolDe, usuarioId, ROLES_ADMIN };
