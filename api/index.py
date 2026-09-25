"""Vercel Python Function entry point for the complete SmartPark web app."""

from Frontend.server import Handler
from urllib.parse import urlparse, parse_qs, urlencode

class handler(Handler):
    def _fix_path(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/index"):
            query = parse_qs(parsed.query, keep_blank_values=True)
            if "_vercel_path" in query:
                original = "/" + query.pop("_vercel_path")[0]
                new_query = urlencode(query, doseq=True)
                self.path = original + ("?" + new_query if new_query else "")

    def do_GET(self):
        self._fix_path()
        super().do_GET()

    def do_POST(self):
        self._fix_path()
        super().do_POST()
