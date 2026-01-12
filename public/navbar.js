function criarNavbar(nomePagina) {
    const token = localStorage.getItem('token');
    // Tenta pegar a foto salva no login
    const savedAvatar = localStorage.getItem('userAvatar');
    const userRole = localStorage.getItem('userRole');
    
    if (!token) return;

    // Se tiver avatar salvo (base64), usa ele. Se não, usa o padrão.
    const avatarSrc = (savedAvatar && savedAvatar !== "null") 
        ? savedAvatar 
        : `https://ui-avatars.com/api/?name=${userRole}&background=random`;

    const navHTML = `
        <nav class="navbar">
            <div class="navbar-brand">
                <span>ARB Monitoramento</span>
                <span class="page-title">${nomePagina}</span>
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

function triggerFile(e) {
    e.stopPropagation(); // Não fecha o menu
    // Simula o clique no input invisível
    document.getElementById('fileInput').click();
}

async function uploadFoto(input) {
    const file = input.files[0];
    if (!file) return;

    // Converte para Base64 (Texto)
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async function () {
        const base64String = reader.result;

        // Envia para o servidor
        const response = await fetch('/api/user/avatar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ avatarBase64: base64String })
        });

        if (response.ok) {
            // Atualiza a imagem na tela na hora
            document.getElementById('userAvatarDisplay').src = base64String;
            // Salva no localStorage para a próxima vez
            localStorage.setItem('userAvatar', base64String);
            alert("Foto de perfil atualizada!");
        } else {
            alert("Erro ao salvar foto (Talvez seja muito grande?)");
        }
    };
}

function gerarLinksNavegacao(role, paginaAtual) {
    let links = '';
    if ((role === 'ADMIN_MASTER' || role === 'FULL') && paginaAtual !== 'Gestão de Usuários') {
        links += `<a href="admin.html" class="dropdown-item">👥 Gestão de Usuários</a>`;
    }
    if (paginaAtual !== 'Dashboard') {
        links += `<a href="dashboard.html" class="dropdown-item">📊 Voltar ao Dashboard</a>`;
    }
    return links;
}

function toggleMenu() {
    document.getElementById('dropdownMenu').classList.toggle('show');
}

window.onclick = function(event) {
    if (!event.target.matches('.user-avatar')) {
        const menu = document.getElementById('dropdownMenu');
        if (menu && menu.classList.contains('show')) menu.classList.remove('show');
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}