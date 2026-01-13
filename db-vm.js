const { Pool } = require('pg');

// Cria o Pool usando as variáveis do .env
const pool = new Pool({
    host: process.env.VM_DB_HOST,
    port: process.env.VM_DB_PORT,
    user: process.env.VM_DB_USER,
    password: process.env.VM_DB_PASS,
    database: process.env.VM_DB_NAME,
    // Opcional: Define tempo limite para não travar se a VM cair
    connectionTimeoutMillis: 5000, 
});

// Teste de conexão silencioso (avisa no terminal se conectar ou falhar)
pool.connect()
    .then(client => {
        console.log('✅ Conexão com Banco da VM estabelecida com sucesso!');
        client.release(); // Libera a conexão de teste
    })
    .catch(err => {
        console.error('❌ Erro ao conectar na VM. Verifique IP e Senha.', err.message);
    });

// Exporta a função "query" para usar no resto do projeto
module.exports = {
    query: (text, params) => pool.query(text, params),
};