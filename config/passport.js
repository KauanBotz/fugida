const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool, executeQuery } = require('../db/connection');
require('dotenv').config();

module.exports = function(passport) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
        const newUser = {
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
            avatar: profile.photos[0].value
        };

        try {
            // 1. Tenta achar o usuário pelo Google ID
            let users = await executeQuery('SELECT_USER_BY_GOOGLE_ID', [newUser.googleId]);

            if (users.length > 0) {
                // Usuário existe -> Login
                return done(null, users[0]);
            } else {
                // 2. Não achou pelo Google ID? Verifica se o email já existe (mesclagem simples)
                // Se já existir email, atualizamos o google_id, senão criamos novo.
                let emailCheck = await executeQuery('SELECT_USER_BY_EMAIL', [newUser.email]);
                
                if (emailCheck.length > 0) {
                    // Email existe, vincula Google ID
                    await executeQuery('UPDATE_USER_GOOGLE_ID', [newUser.googleId, newUser.avatar, emailCheck[0].id]);
                    return done(null, { ...emailCheck[0], google_id: newUser.googleId, avatar_url: newUser.avatar });
                } else {
                    // 3. Usuário novo -> Registro
                    const result = await pool.execute(process.env.INSERT_GOOGLE_USER, 
                        [newUser.name, newUser.email, newUser.googleId, newUser.avatar]);
                    
                    const newUserId = result[0].insertId;
                    const createdUser = await executeQuery('SELECT_USER_BY_ID', [newUserId]);
                    return done(null, createdUser[0]);
                }
            }
        } catch (err) {
            console.error(err);
            return done(err, null);
        }
    }));

    // Serializar: Salva apenas o ID na sessão
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Desserializar: Pega o ID da sessão e busca o usuário completo no banco
    passport.deserializeUser(async (id, done) => {
        try {
            const users = await executeQuery('SELECT_USER_BY_ID', [id]);
            done(null, users[0]);
        } catch (err) {
            done(err, null);
        }
    });
};