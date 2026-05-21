const http = require('http');

const ports = [5001, 5002, 5003, 5004, 5005, 5006];

ports.forEach(port => {
  const req = http.request({
    host: 'localhost',
    port: port,
    path: '/',
    method: 'GET',
    timeout: 1000
  }, (res) => {
    console.log(`Port ${port}: UP (Status: ${res.statusCode})`);
  });

  req.on('error', (err) => {
    console.log(`Port ${port}: DOWN (${err.message})`);
  });

  req.on('timeout', () => {
    console.log(`Port ${port}: TIMEOUT`);
    req.destroy();
  });

  req.end();
});
