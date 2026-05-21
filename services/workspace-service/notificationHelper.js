const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5006/api/notifications/assign';

async function notifyTaskAssignment(task, assignerName) {
  if (!task.assignee) return; // No assignee, no notification

  try {
    fetch(NOTIFICATION_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskId: task._id,
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'medium',
        dueDate: task.dueDate || null,
        assigneeId: task.assignee,
        assigneeName: task.assigneeName || '',
        assignedByName: assignerName || task.assignedByName || 'A team member'
      })
    }).catch(err => {
      console.warn(`⚠️ [Notification Helper] Could not reach Notification Service at ${NOTIFICATION_SERVICE_URL}:`, err.message);
    });
  } catch (e) {
    console.warn(`⚠️ [Notification Helper] Failed to trigger assignment email: ${e.message}`);
  }
}

module.exports = {
  notifyTaskAssignment
};
