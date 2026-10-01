"""Static dev server with caching disabled."""
import http.server, functools, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
http.server.ThreadingHTTPServer(("", 4321), functools.partial(NoCache, directory=root)).serve_forever()
