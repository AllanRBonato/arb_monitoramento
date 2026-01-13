🔐 Gerando a chave do JWT

Utilize o comando abaixo para gerar uma chave aleatória e segura para usar na variável JWT_SECRET:

node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"


Após gerar a chave, adicione-a ao arquivo .env:

JWT_SECRET=sua_chave_gerada_aqui

----------------------------------------------

🚀 Como iniciar o projeto localmente

📋 Pré-requisitos

Antes de começar, certifique-se de ter instalado em sua máquina:

Node.js (versão 18 ou superior)

npm

PostgreSQL

Git

----------------------------------------------

📥 Clonando o repositório

git clone <URL_DO_REPOSITORIO>
cd <NOME_DO_PROJETO>

----------------------------------------------

📦 Inicializando o projeto

Caso o arquivo package.json ainda não exista:

npm init -y

----------------------------------------------

📦 Instalando as dependências

npm install prisma@5.22.0 --save-dev

npm install @prisma/client@5.22.0

npm install nodemon --save-dev

----------------------------------------------

⚙️ Configurando o Prisma
npx prisma init


Isso irá criar:

A pasta prisma/

O arquivo .env

Configure no arquivo .env a variável DATABASE_URL com os dados do seu PostgreSQL.

Exemplo:

DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco"

----------------------------------------------

🐘 Acessando o PostgreSQL (se necessário)
sudo -u postgres psql


Caso o banco ainda não exista:

CREATE DATABASE nome_do_banco;

----------------------------------------------

🗄️ Rodando as migrações
npx prisma migrate dev --name init


⚠️ Este comando deve ser executado sempre que houver alterações no arquivo schema.prisma.

----------------------------------------------

▶️ Configurando os scripts

No arquivo package.json:

"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}

----------------------------------------------

▶️ Iniciando o servidor

Modo desenvolvimento:

npm run dev


Modo produção:

npm start


✅ Pronto!

O sistema estará rodando localmente e pronto para uso 🚀
