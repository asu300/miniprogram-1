"""Extract text from .doc (WPS/Word old format) via olefile. Usage: python extract_doc.py <file>"""
import olefile, struct, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def extract(path):
    ole = olefile.OleFileIO(path)
    stream = ole.openstream('WordDocument').read()
    parts = []
    for i in range(0, len(stream) - 1, 2):
        c = struct.unpack('<H', stream[i:i+2])[0]
        parts.append(chr(c) if 0x20 <= c < 0xFFFF and c != 0xFFFE else ' ')
    return re.sub(r'\s+', ' ', ''.join(parts)).strip()

if __name__ == '__main__':
    print(extract(sys.argv[1]))
