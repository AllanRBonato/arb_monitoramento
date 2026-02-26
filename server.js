require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // Adicionado para lidar com a segurança do token

// Importar Rotas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const noteRoutes = require('./routes/noteRoutes');
const radiusRoutes = require('./routes/radiusRoutes');
const projectRoutes = require('./routes/projectRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

const app = express();

// Configurações Globais
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
app.use(express.static('public'));

// --- NOVA ROTA DE SEGURANÇA (Anti-Spoofing do Local Storage) ---
// Essa rota pega o token real, abre e devolve a verdade sobre quem é o usuário
app.get('/api/verify', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    // O JWT_SECRET garante que o token foi criado pelo seu servidor e não inventado
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
        
        // Se o token for real, devolvemos as informações que estão seladas dentro dele
        res.json(decoded); 
    });
});
// ---------------------------------------------------------------

// --- DEFINIÇÃO DAS ROTAS ---

app.use('/uploads', express.static('uploads'));

// Autenticação (Login)
app.use('/api', authRoutes);

// Gestão de Usuários
app.use('/api/users', userRoutes);
app.use('/api/user', userRoutes);

// Configurações 
app.use('/api', settingsRoutes);

// Notas Pessoais
app.use('/api/notes', noteRoutes);

// Gestão Radius (VM)
app.use('/api/radius', radiusRoutes);

// Projetos Mikrotik
app.use('/api/projects', projectRoutes);


const PORT = process.env.PORT || 55024;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));