const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/auth');
const dbVM = require('../db-vm');

router.use(authenticateToken);

// Middleware de Permissão - Meu pau na sua mão
const checkRadiusPermission = (req, res, next) => {
    const { role, sector } = req.user;
    // Admin Master acessa OU (Full acessa SE for do setor N2) - Resto rapa
    if (role === 'ADMIN_MASTER' || (role === 'FULL' && sector === 'SUPORTE_N2')) {
        next();
    } else {
        return res.status(403).json({ error: "Acesso Negado." });
    }
}
router.use(checkRadiusPermission);

// LISTAR
router.get('/users', async (req, res) => {
    try {
        const sql = `
            SELECT u.username, u.password, 
                (SELECT sa.groupname FROM setor_acesso sa WHERE sa.username = u.username AND sa.priority = 1 LIMIT 1) as setor,
                (SELECT sa.groupname FROM setor_acesso sa WHERE sa.username = u.username AND sa.priority = 2 LIMIT 1) as acesso
            FROM users u 
            WHERE u.attribute = 'Cleartext-Password'
            ORDER BY u.id DESC
        `;
        const result = await dbVM.query(sql);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: "Erro na VM: " + e.message }); }
});

// DROPDOWNS
router.get('/options', async (req, res) => {
    try {
        const setoresRes = await dbVM.query("SELECT DISTINCT groupname FROM setor_acesso WHERE priority = 1 ORDER BY groupname");
        const acessosRes = await dbVM.query("SELECT DISTINCT groupname FROM setor_acesso WHERE priority = 2 ORDER BY groupname");
        res.json({ setores: setoresRes.rows, acessos: acessosRes.rows });
    } catch (e) { res.status(500).json({ error: "Erro ao carregar opções" }); }
});

// CRIAR
router.post('/users', async (req, res) => {
    const { username, password, setor, acesso } = req.body;
    if (!username || !password || !setor || !acesso) return res.status(400).json({ error: "Campos obrigatórios." });

    try {
        const check = await dbVM.query("SELECT username FROM users WHERE username = $1", [username]);
        if (check.rows.length > 0) return res.status(400).json({ error: "Usuário já existe" });

        await dbVM.query("INSERT INTO users (username, attribute, op, password) VALUES ($1, 'Cleartext-Password', ':=', $2)", [username, password]);
        await dbVM.query("INSERT INTO setor_acesso (username, groupname, priority) VALUES ($1, $2, 1)", [username, setor]);
        await dbVM.query("INSERT INTO setor_acesso (username, groupname, priority) VALUES ($1, $2, 2)", [username, acesso]);

        res.json({ message: "Criado no Radius!" });
    } catch (e) { res.status(500).json({ error: "Erro VM: " + e.message }); }
});

// ATUALIZAR
router.put('/users/:username', async (req, res) => {
    const { username } = req.params;
    const { newUsername, password, setor, acesso } = req.body;

    try {
        let targetUser = username;
        if (newUsername && newUsername !== username) {
            await dbVM.query("UPDATE users SET username = $1 WHERE username = $2", [newUsername, username]);
            await dbVM.query("UPDATE setor_acesso SET username = $1 WHERE username = $2", [newUsername, username]);
            
            targetUser = newUsername;
        }

        // 2. Atualiza a Senha
        if (password) {
            await dbVM.query("UPDATE users SET password = $1, attribute = 'Cleartext-Password', op = ':=' WHERE username = $2", [password, targetUser]);
        }

        // 3. Atualiza Setor e Acesso
        if (setor && acesso) {
            await dbVM.query("DELETE FROM setor_acesso WHERE username = $1", [targetUser]);
            await dbVM.query("INSERT INTO setor_acesso (username, groupname, priority) VALUES ($1, $2, 1)", [targetUser, setor]);
            await dbVM.query("INSERT INTO setor_acesso (username, groupname, priority) VALUES ($1, $2, 2)", [targetUser, acesso]);
        }

        res.json({ message: "Atualizado com sucesso!" });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: "Erro VM: " + e.message }); 
    }
});

// EXCLUIR
router.delete('/users/:username', async (req, res) => {
    const { username } = req.params;
    try {
        await dbVM.query("DELETE FROM users WHERE username = $1", [username]);
        await dbVM.query("DELETE FROM setor_acesso WHERE username = $1", [username]);
        res.json({ message: "Removido!" });
    } catch (e) { res.status(500).json({ error: "Erro VM: " + e.message }); }
});

// LOGS
router.get('/logs', async (req, res) => {
    try {
        const sql = `SELECT username, nas_ip, src_ip, nas_identifier, authdate, reply FROM logs ORDER BY authdate DESC LIMIT 200`;
        const result = await dbVM.query(sql);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar logs." }); }
});

module.exports = router;