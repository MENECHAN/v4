const db = require('./connection');


async function tableExists(tableName) {
  try {
    const query = "SELECT name FROM sqlite_master WHERE type='table' AND name=?;";
    const result = await db.get(query, [tableName]);
    return !!result;
  } catch (error) {
    console.error(`[SCHEMA FIX] Error checking if table '${tableName}' exists:`, error);
    return false; 
  }
}


async function columnExists(tableName, columnName) {
  try {
    const tableFound = await tableExists(tableName);
    if (!tableFound) {
      console.log(`[SCHEMA FIX] Table '${tableName}' not found, so column '${columnName}' can't exist.`);
      return false; // Column can't exist if table doesn't
    }

    const tableInfo = await db.all(`PRAGMA table_info(${tableName});`);
    return tableInfo.some(column => column.name === columnName);
  } catch (error) {
    console.error(`[SCHEMA FIX] Error checking column '${columnName}' in table '${tableName}':`, error);
    return false; // Assume not exists on error
  }
}

async function fixCartItemsTable() {
  const tableName = 'cart_items';
  const columnName = 'category';
  console.log(`[SCHEMA FIX] 🔧 Checking table '${tableName}' for column '${columnName}'...`);

  try {
    const cartItemsTableExists = await tableExists(tableName);

    if (!cartItemsTableExists) {
      console.warn(`[SCHEMA FIX] ⚠️ Table '${tableName}' NOT FOUND. Skipping addition of column '${columnName}'. This table should have been created by migrations.`);
      return; // Stop here for this fix if table doesn't exist.
    }

    console.log(`[SCHEMA FIX] ℹ️ Table '${tableName}' found.`);
    const categoryColumnExistsInCartItems = await columnExists(tableName, columnName);

    if (!categoryColumnExistsInCartItems) {
      console.log(`[SCHEMA FIX] ➕ Column '${columnName}' not found in table '${tableName}'. Attempting to add...`);
      try {
        await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT;`);
        console.log(`[SCHEMA FIX] ✅ Column '${columnName}' successfully added to table '${tableName}'.`);
      } catch (err) {
        console.error(`[SCHEMA FIX] ❌ FATAL error adding column '${columnName}' to table '${tableName}': ${err.message}`, err);
      }
    } else {
      console.log(`[SCHEMA FIX] 👍 Column '${columnName}' already exists in table '${tableName}'. No action needed.`);
    }
  } catch (error) {
    console.error(`[SCHEMA FIX] ❌ Error while fixing table '${tableName}':`, error);
  }
}

async function fixUsersTableForTotalDonated() {
    const tableName = 'users';
    const columnName = 'total_donated';
    console.log(`[SCHEMA FIX] 🔧 Checking table '${tableName}' for column '${columnName}'...`);

    try {
      const tableFound = await tableExists(tableName);
      if (!tableFound) {
        console.warn(`[SCHEMA FIX] ⚠️ Table '${tableName}' NOT FOUND. Skipping addition of column '${columnName}'.`);
        return;
      }

      const columnFound = await columnExists(tableName, columnName);
      if (!columnFound) {
        console.log(`[SCHEMA FIX] ➕ Column '${columnName}' not found in table '${tableName}'. Attempting to add with DEFAULT 0...`);
        try {
          await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} INTEGER DEFAULT 0;`);
          console.log(`[SCHEMA FIX] ✅ Column '${columnName}' successfully added to table '${tableName}'.`);
        } catch (err) {
          console.error(`[SCHEMA FIX] ❌ Error adding column '${columnName}' to table '${tableName}': ${err.message}`, err);
        }
      } else {
        console.log(`[SCHEMA FIX] 👍 Column '${columnName}' already exists in table '${tableName}'.`);
      }
    } catch (error) {
      console.error(`[SCHEMA FIX] ❌ Error while fixing table '${tableName}':`, error);
    }
}


async function fixCartsTableForRegion() {
    const tableName = 'carts';
    const columnName = 'region';
    console.log(`[SCHEMA FIX] 🔧 Checking table '${tableName}' for column '${columnName}'...`);

    try {
      const tableFound = await tableExists(tableName);
      if (!tableFound) {
        console.warn(`[SCHEMA FIX] ⚠️ Table '${tableName}' NOT FOUND. Skipping addition of column '${columnName}'.`);
        return;
      }

      const columnFound = await columnExists(tableName, columnName);
      if (!columnFound) {
        console.log(`[SCHEMA FIX] ➕ Column '${columnName}' not found in table '${tableName}'. Attempting to add...`);
        try {
          await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TEXT;`);
          console.log(`[SCHEMA FIX] ✅ Column '${columnName}' successfully added to table '${tableName}'.`);
        } catch (err) {
          console.error(`[SCHEMA FIX] ❌ Error adding column '${columnName}' to table '${tableName}': ${err.message}`, err);
        }
      } else {
        console.log(`[SCHEMA FIX] 👍 Column '${columnName}' already exists in table '${tableName}'.`);
      }
    } catch (error) {
      console.error(`[SCHEMA FIX] ❌ Error while fixing table '${tableName}':`, error);
    }
}


async function createFriendshipLogsTable() {
  const tableName = 'friendship_logs';
  console.log(`[SCHEMA FIX] 🔧 Checking if table '${tableName}' exists...`);

  try {
    const tableFound = await tableExists(tableName);
    if (!tableFound) {
      console.log(`[SCHEMA FIX] ➕ Table '${tableName}' not found. Creating it...`);
      
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
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
      
      try {
        await db.run(createTableSQL);
        console.log(`[SCHEMA FIX] ✅ Table '${tableName}' created successfully.`);
      } catch (err) {
        console.error(`[SCHEMA FIX] ❌ Error creating table '${tableName}': ${err.message}`, err);
      }
    } else {
      console.log(`[SCHEMA FIX] 👍 Table '${tableName}' already exists.`);
    }
  } catch (error) {
    console.error(`[SCHEMA FIX] ❌ Error while checking/creating table '${tableName}':`, error);
  }
}


async function fixFriendshipsNotifiedColumn() {
  const tableName = 'friendships';
  const columnName = 'notified_7_days';
  console.log(`[SCHEMA FIX] 🔧 Checking table '${tableName}' for column '${columnName}'...`);

  try {
    const tableFound = await tableExists(tableName);
    if (!tableFound) {
      console.warn(`[SCHEMA FIX] ⚠️ Table '${tableName}' NOT FOUND. Skipping addition of column '${columnName}'.`);
      return;
    }

    const columnFound = await columnExists(tableName, columnName);
    if (!columnFound) {
      console.log(`[SCHEMA FIX] ➕ Column '${columnName}' not found in table '${tableName}'. Attempting to add...`);
      try {
        await db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} TIMESTAMP NULL;`);
        console.log(`[SCHEMA FIX] ✅ Column '${columnName}' successfully added to table '${tableName}'.`);
      } catch (err) {
        console.error(`[SCHEMA FIX] ❌ Error adding column '${columnName}' to table '${tableName}': ${err.message}`, err);
      }
    } else {
      console.log(`[SCHEMA FIX] 👍 Column '${columnName}' already exists in table '${tableName}'.`);
    }
  } catch (error) {
    console.error(`[SCHEMA FIX] ❌ Error while fixing table '${tableName}':`, error);
  }
}


async function applyDatabaseFixes() {
  console.log("--- [SCHEMA FIX] Starting schema verification and fixes ---");
  
  try {
    await fixCartItemsTable();
    await fixUsersTableForTotalDonated();
    await fixCartsTableForRegion();
    await createFriendshipLogsTable();
    await fixFriendshipsNotifiedColumn();
    
    console.log("--- [SCHEMA FIX] Schema fixes completed ---");
  } catch (error) {
    console.error("[SCHEMA FIX] ❌ Error during schema fix:", error);
  }
}

module.exports = { applyDatabaseFixes };