const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.VM_DB_HOST,
    port: process.env.VM_DB_PORT,
    user: process.env.VM_DB_USER,
    password: process.env.VM_DB_PASS,
    database: process.env.VM_DB_NAME,
    connectionTimeoutMillis: 5000, 
});

pool.connect()
    .then(client => {
        console.log('✅ Conexão com Banco da VM estabelecida com sucesso!');
        client.release(); 
    })
    .catch(err => {
        console.error('❌ Erro ao conectar na VM. Verifique IP e Senha.', err.message);
    });

module.exports = {
    query: (text, params) => pool.query(text, params),
};