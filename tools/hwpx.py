import zipfile, re, sys
for p in sys.argv[1:]:
    print('=====', p)
    z = zipfile.ZipFile(p)
    for n in sorted(z.namelist()):
        if n.startswith('Contents/section'):
            x = z.read(n).decode('utf-8','replace')
            # paragraph breaks and cell breaks
            x = re.sub(r'</hp:p>', '\n', x)
            x = re.sub(r'</hp:tc>', ' | ', x)
            x = re.sub(r'</hp:tr>', '\n', x)
            t = re.sub(r'<[^>]+>', '', x)
            t = re.sub(r'\n\s*\n+', '\n', t)
            print(t)
