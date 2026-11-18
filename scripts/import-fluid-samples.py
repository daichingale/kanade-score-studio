"""Import selected FluidR3 sample pitches as data (never execute downloaded JS).
Source packaging: gleitz/midi-js-soundfonts, FluidR3_GM, CC BY 3.0.
Run from the repository root; Python is needed only to refresh these assets.
"""
import concurrent.futures, hashlib, json, pathlib, re, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'app/web/samples'; OUT.mkdir(exist_ok=True)
INSTRUMENTS=['acoustic_grand_piano','trombone','trumpet','flute','clarinet','violin','french_horn','alto_sax','tenor_sax','tuba','oboe','bassoon']
def fetch(url):
    with urllib.request.urlopen(url,timeout=90) as response: return response.read()
def run(name):
    url=f'https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/FluidR3_GM/{name}-mp3.js'
    raw=fetch(url); text=raw.decode(); start=text.index('{',text.index('MIDI.Soundfont.')); end=text.rfind('}')
    # The upstream payload is a JSON object inside an assignment.
    data=json.loads(re.sub(r",\s*}","}",text[start:end+1])); notes={}
    semitones={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
    for note,value in data.items():
        m=re.fullmatch(r'([A-G])([#b]?)(-?\d+)',note)
        if not m: continue
        midi=(int(m[3])+1)*12+semitones[m[1]]+({'#':1,'b':-1,'':0}[m[2]])
        if midi%3==0 or midi in (21,108,127): notes[str(midi)]=value
    if len(notes)<25 or any(not v.startswith('data:audio/mp3;base64,') and not v.startswith('data:audio/mpeg;base64,') for v in notes.values()): raise ValueError('Unexpected audio payload')
    payload={'source':url,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'samples':notes}
    (OUT/f'{name}.json').write_text(json.dumps(payload,separators=(',',':')),encoding='utf-8')
    print(name,len(notes),len(json.dumps(payload)),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: list(pool.map(run,INSTRUMENTS))
(OUT/'UPSTREAM-README.md').write_bytes(fetch('https://raw.githubusercontent.com/gleitz/midi-js-soundfonts/gh-pages/README.md'))
