const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const prisma = new PrismaClient();
router.use(authenticateToken);

// LISTAR
router.get('/', async (req, res) => {
    try {
        const notes = await prisma.note.findMany({
            where: { userId: req.user.id },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(notes);
    } catch (e) { res.status(500).json({ error: "Erro ao buscar notas" }); }
});

// CRIAR
router.post('/', async (req, res) => {
    const { title, content, dueDate, importance, color, completed } = req.body;
    try {
        const newNote = await prisma.note.create({
            data: {
                title, content, dueDate, importance, color, completed,
                userId: req.user.id
            }
        });
        res.json(newNote);
    } catch (e) { res.status(500).json({ error: "Erro ao salvar nota" }); }
});

// ATUALIZAR
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const note = await prisma.note.findFirst({ where: { id, userId: req.user.id } });
    if (!note) return res.status(403).json({ error: "Sem permissão" });

    try {
        const updated = await prisma.note.update({ where: { id }, data: req.body });
        res.json(updated);
    } catch (e) { res.status(500).json({ error: "Erro ao atualizar" }); }
});

// EXCLUIR
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const note = await prisma.note.findFirst({ where: { id, userId: req.user.id } });
    if (!note) return res.status(403).json({ error: "Sem permissão" });

    try {
        await prisma.note.delete({ where: { id } });
        res.json({ message: "Nota excluída" });
    } catch (e) { res.status(500).json({ error: "Erro ao excluir" }); }
});

module.exports = router;