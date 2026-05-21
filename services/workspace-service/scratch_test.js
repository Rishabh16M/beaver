require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  console.log('--- Connecting to beaver_workspace ---');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/beaver_workspace');
  console.log('Connected.');

  const WorkspaceSchema = new mongoose.Schema({
    name: String,
    code: String,
    boss: String,
    admins: [String],
    members: [String],
    memberPermissions: [{
      userId: String,
      canRead: Boolean,
      canWrite: Boolean
    }]
  });
  const Workspace = mongoose.models.Workspace || mongoose.model('Workspace', WorkspaceSchema);

  const workspaces = await Workspace.find({});
  console.log('\n--- Workspaces in MongoDB ---');
  workspaces.forEach(w => {
    console.log(`Name: ${w.name}, Code: ${w.code}, Boss: ${w.boss}, Admins: ${JSON.stringify(w.admins)}, Members: ${JSON.stringify(w.members)}`);
  });

  await mongoose.disconnect();
  console.log('\nDisconnected.');
  process.exit(0);
}

test();
