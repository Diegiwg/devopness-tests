import os
import http.server
import socketserver

PORT = os.getenv("PORT_BIND")
MSG = os.getenv("MSG_OUTPUT")

if PORT is None or MSG is None:
    raise RuntimeError("Missing required environment variables: PORT_BIND and/or MSG_OUTPUT")

try:
    PORT = int(PORT)
except ValueError:
    raise ValueError("PORT_BIND must be a valid integer")

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT} - {MSG}")
    httpd.serve_forever()
