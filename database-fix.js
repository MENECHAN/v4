const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');


const DB_FILE = './database.db';
const BACKUP_FOLDER = './backups';
const CREATE_BACKUP = true;


if (CREATE_BACKUP && !fs.existsSync(BACKUP_FOLDER)) {
    fs.mkdirSync(BACKUP_FOLDER, { recursive: true });
}


async function fixDatabase() {
    
    if (CREATE_BACKUP) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_FOLDER, `database-backup-${timestamp}.db`);
        console.log(`📦 Creating database backup: ${backupPath}`);
        
        try {
            if (fs.existsSync(DB_FILE)) {
                fs.copyFileSync(DB_FILE, backupPath);
                console.log('✅ Backup created successfully');
            } else {
                console.log('⚠️ No database file found to backup');
            }
        } catch (error) {
            console.error('❌ Error creating backup:', error);
        }
    }

    
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

    
    await fixCartRegionColumn(db);

    
    await createFriendshipLogsTable(db);

    
    await fixFriendshipsNotifiedColumn(db);

    
    await verifyAllTables(db);

    
    await showDatabaseInfo(db);

    
    db.close((err) => {
        if (err) {
            console.error('❌ Error closing database:', err);
        } else {
            console.log('🔌 Database connection closed');
        }
        console.log('✅ Database fix completed');
    });
}


function tableExists(db, tableName) {
    return new Promise((resolve, reject) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", [tableName], (err, row) => {
            if (err) {
                console.error(`❌ Error checking if table '${tableName}' exists:`, err);
                reject(err);
            } else {
                resolve(!!row);
            }
        });
    });
}


function columnExists(db, tableName, columnName) {
    return new Promise(async (resolve, reject) => {
        try {
            const exists = await tableExists(db, tableName);
            if (!exists) {
                console.log(`⚠️ Table '${tableName}' doesn't exist, so column '${columnName}' cannot exist`);
                resolve(false);
                return;
            }

            db.all(`PRAGMA table_info(${tableName});`, (err, columns) => {
                if (err) {
                    console.error(`❌ Error checking column '${columnName}' in table '${tableName}':`, err);
                    reject(err);
                } else {
                    const exists = columns.some(column => column.name === columnName);
                    resolve(exists);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Fix for carts table - add region column
async function fixCartRegionColumn(db) {
    console.log('👉 Checking carts table for region column...');

    try {
        const cartsTableExists = await tableExists(db, 'carts');

        if (!cartsTableExists) {
            console.log('⚠️ Carts table does not exist. Will run migrations to create it.');
            await createCartsTable(db);
        } else {
            console.log('✅ Carts table exists');
            
            const regionColumnExists = await columnExists(db, 'carts', 'region');
            
            if (!regionColumnExists) {
                console.log('❌ Region column missing in carts table. Adding it...');
                
                return new Promise((resolve, reject) => {
                    db.run('ALTER TABLE carts ADD COLUMN region TEXT;', (err) => {
                        if (err) {
                            console.error('❌ Error adding region column:', err);
                            reject(err);
                        } else {
                            console.log('✅ Region column added successfully');
                            resolve();
                        }
                    });
                });
            } else {
                console.log('✅ Region column already exists in carts table');
            }
        }
    } catch (error) {
        console.error('❌ Error fixing carts table:', error);
        throw error;
    }
}

// Create carts table if it doesn't exist
async function createCartsTable(db) {
    return new Promise((resolve, reject) => {
        const query = `
            CREATE TABLE IF NOT EXISTS carts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                ticket_channel_id TEXT UNIQUE NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                total_rp INTEGER NOT NULL DEFAULT 0,
                total_price REAL NOT NULL DEFAULT 0.00,
                region TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        db.run(query, (err) => {
            if (err) {
                console.error('❌ Error creating carts table:', err);
                reject(err);
            } else {
                console.log('✅ Carts table created successfully');
                resolve();
            }
        });
    });
}


async function createFriendshipLogsTable(db) {
    console.log('👉 Checking friendship_logs table...');

    try {
        const tableExists = await tableExists(db, 'friendship_logs');

        if (!tableExists) {
            console.log('❌ Friendship_logs table is missing. Creating it...');
            
            return new Promise((resolve, reject) => {
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
                
                db.run(query, (err) => {
                    if (err) {
                        console.error('❌ Error creating friendship_logs table:', err);
                        reject(err);
                    } else {
                        console.log('✅ Friendship_logs table created successfully');
                        resolve();
                    }
                });
            });
        } else {
            console.log('✅ Friendship_logs table already exists');
        }
    } catch (error) {
        console.error('❌ Error checking friendship_logs table:', error);
        throw error;
    }
}


async function fixFriendshipsNotifiedColumn(db) {
    console.log('👉 Checking friendships table for notified_7_days column...');

    try {
        const friendshipsTableExists = await tableExists(db, 'friendships');

        if (!friendshipsTableExists) {
            console.log('⚠️ Friendships table does not exist. Will run migrations to create it.');
            
            return;
        }
        
        const notifiedColumnExists = await columnExists(db, 'friendships', 'notified_7_days');
        
        if (!notifiedColumnExists) {
            console.log('❌ notified_7_days column missing in friendships table. Adding it...');
            
            return new Promise((resolve, reject) => {
                db.run('ALTER TABLE friendships ADD COLUMN notified_7_days TIMESTAMP NULL;', (err) => {
                    if (err) {
                        console.error('❌ Error adding notified_7_days column:', err);
                        reject(err);
                    } else {
                        console.log('✅ notified_7_days column added successfully');
                        resolve();
                    }
                });
            });
        } else {
            console.log('✅ notified_7_days column already exists in friendships table');
        }
    } catch (error) {
        console.error('❌ Error fixing friendships table:', error);
        throw error;
    }
}


async function verifyAllTables(db) {
    console.log('👉 Verifying all core tables...');

    const coreTables = [
        'users',
        'accounts',
        'friendships',
        'carts',
        'cart_items',
        'orders',
        'order_logs',
        'friendship_logs'
    ];

    for (const table of coreTables) {
        try {
            const exists = await tableExists(db, table);
            if (!exists) {
                console.log(`❌ Core table '${table}' is missing`);
                
            } else {
                console.log(`✅ Table '${table}' exists`);
            }
        } catch (error) {
            console.error(`❌ Error checking table '${table}':`, error);
        }
    }
}


async function showDatabaseInfo(db) {
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


fixDatabase().catch(error => {
    console.error('❌ Fatal error fixing database:', error);
    process.exit(1);
});