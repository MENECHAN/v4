const db = require('./database/connection');

async function checkOrders() {
    try {
        await db.initialize();
        
        console.log('=== TODOS OS PEDIDOS ===');
        const allOrders = await db.all('SELECT id, user_id, status, total_rp, total_price, created_at FROM order_logs ORDER BY created_at DESC');
        
        console.table(allOrders);
        
        console.log('\n=== CONTAGEM POR STATUS ===');
        const statusCount = await db.all(`
            SELECT status, COUNT(*) as count, SUM(total_price) as total_revenue 
            FROM order_logs 
            GROUP BY status
        `);
        
        console.table(statusCount);
        
        console.log('\n=== PEDIDOS DOS ÚLTIMOS 30 DIAS ===');
        const recentOrders = await db.all(`
            SELECT status, COUNT(*) as count, SUM(total_price) as revenue
            FROM order_logs 
            WHERE created_at >= datetime('now', '-30 days')
            GROUP BY status
        `);
        
        console.table(recentOrders);
        
        process.exit(0);
    } catch (error) {
        console.error('Erro:', error);
        process.exit(1);
    }
}

checkOrders();