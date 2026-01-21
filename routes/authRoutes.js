const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth'); 

const prisma = new PrismaClient();
const SECRET_KEY = process.env.JWT_SECRET;

// LOGIN
router.post('/login', async (req, res) => {
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

// SOLICITAR RESET DE SENHA (Público)
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ error: "E-mail não encontrado." });

        const existing = await prisma.passwordRequest.findFirst({
            where: { userId: user.id, status: 'PENDING' }
        });

        if (existing) return res.status(400).json({ error: "Já existe uma solicitação pendente." });

        await prisma.passwordRequest.create({ data: { userId: user.id } });
        res.json({ message: "Solicitação enviada! Avise seu supervisor." });
    } catch (e) { res.status(500).json({ error: "Erro no servidor" }); }
});

// --- CORREÇÃO AQUI EMBAIXO (Adicionado /admin no caminho) ---

// LISTAR SOLICITAÇÕES (Admin/Full)
router.get('/admin/password-requests', authenticateToken, async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão" });

    try {
        let whereUser = {};
        if (req.user.role === 'FULL') {
            whereUser = { sector: { name: req.user.sector } };
        }

        const requests = await prisma.passwordRequest.findMany({
            where: { status: 'PENDING', user: whereUser },
            include: { user: { select: { id: true, name: true, email: true, sector: { select: { name: true } } } } }
        });
        res.json(requests);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar solicitações" }); }
});

// RESOLVER SOLICITAÇÃO
router.delete('/admin/password-requests/:id', authenticateToken, async (req, res) => {
    if (req.user.level < 50) return res.status(403).json({ error: "Sem permissão" });
    try {
        await prisma.passwordRequest.delete({ where: { id: req.params.id } });
        res.json({ message: "Solicitação removida." });
    } catch (e) { res.status(500).json({ error: "Erro ao limpar solicitação" }); }
});

module.exports = router;