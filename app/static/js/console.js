/**
 * mc-webui Console - Chat-style meshcli interface
 *
 * Provides interactive command console for meshcli via WebSocket.
 * Commands are sent to meshcore-bridge and responses are displayed
 * in a chat-like format.
 */

let socket = null;
let isConnected = false;
let commandHistory = [];
let historyIndex = -1;
let pendingCommandDiv = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Console page initialized');
    connectWebSocket();
    setupInputHandlers();
});

/**
 * Connect to WebSocket server on meshcore-bridge
 */
function connectWebSocket() {
    updateStatus('connecting');

    // Get WebSocket URL - bridge runs on port 5001
    // Use same hostname as current page but different port
    const bridgeUrl = window.MC_CONFIG?.bridgeWsUrl ||
                      `${window.location.protocol}//${window.location.hostname}:5001`;

    console.log('Connecting to WebSocket:', bridgeUrl);

    try {
        socket = io(bridgeUrl + '/console', {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        // Connection events
        socket.on('connect', () => {
            console.log('WebSocket connected');
            isConnected = true;
            updateStatus('connected');
            enableInput(true);
            addMessage('Connected to meshcli', 'system');
        });

        socket.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            isConnected = false;
            updateStatus('disconnected');
            enableInput(false);
            addMessage('Disconnected from meshcli', 'error');

            // Clear pending command indicator
            if (pendingCommandDiv) {
                pendingCommandDiv.classList.remove('pending');
                pendingCommandDiv = null;
            }
        });

        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            updateStatus('disconnected');
        });

        // Console events from server
        socket.on('console_status', (data) => {
            console.log('Console status:', data);
            if (data.message) {
                addMessage(data.message, 'system');
            }
        });

        socket.on('command_response', (data) => {
            console.log('Command response:', data);

            // Clear pending indicator
            if (pendingCommandDiv) {
                pendingCommandDiv.classList.remove('pending');
                pendingCommandDiv = null;
            }

            // Display response
            if (data.success) {
                const output = data.output || '(no output)';
                addMessage(output, 'response');
            } else {
                addMessage(`Error: ${data.error}`, 'error');
            }
            scrollToBottom();
        });

    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        updateStatus('disconnected');
        addMessage('Failed to connect: ' + error.message, 'error');
    }
}

/**
 * Setup input form handlers
 */
function setupInputHandlers() {
    const form = document.getElementById('consoleForm');
    const input = document.getElementById('commandInput');

    // Form submit
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        sendCommand();
    });

    // Command history navigation with arrow keys
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateHistory(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateHistory(1);
        }
    });
}

/**
 * Send command to meshcli
 */
function sendCommand() {
    const input = document.getElementById('commandInput');
    const command = input.value.trim();

    if (!command || !isConnected) {
        return;
    }

    // Add to history (avoid duplicates at end)
    if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command) {
        commandHistory.push(command);
        // Limit history size
        if (commandHistory.length > 100) {
            commandHistory.shift();
        }
    }
    historyIndex = commandHistory.length;

    // Show command in chat with pending indicator
    pendingCommandDiv = addMessage(command, 'command pending');

    // Send to server
    socket.emit('send_command', { command: command });

    // Clear input
    input.value = '';
    scrollToBottom();
}

/**
 * Navigate command history
 * @param {number} direction -1 for older, 1 for newer
 */
function navigateHistory(direction) {
    const input = document.getElementById('commandInput');

    if (commandHistory.length === 0) {
        return;
    }

    historyIndex += direction;

    // Clamp to valid range
    if (historyIndex < 0) {
        historyIndex = 0;
    }
    if (historyIndex >= commandHistory.length) {
        historyIndex = commandHistory.length;
        input.value = '';
        return;
    }

    input.value = commandHistory[historyIndex];

    // Move cursor to end
    setTimeout(() => {
        input.selectionStart = input.selectionEnd = input.value.length;
    }, 0);
}

/**
 * Add message to console display
 * @param {string} text Message text
 * @param {string} type Message type: 'command', 'response', 'error', 'system'
 * @returns {HTMLElement} The created message div
 */
function addMessage(text, type) {
    const container = document.getElementById('consoleMessages');
    const div = document.createElement('div');
    div.className = `console-message ${type}`;
    div.textContent = text;
    container.appendChild(div);
    return div;
}

/**
 * Scroll messages container to bottom
 */
function scrollToBottom() {
    const container = document.getElementById('consoleMessages');
    // Use setTimeout to ensure DOM is updated
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 10);
}

/**
 * Update connection status indicator
 * @param {string} status 'connected', 'disconnected', or 'connecting'
 */
function updateStatus(status) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (!dot || !text) return;

    dot.className = `status-dot ${status}`;

    switch (status) {
        case 'connected':
            text.textContent = 'Connected';
            text.className = 'text-success';
            break;
        case 'disconnected':
            text.textContent = 'Disconnected';
            text.className = 'text-danger';
            break;
        case 'connecting':
            text.textContent = 'Connecting...';
            text.className = 'text-warning';
            break;
    }
}

/**
 * Enable or disable input controls
 * @param {boolean} enabled
 */
function enableInput(enabled) {
    const input = document.getElementById('commandInput');
    const btn = document.getElementById('sendBtn');

    if (input) {
        input.disabled = !enabled;
        if (enabled) {
            input.focus();
        }
    }

    if (btn) {
        btn.disabled = !enabled;
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (socket) {
        socket.disconnect();
    }
});
