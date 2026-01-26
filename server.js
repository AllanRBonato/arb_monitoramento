require('dotenv').config();
const express = require('express');
const cors = require('cors');

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

// --- DEFINIÇÃO DAS ROTAS ---

// Isso torna a pasta 'uploads' pública para acessar as fotos
app.use('/uploads', express.static('uploads'));

// Autenticação (Login)
app.use('/api', authRoutes);

// Gestão de Usuários
app.use('/api/user', userRoutes);

// Configurações 
app.use('/api', settingsRoutes);

// Notas Pessoais
app.use('/api/notes', noteRoutes);

// Gestão Radius (VM)
app.use('/api/radius', radiusRoutes);

// Projetos Mikrotik
app.use('/api/projects', projectRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));