require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5006;

app.use(cors());
app.use(express.json());

// Set up Logs folder
const LOGS_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const LOG_FILE_PATH = path.join(LOGS_DIR, 'sent-emails.log');

// Setup services URLs
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5001/api/auth';
const WORKSPACE_SERVICE_URL = process.env.WORKSPACE_SERVICE_URL || 'http://localhost:5002/api';

// Transporter state
let transporter;
let isEthereal = false;

// Initialize Mailer Transporter
async function initMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = process.env.SMTP_PORT || 587;

  let customSmtpVerified = false;

  if (host && user && pass && pass !== 'YOUR_GMAIL_APP_PASSWORD_HERE') {
    console.log(`✉️ [Notification-Service] Attempting custom SMTP connection (${host}:${port}) for <${user}>...`);
    try {
      const customTransporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: parseInt(port) === 465,
        auth: { user, pass },
        connectionTimeout: 5000,
        greetingTimeout: 5000
      });

      // Verify connection configuration
      await customTransporter.verify();
      transporter = customTransporter;
      isEthereal = false;
      customSmtpVerified = true;
      console.log('✅ [Notification-Service] Custom SMTP server verified successfully!');
    } catch (verifyError) {
      console.error('❌ [Notification-Service] Custom SMTP verification failed:', verifyError.message);
      console.warn('⚠️  [Notification-Service] Make sure you have enabled 2-Step Verification and generated a 16-character App Password if using Gmail/Workspace!');
    }
  }

  if (!customSmtpVerified) {
    try {
      console.log('✉️ [Notification-Service] Creating Ethereal SMTP Test Account fallback...');
      const testAccount = await nodemailer.createTestAccount();
      isEthereal = true;
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log('✅ [Notification-Service] Ethereal SMTP test account generated successfully.');
      console.log(`   🔑 User: ${testAccount.user}`);
      console.log(`   🔑 Pass: ${testAccount.pass}`);
    } catch (error) {
      console.error('❌ [Notification-Service] Failed to create Ethereal account, falling back to log-only transporter:', error.message);
      transporter = {
        sendMail: async (options) => {
          console.log('✉️ [TRANS-FALLBACK] Email output logged to file (Transporter Unavailable)');
          return { messageId: 'fallback-' + Date.now() };
        }
      };
    }
  }
}


// Helper to log emails locally
function logEmailLocally(to, subject, htmlContent, previewUrl = '') {
  const timestamp = new Date().toISOString();
  const divider = '='.repeat(80);
  const logEntry = `${divider}\n[TIMESTAMP]: ${timestamp}\n[TO]: ${to}\n[SUBJECT]: ${subject}\n[PREVIEW URL]: ${previewUrl || 'N/A'}\n[HTML CONTENT]:\n${htmlContent}\n${divider}\n\n`;
  
  fs.appendFileSync(LOG_FILE_PATH, logEntry);
  console.log(`📝 [Notification-Service] Email to <${to}> logged in services/notification-service/logs/sent-emails.log`);
}

// ---------------- PREMIUM GLASSMORPHIC HTML EMAIL TEMPLATES ----------------

function compileTaskAssignmentTemplate(taskTitle, taskDesc, priority, dueDate, assigneeName, assignedByName) {
  const pColor = priority === 'high' ? '#ef4444' : priority === 'medium' ? '#f59e0b' : '#3b82f6';
  const pBadge = priority.toUpperCase();
  const formattedDate = dueDate ? new Date(dueDate).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'No due date set';
  const descriptionHtml = taskDesc ? `<div style="background: rgba(255, 255, 255, 0.05); border-left: 3px solid #6366f1; padding: 12px 16px; margin: 15px 0; border-radius: 4px; color: #cbd5e1; font-style: italic;">${taskDesc}</div>` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Task Assigned</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 0; }
    .wrapper { width: 100%; max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; text-align: center; }
    .logo { font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #ffffff; }
    .subtitle { font-size: 14px; color: #e0e7ff; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
    .body { padding: 30px; line-height: 1.6; color: #e2e8f0; }
    .salutation { font-size: 20px; font-weight: 600; color: #ffffff; margin-bottom: 10px; }
    .intro { font-size: 16px; margin-bottom: 20px; }
    .task-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 24px; margin-bottom: 25px; backdrop-filter: blur(10px); }
    .task-title { font-size: 18px; font-weight: bold; color: #ffffff; margin: 0 0 10px 0; }
    .meta-item { font-size: 14px; margin: 8px 0; color: #94a3b8; }
    .meta-value { color: #f8fafc; font-weight: 500; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: bold; border-radius: 12px; color: #ffffff; }
    .footer { text-align: center; padding: 25px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; color: #64748b; background: rgba(0,0,0,0.2); }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">BEAVER</div>
      <div class="subtitle">Workspace Notifications</div>
    </div>
    <div class="body">
      <div class="salutation">Hey ${assigneeName}! 👋</div>
      <div class="intro">You have been assigned a new task by **${assignedByName}** in your collaborative office workspace.</div>
      
      <div class="task-card">
        <div class="task-title">📋 ${taskTitle}</div>
        ${descriptionHtml}
        <div class="meta-item">🔥 Priority: <span class="badge" style="background-color: ${pColor};">${pBadge}</span></div>
        <div class="meta-item">⏰ Due Date: <span class="meta-value">${formattedDate}</span></div>
      </div>
      
      <p style="margin-top: 25px;">Please log in to the Beaver client workspace to review this card on the Kanban swimlanes and begin drafting your workflow.</p>
    </div>
    <div class="footer">
      This is an automated notification. Real-time updates by Beaver microservices team.<br>
      © 2026 Beaver Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}

function compilePendingTasksTemplate(assigneeName, tasks) {
  const taskRows = tasks.map(task => {
    const pColor = task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#3b82f6';
    const formattedDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString(undefined, { dateStyle: 'short' }) : 'None';
    return `
      <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
        <td style="padding: 12px 8px; color: #ffffff; font-weight: 500;">📋 ${task.title}</td>
        <td style="padding: 12px 8px; text-align: center;"><span style="background: rgba(255,255,255,0.06); padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #cbd5e1; text-transform: uppercase;">${task.status}</span></td>
        <td style="padding: 12px 8px; text-align: center;"><span style="color: ${pColor}; font-weight: bold; text-transform: uppercase; font-size: 12px;">${task.priority}</span></td>
        <td style="padding: 12px 8px; text-align: center; color: #94a3b8; font-size: 13px;">${formattedDate}</td>
      </tr>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pending Tasks Digest</title>
  <style>
    body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; margin: 0; padding: 0; }
    .wrapper { width: 100%; max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%); padding: 30px; text-align: center; }
    .logo { font-size: 28px; font-weight: bold; letter-spacing: 2px; color: #ffffff; }
    .subtitle { font-size: 14px; color: #e0e7ff; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
    .body { padding: 30px; line-height: 1.6; color: #e2e8f0; }
    .salutation { font-size: 20px; font-weight: 600; color: #ffffff; margin-bottom: 10px; }
    .intro { font-size: 16px; margin-bottom: 20px; }
    .digest-table { width: 100%; border-collapse: collapse; margin: 25px 0; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden; }
    .digest-th { background: rgba(255,255,255,0.05); padding: 12px 8px; text-align: left; font-size: 13px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
    .footer { text-align: center; padding: 25px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; color: #64748b; background: rgba(0,0,0,0.2); }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">BEAVER</div>
      <div class="subtitle">Daily Work Digest</div>
    </div>
    <div class="body">
      <div class="salutation">Hey ${assigneeName}! 👋</div>
      <div class="intro">Here is your summary report of pending and active items requiring your attention inside the project rooms.</div>
      
      <table class="digest-table">
        <thead>
          <tr>
            <th class="digest-th" style="width: 45%;">Task Title</th>
            <th class="digest-th" style="text-align: center; width: 20%;">Status</th>
            <th class="digest-th" style="text-align: center; width: 15%;">Priority</th>
            <th class="digest-th" style="text-align: center; width: 20%;">Due Date</th>
          </tr>
        </thead>
        <tbody>
          ${taskRows}
        </tbody>
      </table>
      
      <p style="margin-top: 25px;">Allocating your efforts to complete these open items helps clear development bottlenecks across your microservices squad!</p>
    </div>
    <div class="footer">
      This is an automated notification. Real-time updates by Beaver microservices team.<br>
      © 2026 Beaver Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
  `;
}

// ---------------- MICROSERVICE ENDPOINTS ----------------

// 1. Task Assignment Alert Endpoint
app.post('/api/notifications/assign', async (req, res) => {
  try {
    const { taskId, title, description, priority, dueDate, assigneeId, assigneeName, assignedByName } = req.body;

    if (!assigneeId || !title) {
      return res.status(400).json({ message: 'Missing task assignee details' });
    }

    // Fetch user email from Auth Service
    let email = '';
    try {
      const authRes = await fetch(`${AUTH_SERVICE_URL}/users/${assigneeId}`);
      if (authRes.ok) {
        const userObj = await authRes.json();
        email = userObj.email;
      }
    } catch (err) {
      console.warn(`⚠️ [Notification-Service] Could not resolve email from Auth Service at ${AUTH_SERVICE_URL}:`, err.message);
    }

    // Fallback email if auth service is down or unresolved
    if (!email) {
      email = `${assigneeName.toLowerCase().replace(/\s+/g, '')}@beaver-workplace.local`;
      console.log(`⚠️ [Notification-Service] Fallback to email: <${email}>`);
    }

    // Compile template
    const htmlContent = compileTaskAssignmentTemplate(title, description, priority, dueDate, assigneeName, assignedByName);
    
    // Mail options
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Beaver Notifications" <no-reply@beaver-workspace.com>',
      to: email,
      subject: `📋 Task Assigned: "${title}" by ${assignedByName}`,
      html: htmlContent
    };

    // Send Mail
    const info = await transporter.sendMail(mailOptions);
    let previewUrl = '';
    
    if (isEthereal) {
      previewUrl = nodemailer.getTestMessageUrl(info);
      console.log(`✉️ [Ethereal Mail] Email dispatched successfully!`);
      console.log(`🔗 [PREVIEW URL]: ${previewUrl}`);
    } else {
      console.log(`✉️ [Mail Dispatched] MessageID: ${info.messageId}`);
    }

    logEmailLocally(email, mailOptions.subject, htmlContent, previewUrl);

    res.status(200).json({
      message: 'Notification sent successfully',
      email,
      previewUrl
    });
  } catch (error) {
    console.error('Task assignment notification error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// 2. Manual Reminder Digest Trigger Endpoint
app.post('/api/notifications/remind-now', async (req, res) => {
  try {
    console.log('⏰ [Notification-Service] Running manual pending tasks sync...');
    
    // 1. Fetch all pending tasks from Workspace Service
    let pendingTasks = [];
    try {
      const workspaceRes = await fetch(`${WORKSPACE_SERVICE_URL}/internal/tasks/pending`);
      if (workspaceRes.ok) {
        pendingTasks = await workspaceRes.json();
      } else {
        console.warn('⚠️ [Notification-Service] Failed to load pending tasks from Workspace Service.');
      }
    } catch (e) {
      console.error('❌ [Notification-Service] Could not connect to Workspace Service:', e.message);
      return res.status(500).json({ message: 'Could not fetch tasks from Workspace Service' });
    }

    if (pendingTasks.length === 0) {
      console.log('✅ [Notification-Service] No pending tasks found in system.');
      return res.json({ message: 'No pending tasks found. No emails sent.', sentTo: [] });
    }

    // 2. Fetch all users from Auth Service
    let users = [];
    try {
      const authRes = await fetch(`${AUTH_SERVICE_URL}/users`);
      if (authRes.ok) {
        users = await authRes.json();
      }
    } catch (e) {
      console.error('❌ [Notification-Service] Could not retrieve users list from Auth Service:', e.message);
      return res.status(500).json({ message: 'Could not fetch user registry from Auth Service' });
    }

    // 3. Group tasks by assignee ID
    const userTasksMap = {};
    pendingTasks.forEach(task => {
      if (task.assignee) {
        if (!userTasksMap[task.assignee]) {
          userTasksMap[task.assignee] = [];
        }
        userTasksMap[task.assignee].push(task);
      }
    });

    const sentTo = [];

    // 4. Dispatch email digests
    for (const assigneeId of Object.keys(userTasksMap)) {
      const tasksForUser = userTasksMap[assigneeId];
      const userObj = users.find(u => u._id === assigneeId);
      
      const assigneeName = userObj ? userObj.name : tasksForUser[0].assigneeName || 'Team Member';
      const email = userObj ? userObj.email : `${assigneeName.toLowerCase().replace(/\s+/g, '')}@beaver-workplace.local`;

      // Compile Digest Template
      const htmlContent = compilePendingTasksTemplate(assigneeName, tasksForUser);
      
      // Mail options
      const mailOptions = {
        from: process.env.SMTP_FROM || '"Beaver Notifications" <no-reply@beaver-workspace.com>',
        to: email,
        subject: `⏰ Reminder: You have ${tasksForUser.length} pending tasks outstanding`,
        html: htmlContent
      };

      // Send Mail
      const info = await transporter.sendMail(mailOptions);
      let previewUrl = '';
      
      if (isEthereal) {
        previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`✉️ [Ethereal Digest] Email dispatched to <${email}>!`);
        console.log(`🔗 [PREVIEW URL]: ${previewUrl}`);
      } else {
        console.log(`✉️ [Digest Dispatched] Dispatched to <${email}>`);
      }

      logEmailLocally(email, mailOptions.subject, htmlContent, previewUrl);

      sentTo.push({
        name: assigneeName,
        email,
        pendingTasksCount: tasksForUser.length,
        previewUrl
      });
    }

    res.json({
      message: `Successfully dispatched pending task digests to ${sentTo.length} users.`,
      sentTo
    });
  } catch (error) {
    console.error('Pending tasks digest error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ---------------- PERIODIC SCHEDULER (node-cron) ----------------

// Run once every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  try {
    console.log('⏰ [Cron-Scheduler] Triggering automated daily pending tasks digest email routine...');
    const expressHost = `http://localhost:${PORT}`;
    
    // Call the remind-now endpoint internally to run the digest dispatch logic
    await fetch(`${expressHost}/api/notifications/remind-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('⏰ [Cron-Scheduler] Automated daily digest routine completed.');
  } catch (err) {
    console.error('❌ [Cron-Scheduler] Error running daily digest cron job:', err.message);
  }
});

// Start service
async function startServer() {
  await initMailer();
  app.listen(PORT, () => {
    console.log(`🚀 [Notification-Service] running on http://localhost:${PORT}`);
    console.log(`⏰ [Notification-Service] Task reminder cron scheduled daily at 9:00 AM.`);
  });
}

startServer();
