/**
 * Contact Management UI
 *
 * Features:
 * - Manual contact approval toggle (persistent across restarts)
 * - Pending contacts list with approve/copy actions
 * - Auto-refresh on page load
 * - Mobile-first design
 */

// =============================================================================
// State Management
// =============================================================================

let manualApprovalEnabled = false;
let pendingContacts = [];

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Contact Management UI initialized');

    // Attach event listeners
    attachEventListeners();

    // Load initial state
    loadSettings();
    loadPendingContacts();
});

function attachEventListeners() {
    // Manual approval toggle
    const approvalSwitch = document.getElementById('manualApprovalSwitch');
    if (approvalSwitch) {
        approvalSwitch.addEventListener('change', handleApprovalToggle);
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshPendingBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadPendingContacts();
        });
    }
}

// =============================================================================
// Settings Management
// =============================================================================

async function loadSettings() {
    try {
        const response = await fetch('/api/device/settings');
        const data = await response.json();

        if (data.success) {
            manualApprovalEnabled = data.settings.manual_add_contacts || false;
            updateApprovalUI(manualApprovalEnabled);
        } else {
            console.error('Failed to load settings:', data.error);
            showToast('Failed to load settings', 'danger');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Network error loading settings', 'danger');
    }
}

async function handleApprovalToggle(event) {
    const enabled = event.target.checked;

    try {
        const response = await fetch('/api/device/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                manual_add_contacts: enabled
            })
        });

        const data = await response.json();

        if (data.success) {
            manualApprovalEnabled = enabled;
            updateApprovalUI(enabled);
            showToast(
                enabled ? 'Manual approval enabled' : 'Manual approval disabled',
                'success'
            );

            // Reload pending contacts after toggle
            setTimeout(() => loadPendingContacts(), 500);
        } else {
            console.error('Failed to update setting:', data.error);
            showToast('Failed to update setting: ' + data.error, 'danger');

            // Revert toggle on failure
            event.target.checked = !enabled;
        }
    } catch (error) {
        console.error('Error updating setting:', error);
        showToast('Network error updating setting', 'danger');

        // Revert toggle on failure
        event.target.checked = !enabled;
    }
}

function updateApprovalUI(enabled) {
    const switchEl = document.getElementById('manualApprovalSwitch');
    const labelEl = document.getElementById('switchLabel');
    const infoEl = document.getElementById('approvalInfo');

    if (switchEl) {
        switchEl.checked = enabled;
    }

    if (labelEl) {
        labelEl.textContent = enabled
            ? 'Manual approval enabled'
            : 'Automatic approval (default)';
    }

    if (infoEl) {
        infoEl.style.display = enabled ? 'none' : 'inline-block';
    }
}

// =============================================================================
// Pending Contacts Management
// =============================================================================

async function loadPendingContacts() {
    const loadingEl = document.getElementById('pendingLoading');
    const emptyEl = document.getElementById('pendingEmpty');
    const listEl = document.getElementById('pendingList');
    const errorEl = document.getElementById('pendingError');
    const countBadge = document.getElementById('pendingCount');

    // Show loading state
    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '';
    if (errorEl) errorEl.style.display = 'none';
    if (countBadge) countBadge.style.display = 'none';

    try {
        const response = await fetch('/api/contacts/pending');
        const data = await response.json();

        if (loadingEl) loadingEl.style.display = 'none';

        if (data.success) {
            pendingContacts = data.pending || [];

            if (pendingContacts.length === 0) {
                // Show empty state
                if (emptyEl) emptyEl.style.display = 'block';
            } else {
                // Render pending contacts list
                renderPendingList(pendingContacts);

                // Update count badge
                if (countBadge) {
                    countBadge.textContent = pendingContacts.length;
                    countBadge.style.display = 'inline-block';
                }
            }
        } else {
            console.error('Failed to load pending contacts:', data.error);
            if (errorEl) {
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) errorMsg.textContent = data.error || 'Failed to load pending contacts';
                errorEl.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading pending contacts:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        if (errorEl) {
            const errorMsg = document.getElementById('errorMessage');
            if (errorMsg) errorMsg.textContent = 'Network error: ' + error.message;
            errorEl.style.display = 'block';
        }
    }
}

function renderPendingList(contacts) {
    const listEl = document.getElementById('pendingList');
    if (!listEl) return;

    listEl.innerHTML = '';

    contacts.forEach((contact, index) => {
        const card = createContactCard(contact, index);
        listEl.appendChild(card);
    });
}

function createContactCard(contact, index) {
    const card = document.createElement('div');
    card.className = 'pending-contact-card';
    card.id = `contact-${index}`;

    // Contact name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'contact-name';
    nameDiv.textContent = contact.name;

    // Public key (truncated)
    const keyDiv = document.createElement('div');
    keyDiv.className = 'contact-key';
    const truncatedKey = contact.public_key.substring(0, 16) + '...';
    keyDiv.textContent = truncatedKey;
    keyDiv.title = contact.public_key; // Full key on hover

    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'd-flex gap-2 flex-wrap';

    // Approve button
    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-success btn-action flex-grow-1';
    approveBtn.innerHTML = '<i class="bi bi-check-circle"></i> Approve';
    approveBtn.onclick = () => approveContact(contact, index);

    // Copy key button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-outline-secondary btn-action';
    copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> Copy Full Key';
    copyBtn.onclick = () => copyPublicKey(contact.public_key, copyBtn);

    actionsDiv.appendChild(approveBtn);
    actionsDiv.appendChild(copyBtn);

    card.appendChild(nameDiv);
    card.appendChild(keyDiv);
    card.appendChild(actionsDiv);

    return card;
}

async function approveContact(contact, index) {
    const cardEl = document.getElementById(`contact-${index}`);

    // Disable buttons during approval
    if (cardEl) {
        const buttons = cardEl.querySelectorAll('button');
        buttons.forEach(btn => btn.disabled = true);
    }

    try {
        const response = await fetch('/api/contacts/pending/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                public_key: contact.public_key  // ALWAYS use full public_key (works for CLI, ROOM, etc.)
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Approved: ${contact.name}`, 'success');

            // Remove from list with animation
            if (cardEl) {
                cardEl.style.opacity = '0';
                cardEl.style.transition = 'opacity 0.3s';
                setTimeout(() => {
                    cardEl.remove();

                    // Reload pending list to update count
                    loadPendingContacts();
                }, 300);
            }
        } else {
            console.error('Failed to approve contact:', data.error);
            showToast('Failed to approve: ' + data.error, 'danger');

            // Re-enable buttons
            if (cardEl) {
                const buttons = cardEl.querySelectorAll('button');
                buttons.forEach(btn => btn.disabled = false);
            }
        }
    } catch (error) {
        console.error('Error approving contact:', error);
        showToast('Network error: ' + error.message, 'danger');

        // Re-enable buttons
        if (cardEl) {
            const buttons = cardEl.querySelectorAll('button');
            buttons.forEach(btn => btn.disabled = false);
        }
    }
}

function copyPublicKey(publicKey, buttonEl) {
    navigator.clipboard.writeText(publicKey).then(() => {
        // Visual feedback
        const originalHTML = buttonEl.innerHTML;
        buttonEl.innerHTML = '<i class="bi bi-check"></i> Copied!';
        buttonEl.classList.remove('btn-outline-secondary');
        buttonEl.classList.add('btn-success');

        setTimeout(() => {
            buttonEl.innerHTML = originalHTML;
            buttonEl.classList.remove('btn-success');
            buttonEl.classList.add('btn-outline-secondary');
        }, 2000);

        showToast('Public key copied to clipboard', 'info');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy to clipboard', 'danger');
    });
}

// =============================================================================
// Toast Notifications
// =============================================================================

function showToast(message, type = 'info') {
    const toastEl = document.getElementById('contactToast');
    if (!toastEl) return;

    const bodyEl = toastEl.querySelector('.toast-body');
    if (!bodyEl) return;

    // Set message and style
    bodyEl.textContent = message;

    // Apply color based on type
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-info', 'bg-warning');
    toastEl.classList.remove('text-white');

    if (type === 'success' || type === 'danger' || type === 'warning') {
        toastEl.classList.add(`bg-${type}`, 'text-white');
    } else if (type === 'info') {
        toastEl.classList.add('bg-info', 'text-white');
    }

    // Show toast
    const toast = new bootstrap.Toast(toastEl, {
        autohide: true,
        delay: 3000
    });
    toast.show();
}
