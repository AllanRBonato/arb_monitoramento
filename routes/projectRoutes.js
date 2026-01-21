const express = require('express');
const router = express.Router();
const ping = require('ping');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const prisma = new PrismaClient();
router.use(authenticateToken);

// Middleware Permissão N2
const checkN2Access = (req, res, next) => {
    if (req.user.role === 'ADMIN_MASTER' || req.user.sector === 'SUPORTE_N2') {
        next();
    } else {
        return res.status(403).json({ error: "Acesso restrito ao setor SUPORTE_N2." });
    }
};

router.use(checkN2Access);

// LISTAR
router.get('/', async (req, res) => {
    try {
        const projects = await prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
        const safeProjects = projects.map(p => ({ ...p, rbPassword: undefined }));
        res.json(safeProjects);
    } catch (e) { res.status(500).json({ error: "Erro ao listar projetos" }); }
});

// STATUS
router.post('/status', async (req, res) => {
    const { ip } = req.body;
    try {
        const result = await ping.promise.probe(ip, { timeout: 2 });
        res.json({ online: result.alive, ms: result.time });
    } catch (e) { res.json({ online: false, error: e.message }); }
});

// CRIAR
router.post('/', async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão." });
    const { name, description, rbIp, rbUser, rbPassword, rbPort } = req.body;

    try {
        const project = await prisma.project.create({
            data: { name, description, rbIp, rbUser, rbPassword, rbPort: parseInt(rbPort) || 8728 }
        });
        res.json(project);
    } catch (e) { res.status(500).json({ error: "Erro ao criar projeto" }); }
});

// ATUALIZAR
router.put('/:id', async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão." });
    const { id } = req.params;
    const { name, rbIp, rbUser, rbPort, rbPassword } = req.body;
    
    try {
        const data = { name, rbIp, rbUser, rbPort: parseInt(rbPort) };
        if (rbPassword && rbPassword.trim() !== "") data.rbPassword = rbPassword;

        await prisma.project.update({ where: { id }, data: data });
        res.json({ message: "Atualizado!" });
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar." }); }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão." });
    try {
        await prisma.project.delete({ where: { id: req.params.id } });
        res.json({ message: "Deletado" });
    } catch (e) { res.status(500).json({ error: "Erro ao deletar" }); }
});

module.exports = router;