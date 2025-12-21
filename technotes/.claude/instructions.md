# mc-webui - Project Instructions for Claude Code

## Project Overview

**mc-webui** is a lightweight Flask web interface for meshcore-cli. It provides browser-based access to MeshCore mesh network chat without requiring SSH/terminal access.

## Tech Stack

- Python 3.11+ / Flask
- Bootstrap 5 / vanilla JS
- Docker deployment
- subprocess calls to meshcli

## Key Commands

```bash
# meshcli base command (serial port varies per setup)
meshcli -s $MC_SERIAL_PORT <command>

# Common commands:
recv                              # Fetch new messages
public "message"                  # Send to Public channel
public "@[User] msg"              # Reply to user
contacts                          # List contacts
"apply_to u<48h,t=1 remove_contact"  # Clean old contacts
infos                             # Device info
```

## Message File Format

Location: `~/.config/meshcore/<device_name>.msgs` (JSON Lines)

```json
{"type": "CHAN", "text": "User: message", "timestamp": 1766300846}
{"type": "SENT_CHAN", "text": "my message", "name": "DeviceName", "timestamp": 1766309432}
```

## Code Style Guidelines

- **Language:** All code, comments, docs in English
- **Simplicity:** MVP approach, avoid over-engineering
- **Error handling:** meshcli can timeout/fail - handle gracefully
- **No auth:** Trusted network assumption

## Environment Variables

```
MC_SERIAL_PORT    - Serial device path
MC_DEVICE_NAME    - Device name (for .msgs file)
MC_CONFIG_DIR     - meshcore config directory
MC_REFRESH_INTERVAL - Auto-refresh seconds (default: 60)
MC_INACTIVE_HOURS - Contact cleanup threshold (default: 48)
FLASK_PORT        - Web server port (default: 5000)
```

## Project Structure

```
mc-webui/
├── app/
│   ├── main.py           # Flask entry point
│   ├── config.py         # Environment config
│   ├── meshcore/
│   │   ├── cli.py        # meshcli subprocess wrapper
│   │   └── parser.py     # .msgs file parser
│   ├── routes/
│   │   ├── api.py        # REST endpoints
│   │   └── views.py      # HTML views
│   ├── static/           # CSS, JS
│   └── templates/        # Jinja2 templates
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── PRD.md               # Full requirements doc
└── README.md
```

## API Endpoints

```
GET  /api/messages          - List messages
POST /api/messages          - Send message
GET  /api/status            - Connection status
POST /api/contacts/cleanup  - Remove inactive contacts
```

## Important Files

- **PRD.md** - Complete requirements, wireframes, architecture
- **CLAUDE_CODE_PROMPT.md** - Detailed implementation guide

## Testing

Device: Heltec V4 connected via USB to this Debian VM.
Test with real meshcore network - no mock available locally.