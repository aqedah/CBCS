"""HWP 5.0 (olefile) 표 셀 단위 추출기.
tables(path) -> [ {id, level, rows, cols, cells:[{row,col,rowspan,colspan,paras:[str]}], parent:(table_id,cell_idx)|None} ]
body(path) -> 본문(표 밖) 문단 텍스트 리스트
"""
import olefile, zlib, struct

def _records(path):
    ole = olefile.OleFileIO(path)
    hdr = ole.openstream('FileHeader').read()
    compressed = hdr[36] & 1
    for s in sorted(ole.listdir()):
        if s[0] == 'BodyText':
            data = ole.openstream(s).read()
            if compressed:
                data = zlib.decompress(data, -15)
            i = 0
            while i + 4 <= len(data):
                h = struct.unpack('<I', data[i:i+4])[0]
                tag = h & 0x3ff; level = (h >> 10) & 0x3ff; size = (h >> 20) & 0xfff; i += 4
                if size == 0xfff:
                    size = struct.unpack('<I', data[i:i+4])[0]; i += 4
                yield tag, level, data[i:i+size]
                i += size

def _ptext(t):
    s = []; j = 0
    while j + 1 < len(t):
        c = struct.unpack('<H', t[j:j+2])[0]
        if c == 10:
            s.append('\n'); j += 2; continue
        if c in (0, 13, 24, 25, 26, 27, 28, 29, 30, 31):
            j += 2; continue
        if c == 9:
            s.append(' '); j += 16; continue
        if c < 32:
            j += 16; continue
        s.append(chr(c)); j += 2
    return ''.join(s)

def parse(path):
    tables = []          # 모든 표
    body = []            # 표 밖 문단
    open_tables = {}     # level -> table (TABLE 레코드 level 기준 = LIST level)
    cur_cell = {}        # list level -> cell
    pending_tbl_level = None
    for tag, level, d in _records(path):
        if tag == 71 and d[:4][::-1] == b'tbl ':
            pending_tbl_level = level
        elif tag == 77 and pending_tbl_level is not None:  # TABLE
            rows, cols = struct.unpack('<HH', d[4:8])
            t = {'id': len(tables), 'level': level, 'rows': rows, 'cols': cols, 'cells': [], 'parent': None}
            # 부모 셀: 이 표가 어느 셀 안의 문단에 들어있는가 (CTRL level = para level = list level+1)
            pl = pending_tbl_level - 1
            if pl in cur_cell:
                pc = cur_cell[pl]
                t['parent'] = (pc['_tid'], pc['_idx'])
            tables.append(t)
            open_tables[level] = t
            # 더 깊은 레벨의 열린 표/셀은 닫음
            for L in [k for k in open_tables if k > level]: del open_tables[L]
            for L in [k for k in cur_cell if k >= level]: del cur_cell[L]
            pending_tbl_level = None
        elif tag == 72:  # LIST_HEADER
            t = open_tables.get(level)
            if t is None:
                # 표 셀이 아닌 리스트(글상자 등) → 무시하되 셀 컨텍스트 정리
                for L in [k for k in cur_cell if k >= level]: del cur_cell[L]
                continue
            if len(d) >= 16:
                col, row, cs, rs = struct.unpack('<HHHH', d[8:16])
            else:
                col = row = cs = rs = 0
            cell = {'row': row, 'col': col, 'rowspan': rs, 'colspan': cs, 'paras': [],
                    '_tid': t['id'], '_idx': len(t['cells'])}
            t['cells'].append(cell)
            cur_cell[level] = cell
            for L in [k for k in cur_cell if k > level]: del cur_cell[L]
        elif tag == 67:  # PARA_TEXT
            txt = _ptext(d)
            c = cur_cell.get(level - 1)
            if c is not None:
                c['paras'].append(txt)
            elif level == 1:
                body.append(txt)
        elif tag == 66 and level == 1 - 1:  # 본문 PARA_HEADER (level 0) → 셀 컨텍스트 종료
            cur_cell.clear(); open_tables.clear()
    for t in tables:
        for c in t['cells']:
            c.pop('_tid', None); c.pop('_idx', None)
    return tables, body

def grid(t):
    """표를 rows x cols 문자열 격자로. 병합 셀은 왼쪽 위에만 채우고 나머지는 None."""
    g = [[None] * t['cols'] for _ in range(t['rows'])]
    for c in t['cells']:
        if c['row'] < t['rows'] and c['col'] < t['cols']:
            g[c['row']][c['col']] = c
    return g

def cell_text(c, sep='\n'):
    return sep.join(p for p in c['paras']).strip() if c else ''

if __name__ == '__main__':
    import sys
    for p in sys.argv[1:]:
        tables, body = parse(p)
        print('=====', p)
        print('BODY:', body)
        for t in tables:
            print(f"--- table {t['id']} level{t['level']} {t['rows']}x{t['cols']} parent={t['parent']} cells={len(t['cells'])}")
            for c in t['cells']:
                print(f"  r{c['row']} c{c['col']} rs{c['rowspan']} cs{c['colspan']}: {[p for p in c['paras']]}")
