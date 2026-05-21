require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Load mongoose schemas in case Mongoose is active
require('./models/Workspace');
require('./models/Task');
require('./models/File');

const { connectDB, WorkspaceModel, TaskModel, FileModel } = require('./db');
const logAudit = require('./auditHelper');
const { notifyTaskAssignment } = require('./notificationHelper');

const app = express();
const PORT = process.env.PORT || 5002;
const JWT_SECRET = process.env.JWT_SECRET || 'beaver_jwt_secret_key_99';

// Increase body parser limit for Base64 file uploads
app.use(express.json({ limit: '50mb' }));
const ALLOWED_ORIGINS = [
  'https://beaver-nekh.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true
}));

// Initialize Database
connectDB();

// Middleware: Authenticate JWT
function authenticateToken(req, res, next) {
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

// Helper: Check if user is room Creator/Admin or has explicit Write permissions
function hasWritePermission(workspace, userId) {
  const isAdmin = workspace.boss === userId || (workspace.admins && workspace.admins.includes(userId));
  if (isAdmin) return true;
  
  if (workspace.memberPermissions) {
    const perm = workspace.memberPermissions.find(p => p.userId === userId);
    if (perm) {
      return perm.canWrite;
    }
  }
  return true; // Default fallback for backwards compatibility
}

// ---------------- WORKSPACE ENDPOINTS ----------------

// Create Workspace (Any corporate employee can create a room)
app.post('/api/workspaces', authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Workspace name is required' });
    }

    // Generate unique 6-character room code
    let code;
    let codeExists = true;
    while (codeExists) {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const existing = await WorkspaceModel.findOne({ code });
      if (!existing) codeExists = false;
    }

    const newWorkspace = await WorkspaceModel.create({
      name,
      description,
      code,
      boss: req.user.id,
      members: [req.user.id],
      admins: [req.user.id], // Creator is the first Admin
      memberPermissions: [{
        userId: req.user.id,
        canRead: true,
        canWrite: true
      }],
      permissionRequests: [],
      employeeAssignPermissions: false
    });

    logAudit(code, req.user.name, req.user.email, req.user.role, 'WORKSPACE_CREATE', `Created workspace: ${name} with code: ${code}`, req.user.employeeId);

    res.status(201).json(newWorkspace);
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Join Workspace using unique code
app.post('/api/workspaces/join', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Workspace join code is required' });
    }

    const cleanedCode = code.trim().toUpperCase();
    const workspace = await WorkspaceModel.findOne({ code: cleanedCode });

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found. Check your join code.' });
    }

    // Check if user is already a member
    if (workspace.members.includes(req.user.id)) {
      return res.status(400).json({ message: 'You have already joined this workspace' });
    }

    // Add member to workspace and initialize permissions (canRead: true, canWrite: true by default)
    await WorkspaceModel.updateOne(
      { code: cleanedCode },
      { 
        $push: { 
          members: req.user.id,
          memberPermissions: {
            userId: req.user.id,
            canRead: true,
            canWrite: true
          }
        } 
      }
    );

    logAudit(cleanedCode, req.user.name, req.user.email, req.user.role, 'WORKSPACE_JOIN', `Joined workspace: ${workspace.name} (${cleanedCode})`, req.user.employeeId);

    res.json({ message: 'Successfully joined workspace', workspaceCode: cleanedCode });
  } catch (error) {
    console.error('Join workspace error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get User's Workspaces (joined or created)
app.get('/api/workspaces', authenticateToken, async (req, res) => {
  try {
    const workspaces = await WorkspaceModel.find({
      members: req.user.id
    });
    res.json(workspaces);
  } catch (error) {
    console.error('Get workspaces error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get all tasks assigned to the current user across all workspaces they belong to
app.get('/api/workspaces/my-tasks', authenticateToken, async (req, res) => {
  try {
    const workspaces = await WorkspaceModel.find({ members: req.user.id });
    const workspaceMap = {};
    workspaces.forEach(ws => {
      workspaceMap[ws._id] = { name: ws.name, code: ws.code };
    });
    
    const workspaceIds = workspaces.map(ws => ws._id);
    const tasks = await TaskModel.find({
      workspaceId: { $in: workspaceIds },
      assignee: req.user.id,
      status: { $ne: 'done' }
    }).lean();
    
    const tasksWithWorkspace = tasks.map(task => ({
      ...task,
      workspaceName: workspaceMap[task.workspaceId]?.name || 'Unknown',
      workspaceCode: workspaceMap[task.workspaceId]?.code || ''
    }));
    
    res.json(tasksWithWorkspace);
  } catch (error) {
    console.error('Get my-tasks error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get detailed Workspace by code (including tasks, files, members status)
app.get('/api/workspaces/:code', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const workspace = await WorkspaceModel.findOne({ code });

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check membership
    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Access denied: You are not a member of this workspace' });
    }

    // Compute active user permissions in this workspace
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    let canRead = true;
    let canWrite = true;

    if (!isAdmin && workspace.memberPermissions) {
      const perm = workspace.memberPermissions.find(p => p.userId === req.user.id);
      if (perm) {
        canRead = perm.canRead;
        canWrite = perm.canWrite;
      }
    }

    const userPermissions = { isAdmin, canRead, canWrite };

    // Enforce canRead restriction: Return redacted workspace metadata and no tasks/files for security
    if (!canRead) {
      return res.json({
        workspace: {
          _id: workspace._id,
          name: workspace.name,
          description: workspace.description,
          code: workspace.code,
          boss: workspace.boss,
          admins: workspace.admins || [],
          permissionRequests: workspace.permissionRequests || [],
          createdAt: workspace.createdAt
        },
        userPermissions,
        tasks: [],
        files: [],
        readRestricted: true
      });
    }

    const tasks = await TaskModel.find({ workspaceId: workspace._id });
    const files = await FileModel.find({ workspaceId: workspace._id });

    res.json({
      workspace,
      userPermissions,
      tasks,
      files
    });
  } catch (error) {
    console.error('Get workspace details error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Toggle task assignment permissions (Admin only)
app.put('/api/workspaces/:code/permission', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { employeeAssignPermissions } = req.body;

    const workspace = await WorkspaceModel.findOne({ code });

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Must be an Admin of this workspace
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Only workspace Admins can change workspace configurations' });
    }

    await WorkspaceModel.updateOne(
      { code },
      { $set: { employeeAssignPermissions } }
    );

    logAudit(code, req.user.name, req.user.email, req.user.role, 'PERMISSION_CHANGE', `Toggled employee assignment permissions to: ${employeeAssignPermissions}`, req.user.employeeId);

    res.json({ message: 'Permissions updated successfully', employeeAssignPermissions });
  } catch (error) {
    console.error('Toggle permissions error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ---------------- KANBAN TASK ENDPOINTS ----------------

// Create Task
app.post('/api/workspaces/:code/tasks', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { title, description, priority, assignee, assigneeName, dueDate } = req.body;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Verify workspace membership
    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not a member of this workspace' });
    }

    // Enforce canWrite check
    if (!hasWritePermission(workspace, req.user.id)) {
      return res.status(403).json({ message: 'Access Denied: You do not have Write permission in this workspace. Contact admins.' });
    }

    // Role Hierarchy rules for assignment:
    // Workspace Admins can assign any tasks.
    // Employees can assign tasks ONLY IF workspace.employeeAssignPermissions is true,
    // OR if they are assigning the task to THEMSELVES.
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    if (!isAdmin) {
      const isAssigningToOther = assignee && assignee !== req.user.id;
      if (isAssigningToOther && !workspace.employeeAssignPermissions) {
        return res.status(403).json({
          message: 'Access Denied: Employees cannot allocate tasks to other employees unless permitted by an Admin.'
        });
      }
    }

    const newTask = await TaskModel.create({
      workspaceId: workspace._id,
      title,
      description,
      priority: priority || 'medium',
      assignee: assignee || null,
      assigneeName: assignee ? assigneeName : '',
      assignedBy: req.user.id,
      assignedByName: req.user.name,
      dueDate: dueDate || null,
      status: 'todo'
    });

    logAudit(code, req.user.name, req.user.email, req.user.role, 'TASK_CREATE', `Created task: "${title}" (Assigned to: ${assigneeName || 'Unassigned'})`, req.user.employeeId);

    // Trigger email notification if assignee exists
    if (newTask.assignee) {
      notifyTaskAssignment(newTask, req.user.name);
    }

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Update Task (Full details update)
app.put('/api/workspaces/:code/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { taskId } = req.params;
    const { title, description, priority, assignee, assigneeName, dueDate } = req.body;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not a member of this workspace' });
    }

    // Enforce canWrite check
    if (!hasWritePermission(workspace, req.user.id)) {
      return res.status(403).json({ message: 'Access Denied: You do not have Write permission in this workspace. Contact admins.' });
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Role Hierarchy check for shifting assignees:
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    if (!isAdmin) {
      const isAssigningToOther = assignee && assignee !== req.user.id;
      if (isAssigningToOther && !workspace.employeeAssignPermissions) {
        return res.status(403).json({
          message: 'Access Denied: Employees cannot allocate tasks to other employees unless permitted by an Admin.'
        });
      }
    }

    const oldAssignee = task.assignee;

    await TaskModel.updateOne(
      { _id: taskId },
      {
        $set: {
          title,
          description,
          priority,
          assignee: assignee || null,
          assigneeName: assignee ? assigneeName : '',
          dueDate: dueDate || null
        }
      }
    );

    logAudit(code, req.user.name, req.user.email, req.user.role, 'TASK_UPDATE', `Updated task: "${title || task.title}" details.`, req.user.employeeId);

    const updatedTask = await TaskModel.findById(taskId);
    
    // Trigger notification if assignee has changed and is not null
    if (updatedTask.assignee && updatedTask.assignee !== oldAssignee) {
      notifyTaskAssignment(updatedTask, req.user.name);
    }

    res.json(updatedTask);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Update Task Status (Drag & Drop transitions)
app.put('/api/workspaces/:code/tasks/:taskId/status', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { taskId } = req.params;
    const { status } = req.body;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not a member of this workspace' });
    }

    // Enforce canWrite check
    if (!hasWritePermission(workspace, req.user.id)) {
      return res.status(403).json({ message: 'Access Denied: You do not have Write permission in this workspace.' });
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const oldStatus = task.status;
    await TaskModel.updateOne(
      { _id: taskId },
      { $set: { status } }
    );

    logAudit(code, req.user.name, req.user.email, req.user.role, 'TASK_MOVE', `Moved task: "${task.title}" from [${oldStatus.toUpperCase()}] to [${status.toUpperCase()}]`, req.user.employeeId);

    const updatedTask = await TaskModel.findById(taskId);
    res.json(updatedTask);
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Delete Task
app.delete('/api/workspaces/:code/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { taskId } = req.params;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not a member of this workspace' });
    }

    // Enforce canWrite check
    if (!hasWritePermission(workspace, req.user.id)) {
      return res.status(403).json({ message: 'Access Denied: You do not have Write permission in this workspace.' });
    }

    const task = await TaskModel.findById(taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // Role Hierarchy check for deletions:
    // Only the workspace Admins, the person who assigned it, or the assignee themselves can delete
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    const isAssigner = task.assignedBy === req.user.id;
    const isAssignee = task.assignee === req.user.id;

    if (!isAdmin && !isAssigner && !isAssignee) {
      return res.status(403).json({
        message: 'Access Denied: Only Admins or task authors/assignees can delete this task.'
      });
    }

    await TaskModel.deleteOne({ _id: taskId });

    logAudit(code, req.user.name, req.user.email, req.user.role, 'TASK_DELETE', `Deleted task: "${task.title}"`, req.user.employeeId);

    res.json({ message: 'Task deleted successfully', taskId });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ---------------- SHARED FILE CABINET ENDPOINTS ----------------

// Upload File (Stores Base64 directly in database metadata for simple out-of-the-box operation)
app.post('/api/workspaces/:code/files', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { name, type, size, url } = req.body;

    if (!name || !type || !size || !url) {
      return res.status(400).json({ message: 'Missing file upload details' });
    }

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not a member of this workspace' });
    }

    // Enforce canWrite check
    if (!hasWritePermission(workspace, req.user.id)) {
      return res.status(403).json({ message: 'Access Denied: You do not have Write permission in this workspace.' });
    }

    const newFile = await FileModel.create({
      workspaceId: workspace._id,
      name,
      type,
      size,
      url,
      uploadedBy: req.user.id,
      uploadedByName: req.user.name
    });

    logAudit(code, req.user.name, req.user.email, req.user.role, 'FILE_UPLOAD', `Uploaded file: "${name}" (${(size / 1024).toFixed(1)} KB)`, req.user.employeeId);

    res.status(201).json(newFile);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// ---------------- ACCESS REQUESTS & MEMBER CONTROLS ENDPOINTS ----------------

// Submit Access Request (canRead/canWrite/both)
app.post('/api/workspaces/:code/requests', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { requestType } = req.body; // 'read', 'write', or 'both'

    if (!requestType || !['read', 'write', 'both'].includes(requestType)) {
      return res.status(400).json({ message: 'Invalid or missing requestType' });
    }

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!workspace.members.includes(req.user.id)) {
      return res.status(403).json({ message: 'Forbidden: You are not a member of this workspace' });
    }

    // Check if there is already a pending request of this type for this user
    const existingRequest = workspace.permissionRequests.find(
      r => r.userId === req.user.id && r.status === 'pending'
    );
    if (existingRequest) {
      return res.status(400).json({ message: 'You already have a pending access request for this workspace.' });
    }

    const requestId = Math.random().toString(36).substring(2, 10).toUpperCase();

    const newRequest = {
      requestId,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      requestType,
      status: 'pending',
      createdAt: new Date()
    };

    await WorkspaceModel.updateOne(
      { code },
      { $push: { permissionRequests: newRequest } }
    );

    logAudit(code, req.user.name, req.user.email, req.user.role, 'PERMISSION_REQUEST', `Submitted access request: ${requestType.toUpperCase()} for room ${code}`, req.user.employeeId);

    res.status(201).json({ message: 'Access request submitted successfully', request: newRequest });
  } catch (error) {
    console.error('Submit request error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Approve Request (Admin only)
app.post('/api/workspaces/:code/requests/:requestId/approve', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { requestId } = req.params;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Only Admins can approve
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Only workspace Admins can approve access requests' });
    }

    const request = workspace.permissionRequests.find(r => r.requestId === requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    // Determine new permissions
    let setRead = false;
    let setWrite = false;
    if (request.requestType === 'read') {
      setRead = true;
    } else if (request.requestType === 'write') {
      setWrite = true;
    } else if (request.requestType === 'both') {
      setRead = true;
      setWrite = true;
    }

    // Update status in permissionRequests array
    await WorkspaceModel.updateOne(
      { code, "permissionRequests.requestId": requestId },
      { $set: { "permissionRequests.$.status": 'approved' } }
    );

    // Update member permissions inside memberPermissions
    const existingPermIndex = workspace.memberPermissions.findIndex(p => p.userId === request.userId);
    if (existingPermIndex >= 0) {
      const updateQuery = {};
      if (setRead) updateQuery[`memberPermissions.${existingPermIndex}.canRead`] = true;
      if (setWrite) updateQuery[`memberPermissions.${existingPermIndex}.canWrite`] = true;
      await WorkspaceModel.updateOne({ code }, { $set: updateQuery });
    } else {
      const newPerm = {
        userId: request.userId,
        canRead: setRead || true,
        canWrite: setWrite
      };
      await WorkspaceModel.updateOne({ code }, { $push: { memberPermissions: newPerm } });
    }

    logAudit(code, req.user.name, req.user.email, req.user.role, 'PERMISSION_APPROVE', `Approved request ${requestId} for user ${request.userName} (${request.requestType})`, req.user.employeeId);

    res.json({ message: 'Access request approved successfully' });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Reject Request (Admin only)
app.post('/api/workspaces/:code/requests/:requestId/reject', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { requestId } = req.params;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Only Admins can reject
    const isAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    if (!isAdmin) {
      return res.status(403).json({ message: 'Forbidden: Only workspace Admins can reject access requests' });
    }

    const request = workspace.permissionRequests.find(r => r.requestId === requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    await WorkspaceModel.updateOne(
      { code, "permissionRequests.requestId": requestId },
      { $set: { "permissionRequests.$.status": 'rejected' } }
    );

    logAudit(code, req.user.name, req.user.email, req.user.role, 'PERMISSION_REJECT', `Rejected request ${requestId} for user ${request.userName}`, req.user.employeeId);

    res.json({ message: 'Access request rejected successfully' });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Direct Update Member Permissions & Roles (Admin only)
app.put('/api/workspaces/:code/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const { memberId } = req.params;
    const { isAdmin, canRead, canWrite } = req.body;

    const workspace = await WorkspaceModel.findOne({ code });
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Only workspace Admins can edit
    const userIsAdmin = workspace.boss === req.user.id || (workspace.admins && workspace.admins.includes(req.user.id));
    if (!userIsAdmin) {
      return res.status(403).json({ message: 'Forbidden: Only workspace Admins can manage member roles' });
    }

    // Prevent demoting the room Creator/Boss
    if (memberId === workspace.boss) {
      return res.status(400).json({ message: 'Invalid Action: Cannot demote or revoke access from the workspace Creator.' });
    }

    // 1. Update Admin list
    let updatedAdmins = [...(workspace.admins || [])];
    if (isAdmin === true) {
      if (!updatedAdmins.includes(memberId)) {
        updatedAdmins.push(memberId);
      }
    } else if (isAdmin === false) {
      updatedAdmins = updatedAdmins.filter(id => id !== memberId);
    }

    // 2. Update memberPermissions array
    let updatedPermissions = [...(workspace.memberPermissions || [])];
    const idx = updatedPermissions.findIndex(p => p.userId === memberId);
    if (idx >= 0) {
      updatedPermissions[idx].canRead = canRead === undefined ? updatedPermissions[idx].canRead : canRead;
      updatedPermissions[idx].canWrite = canWrite === undefined ? updatedPermissions[idx].canWrite : canWrite;
    } else {
      updatedPermissions.push({
        userId: memberId,
        canRead: canRead === undefined ? true : canRead,
        canWrite: canWrite === undefined ? true : canWrite
      });
    }

    await WorkspaceModel.updateOne(
      { code },
      { 
        $set: { 
          admins: updatedAdmins,
          memberPermissions: updatedPermissions
        } 
      }
    );

    logAudit(code, req.user.name, req.user.email, req.user.role, 'MEMBER_ACCESS_CHANGE', `Modified access for member ID ${memberId}: Admin: ${isAdmin}, Read: ${canRead}, Write: ${canWrite}`, req.user.employeeId);

    res.json({ message: 'Member access and roles updated successfully' });
  } catch (error) {
    console.error('Update member permissions error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get detailed Workspace by code for internal microservice query (AI-service context)
app.get('/api/internal/workspaces/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const workspace = await WorkspaceModel.findOne({ code });

    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const tasks = await TaskModel.find({ workspaceId: workspace._id });
    const files = await FileModel.find({ workspaceId: workspace._id });

    res.json({
      workspace,
      tasks,
      files
    });
  } catch (error) {
    console.error('Get internal workspace details error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get all pending tasks across all workspaces (Internal microservice query)
app.get('/api/internal/tasks/pending', async (req, res) => {
  try {
    const pendingTasks = await TaskModel.find({
      status: { $ne: 'done' },
      assignee: { $ne: null, $exists: true }
    });
    res.json(pendingTasks);
  } catch (error) {
    console.error('Fetch pending tasks internal error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 [Workspace-Service] running on http://localhost:${PORT}`);
});
