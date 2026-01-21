const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const prisma = new PrismaClient();

// Protege todas as rotas com login
router.use(authenticateToken);

// --- CARGOS (ROLES) ---
// O server.js já adiciona /api, então aqui usamos apenas /roles
router.get('/roles', async (req, res) => {
    try {
        const roles = await prisma.role.findMany({ orderBy: { level: 'desc' } });
        res.json(roles);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar cargos" }); }
});

router.post('/roles', async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    const { name, level, label } = req.body;
    try {
        const newRole = await prisma.role.create({ data: { name, level: parseInt(level), label } });
        res.json(newRole);
    } catch (e) { res.status(400).json({ error: "Erro ao criar cargo" }); }
});

router.put('/roles/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        await prisma.role.update({ where: { id: req.params.id }, data: req.body });
        res.json({ message: "Cargo atualizado" });
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar" }); }
});

router.delete('/roles/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        await prisma.role.delete({ where: { id: req.params.id } });
        res.json({ message: "Cargo excluído" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir" }); }
});

// --- SETORES (SECTORS) ---
// O server.js já adiciona /api, então aqui usamos apenas /sectors
router.get('/sectors', async (req, res) => {
    try {
        const sectors = await prisma.sector.findMany();
        res.json(sectors);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar setores" }); }
});

router.post('/sectors', async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        const newSector = await prisma.sector.create({ data: { name: req.body.name } });
        res.json(newSector);
    } catch (e) { res.status(400).json({ error: "Erro ao criar setor" }); }
});

router.put('/sectors/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        await prisma.sector.update({ where: { id: req.params.id }, data: req.body });
        res.json({ message: "Setor atualizado" });
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar" }); }
});

router.delete('/sectors/:id', async (req, res) => {
    if (req.user.role !== 'ADMIN_MASTER') return res.status(403).json({ error: "Apenas Admin" });
    try {
        await prisma.sector.delete({ where: { id: req.params.id } });
        res.json({ message: "Setor excluído" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir" }); }
});

module.exports = router;