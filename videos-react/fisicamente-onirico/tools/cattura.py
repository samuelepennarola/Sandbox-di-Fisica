# Cattura una scena di Fisicamente fotogramma per fotogramma, con orologio virtuale:
# 60 fps esatti anche se lo screenshot è lento. Serve il dev server dell'app.
# Uso:
#   python tools/cattura.py sonda threebody sources ...        -> PNG di prova dopo 1 s e 4 s
#   python tools/cattura.py clip <exp> <secondi> <uscita.mp4> [--tema chiaro] [--attesa 0.8]
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright

URL = os.environ.get('FISICA_URL', 'http://127.0.0.1:5173/')
VW, VH, DPR = 1280, 800, 1.5
FRAME_MS = 1000 / 60


def apri(pw, exp, tema):
    br = pw.chromium.launch()
    ctx = br.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=DPR,
                         reduced_motion='no-preference')
    ctx.add_init_script(
        f"""try {{
          localStorage.setItem('fs.lastExp', JSON.stringify('{exp}'));
          localStorage.setItem('fs.theme', JSON.stringify('{tema}'));
          localStorage.setItem('fs.tour.dismissed', 'true');
        }} catch (e) {{}}"""
    )
    page = ctx.new_page()
    errori = []
    page.on('pageerror', lambda e: errori.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errori.append(m.text))
    page.clock.install(time=0)
    page.goto(URL + '?rec', wait_until='load')
    page.clock.run_for(1200)
    return br, page, errori


def play(page):
    page.evaluate("document.getElementById('playBtn')?.click()")


def sonda(exps, out_dir, tema):
    with sync_playwright() as pw:
        for exp in exps:
            br, page, err = apri(pw, exp, tema)
            page.screenshot(path=os.path.join(out_dir, f'{exp}_0.png'))
            play(page)
            for s in (1, 4):
                page.clock.run_for(1000 if s == 1 else 3000)
                page.screenshot(path=os.path.join(out_dir, f'{exp}_{s}.png'))
            print(exp, 'errori:', err[:3])
            br.close()


def clip(exp, secondi, uscita, tema, attesa, avvia):
    tmp = tempfile.mkdtemp(prefix='cattura_')
    with sync_playwright() as pw:
        br, page, err = apri(pw, exp, tema)
        if avvia:
            play(page)
        page.clock.run_for(int(attesa * 1000))
        n = int(round(secondi * 60))
        for i in range(n):
            page.clock.run_for(FRAME_MS)
            page.screenshot(path=os.path.join(tmp, f'f{i:05d}.png'))
        print(exp, 'fotogrammi', n, 'errori:', err[:3])
        br.close()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '60', '-i', os.path.join(tmp, 'f%05d.png'),
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', uscita], check=True)
    shutil.rmtree(tmp)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('modo', choices=['sonda', 'clip'])
    ap.add_argument('args', nargs='+')
    ap.add_argument('--tema', default='dark')
    ap.add_argument('--attesa', type=float, default=0.0)
    ap.add_argument('--fermo', action='store_true', help='non premere Play')
    ap.add_argument('--dir', default='.')
    a = ap.parse_args()
    if a.modo == 'sonda':
        sonda(a.args, a.dir, a.tema)
    else:
        exp, sec, out = a.args[0], float(a.args[1]), a.args[2]
        clip(exp, sec, out, a.tema, a.attesa, not a.fermo)
    sys.exit(0)
