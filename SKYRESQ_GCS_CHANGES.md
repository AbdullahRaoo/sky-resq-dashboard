# SkyResQ GCS — Required Changes

pi@raspberrypi:/tmp/gimbal_test $ 
pi@raspberrypi:/tmp/gimbal_test $ 
pi@raspberrypi:/tmp/gimbal_test $ # 1) Finish ffmpeg install in the foreground with a much longer wallclock
sudo apt-get install -y ffmpeg 2>&1 | tail -3
which ffprobe && echo "ffprobe OK"

# 2) Where is mediamtx running from and what's its config?
echo
echo "==== mediamtx process ===="
ps -fp $(pgrep -d, mediamtx) 2>&1

echo
echo "==== mediamtx service ===="
sudo systemctl status mediamtx --no-pager 2>&1 | head -8

echo
echo "==== mediamtx config file(s) ===="
sudo find / -name 'mediamtx.yml' 2>/dev/null

echo
echo "==== contents of first config found ===="
CFG=$(sudo find / -name 'mediamtx.yml' 2>/dev/null | head -1)
[ -n "$CFG" ] && sudo cat "$CFG"

# 3) Local mediamtx endpoints
echo
echo "==== mediamtx local ports ===="
ss -tlnp 2>/dev/null | grep mediamtx || sudo ss -tlnp | grep mediamtx

# 4) Ask mediamtx's HTTP API what paths it knows about
echo
curl -s --max-time 3 http://127.0.0.1:9997/v3/paths/list 2>&1 | head -40
Reading state information...
ffmpeg is already the newest version (8:7.1.3-0+deb13u1+rpt1).
0 upgraded, 0 newly installed, 0 to remove and 105 not upgraded.
/usr/bin/ffprobe
ffprobe OK

==== mediamtx process ====
UID          PID    PPID  C STIME TTY          TIME CMD
pi           783       1  2 08:14 ?        00:00:20 /home/pi/mediamtx/mediamtx /home/pi/mediamtx/mediamtx.yml

==== mediamtx service ====
● mediamtx.service - MediaMTX WebRTC Streaming Server
     Loaded: loaded (/etc/systemd/system/mediamtx.service; enabled; preset: enabled)
     Active: active (running) since Mon 2026-05-11 08:12:23 BST; 16min ago
 Invocation: bb174f9ff5ae47af976f0dd0e63dbf6b
   Main PID: 783 (mediamtx)
      Tasks: 9 (limit: 3920)
        CPU: 20.227s
     CGroup: /system.slice/mediamtx.service

==== mediamtx config file(s) ====
/home/pi/mediamtx/mediamtx.yml

==== contents of first config found ====

###############################################
# Global settings

# Settings in this section are applied anywhere.

###############################################
# Global settings -> General

# Verbosity of the program; available values are "error", "warn", "info", "debug".
logLevel: info
# Destinations of log messages; available values are "stdout", "file" and "syslog".
logDestinations: [stdout]
# If "file" is in logDestinations, this is the file which will receive the logs.
logFile: mediamtx.log

# Timeout of read operations.
readTimeout: 10s
# Timeout of write operations.
writeTimeout: 10s
# Size of the queue of outgoing packets.
# A higher value allows to increase throughput, a lower value allows to save RAM.
writeQueueSize: 512
# Maximum size of outgoing UDP packets.
# This can be decreased to avoid fragmentation on networks with a low UDP MTU.
udpMaxPayloadSize: 1472

# Command to run when a client connects to the server.
# This is terminated with SIGINT when a client disconnects from the server.
# The following environment variables are available:
# * RTSP_PORT: RTSP server port
# * MTX_CONN_TYPE: connection type
# * MTX_CONN_ID: connection ID
runOnConnect:
# Restart the command if it exits.
runOnConnectRestart: no
# Command to run when a client disconnects from the server.
# Environment variables are the same of runOnConnect.
runOnDisconnect:

###############################################
# Global settings -> Authentication

# Authentication method. Available values are:
# * internal: users are stored in the configuration file
# * http: an external HTTP URL is contacted to perform authentication
# * jwt: an external identity server provides authentication through JWTs
authMethod: internal

# Internal authentication.
# list of users.
authInternalUsers:
  # Default unprivileged user.
  # Username. 'any' means any user, including anonymous ones.
- user: any
  # Password. Not used in case of 'any' user.
  pass:
  # IPs or networks allowed to use this user. An empty list means any IP.
  ips: []
  # List of permissions.
  permissions:
    # Available actions are: publish, read, playback, api, metrics, pprof.
  - action: publish
    # Paths can be set to further restrict access to a specific path.
    # An empty path means any path.
    # Regular expressions can be used by using a tilde as prefix.
    path:
  - action: read
    path:
  - action: playback
    path:

  # Default administrator.
  # This allows to use API, metrics and PPROF without authentication,
  # if the IP is localhost.
- user: any
  pass:
  ips: ['127.0.0.1', '::1']
  permissions:
  - action: api
  - action: metrics
  - action: pprof

# HTTP-based authentication.
# URL called to perform authentication. Every time a user wants
# to authenticate, the server calls this URL with the POST method
# and a body containing:
# {
#   "user": "user",
#   "password": "password",
#   "ip": "ip",
#   "action": "publish|read|playback|api|metrics|pprof",
#   "path": "path",
#   "protocol": "rtsp|rtmp|hls|webrtc|srt",
#   "id": "id",
#   "query": "query"
# }
# If the response code is 20x, authentication is accepted, otherwise
# it is discarded.
authHTTPAddress:
# Actions to exclude from HTTP-based authentication.
# Format is the same as the one of user permissions.
authHTTPExclude:
- action: api
- action: metrics
- action: pprof

# JWT-based authentication.
# Users have to login through an external identity server and obtain a JWT.
# This JWT must contain the claim "mediamtx_permissions" with permissions,
# for instance:
# {
#  ...
#  "mediamtx_permissions": [
#     {
#       "action": "publish",
#       "path": "somepath"
#     }
#   ]
# }
# Users are expected to pass the JWT in the Authorization header or as a query parameter.
# This is the JWKS URL that will be used to pull (once) the public key that allows
# to validate JWTs.
authJWTJWKS:
# name of the claim that contains permissions.
authJWTClaimKey: mediamtx_permissions

###############################################
# Global settings -> Control API

# Enable controlling the server through the Control API.
api: no
# Address of the Control API listener.
apiAddress: :9997
# Enable TLS/HTTPS on the Control API server.
apiEncryption: no
# Path to the server key. This is needed only when encryption is yes.
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
apiServerKey: server.key
# Path to the server certificate.
apiServerCert: server.crt
# Value of the Access-Control-Allow-Origin header provided in every HTTP response.
apiAllowOrigin: '*'
# List of IPs or CIDRs of proxies placed before the HTTP server.
# If the server receives a request from one of these entries, IP in logs
# will be taken from the X-Forwarded-For header.
apiTrustedProxies: []

###############################################
# Global settings -> Metrics

# Enable Prometheus-compatible metrics.
metrics: no
# Address of the metrics HTTP listener.
metricsAddress: :9998
# Enable TLS/HTTPS on the Metrics server.
metricsEncryption: no
# Path to the server key. This is needed only when encryption is yes.
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
metricsServerKey: server.key
# Path to the server certificate.
metricsServerCert: server.crt
# Value of the Access-Control-Allow-Origin header provided in every HTTP response.
metricsAllowOrigin: '*'
# List of IPs or CIDRs of proxies placed before the HTTP server.
# If the server receives a request from one of these entries, IP in logs
# will be taken from the X-Forwarded-For header.
metricsTrustedProxies: []

###############################################
# Global settings -> PPROF

# Enable pprof-compatible endpoint to monitor performances.
pprof: no
# Address of the pprof listener.
pprofAddress: :9999
# Enable TLS/HTTPS on the pprof server.
pprofEncryption: no
# Path to the server key. This is needed only when encryption is yes.
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
pprofServerKey: server.key
# Path to the server certificate.
pprofServerCert: server.crt
# Value of the Access-Control-Allow-Origin header provided in every HTTP response.
pprofAllowOrigin: '*'
# List of IPs or CIDRs of proxies placed before the HTTP server.
# If the server receives a request from one of these entries, IP in logs
# will be taken from the X-Forwarded-For header.
pprofTrustedProxies: []

###############################################
# Global settings -> Playback server

# Enable downloading recordings from the playback server.
playback: no
# Address of the playback server listener.
playbackAddress: :9996
# Enable TLS/HTTPS on the playback server.
playbackEncryption: no
# Path to the server key. This is needed only when encryption is yes.
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
playbackServerKey: server.key
# Path to the server certificate.
playbackServerCert: server.crt
# Value of the Access-Control-Allow-Origin header provided in every HTTP response.
playbackAllowOrigin: '*'
# List of IPs or CIDRs of proxies placed before the HTTP server.
# If the server receives a request from one of these entries, IP in logs
# will be taken from the X-Forwarded-For header.
playbackTrustedProxies: []

###############################################
# Global settings -> RTSP server

# Enable publishing and reading streams with the RTSP protocol.
rtsp: yes
# List of enabled RTSP transport protocols.
# UDP is the most performant, but doesn't work when there's a NAT/firewall between
# server and clients, and doesn't support encryption.
# UDP-multicast allows to save bandwidth when clients are all in the same LAN.
# TCP is the most versatile, and does support encryption.
# The handshake is always performed with TCP.
protocols: [udp, multicast, tcp]
# Encrypt handshakes and TCP streams with TLS (RTSPS).
# Available values are "no", "strict", "optional".
encryption: "no"
# Address of the TCP/RTSP listener. This is needed only when encryption is "no" or "optional".
rtspAddress: :8554
# Address of the TCP/TLS/RTSPS listener. This is needed only when encryption is "strict" or "optional".
rtspsAddress: :8322
# Address of the UDP/RTP listener. This is needed only when "udp" is in protocols.
rtpAddress: :8000
# Address of the UDP/RTCP listener. This is needed only when "udp" is in protocols.
rtcpAddress: :8001
# IP range of all UDP-multicast listeners. This is needed only when "multicast" is in protocols.
multicastIPRange: 224.1.0.0/16
# Port of all UDP-multicast/RTP listeners. This is needed only when "multicast" is in protocols.
multicastRTPPort: 8002
# Port of all UDP-multicast/RTCP listeners. This is needed only when "multicast" is in protocols.
multicastRTCPPort: 8003
# Path to the server key. This is needed only when encryption is "strict" or "optional".
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
serverKey: server.key
# Path to the server certificate. This is needed only when encryption is "strict" or "optional".
serverCert: server.crt
# Authentication methods. Available are "basic" and "digest".
# "digest" doesn't provide any additional security and is available for compatibility only.
rtspAuthMethods: [basic]

###############################################
# Global settings -> RTMP server

# Enable publishing and reading streams with the RTMP protocol.
rtmp: yes
# Address of the RTMP listener. This is needed only when encryption is "no" or "optional".
rtmpAddress: :1935
# Encrypt connections with TLS (RTMPS).
# Available values are "no", "strict", "optional".
rtmpEncryption: "no"
# Address of the RTMPS listener. This is needed only when encryption is "strict" or "optional".
rtmpsAddress: :1936
# Path to the server key. This is needed only when encryption is "strict" or "optional".
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
rtmpServerKey: server.key
# Path to the server certificate. This is needed only when encryption is "strict" or "optional".
rtmpServerCert: server.crt

###############################################
# Global settings -> HLS server

# Enable reading streams with the HLS protocol.
hls: yes
# Address of the HLS listener.
hlsAddress: :8888
# Enable TLS/HTTPS on the HLS server.
# This is required for Low-Latency HLS.
hlsEncryption: no
# Path to the server key. This is needed only when encryption is yes.
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
hlsServerKey: server.key
# Path to the server certificate.
hlsServerCert: server.crt
# Value of the Access-Control-Allow-Origin header provided in every HTTP response.
# This allows to play the HLS stream from an external website.
hlsAllowOrigin: '*'
# List of IPs or CIDRs of proxies placed before the HLS server.
# If the server receives a request from one of these entries, IP in logs
# will be taken from the X-Forwarded-For header.
hlsTrustedProxies: []
# By default, HLS is generated only when requested by a user.
# This option allows to generate it always, avoiding the delay between request and generation.
hlsAlwaysRemux: no
# Variant of the HLS protocol to use. Available options are:
# * mpegts - uses MPEG-TS segments, for maximum compatibility.
# * fmp4 - uses fragmented MP4 segments, more efficient.
# * lowLatency - uses Low-Latency HLS.
hlsVariant: lowLatency
# Number of HLS segments to keep on the server.
# Segments allow to seek through the stream.
# Their number doesn't influence latency.
hlsSegmentCount: 7
# Minimum duration of each segment.
# A player usually puts 3 segments in a buffer before reproducing the stream.
# The final segment duration is also influenced by the interval between IDR frames,
# since the server changes the duration in order to include at least one IDR frame
# in each segment.
hlsSegmentDuration: 1s
# Minimum duration of each part.
# A player usually puts 3 parts in a buffer before reproducing the stream.
# Parts are used in Low-Latency HLS in place of segments.
# Part duration is influenced by the distance between video/audio samples
# and is adjusted in order to produce segments with a similar duration.
hlsPartDuration: 200ms
# Maximum size of each segment.
# This prevents RAM exhaustion.
hlsSegmentMaxSize: 50M
# Directory in which to save segments, instead of keeping them in the RAM.
# This decreases performance, since reading from disk is less performant than
# reading from RAM, but allows to save RAM.
hlsDirectory: ''
# The muxer will be closed when there are no
# reader requests and this amount of time has passed.
hlsMuxerCloseAfter: 60s

###############################################
# Global settings -> WebRTC server

# Enable publishing and reading streams with the WebRTC protocol.
webrtc: yes
# Address of the WebRTC HTTP listener.
webrtcAddress: :8889
# Enable TLS/HTTPS on the WebRTC server.
webrtcEncryption: no
# Path to the server key.
# This can be generated with:
# openssl genrsa -out server.key 2048
# openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650
webrtcServerKey: server.key
# Path to the server certificate.
webrtcServerCert: server.crt
# Value of the Access-Control-Allow-Origin header provided in every HTTP response.
# This allows to play the WebRTC stream from an external website.
webrtcAllowOrigin: '*'
# List of IPs or CIDRs of proxies placed before the WebRTC server.
# If the server receives a request from one of these entries, IP in logs
# will be taken from the X-Forwarded-For header.
webrtcTrustedProxies: []
# Address of a local UDP listener that will receive connections.
# Use a blank string to disable.
webrtcLocalUDPAddress: :8189
# Address of a local TCP listener that will receive connections.
# This is disabled by default since TCP is less efficient than UDP and
# introduces a progressive delay when network is congested.
webrtcLocalTCPAddress: ''
# WebRTC clients need to know the IP of the server.
# Gather IPs from interfaces and send them to clients.
webrtcIPsFromInterfaces: yes
# List of interfaces whose IPs will be sent to clients.
# An empty value means to use all available interfaces.
webrtcIPsFromInterfacesList: []
# List of additional hosts or IPs to send to clients.
webrtcAdditionalHosts: []
# ICE servers. Needed only when local listeners can't be reached by clients.
# STUN servers allows to obtain and share the public IP of the server.
# TURN/TURNS servers forces all traffic through them.
webrtcICEServers2: []
  # - url: stun:stun.l.google.com:19302
  # if user is "AUTH_SECRET", then authentication is secret based.
  # the secret must be inserted into the password field.
  # username: ''
  # password: ''
  # clientOnly: false
# Time to wait for the WebRTC handshake to complete.
webrtcHandshakeTimeout: 10s
# Maximum time to gather video tracks.
webrtcTrackGatherTimeout: 2s

###############################################
# Global settings -> SRT server

# Enable publishing and reading streams with the SRT protocol.
srt: yes
# Address of the SRT listener.
srtAddress: :8890

###############################################
# Default path settings

# Settings in "pathDefaults" are applied anywhere,
# unless they are overridden in "paths".
pathDefaults:

  ###############################################
  # Default path settings -> General

  # Source of the stream. This can be:
  # * publisher -> the stream is provided by a RTSP, RTMP, WebRTC or SRT client
  # * rtsp://existing-url -> the stream is pulled from another RTSP server / camera
  # * rtsps://existing-url -> the stream is pulled from another RTSP server / camera with RTSPS
  # * rtmp://existing-url -> the stream is pulled from another RTMP server / camera
  # * rtmps://existing-url -> the stream is pulled from another RTMP server / camera with RTMPS
  # * http://existing-url/stream.m3u8 -> the stream is pulled from another HLS server / camera
  # * https://existing-url/stream.m3u8 -> the stream is pulled from another HLS server / camera with HTTPS
  # * udp://ip:port -> the stream is pulled with UDP, by listening on the specified IP and port
  # * srt://existing-url -> the stream is pulled from another SRT server / camera
  # * whep://existing-url -> the stream is pulled from another WebRTC server / camera
  # * wheps://existing-url -> the stream is pulled from another WebRTC server / camera with HTTPS
  # * redirect -> the stream is provided by another path or server
  # * rpiCamera -> the stream is provided by a Raspberry Pi Camera
  # The following variables can be used in the source string:
  # * $MTX_QUERY: query parameters (passed by first reader)
  # * $G1, $G2, ...: regular expression groups, if path name is
  #   a regular expression.
  source: publisher
  # If the source is a URL, and the source certificate is self-signed
  # or invalid, you can provide the fingerprint of the certificate in order to
  # validate it anyway. It can be obtained by running:
  # openssl s_client -connect source_ip:source_port </dev/null 2>/dev/null | sed -n '/BEGIN/,/END/p' > server.crt
  # openssl x509 -in server.crt -noout -fingerprint -sha256 | cut -d "=" -f2 | tr -d ':'
  sourceFingerprint:
  # If the source is a URL, it will be pulled only when at least
  # one reader is connected, saving bandwidth.
  sourceOnDemand: no
  # If sourceOnDemand is "yes", readers will be put on hold until the source is
  # ready or until this amount of time has passed.
  sourceOnDemandStartTimeout: 10s
  # If sourceOnDemand is "yes", the source will be closed when there are no
  # readers connected and this amount of time has passed.
  sourceOnDemandCloseAfter: 10s
  # Maximum number of readers. Zero means no limit.
  maxReaders: 0
  # SRT encryption passphrase require to read from this path
  srtReadPassphrase:
  # If the stream is not available, redirect readers to this path.
  # It can be can be a relative path (i.e. /otherstream) or an absolute RTSP URL.
  fallback:

  ###############################################
  # Default path settings -> Record

  # Record streams to disk.
  record: no
  # Path of recording segments.
  # Extension is added automatically.
  # Available variables are %path (path name), %Y %m %d %H %M %S %f %s (time in strftime format)
  recordPath: ./recordings/%path/%Y-%m-%d_%H-%M-%S-%f
  # Format of recorded segments.
  # Available formats are "fmp4" (fragmented MP4) and "mpegts" (MPEG-TS).
  recordFormat: fmp4
  # fMP4 segments are concatenation of small MP4 files (parts), each with this duration.
  # MPEG-TS segments are concatenation of 188-bytes packets, flushed to disk with this period.
  # When a system failure occurs, the last part gets lost.
  # Therefore, the part duration is equal to the RPO (recovery point objective).
  recordPartDuration: 1s
  # Minimum duration of each segment.
  recordSegmentDuration: 1h
  # Delete segments after this timespan.
  # Set to 0s to disable automatic deletion.
  recordDeleteAfter: 24h

  ###############################################
  # Default path settings -> Publisher source (when source is "publisher")

  # Allow another client to disconnect the current publisher and publish in its place.
  overridePublisher: yes
  # SRT encryption passphrase required to publish to this path
  srtPublishPassphrase:

  ###############################################
  # Default path settings -> RTSP source (when source is a RTSP or a RTSPS URL)

  # Transport protocol used to pull the stream. available values are "automatic", "udp", "multicast", "tcp".
  rtspTransport: automatic
  # Support sources that don't provide server ports or use random server ports. This is a security issue
  # and must be used only when interacting with sources that require it.
  rtspAnyPort: no
  # Range header to send to the source, in order to start streaming from the specified offset.
  # available values:
  # * clock: Absolute time
  # * npt: Normal Play Time
  # * smpte: SMPTE timestamps relative to the start of the recording
  rtspRangeType:
  # Available values:
  # * clock: UTC ISO 8601 combined date and time string, e.g. 20230812T120000Z
  # * npt: duration such as "300ms", "1.5m" or "2h45m", valid time units are "ns", "us" (or "µs"), "ms", "s", "m", "h"
  # * smpte: duration such as "300ms", "1.5m" or "2h45m", valid time units are "ns", "us" (or "µs"), "ms", "s", "m", "h"
  rtspRangeStart:

  ###############################################
  # Default path settings -> Redirect source (when source is "redirect")

  # RTSP URL which clients will be redirected to.
  sourceRedirect:

  ###############################################
  # Default path settings -> Raspberry Pi Camera source (when source is "rpiCamera")

  # ID of the camera
  rpiCameraCamID: 0
  # Width of frames
  rpiCameraWidth: 1920
  # Height of frames
  rpiCameraHeight: 1080
  # Flip horizontally
  rpiCameraHFlip: false
  # Flip vertically
  rpiCameraVFlip: false
  # Brightness [-1, 1]
  rpiCameraBrightness: 0
  # Contrast [0, 16]
  rpiCameraContrast: 1
  # Saturation [0, 16]
  rpiCameraSaturation: 1
  # Sharpness [0, 16]
  rpiCameraSharpness: 1
  # Exposure mode.
  # values: normal, short, long, custom
  rpiCameraExposure: normal
  # Auto-white-balance mode.
  # values: auto, incandescent, tungsten, fluorescent, indoor, daylight, cloudy, custom
  rpiCameraAWB: auto
  # Auto-white-balance fixed gains. This can be used in place of rpiCameraAWB.
  # format: [red,blue]
  rpiCameraAWBGains: [0, 0]
  # Denoise operating mode.
  # values: off, cdn_off, cdn_fast, cdn_hq
  rpiCameraDenoise: "off"
  # Fixed shutter speed, in microseconds.
  rpiCameraShutter: 0
  # Metering mode of the AEC/AGC algorithm.
  # values: centre, spot, matrix, custom
  rpiCameraMetering: centre
  # Fixed gain
  rpiCameraGain: 0
  # EV compensation of the image [-10, 10]
  rpiCameraEV: 0
  # Region of interest, in format x,y,width,height
  rpiCameraROI:
  # Whether to enable HDR on Raspberry Camera 3.
  rpiCameraHDR: false
  # Tuning file
  rpiCameraTuningFile:
  # Sensor mode, in format [width]:[height]:[bit-depth]:[packing]
  # bit-depth and packing are optional.
  rpiCameraMode:
  # frames per second
  rpiCameraFPS: 30
  # Autofocus mode
  # values: auto, manual, continuous
  rpiCameraAfMode: continuous
  # Autofocus range
  # values: normal, macro, full
  rpiCameraAfRange: normal
  # Autofocus speed
  # values: normal, fast
  rpiCameraAfSpeed: normal
  # Lens position (for manual autofocus only), will be set to focus to a specific distance
  # calculated by the following formula: d = 1 / value
  # Examples: 0 moves the lens to infinity.
  #           0.5 moves the lens to focus on objects 2m away.
  #           2 moves the lens to focus on objects 50cm away.
  rpiCameraLensPosition: 0.0
  # Specifies the autofocus window, in the form x,y,width,height where the coordinates
  # are given as a proportion of the entire image.
  rpiCameraAfWindow:
  # Manual flicker correction period, in microseconds.
  rpiCameraFlickerPeriod: 0
  # Enables printing text on each frame.
  rpiCameraTextOverlayEnable: false
  # Text that is printed on each frame.
  # format is the one of the strftime() function.
  rpiCameraTextOverlay: '%Y-%m-%d %H:%M:%S - MediaMTX'
  # Codec. Available values: auto, hardwareH264, softwareH264
  rpiCameraCodec: auto
  # Period between IDR frames
  rpiCameraIDRPeriod: 60
  # Bitrate
  rpiCameraBitrate: 1000000
  # H264 profile
  rpiCameraProfile: main
  # H264 level
  rpiCameraLevel: '4.1'

  ###############################################
  # Default path settings -> Hooks

  # Command to run when this path is initialized.
  # This can be used to publish a stream when the server is launched.
  # This is terminated with SIGINT when the program closes.
  # The following environment variables are available:
  # * MTX_PATH: path name
  # * RTSP_PORT: RTSP server port
  # * G1, G2, ...: regular expression groups, if path name is
  #   a regular expression.
  runOnInit:
  # Restart the command if it exits.
  runOnInitRestart: no

  # Command to run when this path is requested by a reader
  # and no one is publishing to this path yet.
  # This can be used to publish a stream on demand.
  # This is terminated with SIGINT when there are no readers anymore.
  # The following environment variables are available:
  # * MTX_PATH: path name
  # * MTX_QUERY: query parameters (passed by first reader)
  # * RTSP_PORT: RTSP server port
  # * G1, G2, ...: regular expression groups, if path name is
  #   a regular expression.
  runOnDemand:
  # Restart the command if it exits.
  runOnDemandRestart: no
  # Readers will be put on hold until the runOnDemand command starts publishing
  # or until this amount of time has passed.
  runOnDemandStartTimeout: 10s
  # The command will be closed when there are no
  # readers connected and this amount of time has passed.
  runOnDemandCloseAfter: 10s
  # Command to run when there are no readers anymore.
  # Environment variables are the same of runOnDemand.
  runOnUnDemand:

  # Command to run when the stream is ready to be read, whenever it is
  # published by a client or pulled from a server / camera.
  # This is terminated with SIGINT when the stream is not ready anymore.
  # The following environment variables are available:
  # * MTX_PATH: path name
  # * MTX_QUERY: query parameters (passed by publisher)
  # * RTSP_PORT: RTSP server port
  # * G1, G2, ...: regular expression groups, if path name is
  #   a regular expression.
  # * MTX_SOURCE_TYPE: source type
  # * MTX_SOURCE_ID: source ID
  runOnReady:
  # Restart the command if it exits.
  runOnReadyRestart: no
  # Command to run when the stream is not available anymore.
  # Environment variables are the same of runOnReady.
  runOnNotReady:

  # Command to run when a client starts reading.
  # This is terminated with SIGINT when a client stops reading.
  # The following environment variables are available:
  # * MTX_PATH: path name
  # * MTX_QUERY: query parameters (passed by reader)
  # * RTSP_PORT: RTSP server port
  # * G1, G2, ...: regular expression groups, if path name is
  #   a regular expression.
  # * MTX_READER_TYPE: reader type
  # * MTX_READER_ID: reader ID
  runOnRead:
  # Restart the command if it exits.
  runOnReadRestart: no
  # Command to run when a client stops reading.
  # Environment variables are the same of runOnRead.
  runOnUnread:

  # Command to run when a recording segment is created.
  # The following environment variables are available:
  # * MTX_PATH: path name
  # * RTSP_PORT: RTSP server port
  # * G1, G2, ...: regular expression groups, if path name is
  #   a regular expression.
  # * MTX_SEGMENT_PATH: segment file path
  runOnRecordSegmentCreate:

  # Command to run when a recording segment is complete.
  # The following environment variables are available:
  # * MTX_PATH: path name
  # * RTSP_PORT: RTSP server port
  # * G1, G2, ...: regular expression groups, if path name is
  #   a regular expression.
  # * MTX_SEGMENT_PATH: segment file path
  # * MTX_SEGMENT_DURATION: segment duration
  runOnRecordSegmentComplete:

###############################################
# Path settings

# Settings in "paths" are applied to specific paths, and the map key
# is the name of the path.
# Any setting in "pathDefaults" can be overridden here.
# It's possible to use regular expressions by using a tilde as prefix,
# for example "~^(test1|test2)$" will match both "test1" and "test2",
# for example "~^prefix" will match all paths that start with "prefix".
paths:
  skyresq_cam:
    # This pulls the feed from the Z-1 Mini IP you just pinged.
    # Note: 8554/main.264 is the standard Xianfei/SIYI port and path. 
    # If it fails to connect, check the official docs to see if it uses port 554 or a different path like /stream0
    source: rtsp://192.168.144.108:554
 # example:
  # my_camera:
  #   source: rtsp://my_camera

  # Settings under path "all_others" are applied to all paths that
  # do not match another entry.
  all_others:

==== mediamtx local ports ====
LISTEN 0      4096                             *:1935             *:*    users:(("mediamtx",pid=783,fd=10))
LISTEN 0      4096                             *:8888             *:*    users:(("mediamtx",pid=783,fd=11))
LISTEN 0      4096                             *:8889             *:*    users:(("mediamtx",pid=783,fd=12))
LISTEN 0      4096                             *:8554             *:*    users:(("mediamtx",pid=783,fd=9)) 

==== mediamtx API path list ====
pi@raspberrypi:/tmp/gimbal_test $ 
> Spec for changes to [sky-resq-dashboard](https://github.com/AbdullahRaoo/sky-resq-dashboard)
> to support the autonomous SAR drone pipeline + a safe demo mode.
>
> Status: design doc, not yet implemented.

---

## 0. Context

The dashboard today (commit at time of writing) is a single mission-cockpit
view: map + HUD + video iframe + connection controls. Survivor markers exist
in the data model (`survivorStore.ts`) but there is **no UI surface to view
the history, toggle visibility, drop a payload near a survivor, or interact
with detections from the video feed.**

The drone-side pipeline (RPi) will start sending two new things to the
dashboard once the realignment work lands:

1. **Survivor cluster** JSON payloads (one per confirmed detection cluster)
2. **Live detection** JSON payloads (per-frame, with bounding box in image
   coordinates) — so the video can be overlaid with clickable boxes

Both will arrive over the existing UDP/Tailscale channel. SiK fallback
carries only a count + last-known coordinates via `NAMED_VALUE_INT/FLOAT`.

---

## 1. New data flowing in from the drone

### 1.1 Survivor cluster (existing contract — confirmed in ConOps)
```jsonc
{
  "type": "survivor_cluster",
  "id": "cluster-1747043820-3",   // stable across updates
  "count": 3,                     // people in cluster
  "lat": 33.72938,
  "lon": 73.09312,
  "alt": 0.0,                     // ground altitude estimate (m AMSL)
  "confidence": 0.91,             // best detection confidence in cluster
  "first_seen_ms": 1747043820123,
  "last_seen_ms":  1747043829456,
  "n_samples": 18                 // how many detector frames contributed
}
```
Sent on cluster *creation*, *status update*, or every ~2 s while actively
tracked. Idempotent on `id`.

### 1.2 Live detection (NEW — for video overlay)
```jsonc
{
  "type": "detection_frame",
  "frame_ts_ms": 1747043820234,
  "stream_width": 1280,           // matches the WebRTC frame size
  "stream_height": 720,
  "detections": [
    {
      "bbox": [342, 198, 437, 388],   // [x1, y1, x2, y2] in stream pixels
      "confidence": 0.88,
      "class": "person",
      "cluster_id": "cluster-1747043820-3"  // null if unclustered
    }
  ]
}
```
Sent at the **detector's effective rate** (~5–10 Hz). The GCS only needs
the most recent one (drop older if behind). UDP loss is fine — next one
arrives in <200 ms.

### 1.3 Heartbeat from the Pi (existing — keep)
- `STATUSTEXT` over SiK: "RPi: vision OK, 42 dets so far"
- `NAMED_VALUE_INT` on `cluster_count`, `current_state` (mission state),
  `link_4g_ok`. Keeps the dashboard informed even when 4G drops.

### 1.4 Pi status (NEW — 1 Hz heartbeat over UDP :5005)
```jsonc
{
  "type": "pi_status",
  "ts_ms": 1747043820000,
  "uptime_s": 312,
  "cpu_temp_c": 58.2,                  // null if /sys/class/thermal unreadable
  "cpu_load1": 0.47,                   // 1-min load average
  "ram_used_mb": 1840,
  "ram_total_mb": 4096,
  "detector": { "ok": true, "fps": 8.4 },
  "camera":   { "ok": true, "fps": 24.0 },
  "gimbal":   { "ok": true, "pitch_deg": -90.0, "yaw_deg": 0.0 },
  "fc_link":  { "ok": true, "armed": false },
  "gcs_link": { "ok": true },
  "cluster_count": 3
}
```
Sent every `status_period_s` (default 1.0). The `ok` flags drop to `false`
when the upstream topic has been silent for 2–5 s — they're how the
operator sees companion-side failures (overheated Pi, dead camera, gimbal
disconnect, FC link loss) without SSHing in. Suggested UI: a "Pi" badge in
the title bar that goes red/yellow/green based on the worst flag, with a
tooltip showing the JSON.

### 1.5 MAVLink mirror on UDP :14550 (NEW)
The Pi's `mavlink_bridge` opens a UDP socket and rebroadcasts every frame
received from the FC to `<gcs_ip>:14550`. Anything the GCS sends to UDP
`14551` on the Pi is written straight to the FC serial.

This is **the same MAVLink protocol** the SiK radio carries — the only
difference is the transport. The dashboard's existing `udp:100.64.0.1:14550`
connection profile points at this. No new packet parser required.

Operational pattern:
- **Primary** telemetry: the 4G/Tailscale MAVLink stream at 10 Hz
- **Backup** telemetry: SiK MAVLink at 4 Hz when 4G is dead

See §8.5 for the connection-failover logic the dashboard should implement.

---

## 2. New UI surfaces

### 2.1 Video feed — clickable survivor overlay

**File to modify:** [`src/components/video/VideoFeed.tsx`](src/components/video/VideoFeed.tsx)

The current iframe approach can't capture clicks on overlays drawn over
the video. Two paths, in order of preference:

#### Path A (recommended): native `<video>` + `<canvas>` overlay
- Replace the iframe with a `<video>` element pointed at the same
  WebRTC stream (the Pi's mediamtx server should expose a WHEP endpoint —
  if not, that's a small Pi-side change).
- Stack an absolutely positioned `<canvas>` over the `<video>` with
  `pointer-events: none` on the canvas surface, but `pointer-events: auto`
  on rendered marker `<button>` elements.
- A new hook `useDetectionOverlay()` subscribes to detection frames and
  redraws the canvas on each new frame (or uses `requestAnimationFrame` to
  keep it smooth).
- Each detection bbox renders as a green outline. **Cluster centroids** get
  a clickable circular marker badge with the count.
- Clicking a marker calls `useSurvivorStore.setSelected(id)` (existing).

```
┌──────────────────────────────────────────────────┐
│  ●LIVE  WEBRTC                            ⛶      │
├──────────────────────────────────────────────────┤
│  ┌────────────────┐                              │
│  │  ┌────┐        │                              │
│  │  │ ╳3 │ <─── clickable cluster badge          │
│  │  └────┘   bbox outlines                       │
│  │  │   ╳1│                                      │
│  │  └────┘                                       │
│  └────────────────┘                              │
└──────────────────────────────────────────────────┘
```

#### Path B (fallback): keep iframe, overlay outside
If switching off the iframe is too invasive, draw the overlay using
`pointer-events: none` markers positioned on top of the iframe element.
Clicks won't reach the video, but the markers will be clickable. Loses
ability to render bbox outlines accurately if the iframe scales the video
differently (acceptable for clusters; lose bbox precision).

**Acceptance:**
- When a `detection_frame` arrives, outline rectangles appear within
  120 ms over the video at the correct positions, scaled to the player
  size. Cluster badges appear at the centroid of grouped detections.
- Clicking a cluster badge selects it in the survivor store (same effect
  as clicking the corresponding map marker).
- Detections more than 1.5 s old fade out and are removed (no stale
  ghosts on the screen).

---

### 2.2 Survivors page — detection history

**Files to add:**
- `src/app/survivors/page.tsx` — new page
- `src/components/survivors/SurvivorTable.tsx`
- `src/components/survivors/SurvivorFilters.tsx`

**Files to modify:**
- `src/components/layout/Sidebar.tsx` — add a "Survivors" nav entry
- `src/store/survivorStore.ts` — add `visibleIds: Set<string>` + actions
  `setVisibility(id, visible)`, `setAllVisible(visible)`,
  `getVisible()` selector.

**Layout:**

```
┌─ Sidebar ─┬─────────────────────────────────────────────────────┐
│           │  Survivors                                            │
│  Map      │  ┌─────────────────────────────────────────────────┐ │
│  Mission  │  │ Filters: [All] [New] [Confirmed] [Rescued]  ⌕    │ │
│ ►Survivors│  │ Show on map: [✓ All] [✗ None] [Invert]           │ │
│  Settings │  └─────────────────────────────────────────────────┘ │
│           │  ┌───┬─────────┬──────────┬──────┬──────┬──────┬───┐ │
│           │  │ ✓ │ ID      │ Time     │  Lat │  Lon │ Conf │ … │ │
│           │  ├───┼─────────┼──────────┼──────┼──────┼──────┼───┤ │
│           │  │ ✓ │ #003    │ 14:32:08 │ 33.7 │ 73.0 │ 0.91 │ ⤓ │ │
│           │  │ ✗ │ #002    │ 14:31:42 │ 33.7 │ 73.0 │ 0.65 │ ⤓ │ │
│           │  │ ✓ │ #001    │ 14:30:21 │ 33.7 │ 73.0 │ 0.88 │ ⤓ │ │
│           │  └───┴─────────┴──────────┴──────┴──────┴──────┴───┘ │
│           │                                                       │
│           │  Selected: #003 (Confirmed, 3 people)                 │
│           │  [ Highlight on map ]  [ Go to survivor ]  [ Drop ]   │
└───────────┴─────────────────────────────────────────────────────┘
```

**Required columns** (sortable):
- **Show** — checkbox controlling map visibility (per-row override)
- **ID** — short, e.g. last 6 chars of `cluster_id`
- **Time** — local time of first detection
- **Lat / Lon** — copy-on-click
- **People** — count from cluster JSON
- **Confidence** — best confidence
- **Status** — `new` | `confirmed` | `rescued`
- **Actions** — small button column: "Center on map", "Go here",
  "Mark rescued", "Drop payload", "Delete"

**Filters bar:**
- Status pills (All / New / Confirmed / Rescued) with counts
- Free-text search on `id` (or fuzzy on lat/lon for ops who type coords)
- "Show on map": bulk toggle — All / None / Invert

**Per-row actions:**
- **Center on map** — re-routes the user to the map view and pans/zooms
  the map to the survivor's coords with the marker pulsing
- **Go here** — sends the drone toward this lat/lon via a MAVLink
  `SET_POSITION_TARGET_GLOBAL_INT` (already handled by the backend; just
  invoke the existing `/api/goto` endpoint)
- **Mark rescued** — updates `status` to `rescued` (sticks in local
  state; we can persist later)
- **Drop payload** — triggers `MAV_CMD_DO_SET_SERVO` if drone is at this
  survivor (i.e. within auto-drop geofence)
- **Delete** — removes the cluster (false positive cleanup)

**Acceptance:**
- A detected cluster appears as a row in <500 ms of the JSON arriving
- Toggling the checkbox hides/shows the matching map marker immediately
- "Highlight on map" works whether the map is currently shown or not
  (routes to map view if not visible)

---

### 2.3 Map view — visibility controls + layer panel

**File to modify:** `src/app/page.tsx` (or wherever the map lives), plus
a new `src/components/map/MapLegend.tsx`.

The map currently renders all survivors. We need:

- **Per-survivor visibility** driven by `survivorStore.visibleIds`
- **Status filter** — multi-select chips above the map (or in a corner
  legend): show/hide by status
- **Path overlay** (nice-to-have): show the drone's recent track as a
  faint polyline; toggleable
- **Search-area overlay** — already partially there via `missionStore`;
  ensure the demo's small search square renders distinctly from a full
  polygon survey

Legend mock:
```
┌──────────────────────────┐
│ ◉ Drone   • Home   △ WP  │
│ ☑ New (2)  ☑ Confirmed(1)│
│ ☐ Rescued (0)            │
│ ☑ Drone path             │
└──────────────────────────┘
```

---

### 2.4 Payload drop — manual + auto

**Files to modify:**
- `backend/routers/commands.py` — add `/api/payload/drop`,
  `/api/payload/policy`
- `src/store/missionStore.ts` — add `autoDropPolicy` config
- new `src/components/mission/PayloadControl.tsx`

#### Manual drop button
Already implied by the spec but doesn't fully exist yet. Add a prominent
button in the survivor detail panel **and** in a permanent corner of the
mission view. Both call the same `/api/payload/drop` endpoint.

The backend's drop handler:
1. **Validate** interlocks first:
   - Drone is armed in `GUIDED`
   - GPS fix type ≥ 3, HDOP < 2.0
   - AGL within `[min_drop_alt_m, max_drop_alt_m]` (config: 1.5 m to
     10 m by default)
   - Battery remaining > 30 % (refuse to drop on low battery)
   - Has NOT already dropped this mission (one-shot flag, cleared on
     `/api/reset_mission`)
2. **Send** `MAV_CMD_DO_SET_SERVO` with `param1=servo_channel`,
   `param2=pwm_open_us` (e.g. AUX1 → ch 9, 1900 µs open)
3. **Confirm** — listen for the COMMAND_ACK from the FC; respond to the
   frontend with `{ok: bool, reason: str}`
4. **Schedule** a re-close after `open_hold_secs` (default 3 s) using a
   second MAV_CMD_DO_SET_SERVO with `pwm_closed_us` (1100 µs)
5. **Update** the matching survivor's status to `rescued` if a survivor
   was the active context

#### Auto-drop policy
Configurable behaviour that lets the operator say *"if the drone reaches a
survivor and visual confirmation holds, drop without me clicking."* This
makes the demo cleaner and reduces operator workload during the
production path.

Policy object (stored in `missionStore.autoDropPolicy`):
```ts
interface AutoDropPolicy {
  enabled: boolean;             // operator must explicitly turn on
  trigger: "manual" | "auto";   // manual = button only; auto = button + auto
  horizontal_tolerance_m: number;   // default 1.0 — drone must be this close to target
  altitude_min_m: number;           // default 2.0 — never auto-drop below
  altitude_max_m: number;           // default 5.0 — never auto-drop above
  hold_time_s: number;              // default 3.0 — must be in tolerance this long
  require_active_detection: boolean;// default true — detector must still see person
  one_shot: boolean;                // default true — once per mission
}
```

UI surface — a panel in the mission view:
```
┌─ Payload ────────────────────────────┐
│ Status: READY (not dropped)          │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ [ MANUAL DROP ]   (big red btn)  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ☐ Auto-drop when within target       │
│   - Tolerance: [ 1.0 ] m             │
│   - Hold:      [ 3.0 ] s             │
│   - Altitude:  [2.0 ─── 5.0 ] m      │
│   - Require live detection: ☑        │
└──────────────────────────────────────┘
```

**Auto-drop state machine (lives in the backend, not the drone):**
```
IDLE  ──policy.enabled & auto──►  ARMED
ARMED ──in_tolerance & detection_fresh──► CONFIRMING
CONFIRMING ──held > hold_time_s──►  DROPPING
CONFIRMING ──drift_out──►  ARMED (reset hold timer)
DROPPING ──MAV_CMD ack──►  DROPPED
DROPPING ──fail──►  ARMED (3 retries then fault)
DROPPED ──one_shot──►  DONE   (no more auto-drops)
```

**Safety rails (non-negotiable):**
- Operator can hit "MANUAL DROP" any time — bypasses auto-drop state
- Operator can hit "DISARM AUTO" any time — sets `enabled=false`
- If `vehicle.mode` leaves `GUIDED`, auto-drop disarms
- If `vehicle.armed=false`, drop is refused (FC's own interlock)
- If link to drone drops > 1 s, auto-drop disarms

**Acceptance:**
- Manual drop button works in both Map and Survivors views
- Auto-drop only fires when ALL configured conditions hold for the
  full `hold_time_s`
- Drop is one-shot per mission; reset requires explicit
  `/api/reset_mission`
- A failed `MAV_CMD_DO_SET_SERVO` (NACK / no ack within 1 s) does NOT
  mark the survivor as rescued and does NOT clear the one-shot flag

---

### 2.5 "Demo Mode" — a constrained, audience-safe workflow

**Files to add:**
- `src/components/demo/DemoModePanel.tsx`
- new `demoStore.ts`

A toggle in the title bar (or a separate route) that puts the dashboard
in a guided walkthrough state:

1. Pre-flight checklist modal (gates Start):
   - [ ] Drone powered on, props attached
   - [ ] GPS fix ≥ 3D (auto-confirmed from telemetry)
   - [ ] Battery > 70 %
   - [ ] Clear sky, no people in flight zone
   - [ ] Spotter assigned
2. Pre-set search area (5 × 5 m square, centred on drone home)
3. Altitude constrained to **3 m max** across all commands
4. Big step-by-step prompt panel:
   - "Click ARM to begin"
   - "Drone is searching… stand by"
   - "Survivor detected! Click marker to investigate"
   - "Visual confirmation — click DROP when ready"
   - "Click RTL to return home"
5. Always-visible HOVER / RTL emergency buttons at top of screen
6. End-of-demo summary card (time, detections, battery used)

In demo mode, the operator's UI is simplified — fewer settings exposed,
larger touch targets, defaults that match the demo profile.

---

## 3. Backend changes summary

| File | Change |
|---|---|
| `backend/routers/commands.py` | Add `/api/payload/drop`, `/api/payload/policy`, `/api/goto`, `/api/reset_mission` |
| `backend/routers/telemetry_ws.py` | Subscribe to a new UDP socket for incoming `detection_frame` + `survivor_cluster` JSON from the Pi; forward to WebSocket clients |
| `backend/services/payload_service.py` (new) | The auto-drop state machine (FSM described above) |
| `backend/models/drone_state.py` | Add `detections: list[DetectionFrame]`, `payload_state: PayloadState` |
| `backend/models/payload.py` (new) | Pydantic models for `AutoDropPolicy`, `PayloadState`, `DropPayloadRequest`/`Response`, `DetectionFrame` |

---

## 4. Frontend store additions

```ts
// src/store/survivorStore.ts — additions
visibleIds: Set<string>;
setVisibility: (id: string, visible: boolean) => void;
setAllVisible: (visible: boolean) => void;
markRescued: (id: string) => void;

// src/store/missionStore.ts — additions
autoDropPolicy: AutoDropPolicy;
setAutoDropPolicy: (p: Partial<AutoDropPolicy>) => void;
payloadState: "ready" | "armed" | "confirming" | "dropping" | "dropped" | "fault";

// src/store/demoStore.ts — new
demoMode: boolean;
currentStep: number;
checklist: Record<string, boolean>;
```

---

## 5. Phased rollout

| Phase | Scope | Dependency |
|---|---|---|
| **Phase 1 — wiring** | Backend endpoint for the new UDP detection socket; WebSocket relay to frontend; survivor cluster updates already work; add visibility filters in Map | Pi side starts sending survivor_cluster JSON |
| **Phase 2 — survivors page** | New `/survivors` route, table, filters, per-row actions, bulk visibility | Phase 1 |
| **Phase 3 — payload service** | Manual drop button + backend service + interlocks; one-shot guard | Phase 1 |
| **Phase 4 — video overlay** | Switch from iframe to `<video>` + `<canvas>`; render bbox + cluster badges; click-to-select | Phase 1 + Pi sends `detection_frame` |
| **Phase 5 — auto-drop policy** | FSM in backend + policy UI; safety rails | Phase 3 |
| **Phase 6 — demo mode** | Guided walkthrough, checklist, constrained envelope, larger emergency buttons | Phases 3 + 4 |

Phases 1–3 are independent and can land in parallel with the Pi-side
realignment work. Phase 4 is the biggest UI change and benefits from
having a working drone-side detection stream first. Phases 5 and 6 build
on the previous phases.

---

## 6. Things explicitly out of scope (for now)

- **Persistent storage** of survivor history across GCS restarts. Right
  now it lives in Zustand. Add SQLite later if needed.
- **Multi-drone support.** All current designs assume one drone.
- **3D / terrain-aware drop**. We use flat-earth + AGL from baro/GPS.
  Good enough for the demo and most SAR sites.
- **Vendor-locked mobile app.** Stay browser/Electron.

---

## 7. Implementation gaps found in code review

> These are stubs or missing handlers identified in the current dashboard
> codebase. They must be filled before the features in §2 work end-to-end.

### 7.1 Electron main process (`main.js`) — three stub IPC handlers

**`mavlink-upload-mission`** (line ~100 in main.js):
```js
// CURRENT — does nothing real
console.log(`[Main] Mission upload requested: ${waypoints.length} waypoints`);
return { success: true, message: `${waypoints.length} waypoints ready` };
```
Needs the full ArduPilot mission upload handshake:
1. Send `MISSION_COUNT` (count = waypoints.length, target = FC)
2. Wait for `MISSION_REQUEST_INT` for each seq 0…N-1
3. Reply with `MISSION_ITEM_INT` (lat/lon in 1e7 ints, alt in m, command from waypoint)
4. Wait for `MISSION_ACK` (type == MAV_MISSION_ACCEPTED)
5. Send `MAV_CMD_DO_SET_MISSION_CURRENT` seq=0 to arm the new mission

**`mavlink-fly-to`** (main.js, after the upload handler):
```js
// CURRENT — logs coords, does nothing
return { success: true, message: `Flying to ${lat.toFixed(6)}, ${lon.toFixed(6)}` };
```
Needs:
1. Set mode to `GUIDED` (`set_mode(4)` for ArduCopter)
2. Send `SET_POSITION_TARGET_GLOBAL_INT`:
   - `type_mask = 0b110111111000` (position-only, ignore vel/accel/yaw)
   - `coordinate_frame = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT`
   - `lat_int = lat * 1e7`, `lon_int = lon * 1e7`, `alt` in metres AGL

**`mavlink-deploy-payload`**:
```js
// CURRENT — IPC channel registered in preload.js but NO handler in main.js at all
```
Needs:
1. Run interlocks (armed, GUIDED, GPS fix ≥ 3, AGL in [1.5, 10] m, battery > 30 %)
2. Send `MAV_CMD_DO_SET_SERVO` param1=servo_channel, param2=pwm_open_us
3. Wait for COMMAND_ACK
4. Schedule close: send same command with pwm_closed_us after open_hold_secs
5. Return `{success, reason}` to renderer

### 7.2 `GimbalControl.tsx` — UI only, no IPC

The current component updates local state for pitch/yaw but the `applyPreset`
callback has a `// TODO: Send MAV_CMD_DO_MOUNT_CONTROL via IPC` comment and
does nothing. Add:
```ts
// In applyPreset:
if (window.electron) {
    window.electron.setGimbalAngle(p, y);  // new IPC channel needed
}
```
And the corresponding `main.js` handler using `MAV_CMD_DO_MOUNT_CONTROL`:
- param1 = pitch (deg)
- param2 = 0 (roll)
- param3 = yaw (deg)
- param7 = 2 (MAV_MOUNT_MODE_MAVLINK_TARGETING)

### 7.3 `backend/routers/commands.py` — missing `/api/goto`

The survivors page (§2.2) and payload panel (§2.4) both reference a
`/api/goto` endpoint that does not exist in `commands.py`. Add:
```python
class GotoRequest(BaseModel):
    lat: float
    lon: float
    alt: float = 10.0  # metres AGL, capped server-side

@router.post("/goto", response_model=CommandResponse)
async def goto(request: GotoRequest) -> CommandResponse:
    """Switch to GUIDED and fly to lat/lon/alt."""
    ...
```
The handler mirrors the `mavlink-fly-to` IPC logic above but runs in the
Python backend (for browser/web-serial mode). Both paths must exist.

### 7.4 `backend/routers/telemetry_ws.py` — no UDP socket for Pi detections

The backend currently only reads from the serial MAVLink connection. There is
no code to open a UDP socket and receive the `detection_frame` /
`survivor_cluster` JSON packets from the Pi. This is the single biggest
missing piece for Phase 1. See §8.3 for the protocol spec.

### 7.5 `electron/mavlink.js` — required in `main.js` but not in the repo

`main.js` does `require('./electron/mavlink')` and wraps the `MAVLinkHandler`
class. This file is not committed (likely in `.gitignore` or never written).
It must be created alongside the IPC handlers above. Minimum API:
```js
class MAVLinkHandler {
    connect(connectionString, baudRate) → Promise<{success, message}>
    disconnect() → Promise<{success, message}>
    arm() → Promise<{success, message}>
    disarm() → Promise<{success, message}>
    setMode(modeName) → Promise<{success, message}>
    getConnectionProfiles() → Array<ConnectionProfile>
    // New — required by §7.1, §7.2:
    uploadMission(waypoints) → Promise<{success, message}>
    flyTo(lat, lon, alt) → Promise<{success, message}>
    deployPayload() → Promise<{success, message}>
    setGimbalAngle(pitch, yaw) → Promise<{success, message}>
}
```

---

## 8. Recommendations on open design questions

### 8.1 Video overlay — use Path B now, migrate to Path A post-demo

**Recommendation: ship Path B (iframe + external overlay) for the demo.**

The `VideoFeed.tsx` iframe points at `http://<pi-ip>:8889/skyresq_cam`.
Switching to native `<video>` requires the Pi's mediamtx server to expose a
WHEP endpoint. The current Pi config is unknown — adding WHEP may be trivial
or may need a mediamtx upgrade and config change.

For the demo, Path B is faster and lower risk:
- Keep the `<iframe>` as-is
- Add an absolutely-positioned `<div>` layer over it with `pointer-events: none`
- Render cluster-centroid badges (not bbox outlines) on that layer —
  cluster positions are in lat/lon, converted to video coordinates using the
  gimbal's projection math (frames.py already has this)
- Badge clicks work fine; only per-pixel bbox accuracy is lost

Path A (native `<video>` + `<canvas>`) becomes the target once the Pi is
confirmed to serve WHEP. Add this to the mediamtx config on the Pi:
```yaml
# /etc/mediamtx.yml — add under the path entry for skyresq_cam:
paths:
  skyresq_cam:
    source: rtsp://192.168.144.108/...
    webrtcEnabled: true          # already enabled for the iframe
    webrtcICEHostNAT1To1IPs: []
```
WHEP endpoint will then be at:
`http://<pi-ip>:8889/skyresq_cam/whep` — use that as the `<video>` `src`.

### 8.2 Servo channel and PWM values

**Recommendation: default to AUX1, make configurable via `.env`.**

Add to the `.env` (and `backend/config.py`):
```
PAYLOAD_SERVO_CHANNEL=9       # AUX1 = ch 9 on ArduCopter
PAYLOAD_PWM_OPEN_US=1900      # servo open (latch released)
PAYLOAD_PWM_CLOSED_US=1100    # servo closed (latch held)
PAYLOAD_OPEN_HOLD_S=3         # seconds to hold open
```
In `config.py`:
```python
payload_servo_channel: int = 9
payload_pwm_open_us: int = 1900
payload_pwm_closed_us: int = 1100
payload_open_hold_s: float = 3.0
```
**Before first flight**: confirm the channel in Mission Planner under
`SERVO9_FUNCTION` (should be set to `RCPassThru` or a specific servo type)
and test the full open/close cycle on the bench with props off.

### 8.3 Pi → GCS UDP protocol

The Pi's `gcs_link` ROS node will send JSON packets to the GCS over UDP.
Agreed protocol:

| Parameter | Value |
|---|---|
| Pi sends to | `GCS_TAILSCALE_IP:5005` (configured in Pi's `.env`) |
| GCS listens on | `0.0.0.0:5005` UDP |
| Format | newline-delimited JSON (one JSON object per datagram) |
| Max datagram size | 64 KB (well within UDP limit; `detection_frame` with 20 boxes ≈ 1 KB) |
| Loss handling | UDP — loss is OK; stale `detection_frame` discarded by timestamp |
| Auth | None for now (Tailscale provides network-layer auth) |

Add to GCS `.env`:
```
PI_DETECTION_HOST=0.0.0.0
PI_DETECTION_PORT=5005
GCS_TAILSCALE_IP=100.123.87.26   # Pi's Tailscale IP (already in VideoFeed.tsx)
```

The GCS backend opens this socket in `telemetry_ws.py` lifespan and
dispatches messages by `"type"` field:
- `"survivor_cluster"` → `survivorStore` update + WebSocket broadcast
- `"detection_frame"` → most-recent-only buffer + WebSocket broadcast
- anything else → logged and dropped

### 8.4 Demo mode — one codebase, one toggle

**Recommendation: single codebase, `DEMO_MODE` toggle in the title bar.**

Two separate codebases would diverge immediately and double maintenance
burden. The demo-mode overlay approach from §2.5 is the right call:

- `demoStore.ts` holds `demoMode: boolean` (persisted to `localStorage` so
  a page refresh during the demo doesn't reset it)
- A small "DEMO" badge in the title bar; clicking it toggles the mode
  (requires clicking through a confirmation — can't accidentally enter demo
  mode during a real mission)
- Demo mode gates: 3 m altitude cap enforced server-side (the `/api/goto`
  endpoint and the mission upload handler both clamp `alt` to 3.0 when
  `settings.demo_mode` is `True`), pre-set 5×5 m search area, step-by-step
  prompts panel, and constrained UI (fewer settings exposed)
- `DEMO_MODE=true` can also be set in `.env` to hard-lock the GCS into demo
  mode for an event (so it can't be accidentally toggled off)

Add to `backend/config.py`:
```python
demo_mode: bool = False
demo_max_alt_m: float = 3.0
demo_search_radius_m: float = 5.0
```

### 8.5 Two-channel telemetry — 4G primary, SiK backup

**The drone now sends MAVLink over both SiK and 4G simultaneously.**
The dashboard should prefer whichever has fresher heartbeats and fall
back automatically when one goes silent.

```ts
// Pseudo-code for the failover state machine
type Link = { name: 'sik' | 'udp', last_hb_ms: number, connected: boolean };

function pickActiveLink(sik: Link, udp: Link): Link {
    const FRESH = 1500;  // ms — a link is "fresh" if a heartbeat arrived this recently
    const now = Date.now();
    const sikFresh = (now - sik.last_hb_ms) < FRESH;
    const udpFresh = (now - udp.last_hb_ms) < FRESH;

    if (udpFresh) return udp;        // prefer 4G when both are alive
    if (sikFresh) return sik;        // fall back to SiK
    return udp.connected ? udp : sik; // both stale — keep the connected one
}
```

**Why prefer UDP/4G when both are alive:**
- 10 Hz update rate (vs 4 Hz on SiK)
- No 433/915 MHz multipath dropouts
- Lower latency (~50 ms vs ~200 ms)
- Same data, no parser changes

**Recommended UI surface:** a tiny pair of dots in the title bar:
```
●—— 4G  10Hz   ←active
●—— SiK 4 Hz
```
Both green when alive, red when stale > 1.5 s. Clicking either dot
toggles a "force this link" override that disables the auto-switch
(useful for testing).

**On the Pi side**, both paths share the same FC serial connection so
arming/mode commands sent over either channel reach the FC. The dashboard
can keep using the SiK serial port for commands (its existing path) and
just **listen** on the UDP socket — that's the lowest-friction migration.

### 8.6 detection_frame is now live

`detection_frame` packets (§1.2) start flowing as soon as the Pi
pipeline is running. They arrive at the detector rate (~5–10 Hz) and
contain bbox lists in source-camera pixel coordinates with
`stream_width` and `stream_height` populated from the actual RTSP
frame. The GCS can switch from Path B (cluster badges only) to Path A
(per-detection bbox outlines + clickable cluster badges) without
waiting on any Pi-side work.
