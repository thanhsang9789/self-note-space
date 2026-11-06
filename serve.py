"""Local development server that mirrors GitHub Pages SPA routing."""
import http.server
import os
import socket
import socketserver
import sys

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


class GitHubPagesSPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            fallback = os.path.join(ROOT_DIR, "404.html")
            if os.path.isfile(fallback):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                with open(fallback, "rb") as f:
                    body = f.read()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().send_error(code, message, explain)


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", port), GitHubPagesSPAHandler) as httpd:
        lan_ip = get_lan_ip()
        print(f"\n  SelfNote / Unsaid Space Server running:")
        print(f"  • Local:   http://localhost:{port}/space")
        print(f"  • Phone:   http://{lan_ip}:{port}/space  (same Wi-Fi)\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
