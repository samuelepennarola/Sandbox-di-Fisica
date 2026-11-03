# Server di sviluppo: come `python3 -m http.server`, ma senza cache del browser,
# così ogni modifica ai moduli JS si vede al primo ricaricamento.
#
# Safari prova prima a collegarsi in https: senza accorgimenti il server resta in attesa
# di una riga di richiesta che non arriva mai e la pagina impiega molti secondi ad aprirsi.
# Chiudiamo subito le connessioni che iniziano con un handshake TLS, così Safari ripiega su http all'istante.
import http.server
import os
import socket
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TLS_HANDSHAKE = 0x16


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def handle(self):
        self.request.settimeout(10)
        try:
            first = self.request.recv(1, socket.MSG_PEEK)
        except (socket.timeout, ConnectionError):
            return
        if not first or first[0] == TLS_HANDSHAKE:
            return
        try:
            super().handle()
        except (socket.timeout, ConnectionError):
            pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
http.server.ThreadingHTTPServer((host, port), NoCache).serve_forever()
