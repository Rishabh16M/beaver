const { Sequelize, DataTypes } = require('sequelize');

let sequelize;

const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASS = process.env.MYSQL_PASS || '';
const MYSQL_DB = process.env.MYSQL_DB || 'beaver_audits';

async function initDB() {
  try {
    sequelize = new Sequelize(MYSQL_DB, MYSQL_USER, MYSQL_PASS, {
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      dialect: 'mysql',
      logging: false
    });

    await sequelize.authenticate();
    console.log('✅ [Audit-Service] Connected to MySQL database.');
  } catch (error) {
    console.error('❌ [Audit-Service] MySQL connection failed:', error.message);
    throw error;
  }
}

// Define the AuditLog model
const AuditLog = {
  defineModel() {
    return sequelize.define('AuditLog', {
      workspaceCode: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'GLOBAL'
      },
      actorName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      actorEmail: {
        type: DataTypes.STRING,
        allowNull: false
      },
      actorRole: {
        type: DataTypes.STRING,
        allowNull: false
      },
      actorEmployeeId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      actionType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: false
      }
    }, {
      tableName: 'audit_logs',
      timestamps: true
    });
  }
};

let AuditModelInstance;

async function connectDB() {
  await initDB();
  AuditModelInstance = AuditLog.defineModel();
  await sequelize.sync({ alter: true });
  console.log('⚙️ [Audit-Service] Database tables synchronized (alter mode).');
}

module.exports = {
  connectDB,
  getAuditModel: () => AuditModelInstance
};
