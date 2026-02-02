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
    limits: { fileSize: 5 * 1024 * 1024 }, // Limite 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas.'));
        }
    }
});

router.use(authenticateToken);

// --- ROTAS DE USUÁRIO ---

// 1. SALVAR AVATAR - Alenda do Aeng kkkk
router.post('/avatar', upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Nenhum arquivo enviado." });
        }

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
        const userId = req.user.id || req.user.userId;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, avatar: true, role: { include: { } }, sector: true } 
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar dados." });
    }
});

// 3. LISTAR USUÁRIOS
router.get('/', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, name: true, email: true, phone: true, avatar: true,
                role: { select: { name: true, label: true } },
                sector: { select: { name: true } }
            },
            orderBy: { name: 'asc' }
        });

        const formatted = users.map(u => ({
            ...u, 
            role: u.role ? u.role.name : null, 
            roleLabel: u.role ? u.role.label : null, 
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

// 5. CRIAR USUÁRIO
router.post('/', async (req, res) => {
    const { name, email, password, phone, roleName, sectorName } = req.body;
    try {
        const role = await prisma.role.findUnique({ where: { name: roleName } });
        const sector = await prisma.sector.findUnique({ where: { name: sectorName } });

        if (!role || !sector) return res.status(400).json({ error: "Cargo ou Setor inválido" });

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { name, email, password: hashedPassword, phone, roleId: role.id, sectorId: sector.id }
        });
        res.status(201).json({ message: "Criado com sucesso!" });
    } catch (e) { res.status(500).json({ error: "Erro ao criar: " + e.message }); }
});

// 6. ATUALIZAR USUÁRIO
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, roleName, sectorName, password } = req.body;
    try {
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

// 7. EXCLUIR USUÁRIO
router.delete('/:id', async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: "Excluído!" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir." }); }
});

module.exports = router;