const cron = require('node-cron');
const db = require('./db');
const axios = require('axios');

// Check and expire servers every 5 minutes
const checkExpiredServers = async () => {
    try {
        console.log('Running cron job: Checking expired servers...');
        
        const now = new Date();
        const result = await db.query(
            `UPDATE servers 
             SET status = 'expired' 
             WHERE expires_at <= $1 
             AND status = 'active' 
             RETURNING *`,
            [now]
        );

        // Stop expired servers on external API
        for (const server of result.rows) {
            if (server.session_id) {
                try {
                    await axios.post(
                        `${process.env.EXTERNAL_API_URL}/stop/${server.session_id}`
                    );
                    console.log(`Stopped server session: ${server.session_id}`);
                } catch (error) {
                    console.error(`Failed to stop server ${server.session_id}:`, error.message);
                }
            }
        }

        console.log(`Expired ${result.rowCount} servers`);
    } catch (error) {
        console.error('Cron job error:', error);
    }
};

// Clean up old expired servers (older than 7 days)
const cleanupOldServers = async () => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const result = await db.query(
            `DELETE FROM servers 
             WHERE status = 'expired' 
             AND updated_at <= $1 
             RETURNING id`,
            [sevenDaysAgo]
        );
        
        console.log(`Cleaned up ${result.rowCount} old servers`);
    } catch (error) {
        console.error('Cleanup error:', error);
    }
};

const initializeCronJobs = () => {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', checkExpiredServers);
    
    // Run cleanup every day at 3 AM
    cron.schedule('0 3 * * *', cleanupOldServers);
    
    console.log('Cron jobs initialized');
};

module.exports = { initializeCronJobs };
