require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  console.log('--- Connecting to beaver_workspace ---');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/beaver_workspace');
  console.log('Connected.');

  const UserSchema = new mongoose.Schema({
    name: String,
    email: String,
    role: String,
    employeeId: String
  });
  const User = mongoose.models.User || mongoose.model('User', UserSchema);

  const users = await User.find({});
  console.log('\n--- Users in MongoDB ---');
  let issues = 0;
  users.forEach(u => {
    console.log(`Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, ID: ${u.employeeId}`);
    if (!u.role) {
      console.log(`⚠️ User ${u.name} has null/empty role!`);
      issues++;
    }
  });

  if (issues === 0) {
    console.log('✅ No null/empty user roles found!');
  } else {
    console.log(`⚠️ Found ${issues} issues!`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

test();
