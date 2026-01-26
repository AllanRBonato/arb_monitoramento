(function() {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = './favicon/favicon.ico'; 
})();

window.addEventListener('pageshow', function (event) {
    if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
        window.location.reload();
    }
});

function criarNavbar(nomePagina) {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    document.body.style.display = 'flex';

    let savedAvatar = localStorage.getItem('userAvatar');
    const userRole = localStorage.getItem('userRole');

    // Correção: Se a imagem não for link completo (ex: uploads/...), adiciona a barra
    if (savedAvatar && !savedAvatar.startsWith('http') && !savedAvatar.startsWith('/')) {
        savedAvatar = '/' + savedAvatar;
    }

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

function gerarLinksNavegacao(role, paginaAtual) {
    let links = '';
    const userSector = localStorage.getItem('userSector');

    if (paginaAtual !== 'Minhas Notas') {
        links += `<a href="menu.html" class="dropdown-item">📝 Minhas Notas</a>`;
    }

    if ((role === 'ADMIN_MASTER' || role === 'FULL') && paginaAtual !== 'Gestão de Usuários') {
        links += `<a href="admin.html" class="dropdown-item">👥 Gestão de Usuários</a>`;
    }

    if ((role === 'ADMIN_MASTER' || role === 'FULL') && userSector === 'SUPORTE_N2' && paginaAtual !== 'Gestão Radius') {
        links += `<a href="radius.html" class="dropdown-item">📡 Gestão Radius (VM)</a>`;
    }

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

// --- FUNÇÃO DE UPLOAD CORRIGIDA PARA ENVIAR ARQUIVO REAL ---
async function uploadFoto(input) {
    const file = input.files[0];
    if (!file) return;

    // Prepara o formulário de dados (Multipart)
    const formData = new FormData();
    formData.append('avatar', file); // 'avatar' deve bater com o backend

    try {
        const response = await fetch('/api/user/avatar', {
            method: 'POST',
            headers: {
                // NÃO definir Content-Type aqui (o browser define multipart/form-data sozinho)
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            
            // Corrige o caminho para exibição
            const newPath = '/' + data.path.replace(/\\/g, '/');
            
            document.getElementById('userAvatarDisplay').src = newPath;
            localStorage.setItem('userAvatar', newPath); // Salva o caminho do arquivo, não base64
            
            alert("Foto atualizada com sucesso!");
            // Opcional: Recarregar para garantir que apareça em tudo
            // location.reload(); 
        } else {
            const err = await response.json();
            alert("Erro: " + (err.error || "Falha ao salvar foto."));
        }
    } catch (e) {
        console.error(e);
        alert("Erro de conexão ao enviar foto.");
    }
}