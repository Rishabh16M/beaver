const { Sequelize, DataTypes } = require('sequelize');

async function test() {
  console.log('--- Connecting to Railway MySQL ---');
  const sequelize = new Sequelize('railway', 'root', 'mjOmLrPbOZEjowQmeAAaFaUXmsPDmFhS', {
    host: 'kodama.proxy.rlwy.net',
    port: 36890,
    dialect: 'mysql',
    logging: false
  });

  try {
    await sequelize.authenticate();
    console.log('Connected to Railway MySQL.');
    
    const AuditLog = sequelize.define('AuditLog', {
      workspaceCode: DataTypes.STRING,
      actorName: DataTypes.STRING,
      actorEmail: DataTypes.STRING,
      actorRole: DataTypes.STRING,
      actionType: DataTypes.STRING,
      details: DataTypes.TEXT
    }, {
      tableName: 'audit_logs',
      timestamps: true
    });

    const logs = await AuditLog.findAll({});
    console.log('Total Logs:', logs.length);

    let issuesCount = 0;
    logs.forEach(log => {
      if (!log.actorRole) {
        console.log(`⚠️ Log ID ${log.id} has null/empty actorRole!`);
        issuesCount++;
      }
      if (!log.actionType) {
        console.log(`⚠️ Log ID ${log.id} has null/empty actionType!`);
        issuesCount++;
      }
    });

    if (issuesCount === 0) {
      console.log('✅ No null/empty actorRole or actionType fields found in database!');
    } else {
      console.log(`⚠️ Found ${issuesCount} issues!`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}

test();

