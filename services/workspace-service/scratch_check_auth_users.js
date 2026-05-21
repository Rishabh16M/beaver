const mongoose = require('mongoose');

const URI = 'mongodb://rishabhmaurya16_db_user:qGjjwcigFAcH0uQz@ac-o0wtgkm-shard-00-00.dnbcwok.mongodb.net:27017,ac-o0wtgkm-shard-00-01.dnbcwok.mongodb.net:27017,ac-o0wtgkm-shard-00-02.dnbcwok.mongodb.net:27017/beaver_auth?ssl=true&replicaSet=atlas-z9tc61-shard-0&authSource=admin';

async function test() {
  console.log('Connecting to beaver_auth...');
  await mongoose.connect(URI);
  console.log('Connected.');

  const UserSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', UserSchema, 'users');

  const users = await User.find({});
  console.log('\nUsers in beaver_auth:');
  users.forEach(u => {
    console.log(`ID: ${u._id}, Name: ${u.name}, Email: ${u.email}, Role: ${u.role}, EmpID: ${u.employeeId}`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

test();
