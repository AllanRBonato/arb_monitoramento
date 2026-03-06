const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const ping = require('ping');
const { authenticateToken } = require('../middlewares/auth');

const nodeRouterOsLib = require('node-routeros');
const MikrotikClient = nodeRouterOsLib.RouterOSAPI || nodeRouterOsLib.RouterOSClient || nodeRouterOsLib;

const prisma = new PrismaClient();
router.use(authenticateToken);

// --- SISTEMA DE CACHE DE NAT ---
const cacheNAT = {};
const TEMPO_CACHE_MINUTOS = 10; // Atualiza a lista a cada 10 minutos

// 1. Listar projetos
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { viewProjects: true, role: true } 
        });

        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        let whereClause = {};

        const roleName = user.role?.name?.toUpperCase() || '';
        const isAdmin = ['FULL', 'SUPER ADMIN', 'ADMINISTRADOR', 'GERENTE', 'MASTER', 'ADMIN'].some(r => roleName.includes(r));

        if (!isAdmin) {
            const allowedProjectIds = user.viewProjects.map(p => p.id);

            if (allowedProjectIds.length === 0) {
                return res.json([]);
            }

            whereClause = {
                id: { in: allowedProjectIds }
            };
        }

        const projects = await prisma.project.findMany({
            where: whereClause,
            include: { providers: true }
        });

        res.json(projects);
    }
    catch (error) {
        console.error("Erro na listagem de projetos:", error);
        res.status(500).json({ error: "Erro ao buscar projetos" });
    }
});

// 2. Criar Projeto (AUMENTEI O TIMEOUT AQUI PARA VOCÊ CONSEGUIR ADICIONAR A CPN)
router.post('/', async (req, res) => {
    const { name, rbIp, rbUser, rbPort, rbWinboxPort, rbPassword, excelLink, providers } = req.body;
    try {
        // Timeout aumentado para 30s para garantir o "aperto de mão" com RBs lentas
        const api = new MikrotikClient({ host: rbIp, user: rbUser, password: rbPassword, port: parseInt(rbPort) || 8728, timeout: 30 });
        await api.connect(); await api.close();

        const newProject = await prisma.project.create({
            data: { name, rbIp, rbUser, rbPassword, excelLink, rbPort: parseInt(rbPort) || 8728, rbWinboxPort: parseInt(rbWinboxPort) || 8291, providers: { create: providers || [] } }
        });
        res.status(201).json(newProject);
    } catch (error) {
        console.error("Erro ao criar:", error.message);
        res.status(500).json({ error: "Falha na conexão com a RB (Verifique IP, Usuário ou se a porta API está ativa)." });
    }
});

// 3. Atualizar Projeto
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, rbIp, rbUser, rbPort, rbWinboxPort, rbPassword, excelLink, providers } = req.body;
    try {
        const data = { name, rbIp, rbUser, excelLink, rbPort: parseInt(rbPort), rbWinboxPort: parseInt(rbWinboxPort) };
        if (rbPassword) data.rbPassword = rbPassword;
        await prisma.$transaction([
            prisma.provider.deleteMany({ where: { projectId: id } }),
            prisma.project.update({ where: { id }, data: { ...data, providers: { create: providers || [] } } })
        ]);
        res.json({ message: "Atualizado com sucesso!" });
    } catch (error) { res.status(500).json({ error: "Erro na atualização" }); }
});

// 4. Excluir Projeto
router.delete('/:id', async (req, res) => {
    try { await prisma.project.delete({ where: { id: req.params.id } }); res.json({ message: "Projeto excluído" }); }
    catch (e) { res.status(500).json({ error: "Erro ao excluir" }); }
});

// 5. Ping Simples
router.post('/status', async (req, res) => {
    const { ip } = req.body;
    try { const resPing = await ping.promise.probe(ip, { timeout: 2 }); res.json({ online: resPing.alive, ms: resPing.time }); }
    catch (error) { res.json({ online: false, ms: 0 }); }
});

// 6. ROTA DE CHECAGEM BLINDADA (PING SEQUENCIAL + SALVA VIDAS ARP)
router.post('/:id/check-group', async (req, res) => {
    const { id } = req.params;
    const { ips } = req.body;

    if (!ips || !Array.isArray(ips)) return res.status(400).json({ error: "Lista inválida" });

    let api = null;
    const results = {};

    try {
        const project = await prisma.project.findUnique({ where: { id } });
        if (!project) return res.status(404).json({ error: "Projeto não encontrado" });

        // Timeout longo (120s) para aguentar listas grandes sem cair
        api = new MikrotikClient({
            host: project.rbIp, user: project.rbUser, password: project.rbPassword,
            port: parseInt(project.rbPort) || 8728, timeout: 120
        });

        api.on('error', (err) => console.log("⚠️ Erro Socket Ping:", err.message));
        await api.connect();

        // Baixa a ARP para usar como plano B
        let arpMap = {};
        try {
            const arpTable = await api.write('/ip/arp/print');
            if (Array.isArray(arpTable)) {
                arpTable.forEach(entry => {
                    if (entry.address && entry['mac-address']) {
                        arpMap[entry.address.trim()] = entry['mac-address'];
                    }
                });
            }
        } catch (e) { console.log("Erro ARP:", e.message); }

        // MÁGICA AQUI: Laço sequencial com array cru para não dar erro de sintaxe
        for (const ip of ips) {
            const ipClean = ip.trim();
            const macEncontrado = arpMap[ipClean] || null;

            try {
                // Sintaxe crua (array) evita bugs de versão do RouterOS
                const pingRes = await api.write('/ping', [
                    '=address=' + ipClean,
                    '=count=1'
                ]);

                let isOnline = false;
                let latency = '---';
                let statusMsg = 'Offline';

                if (Array.isArray(pingRes) && pingRes.length > 0) {
                    const p = pingRes[0];
                    if (p.received == 1 || p.received === '1' || (p.time && p.time !== 'timeout')) {
                        isOnline = true;
                        latency = p.time || '<1ms';
                        statusMsg = 'Online';
                    } else if (macEncontrado) {
                        statusMsg = 'Offline (Cache ARP)';
                    }
                }
                results[ipClean] = { online: isOnline, ms: latency, mac: macEncontrado, status: statusMsg };
            } catch (innerError) {
                // SALVA-VIDAS: Se o comando de ping falhar na API, mas estiver na ARP, considera ONLINE!
                if (macEncontrado) {
                    results[ipClean] = { online: true, ms: '---', mac: macEncontrado, status: "Online (via ARP)" };
                } else {
                    results[ipClean] = { online: false, ms: 0, mac: null, status: "Offline (Erro Ping)" };
                }
            }
        }

        await api.close();
        res.json(results);

    } catch (e) {
        if (api) try { api.close() } catch (x) { };
        const failResults = {};
        ips.forEach(ip => failResults[ip] = { online: false, ms: 0, status: "Erro Conexão" });
        res.json(failResults);
    }
});

// 7. Monitoramento de Recursos
router.get('/:id/resources', async (req, res) => {
    const { id } = req.params;
    let api = null;
    try {
        const project = await prisma.project.findUnique({ where: { id } });
        api = new MikrotikClient({ host: project.rbIp, user: project.rbUser, password: project.rbPassword, port: parseInt(project.rbPort) || 8728, timeout: 20 });
        api.on('error', () => { }); await api.connect();
        const result = await api.write('/system/resource/print'); await api.close();
        const data = Array.isArray(result) ? result[0] : result;
        if (data) res.json({ cpu: data['cpu-load'], uptime: data['uptime'] });
        else res.status(500).json({ error: "Vazio" });
    } catch (e) { if (api) try { api.close() } catch (x) { }; res.status(500).json({ error: e.message }); }
});

// 8. Rota NAT COM CACHE (Timeout aumentado para a CPN)
router.get('/:id/nat', async (req, res) => {
    const { id } = req.params;
    const agora = Date.now();

    // Se tem cache novo, devolve na hora!
    if (cacheNAT[id] && (agora - cacheNAT[id].ultimaVez) < (TEMPO_CACHE_MINUTOS * 60 * 1000)) {
        return res.json(cacheNAT[id].dados);
    }

    let api = null;
    try {
        const project = await prisma.project.findUnique({ where: { id } });

        // Timeout aumentado para 120 SEGUNDOS.
        api = new MikrotikClient({ host: project.rbIp, user: project.rbUser, password: project.rbPassword, port: parseInt(project.rbPort) || 8728, timeout: 120 });

        api.on('error', () => { }); await api.connect();
        const natRules = await api.write('/ip/firewall/nat/print'); await api.close();

        const groups = {};
        if (Array.isArray(natRules)) {
            natRules.forEach(rule => {
                if (rule.comment && rule['to-addresses']) {
                    const groupName = rule.comment.trim();
                    if (!groups[groupName]) groups[groupName] = [];
                    groups[groupName].push({ id: rule['.id'], ip: rule['to-addresses'], port: rule['dst-port'] || 'Todas', isOnline: false });
                }
            });
        }
        const responseData = Object.keys(groups).map(key => ({ name: key, ips: groups[key] }));

        // Salva na memória
        cacheNAT[id] = { dados: responseData, ultimaVez: agora };
        res.json(responseData);
    } catch (e) {
        if (api) try { api.close() } catch (x) { };
        if (cacheNAT[id]) return res.json(cacheNAT[id].dados);
        if (e.message.includes("timeout") || e.message.includes("socket")) return res.status(503).json({ error: "A RB demorou para responder (Timeout). Tente novamente." });
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;