// backend/scripts/sync_codes_to_tables.js
const db = require('../db');

const syncCodesToDisplayTables = async () => {
  console.log('Syncing codes to display tables...');
  
  try {
    // Tax rates (cd_cls = '04')
    await db.runAsync(`
      INSERT OR REPLACE INTO tax_rates (code, label, rate, description, updated_at)
      SELECT 
        cd,
        cd_nm,
        CAST(COALESCE(user_dfn_cd1, '0') AS REAL) / 100,
        cd_desc,
        updated_at
      FROM codes 
      WHERE cd_cls = '04' AND use_yn = 'Y'
    `);
    console.log('Tax rates synced');

    // Payment types (cd_cls = '07')
    await db.runAsync(`
      INSERT OR REPLACE INTO payment_types (code, label, description, is_active)
      SELECT 
        cd,
        cd_nm,
        cd_desc,
        CASE WHEN use_yn = 'Y' THEN 1 ELSE 0 END
      FROM codes 
      WHERE cd_cls = '07' AND use_yn = 'Y'
    `);
    console.log('Payment types synced');

    // Unit codes (cd_cls = '10')
    await db.runAsync(`
      INSERT OR REPLACE INTO unit_codes (code, label, description)
      SELECT 
        cd,
        cd_nm,
        cd_desc
      FROM codes 
      WHERE cd_cls = '10' AND use_yn = 'Y'
    `);
    console.log('Unit codes synced');

    console.log('All display tables synced successfully');
    return true;
  } catch (error) {
    console.error('Failed to sync display tables:', error.message);
    return false;
  }
};

// Run if called directly
if (require.main === module) {
  syncCodesToDisplayTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = syncCodesToDisplayTables;