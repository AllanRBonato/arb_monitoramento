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

Caso o package.json ainda não exista:

npm init -y

----------------------------------------------

📦 Instalando as dependências

Instale as dependências necessárias:

npm install prisma@5.22.0 --save-dev
npm install @prisma/client@5.22.0
npm install nodemon --save-dev

----------------------------------------------

⚙️ Configurando o Prisma

Inicialize o Prisma no projeto:

npx prisma init


Isso irá criar:

A pasta prisma/

O arquivo .env

Configure no arquivo .env a variável DATABASE_URL com os dados do seu PostgreSQL.

Exemplo:

DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco"

----------------------------------------------

🐘 Acessando o PostgreSQL (se necessário)

Para acessar o banco via terminal:

sudo -u postgres psql


Caso o banco ainda não exista, crie-o:

CREATE DATABASE nome_do_banco;

----------------------------------------------

🗄️ Rodando as migrações

Para criar as tabelas no banco de dados, execute:

npx prisma migrate dev --name init


⚠️ Este comando deve ser executado sempre que houver alterações no schema.prisma.

----------------------------------------------

▶️ Configurando os scripts

No arquivo package.json, garanta que os scripts estejam configurados da seguinte forma:

"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js"
}

----------------------------------------------

▶️ Iniciando o servidor

Para rodar o projeto em modo desenvolvimento:

npm run dev


Ou em modo produção:

npm start

----------------------------------------------

✅ Pronto!

O sistema estará rodando localmente e pronto para uso 🚀
