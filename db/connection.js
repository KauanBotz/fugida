const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Helper para executar queries
async function executeQuery(queryName, params = []) {
    // Busca a query crua das variáveis de ambiente
    const sql = process.env[queryName];

    if (!sql) {
        console.error(`❌ Query não encontrada no ENV: ${queryName}`);
        throw new Error(`Query missing: ${queryName}`);
    }

    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (error) {
        console.error(`❌ Erro SQL [${queryName}]:`, error.message);
        throw error;
    }
}

module.exports = { pool, executeQuery };