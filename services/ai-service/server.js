require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5005;
const WORKSPACE_SERVICE_URL = process.env.WORKSPACE_SERVICE_URL || 'http://localhost:5002';
const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:5004';

const ALLOWED_ORIGINS = [
  'https://beaver-nekh.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true
}));
app.use(express.json());

// ---------------- DYNAMIC MOCK ENGINE FOR COMPACT & STUNNING RESPONSES ----------------

function generateSmartChatReply(msg, userName, userRole, workspaceCode, workspaceData = null, auditLogs = null) {
  const query = msg.toLowerCase();

  const tasks = workspaceData ? workspaceData.tasks || [] : [];
  const files = workspaceData ? workspaceData.files || [] : [];
  const audits = auditLogs || [];

  // 1. Specific search: Tasks assigned to a specific person
  if (query.includes('tasks assigned to') || query.includes('task assigned to') || (query.includes('assigned to') && (query.includes('what') || query.includes('who')))) {
    let searchedName = '';
    const match = msg.match(/(?:assigned\s+to\s+)([a-zA-Z\s]+)/i);
    if (match && match[1]) {
      searchedName = match[1].trim().toLowerCase();
    } else {
      if (query.includes('me') || query.includes('my tasks')) {
        searchedName = userName.toLowerCase();
      }
    }

    if (searchedName) {
      const assignedTasks = tasks.filter(t => t.assigneeName && t.assigneeName.toLowerCase().includes(searchedName));
      if (assignedTasks.length > 0) {
        let reply = `### 📋 Tasks Assigned to **${searchedName.toUpperCase()}** in Workspace **${workspaceCode}**\n\n`;
        assignedTasks.forEach((t, index) => {
          const priorityEmoji = t.priority === 'high' ? '🔥' : t.priority === 'medium' ? '⚡' : '🟢';
          const statusBadge = `\`[${t.status.toUpperCase().replace('_', ' ')}]\``;
          reply += `${index + 1}. ${priorityEmoji} **${t.title}** - ${statusBadge} (Priority: ${t.priority.toUpperCase()}, Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'N/A'})\n`;
          if (t.description) reply += `   *Description: ${t.description}*\n`;
        });
        return reply;
      } else {
        return `I searched the Kanban board for tasks assigned to **${searchedName.toUpperCase()}**, but I found **no matching active tasks**. Make sure the name is typed correctly or check the board!`;
      }
    }
  }

  // 2. Specific search: High priority / urgent tasks
  if (query.includes('high priority') || query.includes('priority tasks') || query.includes('urgent')) {
    const highTasks = tasks.filter(t => t.priority === 'high');
    if (highTasks.length > 0) {
      let reply = `### 🔥 High Priority Tasks in Workspace **${workspaceCode}**\n\n`;
      highTasks.forEach((t, index) => {
        const statusBadge = `\`[${t.status.toUpperCase().replace('_', ' ')}]\``;
        reply += `${index + 1}. **${t.title}** - ${statusBadge} (Assigned to: ${t.assigneeName || 'Unassigned'}, Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'N/A'})\n`;
      });
      return reply;
    } else {
      return `Great news! I checked the Kanban board and found **zero high-priority tasks** in workspace **${workspaceCode}**. All active items are normal flow!`;
    }
  }

  // 3. Specific search: Tasks in specific swimlanes
  if (query.includes('todo') || query.includes('to do') || query.includes('in progress') || query.includes('review') || query.includes('done') || query.includes('completed')) {
    let targetStatus = '';
    if (query.includes('todo') || query.includes('to do')) targetStatus = 'todo';
    else if (query.includes('in progress')) targetStatus = 'in_progress';
    else if (query.includes('review')) targetStatus = 'review';
    else if (query.includes('done') || query.includes('completed')) targetStatus = 'done';

    if (targetStatus) {
      const statusTasks = tasks.filter(t => t.status === targetStatus);
      if (statusTasks.length > 0) {
        let reply = `### 📋 Tasks in \`[${targetStatus.toUpperCase().replace('_', ' ')}]\` Swimlane\n\n`;
        statusTasks.forEach((t, index) => {
          const priorityEmoji = t.priority === 'high' ? '🔥' : t.priority === 'medium' ? '⚡' : '🟢';
          reply += `${index + 1}. ${priorityEmoji} **${t.title}** (Priority: ${t.priority.toUpperCase()}, Assigned: ${t.assigneeName || 'Unassigned'})\n`;
        });
        return reply;
      } else {
        return `I checked the Kanban board and there are currently **no tasks** in the \`[${targetStatus.toUpperCase().replace('_', ' ')}]\` swimlane.`;
      }
    }
  }

  // 4. Specific search: Audit Logs / Who moved / Who updated / Who created
  if (query.includes('audit') || query.includes('log') || query.includes('activity') || query.includes('who moved') || query.includes('who updated') || query.includes('who created')) {
    if (audits.length > 0) {
      let reply = `### 🔒 Recent Compliance & Activity Audit Logs (Last 5)\n\n`;
      const recentAudits = audits.slice(0, 5);
      recentAudits.forEach((log, index) => {
        reply += `${index + 1}. 🛡️ **${log.actorName}** (${log.actorRole}) - \`${log.actionType}\`\n   *Details: ${log.details} (${new Date(log.createdAt).toLocaleTimeString()})*\n`;
      });
      return reply;
    }
  }

  // 5. Specific search: Shared files
  if (query.includes('file') || query.includes('vault') || query.includes('cabinet') || query.includes('upload') || query.includes('pdf') || query.includes('image')) {
    if (files.length > 0) {
      let reply = `### 📁 Uploaded Files Cabinet for Workspace **${workspaceCode}**\n\n`;
      files.forEach((f, index) => {
        reply += `${index + 1}. 📄 **${f.name}** (Type: ${f.type.split('/')[1] || f.type}, Size: ${(f.size / 1024).toFixed(1)} KB) uploaded by **${f.uploadedByName || 'Unknown'}**\n`;
      });
      return reply;
    } else {
      return `I checked the shared vault, and there are **no files** currently uploaded in workspace **${workspaceCode}**.`;
    }
  }

  // General Kanban and tasks
  if (query.includes('task') || query.includes('kanban') || query.includes('board') || query.includes('all tasks')) {
    if (tasks.length > 0) {
      let reply = `### 📋 Active Kanban Board Tasks for Room **${workspaceCode}**\n\n`;
      const todoList = tasks.filter(t => t.status === 'todo');
      const progressList = tasks.filter(t => t.status === 'in_progress');
      const reviewList = tasks.filter(t => t.status === 'review');
      const doneList = tasks.filter(t => t.status === 'done');

      reply += `📌 **To Do** (${todoList.length}):\n`;
      todoList.forEach(t => reply += `  - **${t.title}** (Assignee: ${t.assigneeName || 'Unassigned'}, Priority: ${t.priority})\n`);
      
      reply += `\n🔄 **In Progress** (${progressList.length}):\n`;
      progressList.forEach(t => reply += `  - **${t.title}** (Assignee: ${t.assigneeName || 'Unassigned'}, Priority: ${t.priority})\n`);
      
      reply += `\n👀 **In Review** (${reviewList.length}):\n`;
      reviewList.forEach(t => reply += `  - **${t.title}** (Assignee: ${t.assigneeName || 'Unassigned'}, Priority: ${t.priority})\n`);
      
      reply += `\n✅ **Done** (${doneList.length}):\n`;
      doneList.forEach(t => reply += `  - **${t.title}** (Assignee: ${t.assigneeName || 'Unassigned'}, Priority: ${t.priority})\n`);
      
      return reply;
    }
    return `### 📋 Kanban Board & Work Management Guide

In **Project Room ${workspaceCode}**, there are no tasks yet. You can create a new task card on the Kanban board to get started!
* 🔑 **Creators & Admins**: Have complete clearance. They can create, delete, and assign any task to anyone.
* 👥 **Employees**: Can update tasks, move swimlanes, and delete their own files/tasks.`;
  }

  // Greeting
  if (query.includes('hello') || query.includes('hi') || query.includes('hey') || query.includes('greetings')) {
    return `Hello **${userName}** (${userRole})! 👋 I am your Beaver AI workspace consultant. 

How can I help you manage **Project Room ${workspaceCode}** today? Here's the live data I see right now:
- 📋 **Tasks**: ${tasks.length} active cards on Kanban board
- 📁 **Files**: ${files.length} shared assets in cabinet
- 🔒 **Audits**: ${audits.length} recorded compliance trace events`;
  }

  // Code or Tech Stack
  if (query.includes('code') || query.includes('stack') || query.includes('architecture') || query.includes('aws')) {
    return `### ⚙️ Platform Technical Architecture

This workspace is built with high scalability in mind:
\`\`\`javascript
// Tech Stack Overview
const TechStack = {
  frontend: "React (Vite) + Glassmorphic Pure CSS",
  backends: "6 Microservices (Auth, Workspaces, Chats, Audits, AI, Notification)",
  databases: {
    stateData: "MongoDB (Mongoose Schemas)",
    auditTrails: "MySQL (Sequelize compliance tables)"
  },
  realTime: "Socket.io persistent handshakes"
};
\`\`\`
**AWS Deployment Recommendation**:
* Deploy microservices on **AWS ECS (Fargate)** with **Application Load Balancers (ALB)**.
* Utilize **Amazon DocumentDB** (MongoDB compatible) and **Amazon RDS (MySQL)**.
* Uploaded files can easily shift from Base64 to **Amazon S3** buckets.`;
  }

  // Fallback with live details
  return `I've analyzed your question, **${userName}**. Here is the live status of **Project Room ${workspaceCode}**:

- **Kanban Board**: ${tasks.length} tasks registered.
- **File Cabinet**: ${files.length} assets uploaded.
- **Activity**: ${audits.length > 0 ? `The last activity was by **${audits[0].actorName}** doing \`${audits[0].actionType}\` at ${new Date(audits[0].createdAt).toLocaleTimeString()}.` : 'No compliance actions logged yet.'}

Feel free to ask specific questions about tasks (e.g. "What tasks are assigned to John?"), files (e.g. "What files are uploaded?"), or audit actions (e.g. "Who moved the tasks?").`;
}

// ---------------- ROUTE handlers ----------------

// 1. Live Chat Room Assistant
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, workspaceCode, user } = req.body;
    const userName = user ? user.name : 'Team Member';
    const userRole = user ? user.role : 'Employee';
    const code = workspaceCode || 'GLOBAL';

    // Fetch live workspace details (tasks, files) and compliance audits internally
    let workspaceData = null;
    let auditLogs = null;

    try {
      const workspaceRes = await fetch(`${WORKSPACE_SERVICE_URL}/api/internal/workspaces/${code}`);
      if (workspaceRes.ok) {
        workspaceData = await workspaceRes.json();
      } else {
        console.warn(`⚠️ Failed to fetch workspace details internally for code ${code}: ${workspaceRes.status}`);
      }
    } catch (err) {
      console.warn(`⚠️ Error fetching workspace details from internal API:`, err.message);
    }

    try {
      const auditRes = await fetch(`${AUDIT_SERVICE_URL}/api/internal/audits/${code}`);
      if (auditRes.ok) {
        auditLogs = await auditRes.json();
      } else {
        console.warn(`⚠️ Failed to fetch audit logs internally for code ${code}: ${auditRes.status}`);
      }
    } catch (err) {
      console.warn(`⚠️ Error fetching audit logs from internal API:`, err.message);
    }

    // Assemble dynamic context string for Gemini prompt
    let contextStr = '';
    if (workspaceData && workspaceData.workspace) {
      const ws = workspaceData.workspace;
      contextStr += `Active Workspace Information:
- Name: ${ws.name}
- Code: ${ws.code}
- Description: ${ws.description || 'No description provided.'}
- Boss ID: ${ws.boss}
- Employee Task Assignment Allowed: ${ws.employeeAssignPermissions ? 'Yes' : 'No'}

`;
    }

    if (workspaceData && workspaceData.tasks && workspaceData.tasks.length > 0) {
      contextStr += `Kanban Board Tasks:
`;
      workspaceData.tasks.forEach((t, i) => {
        contextStr += `${i + 1}. Task Title: "${t.title}", Status: "${t.status}", Priority: "${t.priority}", Assignee: "${t.assigneeName || 'Unassigned'}", Due Date: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No due date'}, Description: "${t.description || 'No description.'}"\n`;
      });
      contextStr += `\n`;
    } else {
      contextStr += `Kanban Board Tasks:
- There are no tasks currently on the Kanban board.

`;
    }

    if (workspaceData && workspaceData.files && workspaceData.files.length > 0) {
      contextStr += `Shared Workspace Files:
`;
      workspaceData.files.forEach((f, i) => {
        contextStr += `${i + 1}. Name: "${f.name}", Type: "${f.type}", Size: ${(f.size / 1024).toFixed(1)} KB, Uploaded By: "${f.uploadedByName || 'Unknown'}"\n`;
      });
      contextStr += `\n`;
    } else {
      contextStr += `Shared Workspace Files:
- There are no files uploaded in the shared cabinet.

`;
    }

    if (auditLogs && auditLogs.length > 0) {
      contextStr += `Recent Workspace Activity Logs (Audits):
`;
      auditLogs.forEach((log, i) => {
        contextStr += `${i + 1}. [${new Date(log.createdAt).toLocaleString()}] ${log.actorName} (${log.actorRole}): ${log.actionType} - ${log.details}\n`;
      });
      contextStr += `\n`;
    } else {
      contextStr += `Recent Workspace Activity Logs (Audits):
- No recent audit activity logs available.

`;
    }

    // Probe if Gemini API key exists, otherwise run the high-fidelity mock engine
    if (process.env.GEMINI_API_KEY) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const promptText = `You are an AI Workspace Companion integrated inside a professional, real-time MERN microservices project management application named "Beaver".
You have access to real-time workspace data, tasks, files, and recent audit logs. Use this context to answer the user's questions accurately.

<WORKSPACE_CONTEXT>
${contextStr}
</WORKSPACE_CONTEXT>

User Name: ${userName}
User Role: ${userRole}
Current Workspace Code: ${code}
User Message: "${message}"

Please provide a helpful, styled, concise response using markdown formatting, bullet points, or code blocks where relevant. Keep it aligned with collaborative project operations and answer the question accurately based on the provided live <WORKSPACE_CONTEXT> data.`;

        const geminiRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: promptText
              }]
            }]
          })
        });

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          console.warn(`⚠️ Gemini API returned non-OK status (${geminiRes.status}):`, errText);
        } else {
          const data = await geminiRes.json();
          if (data.error) {
            console.warn('⚠️ Gemini API error in response:', data.error.message);
          } else if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
            return res.json({ reply: data.candidates[0].content.parts[0].text });
          }
        }
      } catch (err) {
        console.warn('⚠️ Gemini API request failed. Reverting to smart local NLP engine.', err.message);
      }
    }

    const reply = generateSmartChatReply(message, userName, userRole, code, workspaceData, auditLogs);
    res.json({ reply });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// 2. Analytical Project Insights Report Compiler
app.post('/api/ai/report', (req, res) => {
  try {
    const { tasks, files, membersCount, workspaceName, workspaceCode } = req.body;

    const totalTasks = tasks.length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const review = tasks.filter(t => t.status === 'review').length;
    const done = tasks.filter(t => t.status === 'done').length;

    const highPriority = tasks.filter(t => t.priority === 'high').length;
    const unassigned = tasks.filter(t => !t.assignee).length;
    const filesCount = files ? files.length : 0;

    // Calculate velocity score
    let velocityScore = 'C';
    let completionPercentage = 0;
    if (totalTasks > 0) {
      completionPercentage = Math.round((done / totalTasks) * 100);
      if (completionPercentage >= 85) velocityScore = 'A';
      else if (completionPercentage >= 65) velocityScore = 'B';
      else if (completionPercentage >= 40) velocityScore = 'C';
      else velocityScore = 'D';
    } else {
      velocityScore = 'N/A';
    }

    // Determine Bottlenecks & Warnings
    const warnings = [];
    if (unassigned > 0) {
      warnings.push(`⚠️ **Resource Gap**: There are ${unassigned} tasks left unallocated without any team assignee.`);
    }
    if (review > 1) {
      warnings.push(`🔄 **Bottleneck Hazard**: ${review} tasks are sitting in "Review" status. Prompt the Admins to review and approve these cards to clear the pipeline.`);
    }
    if (highPriority > 0 && tasks.some(t => t.priority === 'high' && t.status !== 'done')) {
      warnings.push(`🔥 **High Priority Alerts**: There are outstanding High Priority tasks requiring direct oversight.`);
    }

    // Compose Markdown Report
    let reportMarkdown = `
# 📊 Workspace AI Analytics & Insights
**Project Room**: ${workspaceName} (${workspaceCode})
**Analysis Timestamp**: ${new Date().toLocaleString()}

---

### 📈 Project Metrics & Velocity

* 🏆 **Overall Completion Rate**: \`${completionPercentage}%\`
* 🛡️ **Velocity Grade**: \`${velocityScore}\`
* 👥 **Active Core Team Size**: \`${membersCount || 1} members\`
* 📁 **Shared File Inventory**: \`${filesCount} assets uploaded\`

#### Swimlane Distributions:
* **To Do**: \`${todo}\`
* **In Progress**: \`${inProgress}\`
* **In Review**: \`${review}\`
* **Completed**: \`${done}\`

---

### 🔍 Bottlenecks & Structural Warnings

${warnings.length > 0 ? warnings.map(w => `* ${w}`).join('\n') : '✅ **Excellent Pipeline flow!** Zero task stagnation or resource gaps detected.'}

---

### 💡 Dynamic AI Strategic Recommendations

1. ${unassigned > 0 ? `**Allocate Resources**: Instantly assign the **${unassigned}** unallocated tasks to active employees to divide the workload.` : '**Workload Healthy**: Team task allocations are in balance.'}
2. ${review > 0 ? `**Unblock Review Swimlane**: Have the Admins perform audit/checks on the **${review}** cards waiting in "Review" to transition them to "Done".` : '**Approve Active Items**: Keep monitoring task handoffs.'}
3. **Storage Asset Check**: We noticed **${filesCount}** files inside the shared workspace cabinet. Make sure document links and assets match the current task checklist items.
4. **AWS Infrastructure Scaling recommendation**: If this project expands to support over 100 concurrent employees, we suggest setting up an **AWS CloudWatch alarm** on **Amazon RDS CPU Utilization** to auto-scale MySQL database read-replicas.
`;

    res.json({ report: reportMarkdown });
  } catch (error) {
    console.error('AI Report error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 [AI-Service] running on http://localhost:${PORT}`);
});
