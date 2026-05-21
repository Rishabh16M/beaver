const mongoose = require('mongoose');

// Load models
require('./models/User');
require('./models/CompanyEmployee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/beaver_auth';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ [Auth-Service] Connected to MongoDB.');

    // Auto-seed pre-authorized company registry from existing registered users to avoid lockouts
    const CompanyEmployee = mongoose.model('CompanyEmployee');
    const User = mongoose.model('User');
    
    // Automatic Migration: Update legacy Boss accounts to Employee
    const migrationResult = await User.updateMany({ role: 'Boss' }, { $set: { role: 'Employee' } });
    if (migrationResult.modifiedCount > 0) {
      console.log(`🔄 [Auth-Service Migration] Successfully converted ${migrationResult.modifiedCount} legacy 'Boss' accounts to 'Employee'.`);
    }
    
    const count = await CompanyEmployee.countDocuments({});
    if (count === 0) {
      console.log('🔄 [Auth-Service] Pre-authorized registry is empty. Auto-seeding existing users...');
      const existingUsers = await User.find({});
      for (const u of existingUsers) {
        if (u.employeeId && u.email) {
          try {
            await CompanyEmployee.create({
              employeeId: u.employeeId.toUpperCase().trim(),
              email: u.email.toLowerCase().trim(),
              name: u.name || 'Existing User'
            });
            console.log(`✅ Seeded existing user: ${u.email} (${u.employeeId})`);
          } catch (e) {
            console.warn(`⚠️ Skip seeding duplicate/invalid for: ${u.email} - ${e.message}`);
          }
        }
      }
      
      // Seed requested test profile
      const testEmail = 'vasuvijaysharma68@gmail.com';
      const testId = 'EMP-VASU-68';
      const hasTest = await CompanyEmployee.findOne({ email: testEmail });
      if (!hasTest) {
        await CompanyEmployee.create({
          employeeId: testId,
          email: testEmail,
          name: 'Vasu Vijay Sharma'
        });
        console.log(`✅ Seeded corporate test employee: ${testEmail} (${testId})`);
      }
      console.log('✅ [Auth-Service] Pre-authorized employee database seeded successfully.');
    }
  } catch (error) {
    console.error('❌ [Auth-Service] MongoDB connection failed:', error.message);
    throw error;
  }
}

const UserModel = {
  findOne: (...args) => mongoose.model('User').findOne(...args),
  find: (...args) => mongoose.model('User').find(...args),
  findById: (...args) => mongoose.model('User').findById(...args),
  create: (...args) => mongoose.model('User').create(...args)
};

const CompanyEmployeeModel = {
  findOne: (...args) => mongoose.model('CompanyEmployee').findOne(...args),
  find: (...args) => mongoose.model('CompanyEmployee').find(...args),
  create: (...args) => mongoose.model('CompanyEmployee').create(...args),
  countDocuments: (...args) => mongoose.model('CompanyEmployee').countDocuments(...args)
};

module.exports = {
  connectDB,
  UserModel,
  CompanyEmployeeModel
};

