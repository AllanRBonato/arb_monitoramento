// --- SEGURANÇA: PREVENIR BOTÃO VOLTAR ---
window.addEventListener('pageshow', function (event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        window.location.reload();
    }
});

function criarNavbar(nomePagina) {
    const token = localStorage.getItem('token');

    // --- VERIFICAÇÃO RIGOROSA ---
    if (!token) {
        // Se não tem token, a página continua invisível e redireciona
        window.location.href = 'login.html';
        return;
    }

    // SE CHEGOU AQUI, TEM TOKEN. ENTÃO MOSTRA A PÁGINA:
    document.body.style.display = 'flex'; // <--- A MÁGICA ACONTECE AQUI

    const savedAvatar = localStorage.getItem('userAvatar');
    const userRole = localStorage.getItem('userRole');

    const avatarSrc = (savedAvatar && savedAvatar !== "null")
        ? savedAvatar
        : `https://ui-avatars.com/api/?name=${userRole}&background=random`;

    const navHTML = `
        <nav class="navbar">
            <div class="navbar-brand">
                <a href="menu.html" style="text-decoration:none; color:white; display:flex; align-items:center; gap:10px;">
                    <span>ARB Monitoramento</span>
                    <span class="page-title">${nomePagina}</span>
                </a>
            </div>

            <div class="user-menu-container" onclick="toggleMenu()">
                <img src="${avatarSrc}" class="user-avatar" id="userAvatarDisplay">
                
                <div class="dropdown-menu" id="dropdownMenu">
                    <div style="padding: 10px 15px; font-weight:bold; font-size:0.8rem; color:#999; border-bottom:1px solid #eee;">
                        ${userRole}
                    </div>

                    <a href="#" class="dropdown-item" onclick="triggerFile(event)">📸 Alterar Foto</a>
                    
                    ${gerarLinksNavegacao(userRole, nomePagina)}
                    
                    <a href="#" class="dropdown-item danger" onclick="logout()">🚪 Sair</a>
                </div>
            </div>
        </nav>
        
        <input type="file" id="fileInput" accept="image/*" style="display:none" onchange="uploadFoto(this)">
    `;

    document.body.insertAdjacentHTML('afterbegin', navHTML);
}

// LÓGICA DOS LINKS DO MENU
function gerarLinksNavegacao(role, paginaAtual) {
    let links = '';
    
    // Precisamos pegar o setor salvo no login
    const userSector = localStorage.getItem('userSector');

    // 1. Link para Notas
    if (paginaAtual !== 'Minhas Notas') {
        links += `<a href="menu.html" class="dropdown-item">📝 Minhas Notas</a>`;
    }

    // 2. Link para Admin (Chefes em geral)
    if ((role === 'ADMIN_MASTER' || role === 'FULL') && paginaAtual !== 'Gestão de Usuários') {
        links += `<a href="admin.html" class="dropdown-item">👥 Gestão de Usuários</a>`;
    }

    // 3. Link para Radius (SÓ PARA SUPORTE_N2 COM CARGO ALTO)
    if (
        (role === 'ADMIN_MASTER' || role === 'FULL') && 
        userSector === 'SUPORTE_N2' && 
        paginaAtual !== 'Gestão Radius'
    ) {
        links += `<a href="radius.html" class="dropdown-item">📡 Gestão Radius (VM)</a>`;
    }

    // 4. Link para Dashboard
    if (paginaAtual !== 'Dashboard') {
        links += `<a href="dashboard.html" class="dropdown-item">📊 Dashboard Geral</a>`;
    }
    
    return links;
}

function toggleMenu() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) menu.classList.toggle('show');
}

window.onclick = function (event) {
    if (!event.target.matches('.user-avatar')) {
        const menu = document.getElementById('dropdownMenu');
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    }
}

function logout() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = 'login.html';
}

function triggerFile(e) {
    e.stopPropagation();
    document.getElementById('fileInput').click();
}

async function uploadFoto(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async function () {
        const base64String = reader.result;
        try {
            const response = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ avatarBase64: base64String })
            });

            if (response.ok) {
                document.getElementById('userAvatarDisplay').src = base64String;
                localStorage.setItem('userAvatar', base64String);
                alert("Foto atualizada!");
            } else {
                alert("Erro ao salvar foto.");
            }
        } catch (e) { console.error(e); }
    };
}