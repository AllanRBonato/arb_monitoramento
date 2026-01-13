require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dbVM = require('./db-vm');

const prisma = new PrismaClient();
const app = express(); 

const SECRET_KEY = process.env.JWT_SECRET;

// --- CONFIGURAÇÕES DO APP ---
// Aumenta limite para aceitar fotos grandes (10mb)
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

// --- SEED (DADOS INICIAIS) ---
async function seedDatabase() {
    try {
        const rolesData = [
            { name: 'ADMIN_MASTER', level: 100, label: 'Acesso Total' },
            { name: 'FULL',         level: 50,  label: 'Gestor de Setor' },
            { name: 'WRITE',        level: 20,  label: 'Operador' },
            { name: 'BEGINNER',     level: 10,  label: 'Visualizador' }
        ];

        for (const r of rolesData) {
            await prisma.role.upsert({
                where: { name: r.name },
                update: {},
                create: { name: r.name, level: r.level, label: r.label }
            });
        }

        const sectors = ['SUPORTE_N2', 'OEM', 'ATENDIMENTO'];
        for (const s of sectors) {
            await prisma.sector.upsert({
                where: { name: s }, update: {}, create: { name: s }
            });
        }

        // suário padrão caso não tenha nenhum usuário
        const adminEmail = "innon2026@innon.com.br";
        const userExists = await prisma.user.findUnique({ where: { email: adminEmail } });

        if (!userExists) {
            const roleMaster = await prisma.role.findUnique({ where: { name: 'ADMIN_MASTER' } });
            const sectorSuporte = await prisma.sector.findUnique({ where: { name: 'SUPORTE_N2' } });
            const hashedPassword = await bcrypt.hash("@2026Admin", 10);

            await prisma.user.create({
                data: {
                    name: "Administrador Inicial", email: adminEmail, password: hashedPassword, phone: "00000000",
                    roleId: roleMaster.id, sectorId: sectorSuporte.id
                }
            });
            console.log("✅ Usuário Admin checado/criado: admin@arb.com.br");
        }
    } catch (error) { console.error("Erro no Seed:", error); }
}
seedDatabase();

// --- MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token ausente' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
}


// ================= ROTAS =================

// LOGIN
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ 
            where: { email }, include: { role: true, sector: true } 
        });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Credenciais inválidas" });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role.name, level: user.role.level, sector: user.sector.name }, 
            SECRET_KEY, { expiresIn: '8h' }
        );

        res.json({ 
            message: "OK", token, 
            role: user.role.name, sector: user.sector.name, avatar: user.avatar 
        });
    } catch (e) { res.status(500).json({ error: "Erro servidor" }); }
});

// LISTAR USUÁRIOS
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const { role, sector } = req.user;
        let whereClause = {};

        if (role === 'ADMIN_MASTER') {
            whereClause = {}; 
        } else if (role === 'FULL') {
            whereClause = { 
                sector: { name: sector },
                role: { level: { lt: 100 } } 
            };
        } else {
            return res.status(403).json({ error: "Sem permissão" });
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: { 
                id: true, name: true, email: true, 
                role: { select: { name: true, label: true } }, 
                sector: { select: { name: true } } 
            },
            orderBy: { role: { level: 'desc' } }
        });
        
        const formatted = users.map(u => ({
            ...u, role: u.role.name, roleLabel: u.role.label, sector: u.sector.name
        }));
        res.json(formatted);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// OBTER UM USUÁRIO (PARA EDIÇÃO)
app.get('/api/users/:id', authenticateToken, async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, sector: true }
    });
    if(user) user.password = undefined; 
    res.json(user);
});

// 4. CRIAR USUÁRIO (COM PROTEÇÃO DE HIERARQUIA)
app.post('/api/users', authenticateToken, async (req, res) => {
    const { name, email, password, phone, roleName, sectorName } = req.body;
    
    // REGRA DE SEGURANÇA 1: Quem é FULL ou menor não pode criar usuários
    // (A menos que você queira que FULL crie usuários operacionais, mas aqui vou bloquear)
    if (req.user.level < 50) { 
        return res.status(403).json({ error: "Você não tem permissão para criar usuários." });
    }

    try {
        const role = await prisma.role.findUnique({ where: { name: roleName } });
        const sector = await prisma.sector.findUnique({ where: { name: sectorName } });
        
        if (!role || !sector) return res.status(400).json({ error: "Dados inválidos" });

        // REGRA DE SEGURANÇA 2: Ninguém pode criar um cargo maior ou igual ao seu
        // Exceção: ADMIN_MASTER pode criar outro ADMIN_MASTER
        if (role.level >= req.user.level && req.user.role !== 'ADMIN_MASTER') {
            return res.status(403).json({ error: "Você não pode criar um usuário com este nível de acesso." });
        }

        // REGRA DE SEGURANÇA 3: FULL só cria no próprio setor
        if (req.user.role === 'FULL' && sector.name !== req.user.sector) {
            return res.status(403).json({ error: "Você só pode criar usuários no seu setor." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { name, email, password: hashedPassword, phone, roleId: role.id, sectorId: sector.id }
        });
        res.status(201).json({ message: "Criado" });
    } catch (e) { res.status(500).json({ error: "Erro ao criar (Email duplicado?)" }); }
});

// 5. ATUALIZAR USUÁRIO (PUT) (COM A MESMA PROTEÇÃO)
app.put('/api/users/:id', authenticateToken, async (req, res) => {
    // Validação básica
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão" });

    const { id } = req.params;
    const { name, email, phone, roleName, sectorName, password } = req.body;

    try {
        // Se estiver tentando mudar o cargo, verifica a hierarquia
        if (roleName) {
            const newRole = await prisma.role.findUnique({ where: { name: roleName } });
            
            // Ninguém (exceto Master) pode promover alguém para um cargo maior ou igual ao seu
            if (newRole && newRole.level >= req.user.level && req.user.role !== 'ADMIN_MASTER') {
                return res.status(403).json({ error: "Você não pode promover alguém a este nível." });
            }
        }

        const updateData = { name, email, phone };
        
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        if (roleName) {
            const role = await prisma.role.findUnique({ where: { name: roleName } });
            if (role) updateData.roleId = role.id;
        }
        if (sectorName) {
            const sector = await prisma.sector.findUnique({ where: { name: sectorName } });
            if (sector) updateData.sectorId = sector.id;
        }

        await prisma.user.update({ where: { id }, data: updateData });
        res.json({ message: "Atualizado!" });
    } catch (error) { res.status(500).json({ error: "Erro ao atualizar." }); }
});

// 6. EXCLUIR USUÁRIO (DELETE)
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
    // Segurança: Só quem é Gerente (50) ou Master (100) pode apagar
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão para excluir." });

    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: "Usuário excluído com sucesso!" });
    } catch (e) {
        res.status(500).json({ error: "Erro ao excluir (Talvez o usuário não exista)." });
    }
});

// SALVAR AVATAR
app.post('/api/user/avatar', authenticateToken, async (req, res) => {
    const { avatarBase64 } = req.body;
    try {
        await prisma.user.update({
            where: { id: req.user.id },
            data: { avatar: avatarBase64 }
        });
        res.json({ message: "Foto salva!" });
    } catch (e) { res.status(500).json({ error: "Erro ao salvar foto" }); }
});

// GESTÃO DE CARGOS/SETORES
app.post('/api/roles', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    const { name, level, label } = req.body;
    try {
        const newRole = await prisma.role.create({ data: { name, level: parseInt(level), label } });
        res.json(newRole);
    } catch (e) { res.status(400).json({ error: "Erro ao criar cargo" }); }
});

app.post('/api/sectors', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        const newSector = await prisma.sector.create({ data: { name: req.body.name } });
        res.json(newSector);
    } catch (e) { res.status(400).json({ error: "Setor já existe" }); }
});

// Dropdowns
app.get('/api/roles', async (req, res) => res.json(await prisma.role.findMany({ orderBy: { level: 'desc' } })));
app.get('/api/sectors', async (req, res) => res.json(await prisma.sector.findMany()));

// 1. ATUALIZAR SETOR
app.put('/api/sectors/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        await prisma.sector.update({
            where: { id: req.params.id },
            data: { name: req.body.name }
        });
        res.json({ message: "Setor atualizado!" });
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar." }); }
});

// 2. EXCLUIR SETOR
app.delete('/api/sectors/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        // Verifica se tem gente usando antes de apagar
        const usersInSector = await prisma.user.count({ where: { sectorId: req.params.id } });
        if (usersInSector > 0) return res.status(400).json({ error: "Não pode apagar: Existem usuários neste setor!" });

        await prisma.sector.delete({ where: { id: req.params.id } });
        res.json({ message: "Setor excluído!" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir." }); }
});

// 3. ATUALIZAR CARGO
app.put('/api/roles/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    const { name, level, label } = req.body;
    try {
        await prisma.role.update({
            where: { id: req.params.id },
            data: { name, level: parseInt(level), label }
        });
        res.json({ message: "Cargo atualizado!" });
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar." }); }
});

// 4. EXCLUIR CARGO
app.delete('/api/roles/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        const usersInRole = await prisma.user.count({ where: { roleId: req.params.id } });
        if (usersInRole > 0) return res.status(400).json({ error: "Não pode apagar: Existem usuários com este cargo!" });

        await prisma.role.delete({ where: { id: req.params.id } });
        res.json({ message: "Cargo excluído!" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir." }); }
});

// ================= ROTAS DE NOTAS (PESSOAIS) =================

// 1. LISTAR MINHAS NOTAS
app.get('/api/notes', authenticateToken, async (req, res) => {
    try {
        const notes = await prisma.note.findMany({
            where: { userId: req.user.id }, // Só pega as notas DO USUÁRIO logado
            orderBy: { updatedAt: 'desc' }
        });
        res.json(notes);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar notas" }); }
});

// 2. CRIAR NOTA
app.post('/api/notes', authenticateToken, async (req, res) => {
    const { title, content, dueDate, importance, color, completed } = req.body;
    try {
        const newNote = await prisma.note.create({
            data: {
                title, content, dueDate, importance, color, completed,
                userId: req.user.id // Vincula ao usuário logado
            }
        });
        res.json(newNote);
    } catch (e) { res.status(500).json({ error: "Erro ao salvar nota" }); }
});

// 3. ATUALIZAR NOTA
app.put('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    // Garante que a nota pertence ao usuário antes de editar
    const note = await prisma.note.findFirst({ where: { id, userId: req.user.id } });
    if (!note) return res.status(403).json({ error: "Nota não encontrada ou sem permissão" });

    try {
        const updated = await prisma.note.update({
            where: { id },
            data: req.body // Atualiza os campos enviados
        });
        res.json(updated);
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar" }); }
});

// 4. EXCLUIR NOTA
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const note = await prisma.note.findFirst({ where: { id, userId: req.user.id } });
    if (!note) return res.status(403).json({ error: "Sem permissão" });

    try {
        await prisma.note.delete({ where: { id } });
        res.json({ message: "Nota excluída" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir" }); }
});

// ================= RECUPERAÇÃO DE SENHA =================

// 1. USUÁRIO SOLICITA RESET (PÚBLICO)
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ error: "E-mail não encontrado." });

        // Verifica se já tem pedido pendente
        const existing = await prisma.passwordRequest.findFirst({
            where: { userId: user.id, status: 'PENDING' }
        });

        if (existing) return res.status(400).json({ error: "Já existe uma solicitação pendente para este e-mail." });

        await prisma.passwordRequest.create({ data: { userId: user.id } });
        
        res.json({ message: "Solicitação enviada! Avise seu supervisor." });
    } catch (e) { res.status(500).json({ error: "Erro no servidor" }); }
});

// 2. ADMIN VÊ SOLICITAÇÕES (FILTRADO POR SETOR)
app.get('/api/admin/password-requests', authenticateToken, async (req, res) => {
    // Só Admin ou Full podem ver
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão" });

    try {
        let whereUser = {};
        
        // Se for FULL (Gerente), só vê do setor dele
        if (req.user.role === 'FULL') {
            whereUser = { sector: { name: req.user.sector } };
        }

        const requests = await prisma.passwordRequest.findMany({
            where: { 
                status: 'PENDING',
                user: whereUser // Filtra os usuários baseado no cargo de quem tá vendo
            },
            include: { 
                user: { select: { id: true, name: true, email: true, sector: { select: { name: true } } } } 
            }
        });

        res.json(requests);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar solicitações" }); }
});

// 3. ADMIN RESOLVE (DELETA O PEDIDO APÓS MUDAR A SENHA)
app.delete('/api/admin/password-requests/:id', authenticateToken, async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão" });
    try {
        await prisma.passwordRequest.delete({ where: { id: req.params.id } });
        res.json({ message: "Solicitação removida." });
    } catch (e) { res.status(500).json({ error: "Erro ao limpar solicitação" }); }
});

// Rota para testar conexão com a VM
app.get('/api/vm/status', authenticateToken, async (req, res) => {
    try {
        // Executa um comando SQL direto na VM
        const result = await dbVM.query('SELECT NOW() as hora_servidor, inet_server_addr() as ip_servidor');

        res.json({
            status: "Conectado",
            mensagem: "A VM respondeu!",
            dados_vm: result.rows[0] // Retorna o IP e a Hora da VM
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Falha ao comunicar com a VM", detalhes: error.message });
    }
});

// ================= GESTÃO RADIUS (VM EXTERNA) =================

// Middleware auxiliar ou verificação manual em cada rota
const checkRadiusPermission = (req, res, next) => {
    if (req.user.role !== 'ADMIN_MASTER' && req.user.role !== 'FULL') {
        return res.status(403).json({ error: "Acesso negado: Apenas Admin ou Full." });
    }
    next();
};

// 1. LISTAR USUÁRIOS RADIUS
app.get('/api/radius/users', authenticateToken, checkRadiusPermission, async (req, res) => {
    try {
        const sql = `
            SELECT rc.id, rc.username, rc.value as password, rug.groupname 
            FROM radcheck rc 
            LEFT JOIN radusergroup rug ON rc.username = rug.username 
            WHERE rc.attribute = 'Cleartext-Password'
            ORDER BY rc.id DESC
        `;
        const result = await dbVM.query(sql);
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro ao buscar dados na VM" });
    }
});

// 2. CRIAR USUÁRIO RADIUS
app.post('/api/radius/users', authenticateToken, checkRadiusPermission, async (req, res) => {
    const { username, password, groupname } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Usuário e Senha obrigatórios" });

    try {
        const check = await dbVM.query("SELECT username FROM radcheck WHERE username = $1", [username]);
        if (check.rows.length > 0) return res.status(400).json({ error: "Usuário já existe no Radius" });

        await dbVM.query(
            "INSERT INTO radcheck (username, attribute, op, value) VALUES ($1, 'Cleartext-Password', ':=', $2)",
            [username, password]
        );

        if (groupname) {
            await dbVM.query(
                "INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, 1)",
                [username, groupname]
            );
        }
        res.json({ message: "Usuário Radius criado!" });
    } catch (e) { res.status(500).json({ error: "Erro ao criar na VM" }); }
});

// 3. EDITAR USUÁRIO
app.put('/api/radius/users/:username', authenticateToken, checkRadiusPermission, async (req, res) => {
    const { username } = req.params;
    const { password, groupname } = req.body;

    try {
        if (password) {
            await dbVM.query(
                "UPDATE radcheck SET value = $1 WHERE username = $2 AND attribute = 'Cleartext-Password'",
                [password, username]
            );
        }
        if (groupname) {
            await dbVM.query("DELETE FROM radusergroup WHERE username = $1", [username]);
            await dbVM.query(
                "INSERT INTO radusergroup (username, groupname, priority) VALUES ($1, $2, 1)",
                [username, groupname]
            );
        }
        res.json({ message: "Usuário Radius atualizado!" });
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar na VM" }); }
});

// 4. EXCLUIR USUÁRIO
app.delete('/api/radius/users/:username', authenticateToken, checkRadiusPermission, async (req, res) => {
    const { username } = req.params;
    try {
        await dbVM.query("DELETE FROM radcheck WHERE username = $1", [username]);
        await dbVM.query("DELETE FROM radusergroup WHERE username = $1", [username]);
        res.json({ message: "Usuário removido do Radius!" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir na VM" }); }
});

// 5. LISTAR GRUPOS/PLANOS DISPONÍVEIS (Para o Dropdown)
app.get('/api/radius/groups', authenticateToken, checkRadiusPermission, async (req, res) => {
    try {
        // Busca todos os nomes de grupos distintos usados na radusergroup
        // (E opcionalmente na radgroupreply se você tiver planos definidos lá sem usuários ainda)
        const sql = `
            SELECT DISTINCT groupname 
            FROM radusergroup 
            UNION 
            SELECT DISTINCT groupname 
            FROM radgroupreply 
            ORDER BY groupname
        `;
        
        const result = await dbVM.query(sql);
        res.json(result.rows);
    } catch (e) {
        console.error(e);
        // Se der erro (ex: tabela radgroupreply vazia), tenta só na radusergroup
        try {
            const resultBackup = await dbVM.query("SELECT DISTINCT groupname FROM radusergroup ORDER BY groupname");
            res.json(resultBackup.rows);
        } catch (errBackup) {
            res.status(500).json({ error: "Erro ao buscar grupos" });
        }
    }
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));