/**
 * mc-webui Direct Messages JavaScript
 * Full-page DM view functionality
 */

// State variables
let currentConversationId = null;
let currentRecipient = null;
let dmConversations = [];
let dmLastSeenTimestamps = {};
let autoRefreshInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DM page initialized');

    // Load last seen timestamps from localStorage
    loadDmLastSeenTimestamps();

    // Setup event listeners
    setupEventListeners();

    // Load conversations into dropdown
    await loadConversations();

    // Check for initial conversation from URL parameter
    if (window.MC_CONFIG && window.MC_CONFIG.initialConversation) {
        const convId = window.MC_CONFIG.initialConversation;
        // Find the conversation in the list or use the ID directly
        selectConversation(convId);
    }

    // Setup auto-refresh
    setupAutoRefresh();

    updateStatus('connected', 'Ready');
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Conversation selector
    const selector = document.getElementById('dmConversationSelector');
    if (selector) {
        selector.addEventListener('change', function() {
            const convId = this.value;
            if (convId) {
                selectConversation(convId);
            } else {
                clearConversation();
            }
        });
    }

    // Send form
    const sendForm = document.getElementById('dmSendForm');
    if (sendForm) {
        sendForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await sendMessage();
        });
    }

    // Message input
    const input = document.getElementById('dmMessageInput');
    if (input) {
        input.addEventListener('input', updateCharCounter);

        // Enter key to send
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

/**
 * Load conversations from API
 */
async function loadConversations() {
    try {
        const response = await fetch('/api/dm/conversations?days=7');
        const data = await response.json();

        if (data.success) {
            dmConversations = data.conversations || [];
            populateConversationSelector();
        } else {
            console.error('Failed to load conversations:', data.error);
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

/**
 * Populate the conversation selector dropdown
 */
function populateConversationSelector() {
    const selector = document.getElementById('dmConversationSelector');
    if (!selector) return;

    // Clear existing options (keep first placeholder)
    selector.innerHTML = '<option value="">Select chat...</option>';

    if (dmConversations.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No conversations yet';
        opt.disabled = true;
        selector.appendChild(opt);
        return;
    }

    dmConversations.forEach(conv => {
        const opt = document.createElement('option');
        opt.value = conv.conversation_id;

        // Show unread indicator
        const lastSeen = dmLastSeenTimestamps[conv.conversation_id] || 0;
        const isUnread = conv.last_message_timestamp > lastSeen;

        let label = conv.display_name;
        if (isUnread) {
            label = `* ${label}`;
        }

        opt.textContent = label;
        selector.appendChild(opt);
    });

    // If we have a current conversation, select it
    if (currentConversationId) {
        selector.value = currentConversationId;
    }
}

/**
 * Select a conversation
 */
async function selectConversation(conversationId) {
    currentConversationId = conversationId;

    // Find the conversation to get recipient name
    const conv = dmConversations.find(c => c.conversation_id === conversationId);
    if (conv) {
        currentRecipient = conv.display_name;
    } else {
        // Extract name from conversation_id
        if (conversationId.startsWith('name_')) {
            currentRecipient = conversationId.substring(5);
        } else if (conversationId.startsWith('pk_')) {
            currentRecipient = conversationId.substring(3, 11) + '...';
        } else {
            currentRecipient = 'Unknown';
        }
    }

    // Update selector if not already selected
    const selector = document.getElementById('dmConversationSelector');
    if (selector && selector.value !== conversationId) {
        selector.value = conversationId;
    }

    // Enable input
    const input = document.getElementById('dmMessageInput');
    const sendBtn = document.getElementById('dmSendBtn');
    if (input) {
        input.disabled = false;
        input.placeholder = `Message ${currentRecipient}...`;
    }
    if (sendBtn) {
        sendBtn.disabled = false;
    }

    // Load messages
    await loadMessages();
}

/**
 * Clear conversation selection
 */
function clearConversation() {
    currentConversationId = null;
    currentRecipient = null;

    // Disable input
    const input = document.getElementById('dmMessageInput');
    const sendBtn = document.getElementById('dmSendBtn');
    if (input) {
        input.disabled = true;
        input.placeholder = 'Type a message...';
        input.value = '';
    }
    if (sendBtn) {
        sendBtn.disabled = true;
    }

    // Show empty state
    const container = document.getElementById('dmMessagesList');
    if (container) {
        container.innerHTML = `
            <div class="dm-empty-state">
                <i class="bi bi-envelope"></i>
                <p class="mb-1">Select a conversation</p>
                <small class="text-muted">Choose from the dropdown above or start a new chat from channel messages</small>
            </div>
        `;
    }

    updateCharCounter();
}

/**
 * Load messages for current conversation
 */
async function loadMessages() {
    if (!currentConversationId) return;

    const container = document.getElementById('dmMessagesList');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>';

    try {
        const response = await fetch(`/api/dm/messages?conversation_id=${encodeURIComponent(currentConversationId)}&limit=100`);
        const data = await response.json();

        if (data.success) {
            displayMessages(data.messages);

            // Update recipient if we got a better name
            if (data.display_name && data.display_name !== 'Unknown') {
                currentRecipient = data.display_name;
                const input = document.getElementById('dmMessageInput');
                if (input) {
                    input.placeholder = `Message ${currentRecipient}...`;
                }
            }

            // Mark as read
            if (data.messages && data.messages.length > 0) {
                const latestTs = Math.max(...data.messages.map(m => m.timestamp));
                markAsRead(currentConversationId, latestTs);
            }

            updateLastRefresh();
        } else {
            container.innerHTML = '<div class="text-center text-danger py-4">Error loading messages</div>';
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        container.innerHTML = '<div class="text-center text-danger py-4">Failed to load messages</div>';
    }
}

/**
 * Display messages in the container
 */
function displayMessages(messages) {
    const container = document.getElementById('dmMessagesList');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="dm-empty-state">
                <i class="bi bi-chat-dots"></i>
                <p>No messages yet</p>
                <small class="text-muted">Send a message to start the conversation</small>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `dm-message ${msg.is_own ? 'own' : 'other'}`;

        // Status icon for own messages
        let statusIcon = '';
        if (msg.is_own && msg.status) {
            const icons = {
                'pending': '<i class="bi bi-clock dm-status pending" title="Sending..."></i>',
                'delivered': '<i class="bi bi-check2 dm-status delivered" title="Delivered"></i>',
                'timeout': '<i class="bi bi-x-circle dm-status timeout" title="Not delivered"></i>'
            };
            statusIcon = icons[msg.status] || '';
        }

        // Metadata for incoming messages
        let meta = '';
        if (!msg.is_own) {
            const parts = [];
            if (msg.snr !== null && msg.snr !== undefined) {
                parts.push(`SNR: ${msg.snr.toFixed(1)}`);
            }
            if (msg.path_len !== null && msg.path_len !== undefined) {
                parts.push(`Hops: ${msg.path_len}`);
            }
            if (parts.length > 0) {
                meta = `<div class="dm-meta">${parts.join(' | ')}</div>`;
            }
        }

        div.innerHTML = `
            <div class="d-flex justify-content-between align-items-center" style="font-size: 0.7rem;">
                <span class="text-muted">${formatTime(msg.timestamp)}</span>
                ${statusIcon}
            </div>
            <div>${escapeHtml(msg.content)}</div>
            ${meta}
        `;

        container.appendChild(div);
    });

    // Scroll to bottom
    const scrollContainer = document.getElementById('dmMessagesContainer');
    if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
}

/**
 * Send a message
 */
async function sendMessage() {
    const input = document.getElementById('dmMessageInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !currentRecipient) return;

    const sendBtn = document.getElementById('dmSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
        const response = await fetch('/api/dm/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: currentRecipient,
                text: text
            })
        });

        const data = await response.json();

        if (data.success) {
            input.value = '';
            updateCharCounter();
            showNotification('Message sent', 'success');

            // Reload messages after short delay
            setTimeout(() => loadMessages(), 1000);
        } else {
            showNotification('Failed to send: ' + data.error, 'danger');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message', 'danger');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
        input.focus();
    }
}

/**
 * Setup auto-refresh
 */
function setupAutoRefresh() {
    const checkInterval = 10000; // 10 seconds

    autoRefreshInterval = setInterval(async () => {
        // Reload conversations to update unread indicators
        await loadConversations();

        // If viewing a conversation, reload messages
        if (currentConversationId) {
            await loadMessages();
        }
    }, checkInterval);

    console.log('Auto-refresh enabled');
}

/**
 * Update character counter
 */
function updateCharCounter() {
    const input = document.getElementById('dmMessageInput');
    const counter = document.getElementById('dmCharCounter');
    if (!input || !counter) return;

    const encoder = new TextEncoder();
    const byteLength = encoder.encode(input.value).length;
    counter.textContent = byteLength;

    if (byteLength > 180) {
        counter.classList.add('text-danger');
        counter.classList.remove('text-warning');
    } else if (byteLength > 150) {
        counter.classList.remove('text-danger');
        counter.classList.add('text-warning');
    } else {
        counter.classList.remove('text-danger', 'text-warning');
    }
}

/**
 * Load DM last seen timestamps from localStorage
 */
function loadDmLastSeenTimestamps() {
    try {
        const saved = localStorage.getItem('mc_dm_last_seen_timestamps');
        if (saved) {
            dmLastSeenTimestamps = JSON.parse(saved);
        }
    } catch (error) {
        console.error('Error loading last seen timestamps:', error);
        dmLastSeenTimestamps = {};
    }
}

/**
 * Save DM last seen timestamps to localStorage
 */
function saveDmLastSeenTimestamps() {
    try {
        localStorage.setItem('mc_dm_last_seen_timestamps', JSON.stringify(dmLastSeenTimestamps));
    } catch (error) {
        console.error('Error saving last seen timestamps:', error);
    }
}

/**
 * Mark conversation as read
 */
function markAsRead(conversationId, timestamp) {
    dmLastSeenTimestamps[conversationId] = timestamp;
    saveDmLastSeenTimestamps();

    // Update dropdown to remove unread indicator
    populateConversationSelector();
}

/**
 * Update status indicator
 */
function updateStatus(status, message) {
    const statusEl = document.getElementById('dmStatusText');
    if (!statusEl) return;

    const statusColors = {
        'connected': 'success',
        'disconnected': 'danger',
        'connecting': 'warning'
    };

    const color = statusColors[status] || 'secondary';
    statusEl.innerHTML = `<i class="bi bi-circle-fill text-${color}"></i> ${message}`;
}

/**
 * Update last refresh time
 */
function updateLastRefresh() {
    const el = document.getElementById('dmLastRefresh');
    if (el) {
        el.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    }
}

/**
 * Format timestamp to readable time
 */
function formatTime(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
               ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show a toast notification
 */
function showNotification(message, type = 'info') {
    const toastEl = document.getElementById('notificationToast');
    if (!toastEl) return;

    const toastBody = toastEl.querySelector('.toast-body');
    if (toastBody) {
        toastBody.textContent = message;
    }

    // Update toast header color based on type
    const toastHeader = toastEl.querySelector('.toast-header');
    if (toastHeader) {
        toastHeader.className = 'toast-header';
        if (type === 'success') {
            toastHeader.classList.add('bg-success', 'text-white');
        } else if (type === 'danger') {
            toastHeader.classList.add('bg-danger', 'text-white');
        } else if (type === 'warning') {
            toastHeader.classList.add('bg-warning');
        }
    }

    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
}
