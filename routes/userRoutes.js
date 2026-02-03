const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// --- CONFIGURAÇÃO DE UPLOAD (MULTER) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const userId = req.user ? (req.user.id || req.user.userId) : 'unknown';
        const ext = path.extname(file.originalname);
        cb(null, `avatar-${userId}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas.'));
        }
    }
});

router.use(authenticateToken);

async function getRequester(req) {
    const id = req.user.id || req.user.userId;
    return await prisma.user.findUnique({
        where: { id },
        include: { role: true, sector: true }
    });
}

// 1. SALVAR AVATAR
router.post('/avatar', upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

        const userId = req.user.id || req.user.userId;
        const avatarPath = req.file.path.replace(/\\/g, "/"); 

        await prisma.user.update({
            where: { id: userId },
            data: { avatar: avatarPath }
        });

        res.json({ message: "Avatar atualizado!", path: avatarPath });
    } catch (error) {
        console.error("Erro Upload Avatar:", error);
        res.status(500).json({ error: "Erro ao salvar imagem." });
    }
});

// 2. OBTER MEUS DADOS
router.get('/me', async (req, res) => {
    try {
        const requester = await getRequester(req);
        res.json(requester);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar dados." });
    }
});

// 3. LISTAR USUÁRIOS
router.get('/', async (req, res) => {
    try {
        const requester = await getRequester(req);
        if (!requester) return res.status(403).json({ error: "Usuário não encontrado." });

        // REGRA 1: FILTRO DE SETOR
        let whereClause = {};
        
        if (requester.role.level < 100) {
            whereClause = {
                sectorId: requester.sectorId
            };
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true, name: true, email: true, phone: true, avatar: true,
                viewProjectId: true, // <--- ADICIONADO PARA O FRONT VER O VÍNCULO
                role: { select: { name: true, label: true, level: true } },
                sector: { select: { name: true } }
            },
            orderBy: { name: 'asc' }
        });

        const formatted = users.map(u => ({
            ...u, 
            role: u.role ? u.role.name : null, 
            roleLabel: u.role ? u.role.label : null, 
            roleLevel: u.role ? u.role.level : 0,
            sector: u.sector ? u.sector.name : null
        }));
        res.json(formatted);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. OBTER UM USUÁRIO POR ID
router.get('/:id', async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, sector: true }
    });
    if (user) user.password = undefined;
    res.json(user);
});

// 5. CRIAR USUÁRIO (COM TRAVA DE HIERARQUIA E PROJETO)
router.post('/', async (req, res) => {
    // ADICIONEI viewProjectId AQUI
    const { name, email, password, phone, roleName, sectorName, viewProjectId } = req.body;
    try {
        const requester = await getRequester(req);

        const targetRole = await prisma.role.findUnique({ where: { name: roleName } });
        if (!targetRole) return res.status(400).json({ error: "Cargo inválido" });

        if (targetRole.level >= requester.role.level) {
            return res.status(403).json({ 
                error: "Permissão negada: Você não pode criar um usuário com este nível de acesso." 
            });
        }

        let sectorIdToUse;
        if (requester.role.level >= 100) {
            const sector = await prisma.sector.findUnique({ where: { name: sectorName } });
            if (!sector) return res.status(400).json({ error: "Setor inválido" });
            sectorIdToUse = sector.id;
        } else {
            sectorIdToUse = requester.sectorId;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        await prisma.user.create({
            data: { 
                name, email, password: hashedPassword, phone, 
                roleId: targetRole.id, 
                sectorId: sectorIdToUse,
                // AQUI SALVAMOS O PROJETO (OU NULL SE ESTIVER VAZIO)
                viewProjectId: viewProjectId || null 
            }
        });
        res.status(201).json({ message: "Criado com sucesso!" });
    } catch (e) { res.status(500).json({ error: "Erro ao criar: " + e.message }); }
});

// 6. ATUALIZAR USUÁRIO
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    // ADICIONEI viewProjectId AQUI
    const { name, email, phone, roleName, sectorName, password, viewProjectId } = req.body;
    try {
        const requester = await getRequester(req);
        
        const targetUser = await prisma.user.findUnique({ 
            where: { id }, include: { role: true } 
        });

        if (requester.role.level < 100) {
            if (targetUser.role.level >= requester.role.level) {
                return res.status(403).json({ error: "Você não pode alterar dados de um superior ou de mesmo nível." });
            }
        }

        const updateData = { name, email, phone };
        
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 10);
        }

        // ATUALIZAÇÃO DO VÍNCULO DE PROJETO
        // Se vier no body, atualizamos. Se vier string vazia, vira null (remove o vínculo)
        if (viewProjectId !== undefined) {
            updateData.viewProjectId = viewProjectId || null;
        }

        if (roleName) {
            const newRole = await prisma.role.findUnique({ where: { name: roleName } });
            if (newRole) {
                if (newRole.level >= requester.role.level) {
                    return res.status(403).json({ error: "Você não pode promover alguém para seu nível ou superior." });
                }
                updateData.roleId = newRole.id;
            }
        }

        if (sectorName && requester.role.level >= 100) {
            const sector = await prisma.sector.findUnique({ where: { name: sectorName } });
            if (sector) updateData.sectorId = sector.id;
        }

        await prisma.user.update({ where: { id }, data: updateData });
        res.json({ message: "Atualizado!" });
    } catch (error) { res.status(500).json({ error: "Erro ao atualizar." }); }
});

// 7. EXCLUIR USUÁRIO
router.delete('/:id', async (req, res) => {
    try {
        const requester = await getRequester(req);
        const targetUser = await prisma.user.findUnique({ 
            where: { id: req.params.id }, include: { role: true } 
        });

        if (!targetUser) return res.status(404).json({ error: "Usuário não existe." });

        if (targetUser.role.level >= requester.role.level) {
            return res.status(403).json({ error: "Você não pode excluir um usuário de patente igual ou superior." });
        }

        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: "Excluído!" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir." }); }
});

module.exports = router;