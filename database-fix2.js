
async function addMissingColumns() {
    console.log('👉 Adding missing columns to existing tables...');
    
    const columnsToAdd = [
        
        {
            table: 'carts',
            column: 'region',
            definition: 'TEXT'
        },
        
        {
            table: 'cart_items',
            column: 'category',
            definition: 'TEXT'
        },
        
        {
            table: 'users',
            column: 'total_donated',
            definition: 'INTEGER DEFAULT 0'
        },
        
        {
            table: 'friendships',
            column: 'notified_7_days',
            definition: 'TIMESTAMP NULL'
        }
    ];
    
    for (const col of columnsToAdd) {
        
        const tableExists = await checkTableExists(col.table);
        if (!tableExists) {
            console.log(`⚠️ Table '${col.table}' does not exist. Skipping column addition.`);
            continue;
        }
        
        
        const columnExists = await checkColumnExists(col.table, col.column);
        if (!columnExists) {
            const query = `ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.definition};`;
            await runQuery(query);
            console.log(`✅ Added column '${col.column}' to table '${col.table}'`);
        } else {
            console.log(`ℹ️ Column '${col.column}' already exists in table '${col.table}'`);
        }
    }
}


async function createFriendshipLogsTable() {
    console.log('👉 Creating friendship_logs table if it doesn\'t exist...');
    
    const query = `
        CREATE TABLE IF NOT EXISTS friendship_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            lol_nickname TEXT NOT NULL,
            lol_tag TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            admin_id TEXT,
            admin_response TEXT,
            processed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        )
    `;
    
    await runQuery(query);
    console.log('✅ Friendship_logs table created/verified');
    
    
    const indexes = [
        `CREATE INDEX IF NOT EXISTS idx_friendship_logs_user_id ON friendship_logs(user_id)`,
        `CREATE INDEX IF NOT EXISTS idx_friendship_logs_account_id ON friendship_logs(account_id)`,
        `CREATE INDEX IF NOT EXISTS idx_friendship_logs_status ON friendship_logs(status)`
    ];
    
    for (const idx of indexes) {
        await runQuery(idx);
    }
    
    console.log('✅ Friendship_logs indexes created');
}


async function checkTableExists(tableName) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", 
            [tableName], 
            (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row);
                }
            }
        );
    });
}


async function checkColumnExists(tableName, columnName) {
    return new Promise(async (resolve, reject) => {
        try {
            const tableExists = await checkTableExists(tableName);
            if (!tableExists) {
                resolve(false);
                return;
            }
            
            db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
                if (err) {
                    reject(err);
                } else {
                    const exists = columns.some(col => col.name === columnName);
                    resolve(exists);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}


function runQuery(query) {
    return new Promise((resolve, reject) => {
        db.run(query, function(err) {
            if (err) {
                console.error(`❌ Error running query: ${query}`, err);
                reject(err);
            } else {
                resolve({ id: this.lastID, changes: this.changes });
            }
        });
    });
}


async function showDatabaseInfo() {
    console.log('📊 Database Information:');
    
    return new Promise((resolve, reject) => {
        
        db.get('SELECT sqlite_version() as version', (err, versionRow) => {
            if (err) {
                console.error('❌ Error getting SQLite version:', err);
            } else {
                console.log(`   - SQLite version: ${versionRow.version}`);
            }
            
            
            try {
                const stats = fs.statSync(DB_FILE);
                const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                console.log(`   - Database size: ${sizeInMB} MB`);
            } catch (error) {
                console.error('❌ Error getting database size:', error);
            }
            
            // Get table list
            db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
                if (err) {
                    console.error('❌ Error getting table list:', err);
                    reject(err);
                } else {
                    const tableList = tables.map(t => t.name).filter(name => !name.startsWith('sqlite_'));
                    console.log(`   - Tables (${tableList.length}): ${tableList.join(', ')}`);
                    resolve();
                }
            });
        });
    });
}


runMigrations().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});



const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');


const DB_FILE = './database.db';


const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        process.exit(1);
    }
    console.log('🔌 Connected to database');
});


db.run('PRAGMA foreign_keys = ON;', (err) => {
    if (err) {
        console.warn('⚠️ Could not enable foreign keys:', err);
    } else {
        console.log('🔑 Foreign keys enabled');
    }
});


async function runMigrations() {
    try {
        console.log('🔄 Running migrations...');

        
        await createBaseTables();
        
        
        await addMissingColumns();
        
        
        await createFriendshipLogsTable();
        
        
        await showDatabaseInfo();
        
        console.log('✅ Migrations completed successfully!');
    } catch (error) {
        console.error('❌ Error running migrations:', error);
    } finally {
        
        db.close((err) => {
            if (err) {
                console.error('❌ Error closing database:', err);
            } else {
                console.log('🔌 Database connection closed');
            }
        });
    }
}


async function createBaseTables() {
    console.log('👉 Creating base tables if they don\'t exist...');
    
    const tables = [
        
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            total_donated INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        
        `CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL,
            rp_amount INTEGER NOT NULL DEFAULT 0,
            friends_count INTEGER NOT NULL DEFAULT 0,
            max_friends INTEGER NOT NULL DEFAULT 250,
            region TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        
        `CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            lol_nickname TEXT NOT NULL,
            lol_tag TEXT NOT NULL,
            notified_7_days TIMESTAMP NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
            UNIQUE(user_id, account_id)
        )`,
        
        
        `CREATE TABLE IF NOT EXISTS carts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            ticket_channel_id TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            total_rp INTEGER NOT NULL DEFAULT 0,
            total_price REAL NOT NULL DEFAULT 0.00,
            region TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        
        `CREATE TABLE IF NOT EXISTS cart_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cart_id INTEGER NOT NULL,
            skin_name TEXT NOT NULL,
            skin_price INTEGER NOT NULL,
            skin_image_url TEXT,
            category TEXT,
            original_item_id INTEGER,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE
        )`,
        
        
        `CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cart_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            payment_method TEXT,
            payment_proof TEXT,
            total_rp INTEGER NOT NULL,
            total_price REAL NOT NULL,
            completed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cart_id) REFERENCES carts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        
        
        `CREATE TABLE IF NOT EXISTS order_logs (
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
        )`
    ];
    
    for (const query of tables) {
        await runQuery(query);
    }
    
    console.log('✅ Base tables created/verified');
}