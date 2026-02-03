const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs'); 

const prisma = new PrismaClient();

async function main() {
    console.log("⏳ Criando Admin Completo...");

    const senhaHash = await bcrypt.hash('123456', 10);

    try {
        await prisma.user.create({
            data: {
                name: 'Admin Master',
                email: 'admin@arb.com',
                password: senhaHash,
                phone: '41999999999',
                avatar: null,
                
                role: {
                    create: {
                        name: 'ADMIN_MASTER',
                        level: 100,
                        label: 'Acesso Total ao Sistema'
                    }
                },
                
                sector: {
                    create: {
                        name: 'SUPORTE_N2' 
                    }
                }
            }
        });
        console.log("✅ SUCESSO TOTAL!");
        console.log("Login: admin@arb.com");
        console.log("Senha: 123456");
    } catch (e) {
        console.log("❌ Erro:");
        console.log(e.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
