# 🍻 Fugida
**Seu próximo rolê decidido em segundos.**

O **Fugida** é uma aplicação web inteligente feita para acabar com a indecisão na hora de sair.  
Com base na sua **localização**, **vibe desejada** e **orçamento**, o app encontra as melhores opções de lazer, calcula os custos de transporte e garante que o rolê caiba no bolso.

---

## 🚀 Funcionalidades

- 📍 **Geolocalização Inteligente**  
  Detecta onde você está ou permite busca manual por bairro/cidade.

- 🔎 **Busca por Vibe**  
  Filtros por categorias como:
  - Bares  
  - Restaurantes Românticos  
  - Baladas  
  - Ar Livre  
  - Cultura  

- 💰 **Calculadora de Orçamento**  
  Estima o custo do Uber/99 (ida e volta) e mostra quanto sobra para gastar no local.

- 🚗 **Integração com Transporte**  
  Deep Links para abrir o destino direto no app da **Uber** ou **99Pop**.

- ⭐ **Detalhes Completos**  
  Fotos, avaliações, nota média e horários via **Google Places API**.

- 🔐 **Login Social**  
  Autenticação rápida e segura com **Google**.

---

## 🛠️ Tecnologias Utilizadas

### Backend
- Node.js
- Express

### Frontend
- EJS (Embedded JavaScript Templates)
- CSS3 moderno

### Banco de Dados
- MySQL

### APIs Externas
- Google Maps JavaScript API  
- Google Places API (Text Search & Details)  
- Google Distance Matrix API  
- Google Geocoding API  

### Autenticação
- Passport.js (Google Strategy)

---

## 📂 Estrutura do Projeto

fugida/ ├── app.js              # Ponto de entrada da aplicação ├── routes/             # Rotas (index, auth, etc.) ├── views/              # Templates EJS (Frontend) ├── public/             # Arquivos estáticos (CSS, Imagens) ├── database/           # Scripts SQL para criação do banco ├── middleware/         # Middlewares de autenticação └── .env                # Variáveis de ambiente (não versionado)

---

## ⚙️ Instalação e Configuração

### 1. Pré-requisitos
- Node.js instalado  
- MySQL instalado e rodando  
- Conta no Google Cloud Platform (APIs de Mapas)

---

### 2. Clone o repositório
```bash
git clone https://github.com/seu-usuario/fugida.git
cd fugida


---

3. Instale as dependências

npm install


---

4. Configuração do Banco de Dados

Crie um banco MySQL e execute o script:

database/schema.sql


---

5. Variáveis de Ambiente

Crie um arquivo .env na raiz do projeto:

# Servidor
PORT=3000
SESSION_SECRET=sua_chave_secreta_aqui

# Google Maps Platform
GOOGLE_MAPS_API_KEY=sua_api_key_do_google
GOOGLE_PLACES_API_KEY=sua_api_key_do_google
GOOGLE_DISTANCE_MATRIX=sua_api_key_do_google

# Google OAuth
GOOGLE_CLIENT_ID=seu_client_id
GOOGLE_CLIENT_SECRET=seu_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Banco de Dados
DB_HOST=localhost
DB_USER=root
DB_PASS=sua_senha_mysql
DB_NAME=fugida_db


---

6. Rodando a aplicação

Modo desenvolvimento:

npm run dev

Modo padrão:

node app.js

Acesse:
👉 http://localhost:3000