require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { connectDB, getAuditModel } = require('./db');

const app = express();
const PORT = process.env.PORT || 5004;
const JWT_SECRET = process.env.JWT_SECRET || 'beaver_jwt_secret_key_99';

app.use(cors());
app.use(express.json());

// Initialize Database
connectDB();

// Middleware: Verify JWT token
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ---------------- ENDPOINTS ----------------

// Save Audit Event (Internal microservice query, no JWT required to simplify server-to-server logs)
app.post('/api/audits', async (req, res) => {
  try {
    const { workspaceCode, actorName, actorEmail, actorEmployeeId, actorRole, actionType, details } = req.body;

    if (!actorName || !actorEmail || !actionType || !details) {
      return res.status(400).json({ message: 'Missing audit details' });
    }

    const AuditLog = getAuditModel();
    const newLog = await AuditLog.create({
      workspaceCode: workspaceCode ? workspaceCode.toUpperCase() : 'GLOBAL',
      actorName,
      actorEmail,
      actorEmployeeId: actorEmployeeId || null,
      actorRole: actorRole || 'Employee',
      actionType,
      details
    });

    res.status(201).json(newLog);
  } catch (error) {
    console.error('Save audit log error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Retrieve Audit Logs (authenticated workspace members)
app.get('/api/audits/:workspaceCode', requireAuth, async (req, res) => {
  try {
    const code = req.params.workspaceCode.toUpperCase();
    const AuditLog = getAuditModel();
    
    const logs = await AuditLog.findAll({
      where: { workspaceCode: code },
      order: [['createdAt', 'DESC']]
    });

    res.json(logs);
  } catch (error) {
    console.error('Fetch audits error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Export Audits to CSV (authenticated workspace members)
app.get('/api/audits/:workspaceCode/export', requireAuth, async (req, res) => {
  try {
    const code = req.params.workspaceCode.toUpperCase();
    const AuditLog = getAuditModel();

    const logs = await AuditLog.findAll({
      where: { workspaceCode: code },
      order: [['createdAt', 'ASC']]
    });

    // Compile into standard CSV format
    let csvContent = 'ID,Timestamp,Actor Name,Actor Email,Emp ID,Action Type,Details\n';
    
    logs.forEach(log => {
      // Escape commas & quotes in details to keep CSV aligned
      const escapedDetails = `"${log.details.replace(/"/g, '""')}"`;
      const escapedName = `"${log.actorName.replace(/"/g, '""')}"`;
      
      csvContent += `${log.id},${log.createdAt.toISOString()},${escapedName},${log.actorEmail},${log.actorEmployeeId || ''},${log.actionType},${escapedDetails}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Audit-Log-${code}.csv`);
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Export audits error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get recent audits by workspace code for internal microservice query (AI-service context)
app.get('/api/internal/audits/:workspaceCode', async (req, res) => {
  try {
    const code = req.params.workspaceCode.toUpperCase();
    const AuditLog = getAuditModel();
    
    const logs = await AuditLog.findAll({
      where: { workspaceCode: code },
      order: [['createdAt', 'DESC']],
      limit: 20
    });

    res.json(logs);
  } catch (error) {
    console.error('Fetch internal audits error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 [Audit-Service] running on http://localhost:${PORT}`);
});

