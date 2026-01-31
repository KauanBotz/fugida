module.exports = {
    // Garante que o usuário está logado
    ensureAuthenticated: function(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        req.flash('error_msg', 'Por favor, faça login para acessar este recurso.');
        res.redirect('/'); // Ou para uma página de login dedicada
    },
    
    // Garante que é visitante (útil para não mostrar página de login pra quem já tá logado)
    ensureGuest: function(req, res, next) {
        if (req.isAuthenticated()) {
            return res.redirect('/'); // Redireciona pro dashboard/home
        }
        return next();
    }
};