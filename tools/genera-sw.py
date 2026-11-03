#!/usr/bin/env python3
"""Rigenera sw.js con l'elenco di tutti i file dell'app e un numero di versione.

Va lanciato prima di ogni pubblicazione:  python3 tools/genera-sw.py
Il service worker salva questi file sul dispositivo al primo avvio (così l'app funziona offline);
quando la versione cambia, l'app mostra l'avviso «È disponibile una nuova versione».
"""
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'js', 'vendor', 'icons']
SKIP = {'.DS_Store'}


def files():
    out = []
    for item in INCLUDE:
        path = os.path.join(ROOT, item)
        if os.path.isfile(path):
            out.append(item)
            continue
        for d, _, names in os.walk(path):
            for n in names:
                if n in SKIP or n.endswith('.md'):
                    continue
                out.append(os.path.relpath(os.path.join(d, n), ROOT).replace(os.sep, '/'))
    return sorted(out)


def main():
    lst = files()
    h = hashlib.sha256()
    for f in lst:
        h.update(f.encode())
        with open(os.path.join(ROOT, f), 'rb') as fh:
            h.update(fh.read())
    version = h.hexdigest()[:10]
    with open(os.path.join(ROOT, 'tools', 'sw-template.js'), encoding='utf-8') as fh:
        tpl = fh.read()
    sw = tpl.replace('__VERSION__', version).replace('__FILES__', json.dumps(['./'] + lst, indent=2))
    with open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8') as fh:
        fh.write(sw)
    print(f'sw.js aggiornato: versione {version}, {len(lst)} file')


if __name__ == '__main__':
    main()
