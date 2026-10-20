#!/usr/bin/env python3
"""Package the Chrome extension with its local art and MIT license."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'manifest.json').read_text())['version']
output = root / 'release' / f'my-pet-buddy-chrome-{version}.zip'
files = ['manifest.json', 'pets.js', 'observer.js', 'content.js', 'popup.html',
         'popup.js', 'popup-controller.js', 'popup.css', 'LICENSE', 'README.md']
for directory in ['pets', 'icons']:
    files.extend(str(path.relative_to(root)) for path in sorted((root / directory).rglob('*'))
                 if path.is_file() and not path.name.startswith('.'))
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
print(output)
