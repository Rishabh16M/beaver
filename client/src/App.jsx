import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Trello, MessageSquare, Folder, Shield, LogOut, Plus, 
  UserPlus, Mail, User, ShieldAlert, Cpu, Download, FileText, 
  Image, File, AlertCircle, RefreshCw, Bell 
} from 'lucide-react';

// API Gateways Configuration (set in client/.env for local, Vercel dashboard for production)
const AUTH_URL = import.meta.env.VITE_AUTH_URL || 'http://localhost:5001/api/auth';
const WORKSPACE_URL = import.meta.env.VITE_WORKSPACE_URL || 'http://localhost:5002/api/workspaces';
const CHAT_URL = import.meta.env.VITE_CHAT_URL || 'http://localhost:5003';
const AUDIT_URL = import.meta.env.VITE_AUDIT_URL || 'http://localhost:5004/api/audits';
const NOTIFICATION_URL = import.meta.env.VITE_NOTIFICATION_URL || 'http://localhost:5006';
const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:5005/api/ai';

export default function App() {
  // Session & Authentication
  const [token, setToken] = useState(localStorage.getItem('beaver_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('beaver_user')) || null);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  
  // Auth Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  // role is always 'Employee' — no need to track in state
  const [authError, setAuthError] = useState('');

  // Dashboard & Workspaces
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null); // Detailed Workspace Object
  const [joinCode, setJoinCode] = useState('');
  const [newWsName, setNewWsName] = useState('');
  const [newWsDesc, setNewWsDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Active Workspace Views
  const [activeTab, setActiveTab] = useState('kanban'); // 'kanban', 'chat', 'files', 'audits'
  const [allUsers, setAllUsers] = useState([]); // Employee directory for task assignment
  const [myTasks, setMyTasks] = useState([]); // Outstanding tasks assigned to user
  const [notifications, setNotifications] = useState([]); // Unread chat notifications
  const [showNotifDropdown, setShowNotifDropdown] = useState(false); // Notifications bell toggle
  
  // Kanban Task Form
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskError, setTaskError] = useState('');

  // Chat Room
  const [chatMessages, setChatMessages] = useState([]);
  const [typedMessage, setTypedMessage] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const chatBottomRef = useRef(null);
  const socketRef = useRef(null);

  // File Locker
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragging, setDragging] = useState(false);

  // Boss Auditing panel
  const [auditLogs, setAuditLogs] = useState([]);

  // AI Workspace Report
  const [aiReport, setAiReport] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  // Core App Loading & Error indicators
  const [appError, setAppError] = useState('');

  // Refs to avoid stale closures in global socket listeners
  const currentWorkspaceRef = useRef(currentWorkspace);
  const activeTabRef = useRef(activeTab);
  const workspacesRef = useRef(workspaces);
  const userRef = useRef(user);

  useEffect(() => { currentWorkspaceRef.current = currentWorkspace; }, [currentWorkspace]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { workspacesRef.current = workspaces; }, [workspaces]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Sync session on startup
  useEffect(() => {
    if (token) {
      fetchProfile();
      fetchWorkspaces();
      fetchAllUsers();
      fetchMyTasks();
    }
  }, [token]);

  // Connect Socket.io globally when token is active
  useEffect(() => {
    if (token) {
      if (socketRef.current) socketRef.current.disconnect();

      socketRef.current = io(CHAT_URL, {
        auth: { token }
      });

      socketRef.current.on('connect', () => {
        console.log('🔌 Connected to Socket.io chat server globally');
        // Join all room channels that the user is currently a member of
        const allWs = workspacesRef.current;
        if (allWs && allWs.length > 0) {
          allWs.forEach(ws => {
            socketRef.current.emit('join_workspace', { workspaceCode: ws.code });
          });
        }
      });

      // Receive Chat Message globally
      socketRef.current.on('new_message', (msg) => {
        const currWs = currentWorkspaceRef.current;
        const activeT = activeTabRef.current;
        const currentUser = userRef.current;
        const allWs = workspacesRef.current;

        const isCurrentRoomChatActive = currWs && 
          activeT === 'chat' && 
          msg.workspaceCode.toUpperCase() === currWs.workspace.code.toUpperCase();

        if (isCurrentRoomChatActive) {
          setChatMessages(prev => [...prev, msg]);
        } else {
          // Add notification if not sent by current user
          if (currentUser && msg.sender.id !== currentUser.id) {
            const wsName = allWs.find(w => w.code.toUpperCase() === msg.workspaceCode.toUpperCase())?.name || msg.workspaceCode;
            setNotifications(prev => {
              if (prev.some(n => n._id === msg._id)) return prev;
              return [...prev, {
                _id: msg._id,
                type: 'chat',
                workspaceCode: msg.workspaceCode,
                workspaceName: wsName,
                senderName: msg.sender.name,
                text: msg.text,
                timestamp: msg.createdAt || new Date().toISOString()
              }];
            });
          }
        }
      });

      // Receive AI Typing globally
      socketRef.current.on('ai_typing', ({ active, workspaceCode }) => {
        const currWs = currentWorkspaceRef.current;
        if (currWs && workspaceCode && workspaceCode.toUpperCase() === currWs.workspace.code.toUpperCase()) {
          setAiTyping(active);
        }
      });

      // Receive sync_kanban signal globally
      socketRef.current.on('sync_kanban', ({ workspaceCode } = {}) => {
        const currWs = currentWorkspaceRef.current;
        
        // Sync my assigned tasks list globally
        fetchMyTasks();

        // If changes were made inside our currently active workspace, refresh it!
        if (currWs && (!workspaceCode || workspaceCode.toUpperCase() === currWs.workspace.code.toUpperCase())) {
          reloadWorkspace();
        }
      });

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
        }
      };
    }
  }, [token]);

  // Keep socket rooms in sync when rooms are joined or created
  useEffect(() => {
    if (token && socketRef.current && socketRef.current.connected && workspaces.length > 0) {
      workspaces.forEach(ws => {
        socketRef.current.emit('join_workspace', { workspaceCode: ws.code });
      });
    }
  }, [workspaces]);

  // Handle Workspace details loading when active room changes
  useEffect(() => {
    if (currentWorkspace) {
      fetchChatHistory();
      fetchAuditLogs();
      scrollToBottom();
    }
  }, [currentWorkspace]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, aiTyping]);

  const scrollToBottom = () => {
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // --- API CALLS ---

  // Auth: Verify User Session
  const fetchProfile = async () => {
    try {
      const res = await fetch(`${AUTH_URL}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('beaver_user', JSON.stringify(data.user));
      } else {
        handleLogout();
      }
    } catch (e) {
      console.warn('Auth Service unreachable on start. Operating on cached user metadata.');
    }
  };

  // Auth: Fetch Employee Directory
  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${AUTH_URL}/users`);
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      }
    } catch (e) {
      console.warn('Could not populate member directory.');
    }
  };

  // Auth: User Sign-Up
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!name || !email || !employeeId || !password) {
      setAuthError('All registration fields are required');
      return;
    }
    try {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, employeeId, password })
      });
      const data = await res.json();
      if (res.ok) {
        // Automatically switch to login with details populated
        setAuthMode('login');
        setPassword('');
        setAuthError('Registration successful! Please sign in.');
      } else {
        setAuthError(data.message || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Auth-Service offline. Please launch servers.');
    }
  };

  // Auth: User Login
  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${AUTH_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('beaver_token', data.token);
        localStorage.setItem('beaver_user', JSON.stringify(data.user));
      } else {
        setAuthError(data.message || 'Invalid Credentials');
      }
    } catch (err) {
      setAuthError('Auth-Service offline. Try running root launcher.');
    }
  };

  // Logout Session
  const handleLogout = () => {
    setToken('');
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspace(null);
    localStorage.removeItem('beaver_token');
    localStorage.removeItem('beaver_user');
  };

  // Workspaces: Get all tasks assigned to the user
  const fetchMyTasks = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${WORKSPACE_URL}/my-tasks`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyTasks(data);
      }
    } catch (e) {
      console.error('Error fetching user tasks:', e);
    }
  };

  // Handle clicking chat notification
  const handleNotificationClick = async (notif) => {
    setShowNotifDropdown(false);
    await fetchWorkspaceDetails(notif.workspaceCode);
    setActiveTab('chat');
    setNotifications(prev => prev.filter(n => n._id !== notif._id));
  };

  // Handle clicking task reminder
  const handleTaskReminderClick = async (task) => {
    setShowNotifDropdown(false);
    await fetchWorkspaceDetails(task.workspaceCode);
    setActiveTab('kanban');
  };

  // Single-click trigger for email reminder sync via Notification Service
  const handleEmailDigestRequest = async () => {
    try {
      const res = await fetch(`${NOTIFICATION_URL}/api/notifications/remind-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        alert('✉️ Email reminder digest dispatched successfully to your account!');
      } else {
        alert('⚠️ Could not send email reminders at this time.');
      }
    } catch (err) {
      console.error('Email digest error:', err);
      alert('⚠️ Notification Service offline.');
    }
  };

  // Reusable component rendering for the Global Notification Bell and Dropdown Center
  const renderNotificationBell = () => {
    const totalNotifs = notifications.length + myTasks.length;
    return (
      <div className="notif-bell-container" style={{ position: 'relative' }}>
        <button 
          className={`btn btn-secondary btn-icon notif-bell-btn ${showNotifDropdown ? 'active' : ''}`} 
          onClick={() => setShowNotifDropdown(!showNotifDropdown)}
          title="Notifications center"
        >
          <Bell size={18} />
          {totalNotifs > 0 && (
            <span className="notif-badge">{totalNotifs}</span>
          )}
        </button>
        
        {showNotifDropdown && (
          <div className="notif-dropdown">
            <div className="notif-dropdown-header">
              <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>Notifications Center</h3>
              {notifications.length > 0 && (
                <button 
                  className="btn-text-link" 
                  onClick={() => setNotifications([])}
                  style={{ fontSize: '0.75rem', color: 'var(--secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Clear Messages
                </button>
              )}
            </div>
            
            <div className="notif-dropdown-content">
              {/* 1. Pending tasks section */}
              <div className="notif-section">
                <h4 className="notif-section-title">Your Assigned Work ({myTasks.length})</h4>
                {myTasks.length === 0 ? (
                  <p className="notif-empty-state">No pending tasks assigned to you! 🎉</p>
                ) : (
                  myTasks.map(task => {
                    const priorityClass = task.priority || 'medium';
                    return (
                      <div 
                        key={task._id} 
                        className="notif-item task-item-link"
                        onClick={() => handleTaskReminderClick(task)}
                      >
                         <span className="notif-item-title">📋 {task.title}</span>
                         <div className="notif-item-row">
                           <span className="notif-item-room-badge">{task.workspaceName}</span>
                           <span className={`role-tag ${priorityClass}`} style={{ fontSize: '0.6rem', padding: '0.05rem 0.3rem', height: 'fit-content' }}>
                             {task.priority.toUpperCase()}
                           </span>
                         </div>
                         {task.dueDate && (
                           <span className="notif-item-time" style={{ display: 'block', marginTop: '2px' }}>
                             Due: {new Date(task.dueDate).toLocaleDateString(undefined, { dateStyle: 'short' })}
                           </span>
                         )}
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* 2. Unread messages section */}
              <div className="notif-section" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                <h4 className="notif-section-title">Unread Messages ({notifications.length})</h4>
                {notifications.length === 0 ? (
                  <p className="notif-empty-state">No new chat alerts.</p>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif._id} 
                      className="notif-item chat-item-link"
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="notif-item-title" style={{ color: 'var(--secondary)' }}>💬 {notif.senderName}</span>
                        <span className="notif-item-room-badge" style={{ fontSize: '0.65rem' }}>{notif.workspaceName}</span>
                      </div>
                      <p className="notif-item-body">{notif.text}</p>
                      <span className="notif-item-time">
                        {new Date(notif.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* 3. Dropdown Footer with Quick Email Reminders Action */}
            <div className="notif-dropdown-footer">
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', fontSize: '0.75rem', padding: '0.4rem 0.8rem', justifyContent: 'center' }}
                onClick={handleEmailDigestRequest}
              >
                <Mail size={12} style={{ marginRight: '6px' }} /> Email Me a Digest
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Workspaces: Get Lists
  const fetchWorkspaces = async () => {
    try {
      const res = await fetch(WORKSPACE_URL, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data);
      }
    } catch (e) {
      setAppError('Workspace-Service unreachable.');
    }
  };

  // Workspaces: Detailed Room details
  const fetchWorkspaceDetails = async (code) => {
    try {
      const res = await fetch(`${WORKSPACE_URL}/${code}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentWorkspace(data);
      } else {
        const err = await res.json();
        alert(err.message);
      }
    } catch (e) {
      alert('Could not open workspace room details.');
    }
  };

  // Refreshes the active workspace state (useful for task shifts / files catalog updates)
  const reloadWorkspace = async () => {
    const currWs = currentWorkspaceRef.current;
    if (currWs) {
      await fetchWorkspaceDetails(currWs.workspace.code);
    }
    fetchMyTasks();
  };

  // Workspaces: Create New Room (Boss only)
  const handleCreateWorkspace = async (e) => {
    e.preventDefault();
    if (!newWsName) return;
    try {
      const res = await fetch(WORKSPACE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newWsName, description: newWsDesc })
      });
      if (res.ok) {
        const newWs = await res.json();
        setShowCreateModal(false);
        setNewWsName('');
        setNewWsDesc('');
        fetchWorkspaces();
        // Go straight to the workspace
        fetchWorkspaceDetails(newWs.code);
      }
    } catch (e) {
      alert('Create workspace request failed.');
    }
  };

  // Workspaces: Join Room via Code
  const handleJoinWorkspace = async (e) => {
    e.preventDefault();
    if (!joinCode) return;
    try {
      const res = await fetch(`${WORKSPACE_URL}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: joinCode })
      });
      const data = await res.json();
      if (res.ok) {
        setShowJoinModal(false);
        setJoinCode('');
        fetchWorkspaces();
        fetchWorkspaceDetails(data.workspaceCode);
      } else {
        alert(data.message);
      }
    } catch (e) {
      alert('Join workspace request failed.');
    }
  };

  // Boss Workspace privilege Control (Task Permissions Toggle)
  const handleTogglePermissions = async (checked) => {
    if (!currentWorkspace) return;
    try {
      const res = await fetch(`${WORKSPACE_URL}/${currentWorkspace.workspace.code}/permission`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ employeeAssignPermissions: checked })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentWorkspace(prev => ({
          ...prev,
          workspace: {
            ...prev.workspace,
            employeeAssignPermissions: data.employeeAssignPermissions
          }
        }));
      }
    } catch (e) {
      alert('Failed to update task allocations permissions.');
    }
  };

  // --- KANBAN TASKS MANAGEMENT ---

  // Kanban: Task Addition
  const handleAddTask = async (e) => {
    e.preventDefault();
    setTaskError('');
    if (!taskTitle) {
      setTaskError('Task title is required');
      return;
    }

    const assigneeObj = allUsers.find(u => u._id === taskAssignee);
    const assigneeName = assigneeObj ? assigneeObj.name : '';

    try {
      const res = await fetch(`${WORKSPACE_URL}/${currentWorkspace.workspace.code}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDesc,
          priority: taskPriority,
          assignee: taskAssignee,
          assigneeName,
          dueDate: taskDueDate
        })
      });

      const data = await res.json();
      if (res.ok) {
        setShowTaskModal(false);
        setTaskTitle('');
        setTaskDesc('');
        setTaskPriority('medium');
        setTaskAssignee('');
        setTaskDueDate('');
        reloadWorkspace();
        if (socketRef.current) {
          socketRef.current.emit('task_changed', { workspaceCode: currentWorkspace.workspace.code });
        }
      } else {
        setTaskError(data.message || 'Task addition failed');
      }
    } catch (err) {
      setTaskError('Workspace-Service unreachable.');
    }
  };

  // Kanban: Delete Task
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this Kanban card?')) return;
    try {
      const res = await fetch(`${WORKSPACE_URL}/${currentWorkspace.workspace.code}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        reloadWorkspace();
        if (socketRef.current) {
          socketRef.current.emit('task_changed', { workspaceCode: currentWorkspace.workspace.code });
        }
      } else {
        const err = await res.json();
        alert(err.message || 'Cannot delete task.');
      }
    } catch (e) {
      alert('Delete request failed.');
    }
  };

  // HTML5 Drag & Drop Swimlanes Transition handler
  const handleOnDragOver = (e) => {
    e.preventDefault();
  };

  const handleOnDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const handleOnDrop = async (e, targetStatus) => {
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    
    // Optimistic UI state updates
    const updatedTasks = currentWorkspace.tasks.map(t => {
      if (t._id === taskId) return { ...t, status: targetStatus };
      return t;
    });
    setCurrentWorkspace(prev => ({ ...prev, tasks: updatedTasks }));

    try {
      const res = await fetch(`${WORKSPACE_URL}/${currentWorkspace.workspace.code}/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: targetStatus })
      });
      if (res.ok) {
        reloadWorkspace();
        if (socketRef.current) {
          socketRef.current.emit('task_changed', { workspaceCode: currentWorkspace.workspace.code });
        }
      } else {
        // Revert on error
        reloadWorkspace();
      }
    } catch (err) {
      reloadWorkspace();
    }
  };

  // --- REAL-TIME CHAT HISTORY & DISPATCHERS ---

  // Chat: History Retrieve
  const fetchChatHistory = async () => {
    try {
      const res = await fetch(`${CHAT_URL}/api/chat/${currentWorkspace.workspace.code}`);
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (e) {
      console.warn('Could not populate chat history. Check socket/chat services.');
    }
  };

  // Chat: Dispatch User Message
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!typedMessage.trim()) return;

    if (socketRef.current) {
      socketRef.current.emit('send_message', {
        workspaceCode: currentWorkspace.workspace.code,
        text: typedMessage
      });
      setTypedMessage('');
    } else {
      alert('Socket connection offline. Chat is currently locked.');
    }
  };

  // --- SHARED FILE LOCKER CONTROLLERS ---

  // Files: Converts file upload to base64 & dispatches
  const processFileUpload = async (file) => {
    if (!file) return;
    
    // Check file size limit (Base64 adds overhead, keep it under 4MB for fast transfers)
    if (file.size > 4 * 1024 * 1024) {
      alert('To keep transfers fast, local base64 uploads are limited to 4MB. For massive assets, integrate AWS S3!');
      return;
    }

    setUploadProgress('Preparing base64 transfer...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Url = event.target.result;
      
      try {
        setUploadProgress('Uploading asset to vault...');
        const res = await fetch(`${WORKSPACE_URL}/${currentWorkspace.workspace.code}/files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: file.name,
            type: file.type,
            size: file.size,
            url: base64Url
          })
        });

        if (res.ok) {
          setUploadProgress('✅ Shared successfully!');
          setTimeout(() => setUploadProgress(''), 2000);
          reloadWorkspace();
          if (socketRef.current) {
            socketRef.current.emit('task_changed', { workspaceCode: currentWorkspace.workspace.code });
          }
        } else {
          setUploadProgress('⚠️ Upload failed.');
          setTimeout(() => setUploadProgress(''), 3000);
        }
      } catch (err) {
        setUploadProgress('⚠️ Service down.');
        setTimeout(() => setUploadProgress(''), 3000);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOverFile = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeaveFile = () => {
    setDragging(false);
  };
  const handleDropFile = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFileUpload(e.dataTransfer.files[0]);
    }
  };

  // --- CENTRAL AUDITS & REPORT LOGISTICS ---

  // Auditing: Retrieve audit log rolls
  const fetchAuditLogs = async () => {
    if (!currentWorkspace?.workspace?.code || !token) return;
    try {
      const res = await fetch(`${AUDIT_URL}/${currentWorkspace.workspace.code}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(Array.isArray(data) ? data : []);
      } else {
        const errText = await res.text();
        console.warn(`[Audit] Fetch failed ${res.status}:`, errText);
        setAuditLogs([]);
      }
    } catch (e) {
      console.warn('[Audit] Service unavailable:', e.message);
      setAuditLogs([]);
    }
  };

  // Auditing: Boss downloads log spreadsheet CSV directly
  const handleDownloadCsv = () => {
    if (!currentWorkspace) return;
    const exportUrl = `${AUDIT_URL}/${currentWorkspace.workspace.code}/export`;
    
    // Perform standard browser download injection
    fetch(exportUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Export denied');
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Audit-Trail-${currentWorkspace.workspace.code}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => alert('Failed to download spreadsheet: ' + err.message));
  };

  // AI: Boss triggers analytical workspace report compiled by AI-Service
  const handleCompileAIReport = async () => {
    setLoadingReport(true);
    setShowReportModal(true);
    setAiReport('');
    try {
      const res = await fetch(`${AI_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: currentWorkspace.tasks,
          files: currentWorkspace.files,
          membersCount: currentWorkspace.workspace.members.length,
          workspaceName: currentWorkspace.workspace.name,
          workspaceCode: currentWorkspace.workspace.code
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiReport(data.report);
      } else {
        setAiReport('Failed to compile report. Double check AI microservice startup.');
      }
    } catch (e) {
      setAiReport('AI Companion service is currently offline.');
    } finally {
      setLoadingReport(false);
    }
  };

  // --- HELPERS FOR UI DECORATIONS ---

  const renderFileIcon = (mimeType) => {
    if (mimeType.startsWith('image/')) return <Image size={24} />;
    if (mimeType.includes('pdf')) return <FileText size={24} />;
    return <File size={24} />;
  };

  const getMimeClass = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.includes('pdf')) return 'pdf';
    return 'other';
  };

  // --- SUB-COMPONENTS CHASSIS ---

  // Auth Module View
  if (!token) {
    return (
      <div className="auth-page">
        <div className="glass-card auth-box">
          <div className="logo-container" style={{ justifyContent: 'center', marginBottom: '1.5rem' }}>
            <Trello className="logo-icon" size={32} />
            <span>BEAVER.WORK</span>
          </div>

          <h2 className="auth-title">
            {authMode === 'login' ? 'Welcome Back' : 'Join the Core Workspace'}
          </h2>
          <p className="auth-subtitle">
            {authMode === 'login' ? 'Log in with your official office email' : 'Register your corporate employee profile'}
          </p>

          {authError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--danger)',
              padding: '0.75rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              color: '#fca5a5',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              {authError}
            </div>
          )}

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
            {authMode === 'register' && (
              <>
                <div className="glass-input-group">
                  <label>Full Employee Name</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="Jane Doe" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                  />
                </div>
                <div className="glass-input-group">
                  <label>Employee ID Code</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="EMP-9081" 
                    value={employeeId} 
                    onChange={e => setEmployeeId(e.target.value)} 
                  />
                </div>
              </>
            )}

            <div className="glass-input-group">
              <label>Official Office Email</label>
              <input 
                type="email" 
                className="glass-input" 
                placeholder="jdoe@office.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
            </div>

            <div className="glass-input-group">
              <label>Access Password</label>
              <input 
                type="password" 
                className="glass-input" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
            </div>



            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
              {authMode === 'login' ? 'Sign In' : 'Create Profile'}
            </button>
          </form>

          <p className="auth-switch">
            {authMode === 'login' ? (
              <>First time in Beaver? <span onClick={() => setAuthMode('register')}>Create profile</span></>
            ) : (
              <>Already have a profile? <span onClick={() => setAuthMode('login')}>Sign in</span></>
            )}
          </p>
        </div>
      </div>
    );
  }

  // Dashboard Workspace Navigator View
  if (!currentWorkspace) {
    return (
      <div className="app-container">
        <header className="navbar">
          <div className="logo-container">
            <Trello className="logo-icon" />
            <span>BEAVER.WORK</span>
          </div>
          <div className="nav-user">
            <div className="user-badge">
              <User size={14} />
              <span>{user?.name}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>{user?.employeeId}</span>
            </div>
            {renderNotificationBell()}
            <button className="btn btn-secondary btn-icon" onClick={handleLogout} title="Log Out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="dashboard">
          <div className="dashboard-header">
            <div>
              <h1 style={{ fontSize: '2.25rem', fontFamily: 'var(--font-display)', marginBottom: '0.25rem' }}>Collaborative Rooms</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Select an active office room or enter a join code</p>
            </div>
            <div className="dashboard-actions">
              <button className="btn btn-secondary" onClick={() => setShowJoinModal(true)}>
                <UserPlus size={18} /> Join Room
              </button>
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={18} /> Create Workspace
              </button>
            </div>
          </div>

          {workspaces.length === 0 ? (
            <div className="glass-card" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <ShieldAlert size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
              <h3>No Active Office Rooms Joined</h3>
              <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                Join an active project workspace using a 6-character room code from your manager.
              </p>
              <button className="btn btn-secondary" onClick={() => setShowJoinModal(true)}>
                Enter Room Code
              </button>
            </div>
          ) : (
            <div className="projects-grid">
              {workspaces.map(ws => (
                <div 
                  key={ws._id} 
                  className="glass-card glass-card-interactive project-card"
                  onClick={() => fetchWorkspaceDetails(ws.code)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="project-code-tag">{ws.code}</div>
                  <div>
                    <h3>{ws.name}</h3>
                    <p>{ws.description || 'No description provided.'}</p>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      👥 {ws.members.length} members
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '600' }}>
                      Enter Workspace →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Create Room Modal */}
        {showCreateModal && (
          <div className="modal-overlay">
            <div className="glass-card modal-content">
              <h2 style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Create Workspace Room</h2>
              <form onSubmit={handleCreateWorkspace}>
                <div className="glass-input-group">
                  <label>Workspace Title Name</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="Q3 Marketing Campaign" 
                    value={newWsName} 
                    onChange={e => setNewWsName(e.target.value)} 
                    required 
                  />
                </div>
                <div className="glass-input-group">
                  <label>Operational Description</label>
                  <textarea 
                    className="glass-input" 
                    placeholder="Review deliverables, roadmap syncs, and client storage cabinet." 
                    value={newWsDesc} 
                    onChange={e => setNewWsDesc(e.target.value)} 
                    rows={3}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Room</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Room Modal */}
        {showJoinModal && (
          <div className="modal-overlay">
            <div className="glass-card modal-content">
              <h2 style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Join Project Room</h2>
              <form onSubmit={handleJoinWorkspace}>
                <div className="glass-input-group">
                  <label>6-Character Workspace Room Code</label>
                  <input 
                    type="text" 
                    className="glass-input" 
                    placeholder="PRJ-9X" 
                    value={joinCode} 
                    onChange={e => setJoinCode(e.target.value.toUpperCase())} 
                    required 
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowJoinModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Enter Room</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Workspace Room Chassis
  const { workspace, tasks, files, readRestricted, userPermissions } = currentWorkspace;

  // Submit access requests (read/write/both)
  const handleRequestAccess = async (type = 'both') => {
    try {
      const res = await fetch(`${WORKSPACE_URL}/${workspace.code}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestType: type })
      });
      const data = await res.json();
      if (res.ok) {
        alert('✅ Access request submitted successfully!');
        reloadWorkspace();
      } else {
        alert(data.message || 'Failed to submit request');
      }
    } catch (e) {
      alert('Request failed. Server offline.');
    }
  };

  // Direct Update Member Permissions & Roles (Admin only)
  const handleUpdateMemberAccess = async (memberId, updates) => {
    const isCurrentAdmin = workspace.admins?.includes(memberId);
    const existingPerm = workspace.memberPermissions?.find(p => p.userId === memberId) || { canRead: true, canWrite: true };
    
    const body = {
      isAdmin: updates.isAdmin !== undefined ? updates.isAdmin : isCurrentAdmin,
      canRead: updates.canRead !== undefined ? updates.canRead : existingPerm.canRead,
      canWrite: updates.canWrite !== undefined ? updates.canWrite : existingPerm.canWrite
    };

    try {
      const res = await fetch(`${WORKSPACE_URL}/${workspace.code}/members/${memberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        reloadWorkspace();
        if (socketRef.current) {
          socketRef.current.emit('task_changed', { workspaceCode: workspace.code });
        }
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to update member access');
      }
    } catch (e) {
      alert('Access update failed. Server offline.');
    }
  };

  // Approve / Reject Access Requests (Admin only)
  const handleProcessRequest = async (requestId, action) => {
    try {
      const res = await fetch(`${WORKSPACE_URL}/${workspace.code}/requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert(`✅ Request ${action}d successfully!`);
        reloadWorkspace();
        if (socketRef.current) {
          socketRef.current.emit('task_changed', { workspaceCode: workspace.code });
        }
      } else {
        const err = await res.json();
        alert(err.message || `Failed to ${action} request`);
      }
    } catch (e) {
      alert('Action failed. Server offline.');
    }
  };

  if (readRestricted) {
    return (
      <div className="app-container" style={{ height: '100vh', overflow: 'hidden' }}>
        <header className="navbar">
          <div className="logo-container" onClick={() => setCurrentWorkspace(null)} style={{ cursor: 'pointer' }}>
            <Trello className="logo-icon" />
            <span>BEAVER.WORK</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="user-badge">
              <User size={14} />
              <span>{user?.name}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>{user?.employeeId}</span>
            </div>
            {renderNotificationBell()}
            <button className="btn btn-secondary btn-icon" onClick={() => setCurrentWorkspace(null)} title="Return to Dashboard">
              <RefreshCw size={16} />
            </button>
          </div>
        </header>

        <div className="workspace-container">
          <div className="workspace-toolbar">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <h2 style={{ fontSize: '1.25rem' }}>{workspace.name}</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Creator: {allUsers.find(u => u._id === workspace.boss)?.name || 'Admin'} | Members: {workspace.members?.length || 0}
              </span>
            </div>
          </div>

          <div className="workspace-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div className="glass-card lock-screen" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '3rem',
              textAlign: 'center',
              maxWidth: '600px',
              margin: '4rem auto',
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(16px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
            }}>
              <div className="lock-icon-glow" style={{
                background: 'rgba(239, 68, 68, 0.1)',
                padding: '1.5rem',
                borderRadius: '50%',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)',
                marginBottom: '1.5rem',
                color: 'var(--danger)'
              }}>
                <ShieldAlert size={48} />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.75rem', fontFamily: 'var(--font-display)', color: '#f8fafc' }}>
                🔒 Access Restricted: Read Permission Required
              </h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.95rem', lineHeight: '1.6' }}>
                You do not have Read access to this room. Submit a request to the workspace administrators to unlock the Kanban board, files, and chat.
              </p>
              
              {workspace.permissionRequests?.find(r => r.userId === user?._id && r.status === 'pending') ? (
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '1rem 2rem',
                  borderRadius: 'var(--radius-md)',
                  color: '#fef08a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.9rem',
                  fontWeight: '600'
                }}>
                  <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
                  <span>Your access request is currently pending admin review.</span>
                </div>
              ) : (
                <button 
                  className="btn btn-primary btn-glow"
                  onClick={() => handleRequestAccess('both')}
                  style={{
                    padding: '0.75rem 2.5rem',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.4)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  Request Workspace Access
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ height: '100vh', overflow: 'hidden' }}>
      <header className="navbar">
        <div className="logo-container" onClick={() => setCurrentWorkspace(null)} style={{ cursor: 'pointer' }}>
          <Trello className="logo-icon" />
          <span>BEAVER.WORK</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ background: 'var(--bg-deep)', padding: '0.4rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-glass)', fontSize: '0.85rem' }}>
            Room Join Code: <strong style={{ color: 'var(--secondary)', fontFamily: 'var(--font-display)' }}>{workspace.code}</strong>
          </div>
          {userPermissions?.isAdmin && (
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', color: '#cffafe' }} onClick={handleCompileAIReport}>
              <Cpu size={16} style={{ color: 'var(--secondary)' }} /> Compile AI Insights
            </button>
          )}
          <div className="user-badge">
            <User size={14} />
            <span>{user?.name}</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--secondary)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>{user?.employeeId}</span>
          </div>
          {renderNotificationBell()}
          <button className="btn btn-secondary btn-icon" onClick={() => setCurrentWorkspace(null)} title="Return to Dashboard">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <div className="workspace-container">
        {/* Workspace Sub-Toolbar */}
        <div className="workspace-toolbar">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: '1.25rem' }}>{workspace.name}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Creator: {workspace.boss === user?._id ? 'You' : (allUsers.find(u => u._id === workspace.boss)?.name || 'Admin')} | Members: {workspace.members.length}
            </span>
          </div>

          <div className="workspace-tabs">
            <button className={`tab-btn ${activeTab === 'kanban' ? 'active' : ''}`} onClick={() => setActiveTab('kanban')}>
              <Trello size={16} /> Kanban Board
            </button>
            <button className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
              <MessageSquare size={16} /> Chat Room
            </button>
            <button className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
              <Folder size={16} /> Shared Files
            </button>
            <button className={`tab-btn ${activeTab === 'audits' ? 'active' : ''}`} onClick={() => { setActiveTab('audits'); fetchAuditLogs(); }}>
              <Shield size={16} /> Audit Logs & Room Management
            </button>
          </div>
        </div>

        <div className="workspace-content">
          {/* 1. KANBAN swimlanes TAB */}
          {activeTab === 'kanban' && (
            <div className="kanban-board">
              {['todo', 'in_progress', 'review', 'done'].map(status => {
                const laneTasks = tasks.filter(t => t.status === status);
                const statusTitles = {
                  todo: 'To Do Pool',
                  in_progress: 'In Progress',
                  review: 'In Review',
                  done: 'Completed'
                };
                return (
                  <div 
                    key={status} 
                    className={`kanban-lane ${status}`}
                    onDragOver={handleOnDragOver}
                    onDrop={(e) => handleOnDrop(e, status)}
                  >
                    <div className="lane-header">
                      <div className="lane-title">
                        <span className="lane-indicator"></span>
                        <span>{statusTitles[status]}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="lane-counter">{laneTasks.length}</span>
                        {status === 'todo' && userPermissions?.canWrite !== false && (
                          <button 
                            className="btn btn-secondary btn-icon" 
                            style={{ padding: '0.2rem', borderRadius: '4px' }}
                            onClick={() => setShowTaskModal(true)}
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="lane-cards">
                      {laneTasks.length === 0 ? (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                          Drag cards here
                        </div>
                      ) : (
                        laneTasks.map(task => (
                          <div 
                            key={task._id} 
                            className="kanban-card"
                            draggable={userPermissions?.canWrite !== false}
                            onDragStart={(e) => handleOnDragStart(e, task._id)}
                          >
                            <div className="card-header">
                              <span className="card-title">{task.title}</span>
                              <span className={`priority-tag ${task.priority}`}>{task.priority}</span>
                            </div>
                            <p className="card-desc">{task.description}</p>
                            
                            <div className="card-footer">
                              <div className="card-assignee">
                                <User size={10} />
                                <span>{task.assigneeName || 'Unassigned'}</span>
                              </div>
                              {userPermissions?.canWrite !== false && (
                                <button 
                                  className="btn-danger" 
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.7rem' }}
                                  onClick={() => handleDeleteTask(task._id)}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 2. CHAT & BOT TAB */}
          {activeTab === 'chat' && (
            <div className="chat-tab-container">
              <div className="chat-window">
                <div className="chat-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
                    <strong style={{ fontSize: '0.95rem' }}>Room Chat Room</strong>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Type <code style={{ color: 'var(--secondary)', background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '4px' }}>@ai</code> to ask Beaver AI companion
                  </span>
                </div>

                <div className="chat-messages">
                  {chatMessages.map(msg => (
                    <div 
                      key={msg._id} 
                      className={`message-bubble ${msg.sender.id === user?._id ? 'me' : msg.isAi ? 'ai' : 'other'}`}
                    >
                      <div className="message-info">
                        <strong>{msg.sender.name}</strong> 
                        <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>{msg.sender?.employeeId}</span>
                        <span>• {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div 
                        className="message-content"
                        dangerouslySetInnerHTML={{ 
                          // Very basic rendering of bold formatting in mock ai
                          __html: msg.text
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/### (.*?)\n/g, '<h3>$1</h3>')
                            .replace(/\* (.*?)\n/g, '<li>$1</li>')
                            .replace(/`([^`]+)`/g, '<code>$1</code>')
                        }}
                      />
                    </div>
                  ))}
                  
                  {aiTyping && (
                    <div className="message-bubble ai">
                      <div className="message-info">
                        <strong>Beaver AI</strong>
                        <span>(AI Companion)</span>
                      </div>
                      <div className="message-content" style={{ display: 'flex', padding: '0.5rem 1rem' }}>
                        <div className="ai-typing-indicator">
                          <span>Beaver AI is compiling analysis</span>
                          <div className="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {userPermissions?.canWrite === false ? (
                  <div className="chat-input-locked" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      🔒 You are in view-only mode. Request write access to join the chat.
                    </span>
                    {workspace.permissionRequests?.find(r => r.userId === user?._id && r.requestType === 'write' && r.status === 'pending') ||
                     workspace.permissionRequests?.find(r => r.userId === user?._id && r.requestType === 'both' && r.status === 'pending') ? (
                      <span style={{ color: 'var(--warning)', fontWeight: '600', fontSize: '0.8rem' }}>
                        ⏳ Write request pending
                      </span>
                    ) : (
                      <button 
                        type="button"
                        className="btn btn-primary" 
                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleRequestAccess('write')}
                      >
                        Request Write Access
                      </button>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="chat-input-area">
                    <input 
                      type="text" 
                      className="chat-input" 
                      placeholder="Share task status updates or type @ai for advice..." 
                      value={typedMessage}
                      onChange={e => setTypedMessage(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary">Send</button>
                  </form>
                )}
              </div>

              {/* Members Directory Sidebar */}
              <div className="members-sidebar">
                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>Core Team Catalog</h3>
                <div className="member-list">
                  {allUsers.filter(u => workspace.members.includes(u._id)).map(member => (
                    <div key={member._id} className="member-item">
                      <div className="member-avatar">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="member-details">
                        <h5>{member.name} {member._id === workspace.boss && '👑 (Creator)'}</h5>
                        <p>ID: {member.employeeId}</p>
                        <p style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', color: 'var(--text-secondary)' }}>
                          <Mail size={10} /> {member.email}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 3. SHARED FILE LOCKER TAB */}
          {activeTab === 'files' && (
            <div className="files-tab-container">
              <div className="files-catalog">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.1rem' }}>Shared Digital Asset Vault</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{files.length} assets logged</span>
                </div>

                {files.length === 0 ? (
                  <div className="empty-state">
                    <Folder size={48} className="empty-state-icon" />
                    <h4>File vault is completely empty.</h4>
                    <p>Drag and drop assets into the upload dropzone to share documents or images with employees.</p>
                  </div>
                ) : (
                  <div className="files-grid">
                    {files.map(file => (
                      <a 
                        key={file._id} 
                        href={file.url} 
                        download={file.name} 
                        className={`file-card ${getMimeClass(file.type)}`}
                      >
                        <div className="file-icon-box">
                          {renderFileIcon(file.type)}
                        </div>
                        <span className="file-name" title={file.name}>{file.name}</span>
                        <span className="file-meta">{(file.size / 1024).toFixed(1)} KB</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                          Uploaded by: {file.uploadedByName}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Base64 Drag & Drop Panel */}
              <div className="file-uploader-box">
                <h3 style={{ fontSize: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>Asset Vault Upload</h3>
                {userPermissions?.canWrite === false ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    border: '1px dashed rgba(239, 68, 68, 0.2)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(239, 68, 68, 0.02)',
                    color: 'var(--text-secondary)',
                    marginTop: '1rem'
                  }}>
                    <ShieldAlert size={28} style={{ color: 'var(--danger)', marginBottom: '0.5rem' }} />
                    <h5 style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#fca5a5' }}>Upload Restricted</h5>
                    <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>You have read-only access to this file vault.</p>
                  </div>
                ) : (
                  <div 
                    className="upload-dropzone"
                    onDragOver={handleDragOverFile}
                    onDragLeave={handleDragLeaveFile}
                    onDrop={handleDropFile}
                    style={{ borderColor: dragging ? 'var(--primary)' : '' }}
                  >
                    <Folder size={32} style={{ color: 'var(--text-muted)' }} />
                    <p>Drag & Drop file here</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Or select from computer</span>
                    <input 
                      type="file" 
                      onChange={e => processFileUpload(e.target.files[0])}
                      style={{ display: 'block', fontSize: '0.75rem', opacity: '0.7', width: '100%', marginTop: '0.5rem' }} 
                    />
                  </div>
                )}
                {uploadProgress && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', textAlign: 'center', background: 'rgba(6, 182, 212, 0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                    {uploadProgress}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. AUDIT & PRIVILEGE CONTROLS */}
          {activeTab === 'audits' && (
            <div className="audit-tab-container">
              {/* Member Access Control Dashboard */}
              {userPermissions?.isAdmin && (
                <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#f8fafc', fontWeight: '700' }}>👥 Member Access Control</h3>
                  <div className="audit-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Emp ID</th>
                          <th>Admin Status</th>
                          <th>Read Access</th>
                          <th>Write Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.filter(u => workspace.members.includes(u._id)).map(member => {
                          const isCreator = member._id === workspace.boss;
                          const isAdmin = workspace.admins?.includes(member._id);
                          const perm = workspace.memberPermissions?.find(p => p.userId === member._id) || { canRead: true, canWrite: true };
                          
                          return (
                            <tr key={member._id}>
                              <td>
                                <strong>{member.name}</strong> {isCreator && '👑 (Creator)'}
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{member.email}</div>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontFamily: 'var(--font-display)' }}>{member?.employeeId || '—'}</span>
                              </td>
                              <td>
                                <label className="switch" style={{ opacity: isCreator ? '0.5' : '1', cursor: isCreator ? 'not-allowed' : 'pointer' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isCreator || isAdmin} 
                                    disabled={isCreator}
                                    onChange={e => handleUpdateMemberAccess(member._id, { isAdmin: e.target.checked })}
                                  />
                                  <span className="slider"></span>
                                </label>
                              </td>
                              <td>
                                <label className="switch" style={{ opacity: isCreator ? '0.5' : '1', cursor: isCreator ? 'not-allowed' : 'pointer' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isCreator || perm.canRead} 
                                    disabled={isCreator}
                                    onChange={e => handleUpdateMemberAccess(member._id, { canRead: e.target.checked })}
                                  />
                                  <span className="slider"></span>
                                </label>
                              </td>
                              <td>
                                <label className="switch" style={{ opacity: isCreator ? '0.5' : '1', cursor: isCreator ? 'not-allowed' : 'pointer' }}>
                                  <input 
                                    type="checkbox" 
                                    checked={isCreator || perm.canWrite} 
                                    disabled={isCreator}
                                    onChange={e => handleUpdateMemberAccess(member._id, { canWrite: e.target.checked })}
                                  />
                                  <span className="slider"></span>
                                </label>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Pending Access Requests Dashboard */}
              {userPermissions?.isAdmin && (
                <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--border-glass)' }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#f8fafc', fontWeight: '700' }}>⏳ Pending Access Requests</h3>
                  
                  {(!workspace.permissionRequests || workspace.permissionRequests.filter(r => r.status === 'pending').length === 0) ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>
                      No pending access requests at the moment.
                    </p>
                  ) : (
                    <div className="audit-table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      <table className="audit-table">
                        <thead>
                          <tr>
                            <th>Requester</th>
                            <th>Access Requested</th>
                            <th>Timestamp</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workspace.permissionRequests.filter(r => r.status === 'pending').map(req => (
                            <tr key={req.requestId}>
                              <td>
                                <strong>{req.userName}</strong>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{req.userEmail}</div>
                              </td>
                              <td>
                                <span className="role-tag" style={{
                                  background: (req.requestType || 'both') === 'both' ? 'rgba(6,182,212,0.15)' : (req.requestType || 'both') === 'write' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                                  color: (req.requestType || 'both') === 'both' ? 'var(--secondary)' : (req.requestType || 'both') === 'write' ? '#60a5fa' : '#34d399',
                                  fontSize: '0.7rem'
                                }}>
                                  {(req.requestType || 'both').toUpperCase()} ACCESS
                                </span>
                              </td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                {new Date(req.createdAt).toLocaleString()}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  <button 
                                    className="btn btn-primary"
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                                    onClick={() => handleProcessRequest(req.requestId, 'approve')}
                                  >
                                    Approve
                                  </button>
                                  <button 
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem', color: '#ef4444' }}
                                    onClick={() => handleProcessRequest(req.requestId, 'reject')}
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Permission control panel */}
              {userPermissions?.isAdmin && (
                <div className="permission-toggle-panel">
                  <div>
                    <h3 className="switch-label">Employee Task Assignments</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      If enabled, employees can assign Kanban tasks to other team members. If disabled, employees can only assign tasks to themselves.
                    </p>
                  </div>
                  <div className="toggle-switch-container">
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: workspace.employeeAssignPermissions ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {workspace.employeeAssignPermissions ? 'PERMITTED' : 'RESTRICTED'}
                    </span>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={workspace.employeeAssignPermissions} 
                        onChange={e => handleTogglePermissions(e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              )}

              {/* Audit Logs Table */}
              <div className="audit-actions">
                <h3 style={{ fontSize: '1.1rem' }}>Structured compliance logs (MySQL database audits)</h3>
                <button className="btn btn-primary" onClick={handleDownloadCsv}>
                  <Download size={16} /> Export spreadsheet CSV
                </button>
              </div>

              <div className="audit-table-wrapper">
                {auditLogs.length === 0 ? (
                  <div className="empty-state">
                    <Shield size={48} className="empty-state-icon" />
                    <h4>No compliance records logged yet.</h4>
                  </div>
                ) : (
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Actor Name</th>
                        <th>Emp ID</th>
                        <th>Action Type</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td style={{ color: 'var(--text-secondary)' }}>{new Date(log.createdAt || log.timestamp).toLocaleString()}</td>
                          <td>
                            <strong>{log.actorName}</strong>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{log.actorEmail}</div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontFamily: 'var(--font-display)' }}>{log.actorEmployeeId || log.actorRole || '—'}</span>
                          </td>
                          <td>
                            <span className={`action-badge ${
                              (log.actionType || '').includes('CREATE') ? 'create' :
                              (log.actionType || '').includes('MOVE') ? 'move' :
                              (log.actionType || '').includes('DELETE') ? 'delete' : 'auth'
                            }`}>
                              {log.actionType || 'UNKNOWN'}
                            </span>
                          </td>
                          <td>{log.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Kanban Create Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <h2 style={{ marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Add Kanban Card</h2>
            {taskError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem', color: '#fca5a5', marginBottom: '1rem' }}>
                {taskError}
              </div>
            )}
            <form onSubmit={handleAddTask}>
              <div className="glass-input-group">
                <label>Card Title Name</label>
                <input 
                  type="text" 
                  className="glass-input" 
                  placeholder="Design Landing Grid" 
                  value={taskTitle} 
                  onChange={e => setTaskTitle(e.target.value)} 
                  required 
                />
              </div>

              <div className="glass-input-group">
                <label>Task Scope Description</label>
                <textarea 
                  className="glass-input" 
                  placeholder="Set up modern css layout variables and responsive media parameters." 
                  value={taskDesc} 
                  onChange={e => setTaskDesc(e.target.value)} 
                  rows={2}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="glass-input-group">
                  <label>Swimlane Priority</label>
                  <select 
                    className="glass-input" 
                    value={taskPriority} 
                    onChange={e => setTaskPriority(e.target.value)}
                    style={{ background: '#0e1017' }}
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                  </select>
                </div>

                <div className="glass-input-group">
                  <label>Team Allocation Assignee</label>
                  <select 
                    className="glass-input" 
                    value={taskAssignee} 
                    onChange={e => setTaskAssignee(e.target.value)}
                    style={{ background: '#0e1017' }}
                  >
                    <option value="">Unassigned Pool</option>
                    {allUsers.filter(u => workspace.members.includes(u._id)).map(u => (
                      <option key={u._id} value={u._id}>
                        {u.name} [{u.employeeId}]
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="glass-input-group">
                <label>Target Deadline Date</label>
                <input 
                  type="date" 
                  className="glass-input" 
                  value={taskDueDate} 
                  onChange={e => setTaskDueDate(e.target.value)} 
                />
              </div>

              {/* Warning note for employees based on permission toggle */}
              {!userPermissions?.isAdmin && !workspace.employeeAssignPermissions && (
                <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245,158,11,0.2)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#fde047', marginBottom: '1rem' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>Note: Task assignment permissions are disabled. You can only assign cards to yourself. Assigning to others will trigger access restrictions.</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Allocate Card</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Boss Workspace Report Modal */}
      {showReportModal && (
        <div className="modal-overlay" onClick={() => setShowReportModal(false)}>
          <div className="report-overlay-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-display)' }}>
                <Cpu size={24} style={{ color: 'var(--secondary)' }} /> Beaver AI Workspace Consultant
              </h2>
              <button className="btn btn-secondary" onClick={() => setShowReportModal(false)}>Dismiss</button>
            </div>

            {loadingReport ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0', gap: '1rem' }}>
                <div className="ai-typing-indicator">
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Analyzing Kanban status, team workload metrics, and audit files...</p>
              </div>
            ) : (
              <div 
                className="report-content"
                dangerouslySetInnerHTML={{ 
                  __html: aiReport
                    .replace(/\n# (.*?)\n/g, '<h1>$1</h1>')
                    .replace(/\n## (.*?)\n/g, '<h2>$1</h2>')
                    .replace(/\n### (.*?)\n/g, '<h3>$1</h3>')
                    .replace(/\n#### (.*?)\n/g, '<h4>$1</h4>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\n\* (.*?)\n/g, '\n<li>$1</li>')
                    .replace(/\n\d+\. (.*?)\n/g, '\n<li>$1</li>')
                    .replace(/\n---/g, '<hr/>')
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
