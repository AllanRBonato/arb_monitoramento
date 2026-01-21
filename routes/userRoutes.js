const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const prisma = new PrismaClient();

// Aplicar middleware em todas as rotas deste arquivo
router.use(authenticateToken);

// LISTAR USUÁRIOS
router.get('/', async (req, res) => {
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

// OBTER UM USUÁRIO
router.get('/:id', async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        include: { role: true, sector: true }
    });
    if(user) user.password = undefined; 
    res.json(user);
});

// CRIAR USUÁRIO
router.post('/', async (req, res) => {
    const { name, email, password, phone, roleName, sectorName } = req.body;
    
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão." });

    try {
        const role = await prisma.role.findUnique({ where: { name: roleName } });
        const sector = await prisma.sector.findUnique({ where: { name: sectorName } });
        
        if (!role || !sector) return res.status(400).json({ error: "Dados inválidos" });

        if (role.level >= req.user.level && req.user.role !== 'ADMIN_MASTER') {
            return res.status(403).json({ error: "Nível hierárquico inválido." });
        }

        if (req.user.role === 'FULL' && sector.name !== req.user.sector) {
            return res.status(403).json({ error: "Setor inválido." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { name, email, password: hashedPassword, phone, roleId: role.id, sectorId: sector.id }
        });
        res.status(201).json({ message: "Criado" });
    } catch (e) { res.status(500).json({ error: "Erro ao criar" }); }
});

// ATUALIZAR USUÁRIO
router.put('/:id', async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão" });
    const { id } = req.params;
    const { name, email, phone, roleName, sectorName, password } = req.body;

    try {
        if (roleName) {
            const newRole = await prisma.role.findUnique({ where: { name: roleName } });
            if (newRole && newRole.level >= req.user.level && req.user.role !== 'ADMIN_MASTER') {
                return res.status(403).json({ error: "Permissão negada para este nível." });
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

// EXCLUIR USUÁRIO
router.delete('/:id', async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão." });
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ message: "Usuário excluído!" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir." }); }
});

// AVATAR
router.post('/avatar', async (req, res) => {
    const { avatarBase64 } = req.body;
    try {
        await prisma.user.update({
            where: { id: req.user.id }, data: { avatar: avatarBase64 }
        });
        res.json({ message: "Foto salva!" });
    } catch (e) { res.status(500).json({ error: "Erro ao salvar foto" }); }
});

module.exports = router;