const jwt = require('jsonwebtoken');

const JWT_SECRET = '44f516f6453a1624fab573ca677645285549e7a94288f9bca9f575873cc54d43';

async function run() {
  // Sign token for Rishabh Maurya (Admin, role: Employee)
  const token = jwt.sign(
    {
      id: '6a0f4c2a8fb5953637f84af6',
      role: 'Employee',
      email: 'rishabhmaurya16@gmail.com',
      name: 'rishabh maurya',
      employeeId: 'emp098'
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('Signed token:', token);

  try {
    const res = await fetch('http://localhost:5002/api/workspaces/8TWDWX', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Workspace Details Response keys:', Object.keys(data));
    console.log('userPermissions:', data.userPermissions);
  } catch (err) {
    console.error('Error fetching details:', err.message);
  }
  process.exit(0);
}

run();
