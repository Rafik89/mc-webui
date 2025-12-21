# PRD: mc-webui

## Product Requirements Document

**Version:** 1.0  
**Date:** 2025-01-21  
**Author:** Marek / Claude AI  

---

## 1. Project Overview

### 1.1 Project Name
**mc-webui** - A simple web interface for meshcore-cli

### 1.2 Description
mc-webui is a lightweight web application that provides convenient access to the MeshCore network without requiring terminal/SSH access. The application serves as a wrapper around meshcore-cli, offering a user-friendly interface for viewing messages, sending communications, and basic contact management.

### 1.3 Problem Statement
Currently, using the MeshCore network via a Heltec V4 device connected to a Debian server requires:
- SSH connection to the virtual machine
- Knowledge of meshcore-cli commands
- Manual command entry in the terminal

mc-webui eliminates these barriers by providing browser-based access from any device on the local network.

### 1.4 Target Users
- Single user (single-user deployment)
- Access from multiple devices (computer, tablet, phone) via web browser
- Environment: trusted local network (no authentication requirement)

### 1.5 Existing Solutions
| Project | Assessment | Why It Doesn't Fit |
|---------|------------|-------------------|
| meshcore-hub | Feature-rich | Requires MQTT, too complex for single-user |
| MeshCore App (Flutter) | Official app | Requires BLE/WiFi, doesn't work with Serial over network |
| MeshTUI | Terminal UI | Still requires SSH |

mc-webui fills the niche of a **simple, lightweight web solution** for a single device.

---

## 2. Goals and Assumptions

### 2.1 Primary Goals (MVP)
1. **View messages** - display chat history from the Public channel
2. **Send messages** - publish to the Public channel
3. **Reply to users** - using `@[UserName] content` format
4. **Manage contacts** - clean up inactive contacts

### 2.2 Technical Assumptions
- **Backend:** Python 3.11+ with Flask
- **Frontend:** HTML5, Bootstrap 5, vanilla JavaScript
- **Deployment:** Docker / Docker Compose
- **MeshCore communication:** subprocess calls to `meshcli`
- **Data source:** `~/.config/meshcore/<device_name>.msgs` file
- **Refresh rate:** automatic every 60 seconds + manual button

### 2.3 Design Assumptions
- Minimalism - only essential features at launch
- Simple configuration - environment variables
- Responsive design - works on phone and desktop
- No authentication - trusted local network

---

## 3. Technical Architecture

### 3.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Host (Debian VM)                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Docker Container                        │  │
│  │  ┌─────────────┐      ┌─────────────┐                     │  │
│  │  │   Flask     │◄────►│  meshcli    │                     │  │
│  │  │   Backend   │      │  (subprocess)                     │  │
│  │  └──────┬──────┘      └──────┬──────┘                     │  │
│  │         │                    │                             │  │
│  │         ▼                    ▼                             │  │
│  │  ┌─────────────┐      ┌─────────────┐                     │  │
│  │  │  Bootstrap  │      │  .msgs file │                     │  │
│  │  │  Frontend   │      │  (mounted)  │                     │  │
│  │  └─────────────┘      └─────────────┘                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                    ┌─────────────────┐                          │
│                    │   Heltec V4     │                          │
│                    │   (USB Serial)  │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ HTTP :5000
         ▼
┌─────────────────┐
│     Browser     │
│   (LAN/VPN)     │
└─────────────────┘
```

### 3.2 Components

#### 3.2.1 Backend (Flask)
- **HTTP server** on port 5000
- **REST API** for frontend communication
- **meshcli wrapper** - command execution via subprocess
- **Parser for .msgs** - reading and parsing JSON Lines file

#### 3.2.2 Frontend (Bootstrap 5)
- **Chat view** - message list in messenger style
- **Send form** - text input field + button
- **Management panel** - contact cleanup
- **Auto-refresh** - JavaScript polling every 60s

#### 3.2.3 meshcore-cli Integration
Commands executed via subprocess:
```bash
# Fetch messages (trigger sync)
meshcli -s <SERIAL_PORT> recv

# Send to Public channel
meshcli -s <SERIAL_PORT> public "message content"

# Reply to user
meshcli -s <SERIAL_PORT> public "@[UserName] content"

# Clean up inactive contacts
meshcli -s <SERIAL_PORT> "apply_to u<48h,t=1 remove_contact"

# Get contact list
meshcli -s <SERIAL_PORT> contacts
```

### 3.3 Project File Structure

```
mc-webui/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── app/
│   ├── __init__.py
│   ├── main.py              # Flask entry point
│   ├── config.py            # Configuration
│   ├── meshcore/
│   │   ├── __init__.py
│   │   ├── cli.py           # meshcli wrapper (subprocess)
│   │   └── parser.py        # .msgs file parser
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── api.py           # API endpoints
│   │   └── views.py         # HTML views
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css    # Custom styles
│   │   └── js/
│   │       └── app.js       # Frontend logic
│   └── templates/
│       ├── base.html        # Base template
│       ├── index.html       # Main chat view
│       └── components/
│           ├── message.html # Message component
│           └── navbar.html  # Navigation
├── requirements.txt
├── .env.example
├── README.md
└── PRD.md
```

---

## 4. Functional Requirements (MVP)

### 4.1 Module: Message Viewing

| ID | Requirement | Priority |
|----|-------------|----------|
| F1.1 | System displays message list from .msgs file | MUST |
| F1.2 | Messages are sorted chronologically (newest at bottom) | MUST |
| F1.3 | Each message contains: sender, content, timestamp | MUST |
| F1.4 | Own messages are visually distinguished (e.g., different side) | SHOULD |
| F1.5 | Auto-scroll to newest message | SHOULD |
| F1.6 | Display emoji (Unicode) | SHOULD |

**Message format in .msgs (JSON Lines):**
```json
{"type": "CHAN", "SNR": 10.5, "channel_idx": 0, "text": "UserName: content", "timestamp": 1766300846}
{"type": "SENT_CHAN", "channel_idx": 0, "text": "content", "name": "MarWoj", "timestamp": 1766309413}
```

### 4.2 Module: Message Sending

| ID | Requirement | Priority |
|----|-------------|----------|
| F2.1 | Form with text field and "Send" button | MUST |
| F2.2 | Send via Enter (Shift+Enter = new line) | SHOULD |
| F2.3 | Validation - non-empty field | MUST |
| F2.4 | Status feedback (success/error) | MUST |
| F2.5 | Clear field after sending | MUST |

### 4.3 Module: Replying to Users

| ID | Requirement | Priority |
|----|-------------|----------|
| F3.1 | "Reply" button on each message | MUST |
| F3.2 | Click inserts `@[UserName] ` into text field | MUST |
| F3.3 | Focus moves to text field | SHOULD |

### 4.4 Module: Contact Management

| ID | Requirement | Priority |
|----|-------------|----------|
| F4.1 | "Clean inactive contacts" button | MUST |
| F4.2 | Configurable inactivity hours (default 48h) | SHOULD |
| F4.3 | Confirmation before execution (modal) | MUST |
| F4.4 | Feedback on number of removed contacts | SHOULD |

### 4.5 Module: Data Refresh

| ID | Requirement | Priority |
|----|-------------|----------|
| F5.1 | Automatic refresh every 60 seconds | MUST |
| F5.2 | Manual refresh button | MUST |
| F5.3 | Last refresh indicator | SHOULD |
| F5.4 | Loading indicator during refresh | SHOULD |

---

## 5. Non-Functional Requirements

### 5.1 Performance
| ID | Requirement |
|----|-------------|
| NF1.1 | API response time < 2 seconds |
| NF1.2 | Handle .msgs file up to 10,000 messages |
| NF1.3 | Minimal resource usage (< 100MB RAM) |

### 5.2 Usability
| ID | Requirement |
|----|-------------|
| NF2.1 | Responsive design (mobile-first) |
| NF2.2 | Readable on screens 320px - 2560px |
| NF2.3 | Basic view works without JavaScript (graceful degradation) |

### 5.3 Reliability
| ID | Requirement |
|----|-------------|
| NF3.1 | Handle meshcli errors (timeout, device unavailable) |
| NF3.2 | Log errors to stdout/stderr (Docker logs) |
| NF3.3 | Automatic container restart on failure |

### 5.4 Security
| ID | Requirement |
|----|-------------|
| NF4.1 | No authentication (trusted network) - deliberate decision |
| NF4.2 | Input sanitization (injection protection) |
| NF4.3 | No sensitive data storage |

---

## 6. User Interface

### 6.1 Wireframe - Main View

```
┌────────────────────────────────────────────────────────────┐
│  mc-webui                            [↻ Refresh] [⚙️]      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 12:30  MarioTJE🤖                                    │  │
│  │        Hey everyone                            [↩️]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 12:35  BBKr                                          │  │
│  │        @[Mruk-A] no it's ID conflict 01        [↩️]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│                    ┌────────────────────────────────────┐  │
│                    │ 12:40  MarWoj (You)                │  │
│                    │        Good morning everyone       │  │
│                    └────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 12:45  Zen                                           │  │
│  │        Good morning everyone, greetings         [↩️]  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐ ┌────────┐  │
│  │ Type a message...                        │ │  Send  │  │
│  └──────────────────────────────────────────┘ └────────┘  │
├────────────────────────────────────────────────────────────┤
│  Last refresh: 12:46:30    Next in: 45s                   │
└────────────────────────────────────────────────────────────┘
```

### 6.2 Wireframe - Settings Panel (modal/dropdown)

```
┌─────────────────────────────────────┐
│  ⚙️ Settings                     ✕  │
├─────────────────────────────────────┤
│                                     │
│  Contact Management                 │
│  ─────────────────────────────────  │
│  Remove contacts inactive for:      │
│  [ 48 ] hours                       │
│                                     │
│  [🗑️ Clean Inactive Contacts]       │
│                                     │
│  ─────────────────────────────────  │
│  Device Information                 │
│  Name: MarWoj                       │
│  Port: /dev/serial/by-id/usb-...    │
│                                     │
└─────────────────────────────────────┘
```

### 6.3 Colors and Style
- **Theme:** Light (dark mode possibility in future)
- **Primary colors:** 
  - Primary: #0d6efd (Bootstrap blue)
  - Own messages: light blue background (#e7f1ff)
  - Others' messages: white/gray background (#f8f9fa)
- **Fonts:** System fonts (Bootstrap defaults)
- **Icons:** Bootstrap Icons

---

## 7. Configuration

### 7.1 Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `MC_SERIAL_PORT` | Path to serial device | `/dev/ttyUSB0` |
| `MC_DEVICE_NAME` | Device name (for .msgs file) | `MeshCore` |
| `MC_CONFIG_DIR` | meshcore configuration directory | `/root/.config/meshcore` |
| `MC_REFRESH_INTERVAL` | Refresh interval (seconds) | `60` |
| `MC_INACTIVE_HOURS` | Inactivity hours for cleanup | `48` |
| `FLASK_HOST` | Listen address | `0.0.0.0` |
| `FLASK_PORT` | Application port | `5000` |
| `FLASK_DEBUG` | Debug mode | `false` |

### 7.2 Example .env File

```env
# MeshCore device configuration
MC_SERIAL_PORT=/dev/serial/by-id/usb-Espressif_Systems_heltec_wifi_lora_32_v4__16_MB_FLASH__2_MB_PSRAM__90706984A000-if00
MC_DEVICE_NAME=MarWoj
MC_CONFIG_DIR=/root/.config/meshcore

# Application settings
MC_REFRESH_INTERVAL=60
MC_INACTIVE_HOURS=48

# Flask
FLASK_HOST=0.0.0.0
FLASK_PORT=5000
FLASK_DEBUG=false
```

### 7.3 Docker Compose

```yaml
version: '3.8'

services:
  mc-webui:
    build: .
    container_name: mc-webui
    restart: unless-stopped
    ports:
      - "5000:5000"
    devices:
      - "${MC_SERIAL_PORT}:${MC_SERIAL_PORT}"
    volumes:
      - "${MC_CONFIG_DIR}:/root/.config/meshcore:rw"
    environment:
      - MC_SERIAL_PORT
      - MC_DEVICE_NAME
      - MC_REFRESH_INTERVAL
      - MC_INACTIVE_HOURS
      - FLASK_HOST
      - FLASK_PORT
    env_file:
      - .env
```

---

## 8. Implementation Plan

### Phase 0: Environment Setup (0.5 day)
- [ ] Create GitHub repository
- [ ] Project directory structure
- [ ] Docker and docker-compose configuration
- [ ] Install meshcore-cli in container
- [ ] Verify device connection

### Phase 1: Backend - Basics (1 day)
- [ ] Flask application skeleton
- [ ] Configuration from environment variables
- [ ] meshcli wrapper (subprocess)
- [ ] .msgs file parser
- [ ] Basic API endpoints:
  - `GET /api/messages` - message list
  - `POST /api/messages` - send message
  - `GET /api/status` - connection status

### Phase 2: Frontend - Chat View (1 day)
- [ ] Base template (Bootstrap 5)
- [ ] Message list view
- [ ] Distinguish own/others' messages
- [ ] Time formatting
- [ ] Emoji support

### Phase 3: Frontend - Message Sending (0.5 day)
- [ ] Send form
- [ ] Validation
- [ ] Feedback (toast notifications)
- [ ] Reply button (@[UserName])

### Phase 4: Auto-refresh (0.5 day)
- [ ] JavaScript polling
- [ ] Last refresh indicator
- [ ] Manual refresh button
- [ ] Smart scroll (don't jump if user is scrolling)

### Phase 5: Contact Management (0.5 day)
- [ ] Settings panel (modal)
- [ ] Contact cleanup function
- [ ] Action confirmation
- [ ] Result feedback

### Phase 6: Polish & Documentation (0.5 day)
- [ ] Manual testing
- [ ] Error handling and edge cases
- [ ] README with installation instructions
- [ ] Docker image optimization

**Total estimated time: ~4-5 working days**

---

## 9. Future Extensions (Backlog)

Features to consider in future versions:

| Priority | Feature | Description |
|----------|---------|-------------|
| HIGH | Dark mode | Dark theme interface |
| HIGH | Other channels | Send to channels other than Public |
| MEDIUM | Contact list | Browse and manage contacts |
| MEDIUM | Private messages | Send DMs to contacts |
| MEDIUM | Notifications | Audio/visual notifications for new messages |
| MEDIUM | Map | Display contact locations on map |
| LOW | Statistics | Message count, network activity |
| LOW | Telemetry | Display telemetry data |
| LOW | Authentication | Optional login (for internet access) |
| LOW | Multi-device | Support for multiple devices |

---

## 10. Risks and Limitations

### 10.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| meshcli delays | Medium | Medium | Timeout + async execution |
| Device connection loss | Low | High | Health check + restart |
| Large .msgs file | Low | Medium | Pagination, tail last N |
| Concurrent access conflicts | Low | Low | Command queuing |

### 10.2 Limitations

1. **Single-user** - no multi-user support
2. **No authentication** - requires trusted network
3. **meshcli dependency** - requires installed meshcore-cli
4. **Public channel only (MVP)** - other channels in future versions
5. **No persistence** - data only in .msgs file

### 10.3 Assumptions

1. Heltec V4 device is always connected and available
2. meshcore-cli is properly configured
3. .msgs file is regularly updated by meshcore-cli
4. Local network is trusted (no authentication needed)

---

## 11. Definitions and Abbreviations

| Term | Definition |
|------|------------|
| MeshCore | Mesh networking protocol for LoRa radios |
| meshcore-cli | Command-line interface for MeshCore |
| meshcli | Alias for meshcore-cli |
| Heltec V4 | Heltec WiFi LoRa 32 V4 - LoRa device |
| .msgs | JSON Lines file with message history |
| Public | Default public channel (channel 0) |
| SNR | Signal-to-Noise Ratio |

---

## 12. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-21 | Marek/Claude | Initial version |

---

## Appendices

### A. Example Message Format (.msgs)

```json
{"type": "CHAN", "SNR": 10.5, "channel_idx": 0, "path_len": 5, "txt_type": 0, "sender_timestamp": 1766300840, "text": "MarioTJE🤖: Hey everyone ", "name": "channel 0", "timestamp": 1766300846}
{"type": "SENT_CHAN", "channel_idx": 0, "text": "Good morning everyone", "txt_type": 0, "name": "MarWoj", "timestamp": 1766309432}
```

### B. meshcli Commands Used in Project

```bash
# Sync messages
meshcli -s <PORT> recv

# Send to Public
meshcli -s <PORT> public "message"

# Contact list
meshcli -s <PORT> contacts

# Clean inactive contacts (type client, >48h)
meshcli -s <PORT> "apply_to u<48h,t=1 remove_contact"

# Device information
meshcli -s <PORT> infos
```