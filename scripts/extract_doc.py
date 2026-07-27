"""Extract text from .doc (WPS/Word old format) via olefile. Usage: python extract_doc.py <file>"""
import olefile, struct, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def extract(path):
    ole = olefile.OleFileIO(path)
    stream = ole.openstream('WordDocument').read()
    # Extract readable tokens: runs of CJK+ASCII at least 2 chars long
    chars = []
    for i in range(0, len(stream) - 1, 2):
        c = struct.unpack('<H', stream[i:i+2])[0]
        # Keep: CJK, digits, letters, common punctuation
        if (0x4E00 <= c <= 0x9FFF or 0x3000 <= c <= 0x303F or 0xFF00 <= c <= 0xFFEF or
            0x30 <= c <= 0x39 or 0x41 <= c <= 0x5A or 0x61 <= c <= 0x7A or
            c == 0x20):
            chars.append(chr(c))
        else:
            chars.append(' ')
    raw = ''.join(chars)
    # Keep only tokens with >=2 chars (filter isolated binary bytes)
    tokens = [t for t in raw.split() if len(t) >= 2]
    return ' '.join(tokens)

if __name__ == '__main__':
    print(extract(sys.argv[1]))
