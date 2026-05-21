const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:5004/api/audits';

async function logAudit(workspaceCode, actorName, actorEmail, actorRole, actionType, details, actorEmployeeId) {
  try {
    // Fire-and-forget API call to Audit Service
    fetch(AUDIT_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workspaceCode: workspaceCode || 'GLOBAL',
        actorName,
        actorEmail,
        actorRole,
        actorEmployeeId: actorEmployeeId || null,
        actionType,
        details
      })
    }).catch(err => {
      // Catch network-level fetch errors
      console.warn(`⚠️ [Audit Helper] Could not reach Audit Service at ${AUDIT_SERVICE_URL}`);
    });
  } catch (e) {
    console.warn(`⚠️ [Audit Helper] Failed to trigger audit log: ${e.message}`);
  }
}

module.exports = logAudit;
