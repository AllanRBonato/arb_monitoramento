const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const ping = require("ping"); // Usado apenas na rota de status simples
const TEMPO_CACHE_MINUTOS = 10; // Atualiza a lista a cada 10 minutos
const { authenticateToken } = require("../middlewares/auth");

const nodeRouterOsLib = require("node-routeros");
// Tenta identificar qual construtor usar (compatibilidade com versões diferentes da lib)
const MikrotikClient =
    nodeRouterOsLib.RouterOSAPI ||
    nodeRouterOsLib.RouterOSClient ||
    nodeRouterOsLib;

const prisma = new PrismaClient();
router.use(authenticateToken);

// --- ROTAS CRUD ---

// 1. Listar projetos
router.get("/", async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const user = await prisma.user.findUnique({ where: { id: userId } });

        let whereClause = {};
        if (user && user.viewProjectId) {
            whereClause = { id: user.viewProjectId };
        }

        const projects = await prisma.project.findMany({
            where: whereClause,
            include: { providers: true },
        });
        res.json(projects);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar projetos" });
    }
});

// 2. Criar Projeto
router.post("/", async (req, res) => {
    const {
        name,
        rbIp,
        rbUser,
        rbPort,
        rbWinboxPort,
        rbPassword,
        excelLink,
        providers,
    } = req.body;
    try {
        // Teste de conexão antes de salvar
        const client = new MikrotikClient({
            host: rbIp,
            user: rbUser,
            password: rbPassword,
            port: parseInt(rbPort) || 8728,
            timeout: 10,
        });
        await client.connect();
        await client.close();

        const newProject = await prisma.project.create({
            data: {
                name,
                rbIp,
                rbUser,
                rbPassword,
                excelLink,
                rbPort: parseInt(rbPort) || 8728,
                rbWinboxPort: parseInt(rbWinboxPort) || 8291,
                providers: { create: providers || [] },
            },
        });
        res.status(201).json(newProject);
    } catch (error) {
        res.status(500).json({ error: "Falha na conexão com a RB." });
    }
});

// 3. Atualizar Projeto
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
        name,
        rbIp,
        rbUser,
        rbPort,
        rbWinboxPort,
        rbPassword,
        excelLink,
        providers,
    } = req.body;
    try {
        const data = {
            name,
            rbIp,
            rbUser,
            excelLink,
            rbPort: parseInt(rbPort),
            rbWinboxPort: parseInt(rbWinboxPort),
        };
        if (rbPassword) data.rbPassword = rbPassword;

        await prisma.$transaction([
            prisma.provider.deleteMany({ where: { projectId: id } }),
            prisma.project.update({
                where: { id },
                data: { ...data, providers: { create: providers || [] } },
            }),
        ]);
        res.json({ message: "Atualizado com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro na atualização" });
    }
});

// 4. Excluir Projeto
router.delete("/:id", async (req, res) => {
    try {
        await prisma.project.delete({ where: { id: req.params.id } });
        res.json({ message: "Projeto excluído" });
    } catch (e) {
        res.status(500).json({ error: "Erro ao excluir" });
    }
});

// 5. Ping Simples (Teste de Conexão Geral)
router.post("/status", async (req, res) => {
    const { ip } = req.body;
    try {
        const resPing = await ping.promise.probe(ip, { timeout: 2 });
        res.json({ online: resPing.alive, ms: resPing.time });
    } catch (error) {
        res.json({ online: false, ms: 0 });
    }
});

// --- ROTA CRÍTICA: STATUS REAIS (ARP + PING PARALELO) ---
router.post("/:id/check-group", async (req, res) => {
    const { id } = req.params;
    const { ips } = req.body;

    if (!ips || !Array.isArray(ips))
        return res.status(400).json({ error: "Lista de IPs inválida" });

    let client = null;
    const finalResults = {};

    try {
        const project = await prisma.project.findUnique({ where: { id } });
        if (!project)
            return res.status(404).json({ error: "Projeto não encontrado" });

        client = new MikrotikClient({
            host: project.rbIp,
            user: project.rbUser,
            password: project.rbPassword,
            port: parseInt(project.rbPort) || 8728,
            timeout: 20, // Timeout da conexão socket
        });

        // Evita derrubar o node se der erro no socket
        client.on("error", (err) =>
            console.log("⚠️ Erro Socket Mikrotik:", err.message),
        );
        await client.connect();

        // 1. BAIXA ARP (Apenas para pegar os MACs e identificar fantasmas)
        let arpMap = {};
        try {
            const arpTable = await client.write("/ip/arp/print");
            if (Array.isArray(arpTable)) {
                arpTable.forEach((entry) => {
                    if (entry.address && entry["mac-address"]) {
                        const cleanIp = entry.address.trim();
                        arpMap[cleanIp] = entry["mac-address"];
                    }
                });
            }
        } catch (e) {
            console.log("Erro ao ler ARP, seguindo apenas com Ping...");
        }

        // 2. PROCESSAMENTO PARALELO (Velocidade Máxima)
        // Cria uma lista de "missões" (Promises) para o Mikrotik executar ao mesmo tempo
        const pingPromises = ips.map(async (ip) => {
            const ipClean = ip.trim();
            const macEncontrado = arpMap[ipClean] || null;

            try {
                // Comando de Ping Rápido
                const pingRes = await client.write("/ping", {
                    address: ipClean,
                    count: "1", // Apenas 1 pacote
                    interval: "0.1", // Intervalo curto
                    timeout: "1", // Timeout curto pra não travar se tiver off
                });

                let isOnline = false;
                let latency = "---";
                let statusMsg = "Offline";

                // Analisa a resposta do Mikrotik (array de objetos)
                if (Array.isArray(pingRes) && pingRes.length > 0) {
                    const p = pingRes[0];
                    // Critério de Sucesso: Recebeu pacote E não deu timeout
                    if (p.received == 1) {
                        isOnline = true;
                        latency = p.time || "<1ms";
                        statusMsg = "Online";
                    } else {
                        // Se falhou o ping, mas tem MAC na ARP -> Cache/Fantasma
                        if (macEncontrado) {
                            statusMsg = "Offline (Cache ARP)";
                        }
                    }
                }

                return {
                    ip: ipClean,
                    data: {
                        online: isOnline,
                        ms: latency,
                        mac: macEncontrado,
                        status: statusMsg,
                    },
                };
            } catch (innerError) {
                // Erro de execução do comando ping
                return {
                    ip: ipClean,
                    data: {
                        online: false,
                        ms: 0,
                        mac: macEncontrado,
                        status: "Erro Ping",
                    },
                };
            }
        });

        // Espera todos os pings terminarem
        const resultsArray = await Promise.all(pingPromises);

        // Transforma o array de volta em objeto para o Frontend
        resultsArray.forEach((item) => {
            finalResults[item.ip] = item.data;
        });

        await client.close();
        res.json(finalResults);
    } catch (e) {
        if (client)
            try {
                client.close();
            } catch (x) { }
        console.error("Erro Geral Check-Group:", e);

        // Retorna falha para o frontend não travar
        const failResults = {};
        ips.forEach(
            (ip) =>
                (failResults[ip] = { online: false, ms: 0, status: "Erro Conexão" }),
        );
        res.json(failResults);
    }
});

// 6. Monitoramento de Recursos (CPU/Uptime)
router.get("/:id/resources", async (req, res) => {
    const { id } = req.params;
    let client = null;
    try {
        const project = await prisma.project.findUnique({ where: { id } });
        client = new MikrotikClient({
            host: project.rbIp,
            user: project.rbUser,
            password: project.rbPassword,
            port: parseInt(project.rbPort) || 8728,
            timeout: 10,
        });
        client.on("error", () => { });
        await client.connect();

        const result = await client.write("/system/resource/print");
        await client.close();

        const data = Array.isArray(result) ? result[0] : result;
        if (data) res.json({ cpu: data["cpu-load"], uptime: data["uptime"] });
        else res.status(500).json({ error: "Dados vazios" });
    } catch (e) {
        if (client)
            try {
                client.close();
            } catch (x) { }
        res.status(500).json({ error: e.message });
    }
});


// 7. Rota Blindada de NAT
router.get('/:id/nat', async (req, res) => {
    const { id } = req.params;
    const now = Date.now();

    if (cacheNAT[id] && (now - cacheNAT[id].timestamp < CACHE_LIFETIME)) {
        console.log(`[NAT] Servindo cache para projeto ${id}`);
        return res.json(cacheNAT[id].data);
    }

    let client = null;
    try {
        const project = await prisma.project.findUnique({ where: { id } });
        if (!project) return res.status(404).json({ error: "Projeto não encontrado" });

        client = new MikrotikClient({
            host: project.rbIp,
            user: project.rbUser,
            password: project.rbPassword,
            port: parseInt(project.rbPort) || 8728,
            timeout: 45 
        });

        client.on('error', (err) => console.error("[Mikrotik Error]", err.message));

        await client.connect();

        const natRules = await client.write('/ip/firewall/nat/print');
        await client.close();

        // Processa os dados
        const groups = {};
        if (Array.isArray(natRules)) {
            natRules.forEach(rule => {
                if (rule.comment && rule['to-addresses']) {
                    const groupName = rule.comment.trim();
                    if (!groups[groupName]) groups[groupName] = [];
                    groups[groupName].push({
                        id: rule['.id'],
                        ip: rule['to-addresses'],
                        port: rule['dst-port'] || 'Todas',
                        isOnline: false
                    });
                }
            });
        }

        const responseData = Object.keys(groups).map(key => ({ name: key, ips: groups[key] }));

        cacheNAT[id] = { timestamp: now, data: responseData };

        res.json(responseData);

    } catch (e) {
        if (client) try { client.close() } catch (x) {};
        
        console.error("Erro NAT:", e.message);

        if (cacheNAT[id]) {
            console.log("[NAT] Erro na RB, entregando cache antigo por segurança.");
            return res.json(cacheNAT[id].data);
        }

        if (e.message.includes("timeout") || e.message.includes("socket")) {
            return res.status(503).json({ error: "A RB demorou muito para responder. Tente novamente em 1 minuto." });
        }

        res.status(500).json({ error: "Erro interno: " + e.message });
    }
});
module.exports = router;
