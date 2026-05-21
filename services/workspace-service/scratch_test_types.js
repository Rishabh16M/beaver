const mongoose = require('mongoose');

const URI = 'mongodb://rishabhmaurya16_db_user:qGjjwcigFAcH0uQz@ac-o0wtgkm-shard-00-00.dnbcwok.mongodb.net:27017,ac-o0wtgkm-shard-00-01.dnbcwok.mongodb.net:27017,ac-o0wtgkm-shard-00-02.dnbcwok.mongodb.net:27017/beaver_workspace?ssl=true&replicaSet=atlas-z9tc61-shard-0&authSource=admin';

async function test() {
  console.log('Connecting to beaver_workspace...');
  await mongoose.connect(URI);
  console.log('Connected.');

  const WorkspaceSchema = new mongoose.Schema({
    name: String,
    code: String,
    boss: String,
    admins: [mongoose.Schema.Types.Mixed],
    members: [mongoose.Schema.Types.Mixed]
  });
  const Workspace = mongoose.models.Workspace || mongoose.model('Workspace', WorkspaceSchema);

  const w = await Workspace.findOne({ code: '8TWDWX' });
  if (w) {
    console.log('Workspace:', w.name);
    console.log('Boss:', w.boss, 'type:', typeof w.boss);
    console.log('Admins array:', w.admins);
    w.admins.forEach((admin, i) => {
      console.log(`Admin ${i}: ${admin}, type: ${typeof admin}, isObjectId: ${admin instanceof mongoose.Types.ObjectId}`);
    });
    console.log('Members array:', w.members);
    w.members.forEach((member, i) => {
      console.log(`Member ${i}: ${member}, type: ${typeof member}, isObjectId: ${member instanceof mongoose.Types.ObjectId}`);
    });
  }

  await mongoose.disconnect();
  process.exit(0);
}

test();
