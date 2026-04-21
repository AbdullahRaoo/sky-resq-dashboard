# RPi → Pixhawk → Dashboard Integration

## Data Flow
```
RPi (Python) --serial TELEM2--> Pixhawk --SiK Radio TELEM1--> Dashboard
```

The RPi sends MAVLink messages to the Pixhawk. The Pixhawk automatically forwards them via the SiK telemetry radio to the dashboard.

## Prerequisites
- Pixhawk connected to RPi via TELEM2 (`/dev/serial0`, 57600 baud)
- `SERIAL2_PROTOCOL = 2` (MAVLink 2)
- `SERIAL1_PROTOCOL = 2` (MAVLink 2) — SiK radio side
- Dashboard running and connected via SiK radio

## Scripts

| Script | Purpose |
|--------|---------|
| `rpi_hello_world.py` | Quick test — sends "Hello World" text |
| `rpi_data_sender.py` | Continuous stream — sends data at 4Hz |

## Quick Start

### 1. Test Connection
```bash
python3 rpi_hello_world.py
```
Check dashboard for "Hello World from RPi!" in the status/toast area.

### 2. Continuous Stream
```bash
python3 rpi_data_sender.py
```
Streams `NAMED_VALUE_FLOAT`, `NAMED_VALUE_INT`, and `STATUSTEXT` at 4Hz.

## MAVLink Message Types Used

### STATUSTEXT (ID: 253) — No dashboard changes needed
- Text messages (max 50 chars)
- Appears in dashboard's toast/log area automatically

### NAMED_VALUE_FLOAT (ID: 251) — Dashboard changes needed
- Named float values (name max 10 chars)
- Example: `rpi_temp = 42.5`
- **To display**: Add parsing in `backend/mavlink/parser.py`

### NAMED_VALUE_INT (ID: 252) — Dashboard changes needed
- Named integer values
- Example: `rpi_count = 150`
- **To display**: Add parsing in `backend/mavlink/parser.py`

## Adding Your Own Data

Edit `rpi_data_sender.py` and replace the example values:

```python
# Send your sensor reading
master.mav.named_value_float_send(
    time_boot_ms,
    b'my_sensor\x00',    # name (10 bytes, pad with \x00)
    your_sensor_value     # float value
)
```

## Dashboard Integration (For NAMED_VALUE_FLOAT)

To display custom RPi data on your dashboard, add to `backend/mavlink/parser.py`:

```python
elif msg_type == "NAMED_VALUE_FLOAT":
    state.rpi_data[msg.name.strip('\x00')] = msg.value
```

And add `rpi_data: dict = {}` to `DroneState` in `backend/models/drone_state.py`.
