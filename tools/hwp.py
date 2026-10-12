import olefile, zlib, struct, sys
def text(path):
    ole = olefile.OleFileIO(path)
    hdr = ole.openstream('FileHeader').read()
    compressed = hdr[36] & 1
    out=[]
    for s in sorted(ole.listdir()):
        if s[0]=='BodyText':
            data = ole.openstream(s).read()
            if compressed: data = zlib.decompress(data, -15)
            i=0
            while i < len(data):
                h = struct.unpack('<I', data[i:i+4])[0]
                tag = h & 0x3ff; size = (h>>20)&0xfff; i+=4
                if size==0xfff:
                    size = struct.unpack('<I', data[i:i+4])[0]; i+=4
                if tag==67: # PARA_TEXT
                    t = data[i:i+size]
                    s_=''; j=0
                    while j+1 < len(t):
                        c = struct.unpack('<H', t[j:j+2])[0]
                        if c in (0,10,13,24,25,26,27,28,29,30,31): j+=2; continue
                        if c in (1,2,3,11,12,14,15,16,17,18,21,22,23): j+=16; continue
                        if c in (4,5,6,7,8,9,19,20): j+=16; continue
                        s_+=chr(c); j+=2
                    out.append(s_)
                i+=size
    return '\n'.join(out)
if __name__ == '__main__':
  for p in sys.argv[1:]:
    print('=====', p); print(text(p).encode('utf-8','replace').decode('utf-8'))
