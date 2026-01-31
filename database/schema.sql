-- Criação do Banco
CREATE DATABASE IF NOT EXISTS fugida CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fugida;

-- 1. Tabela de Usuários
-- Preparada para Auth e Planos (Freemium)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255), -- Nullable se usarmos Social Login no futuro
    phone VARCHAR(20),
    plan ENUM('FREE', 'PRO', 'ENTERPRISE') DEFAULT 'FREE',
    credits INT DEFAULT 5, -- Créditos para o modelo freemium
    stripe_customer_id VARCHAR(255), -- Preparado para pagamentos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB COMMENT='Dados cadastrais e controle de plano';

-- 2. Tabela de Pesquisas
-- Histórico para analytics e "Meus Roteiros"
CREATE TABLE IF NOT EXISTS pesquisas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT, -- Nullable para usuários anônimos (se permitirmos)
    address_input VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    vibe VARCHAR(100),
    budget DECIMAL(10, 2),
    radius_km INT DEFAULT 5,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_history (user_id, created_at)
) ENGINE=InnoDB COMMENT='Log de intenção de busca dos usuários';

-- 3. Cache de Geocoding (Economia de Custo: ALTA)
-- Se alguém buscar "Savassi, BH" de novo, não pagamos API
CREATE TABLE IF NOT EXISTS cache_geocode (
    id INT AUTO_INCREMENT PRIMARY KEY,
    address_slug VARCHAR(255) NOT NULL UNIQUE, -- Ex: savassi-belo-horizonte-mg (sanitizado)
    full_address VARCHAR(255),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_hit_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_slug (address_slug)
) ENGINE=InnoDB COMMENT='Cache para evitar chamadas repetidas na Geocoding API';

-- 4. Cache de Places (Economia de Custo: MÉDIA/ALTA)
-- Guarda o JSON de resposta do Google para vibes/locais específicos
CREATE TABLE IF NOT EXISTS cache_places (
    id INT AUTO_INCREMENT PRIMARY KEY,
    query_signature VARCHAR(255) NOT NULL UNIQUE, -- Hash ou string: "lat,lng,vibe,radius"
    json_result JSON NOT NULL, -- O resultado da API (textsearch/nearby)
    expires_at TIMESTAMP NOT NULL, -- Importante: Termos do Google exigem refresh periódico
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_signature (query_signature)
) ENGINE=InnoDB COMMENT='Cache de resultados de lugares próximos';

-- 5. Uso de API (Auditoria de Custo)
-- Para sabermos se um usuário FREE está dando prejuízo
CREATE TABLE IF NOT EXISTS uso_api (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    endpoint VARCHAR(100), -- Ex: 'textsearch', 'geocode', 'distancematrix'
    cost_credits INT DEFAULT 1, -- Custo interno do sistema
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_usage (user_id, created_at)
) ENGINE=InnoDB COMMENT='Log técnico de consumo de recursos';

-- Alter Tables 

-- Migration Sprint 2: Adicionar campos para Google Auth
ALTER TABLE users 
ADD COLUMN google_id VARCHAR(255) UNIQUE AFTER id,
ADD COLUMN avatar_url VARCHAR(255) AFTER email;

-- Ajustar a coluna password_hash para aceitar NULL (usuários Google não têm senha)
ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;