const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const ping = require('ping');
const { authenticateToken } = require('../middlewares/auth');

const nodeRouterOsLib = require('node-routeros');
const MikrotikClient = nodeRouterOsLib.RouterOSAPI || nodeRouterOsLib.RouterOSClient || nodeRouterOsLib;

const prisma = new PrismaClient();
router.use(authenticateToken);

// --- ROTAS CRUD (Padrão) ---
router.get('/', async (req, res) => {
    try { const projects = await prisma.project.findMany({ include: { providers: true } }); res.json(projects); } 
    catch (error) { res.status(500).json({ error: "Erro ao buscar" }); }
});

router.post('/', async (req, res) => {
    const { name, rbIp, rbUser, rbPort, rbWinboxPort, rbPassword, excelLink, providers } = req.body;
    try {
        const api = new MikrotikClient({ host: rbIp, user: rbUser, password: rbPassword, port: parseInt(rbPort)||8728, timeout: 10 });
        await api.connect(); await api.close();
        const newProject = await prisma.project.create({
            data: { name, rbIp, rbUser, rbPassword, excelLink, rbPort: parseInt(rbPort)||8728, rbWinboxPort: parseInt(rbWinboxPort)||8291, providers: { create: providers || [] } }
        });
        res.status(201).json(newProject);
    } catch (error) { res.status(500).json({ error: "Falha na conexão." }); }
});

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
        res.json({ message: "Atualizado!" });
    } catch (error) { res.status(500).json({ error: "Erro atualização" }); }
});

router.delete('/:id', async (req, res) => {
    try { await prisma.project.delete({ where: { id: req.params.id } }); res.json({ message: "Excluído" }); } 
    catch (e) { res.status(500).json({ error: "Erro" }); }
});

router.post('/status', async (req, res) => {
    const { ip } = req.body;
    try { const resPing = await ping.promise.probe(ip, { timeout: 2 }); res.json({ online: resPing.alive, ms: resPing.time }); } 
    catch (error) { res.json({ online: false, ms: 0 }); }
});

// --- ROTA DE STATUS CORRIGIDA (DEBUG + SEM FILTROS) ---
router.post('/:id/check-group', async (req, res) => {
    const { id } = req.params;
    const { ips } = req.body;
    
    if (!ips || !Array.isArray(ips)) return res.status(400).json({ error: "Lista inválida" });

    let api = null;
    const results = {};

    try {
        const project = await prisma.project.findUnique({ where: { id } });
        
        api = new MikrotikClient({
            host: project.rbIp, user: project.rbUser, password: project.rbPassword, 
            port: parseInt(project.rbPort) || 8728, timeout: 40 
        });
        
        api.on('error', (err) => console.log("⚠️ Erro Socket:", err.message));
        await api.connect();

        // 1. BAIXA ARP SEM FILTROS
        // console.log(`📡 Baixando ARP de ${project.rbIp}...`);
        const arpTable = await api.write('/ip/arp/print');
        
        // Mapa IP -> MAC (Imprime no terminal para conferência)
        const arpMap = {};
        if (Array.isArray(arpTable)) {
            arpTable.forEach(entry => {
                // Pega qualquer entrada que tenha IP e MAC
                if (entry.address && entry['mac-address']) {
                    const cleanIp = entry.address.trim();
                    arpMap[cleanIp] = entry['mac-address'];
                }
            });
        }
        
        // LOG DEBUG: Verifica se o IP problemático está no mapa
        // console.log("ARP Cache contém 192.168.1.110?", arpMap['192.168.1.110'] ? "SIM" : "NÃO");

        // 2. PROCESSA IPs
        for (const ip of ips) {
            const ipClean = ip.trim();
            const macEncontrado = arpMap[ipClean];

            if (macEncontrado) {
                // ACHOU NO ARP
                results[ip] = { online: true, ms: "via ARP", mac: macEncontrado, status: "Conectado" };
            } else {
                // NÃO ACHOU -> PING
                // console.log(`🔍 Pingando ${ipClean}...`);
                try {
                    const pingCommand = api.write('/ping', { 
                        'address': ipClean, 
                        'count': '1',
                        'interval': '0.2'
                    });
                    
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("TIMEOUT")), 3000)
                    );

                    const pingRes = await Promise.race([pingCommand, timeoutPromise]);
                    
                    let isOnline = false;
                    let latency = '0ms';
                    
                    if (Array.isArray(pingRes)) {
                        // Verifica qualquer sinal de vida
                        const p = pingRes[0];
                        if (p && ((p.received && p.received > 0) || (p.time))) {
                            isOnline = true;
                            latency = p.time || '1ms';
                        }
                    }
                    
                    results[ip] = { 
                        online: isOnline, 
                        ms: latency, 
                        mac: null, 
                        status: isOnline ? "Ping OK" : "Sem sinal" 
                    };

                } catch (innerError) {
                    results[ip] = { online: false, ms: 0, mac: null, status: "Falha Ping" };
                }
            }
        }

        await api.close();
        res.json(results);

    } catch (e) {
        if(api) try{api.close()}catch(x){};
        // Retorna erro mas não quebra o front
        const failResults = {};
        ips.forEach(ip => failResults[ip] = { online: false, ms: 0, status: "Erro Conexão" });
        res.json(failResults);
    }
});

router.get('/:id/resources', async (req, res) => {
    const { id } = req.params;
    let api = null;
    try {
        const project = await prisma.project.findUnique({ where: { id } });
        api = new MikrotikClient({ host: project.rbIp, user: project.rbUser, password: project.rbPassword, port: parseInt(project.rbPort)||8728, timeout: 10 });
        api.on('error', () => {}); await api.connect();
        const result = await api.write('/system/resource/print'); await api.close();
        const data = Array.isArray(result) ? result[0] : result;
        if(data) res.json({ cpu: data['cpu-load'], uptime: data['uptime'] });
        else res.status(500).json({ error: "Vazio" });
    } catch (e) { if(api) try{api.close()}catch(x){}; res.status(500).json({ error: e.message }); }
});

router.get('/:id/nat', async (req, res) => {
    const { id } = req.params;
    let api = null;
    try {
        const project = await prisma.project.findUnique({ where: { id } });
        api = new MikrotikClient({ host: project.rbIp, user: project.rbUser, password: project.rbPassword, port: parseInt(project.rbPort)||8728, timeout: 20 });
        api.on('error', () => {}); await api.connect();
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
        res.json(responseData);
    } catch (e) { if(api) try{api.close()}catch(x){}; res.status(500).json({ error: e.message }); }
});

module.exports = router;