"""Rebuild the inline Tailwind CSS in index.html (replaces the in-browser Tailwind CDN).

Usage: python3 tools/build-css.py   (needs Node.js; installs tailwindcss@3.4.17 via npx)
Scans index.html for classes, adds the Lintas color variants that are created at
runtime from the Kasku merchant kit, then writes minified CSS between the
<!-- tw:start --> and <!-- tw:end --> markers.
"""
import re, subprocess, tempfile, os, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text()
kit = re.search(r'<div id="merchant-kit" class="merchant-kit">(.*?)<!-- /merchant-kit -->', html, re.S)
src = kit.group(1) if kit else html
for a, b in [('from-[#118EEA] to-blue-500 hover:from-blue-600 hover:to-blue-500', 'from-[#C2410C] to-[#C2410C] hover:from-[#A8380A] hover:to-[#A8380A]'),
             ('shadow-blue-500', 'shadow-orange-700'), ('hover:bg-blue-600', 'hover:bg-[#A8380A]'), ('bg-blue-50', 'bg-orange-50'),
             ('border-blue-100', 'border-orange-100'), ('rgba(17,142,234', 'rgba(194,65,12'), ('#118EEA', '#C2410C')]:
    src = src.replace(a, b)
with tempfile.TemporaryDirectory() as d:
    (pathlib.Path(d) / 'extra.html').write_text(src)
    (pathlib.Path(d) / 'in.css').write_text('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')
    (pathlib.Path(d) / 'tw.config.js').write_text("module.exports = { content: [%r, %r] };" % (str(root / 'index.html'), os.path.join(d, 'extra.html')))
    out = os.path.join(d, 'out.css')
    subprocess.run(['npx', '--yes', 'tailwindcss@3.4.17', '-c', os.path.join(d, 'tw.config.js'), '-i', os.path.join(d, 'in.css'), '-o', out, '--minify'], check=True, capture_output=True)
    css = pathlib.Path(out).read_text()
block = '<!-- tw:start -->\n    <style id="tw">' + css + '</style>\n    <!-- tw:end -->'
if '<!-- tw:start -->' in html:
    html = re.sub(r'<!-- tw:start -->.*?<!-- tw:end -->', lambda m: block, html, flags=re.S)
else:
    html = html.replace('    <script src="https://cdn.tailwindcss.com/3.4.17"></script>', '    ' + block)
(root / 'index.html').write_text(html)
print('inline tailwind css:', len(css), 'bytes')
