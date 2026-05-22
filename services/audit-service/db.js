const { Sequelize, DataTypes } = require('sequelize');

let sequelize;

const MYSQL_URL = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;

const MYSQL_HOST = process.env.MYSQL_HOST || process.env.MYSQLHOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306;
const MYSQL_USER = process.env.MYSQL_USER || process.env.MYSQLUSER || 'root';
const MYSQL_PASS = process.env.MYSQL_PASS || process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || '';
const MYSQL_DB = process.env.MYSQL_DB || process.env.MYSQLDATABASE || process.env.MYSQL_DB_NAME || 'beaver_audits';

async function initDB() {
  try {
    // If specifically requested to use SQLite (or no connection details and not in production)
    if (MYSQL_HOST === 'sqlite' || (!MYSQL_URL && !process.env.MYSQL_HOST && !process.env.MYSQLHOST && process.env.NODE_ENV !== 'production')) {
      console.log('📦 [Audit-Service] Using SQLite database for local development/fallback.');
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './beaver_audits.sqlite',
        logging: false
      });
      await sequelize.authenticate();
      return;
    }

    if (MYSQL_URL) {
      console.log('🔗 [Audit-Service] Connecting to MySQL using connection URL...');
      sequelize = new Sequelize(MYSQL_URL, {
        dialect: 'mysql',
        logging: false,
        dialectOptions: {
          connectTimeout: 10000
        }
      });
    } else {
      console.log(`🔗 [Audit-Service] Connecting to MySQL at ${MYSQL_HOST}:${MYSQL_PORT}...`);
      sequelize = new Sequelize(MYSQL_DB, MYSQL_USER, MYSQL_PASS, {
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        dialect: 'mysql',
        logging: false,
        dialectOptions: {
          connectTimeout: 10000
        }
      });
    }

    await sequelize.authenticate();
    console.log('✅ [Audit-Service] Connected to MySQL database.');
  } catch (error) {
    console.error('❌ [Audit-Service] MySQL connection failed:', error.message);
    
    // Automatically fall back to SQLite in non-production environments to avoid startup crashes
    if (process.env.NODE_ENV !== 'production') {
      console.log('⚠️ [Audit-Service] Falling back to local SQLite database...');
      sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './beaver_audits.sqlite',
        logging: false
      });
      await sequelize.authenticate();
      console.log('✅ [Audit-Service] Connected to fallback SQLite database.');
    } else {
      throw error;
    }
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
