import os
import re

with open(r'c:\Users\yesav\Downloads\distipettu\js\services-data.js', 'r', encoding='utf-8') as f:
    text = f.read()

ids = re.findall(r'id:\s*"([^"]+)"', text)
print(f'Total in registry: {len(ids)}')

vdir = r'c:\Users\yesav\Downloads\distipettu\assets\villains'
existing = os.listdir(vdir)
missing = []
for vid in ids:
    fname = f'{vid}.jpg'
    fpath = os.path.join(vdir, fname)
    if fname not in existing:
        missing.append((vid, 'missing'))
    elif os.path.getsize(fpath) < 5000:
        missing.append((vid, f'small: {os.path.getsize(fpath)}'))

print('Missing or small:', missing)

