const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Caminho para o seu banco de dados
const DB_FILE = './database.db';

// Verificar se o arquivo existe
if (!fs.existsSync(DB_FILE)) {
    console.error(`❌ Arquivo de banco de dados não encontrado: ${DB_FILE}`);
    process.exit(1);
}

console.log(`🔍 Conectando ao banco de dados: ${DB_FILE}`);

// Abrir conexão com o banco de dados
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('❌ Erro ao abrir banco de dados:', err);
        process.exit(1);
    }
    console.log('✅ Conectado ao banco de dados');
});

// Habilitar chaves estrangeiras
db.run('PRAGMA foreign_keys = ON;', (err) => {
    if (err) {
        console.warn('⚠️ Não foi possível habilitar chaves estrangeiras:', err);
    } else {
        console.log('✅ Chaves estrangeiras habilitadas');
    }
});

// Verificar se a tabela já existe
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='order_logs'", (err, row) => {
    if (err) {
        console.error('❌ Erro ao verificar tabela:', err);
        closeAndExit(1);
        return;
    }

    if (row) {
        console.log('⚠️ Tabela order_logs já existe.');
        console.log('👉 Para recriar a tabela, exclua-a manualmente primeiro.');
        closeAndExit(0);
        return;
    }

    // Criar a tabela order_logs
    const createTableSQL = `
        CREATE TABLE order_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            cart_id INTEGER,
            items_data TEXT,
            total_rp INTEGER NOT NULL DEFAULT 0,
            total_price REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'PENDING_CHECKOUT',
            payment_proof_url TEXT,
            order_channel_id TEXT,
            selected_account_id INTEGER,
            processed_by_admin_id TEXT,
            debited_from_account_id INTEGER,
            admin_notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;

    db.run(createTableSQL, (err) => {
        if (err) {
            console.error('❌ Erro ao criar tabela order_logs:', err);
            closeAndExit(1);
            return;
        }

        console.log('✅ Tabela order_logs criada com sucesso!');
        
        // Criar índices para melhorar performance
        const indexes = [
            'CREATE INDEX idx_order_logs_user_id ON order_logs(user_id)',
            'CREATE INDEX idx_order_logs_status ON order_logs(status)',
            'CREATE INDEX idx_order_logs_cart_id ON order_logs(cart_id)'
        ];
        
        let indexesCreated = 0;
        indexes.forEach((indexSQL, i) => {
            db.run(indexSQL, (err) => {
                if (err) {
                    console.warn(`⚠️ Erro ao criar índice #${i+1}:`, err);
                } else {
                    indexesCreated++;
                    console.log(`✅ Índice #${i+1} criado com sucesso`);
                    
                    // Fechar conexão quando todos os índices forem criados
                    if (indexesCreated === indexes.length) {
                        console.log('🎉 Todos os índices criados com sucesso!');
                        closeAndExit(0);
                    }
                }
            });
        });
    });
});

function closeAndExit(code) {
    db.close((err) => {
        if (err) {
            console.error('❌ Erro ao fechar banco de dados:', err);
        } else {
            console.log('👋 Conexão com banco de dados fechada');
        }
        console.log(`🏁 Processo concluído ${code === 0 ? 'com sucesso' : 'com erros'}`);
        process.exit(code);
    });
}