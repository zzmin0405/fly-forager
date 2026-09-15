"""공개 좌표를 연결망의 원래 뉴런 순서로 정렬한다. 첫 대표 좌표만 사용한다."""
import array
import csv
import gzip
import json
import struct
from pathlib import Path

source = Path('D:/opensource/flybrain-reference/data')
output = Path(__file__).parent / 'dist'
with gzip.open(source / 'neurons.csv.gz', 'rt') as f:
    ids = [r['root_id'] for r in csv.DictReader(f)]
assert len(ids) == len(set(ids)) == 139255
lookup = {rid: i for i, rid in enumerate(ids)}
positions = array.array('f', [float('nan')] * (len(ids) * 3))
seen = set()
with gzip.open(source / 'coordinates.csv.gz', 'rt') as f:
    for row in csv.DictReader(f):
        i = lookup.get(row['root_id'])
        if i is None or i in seen:
            continue
        xyz = [float(x) for x in row['position'].strip('[]').split()]
        assert len(xyz) == 3
        positions[i*3:i*3+3] = array.array('f', xyz)
        seen.add(i)
with gzip.open(output / 'connectome.bin.gz', 'rb') as f:
    n, edges = struct.unpack('<II', f.read(8))
assert n == len(ids)
(output / 'neuron-positions.bin').write_bytes(positions.tobytes())
(output / 'neuron-ids.json').write_text(json.dumps(ids, separators=(',', ':')), encoding='utf-8')
(output / 'neuron-view-meta.json').write_text(json.dumps({
    'nodes': n, 'positioned': len(seen), 'missing': n-len(seen),
    'source': 'https://github.com/snedea/flybrain',
    'source_commit': '9191824d17871b7851645782d53d23f213ddb938',
    'note': 'coordinates.csv.gz의 뉴런별 첫 대표 좌표. 세포체 또는 전체 신경 가지 형태가 아님.',
}, ensure_ascii=False), encoding='utf-8')
print(f'{len(seen)}/{n} 뉴런 좌표 정렬 완료')
