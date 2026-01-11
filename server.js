const express = require('express');
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(cors());

const SECRET_KEY = "sua_chave_super_secreta"; // Em produção, use .env

// Rota 1: Criar Usuário (Página de Administração)
app.post('/api/users', async (req, res) => {
    const { name, email, password, phone, role, sector } = req.body;

    try {
        // Verifica se usuário já existe
        const userExists = await prisma.user.findUnique({ where: { email } });
        if (userExists) return res.status(400).json({ error: "E-mail já cadastrado" });

        // Criptografa a senha
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                phone,
                role,   // Deve ser um dos valores do ENUM (ex: ADMIN_MASTER)
                sector  // Deve ser um dos valores do ENUM (ex: OEM)
            }
        });

        res.status(201).json({ message: "Usuário criado com sucesso!", user: newUser });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Erro ao criar usuário" });
    }
});

// Rota 2: Login (Testar Acessos)
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: "Senha incorreta" });

        // Cria token com as permissões
        const token = jwt.sign(
            { id: user.id, role: user.role, sector: user.sector }, 
            SECRET_KEY, 
            { expiresIn: '1h' }
        );

        res.json({ message: "Login realizado", token, role: user.role, sector: user.sector });
    } catch (error) {
        res.status(500).json({ error: "Erro no servidor" });
    }
});

app.listen(3000, () => console.log('Servidor rodando na porta 3000'));