import json
from pathlib import Path
for name in __import__('sys').argv[1:]:
 d=json.loads(Path(name+'/probe.json').read_text());nav=next(m['value'] for m in d['metrics'] if m['name']=='NavigationStart');times=[int(x) for x in Path(name+'/frames.txt').read_text(encoding='utf-8-sig').splitlines()[1:]];intervals=[];raf=[]
 for key in d['keys']:
  t=nav+key['time']/1000;fs=[f/1e9 for f in times if t<=f/1e9<=t+.4];intervals.extend([(b-a)*1000 for a,b in zip(fs,fs[1:])]);rf=[x for x in d['frames'] if key['time']<=x<=key['time']+400];raf.extend([b-a for a,b in zip(rf,rf[1:])])
 def stat(xs):
  a=sorted(xs);return {'n':len(a),'fps':1000/(sum(a)/len(a)),'median':a[len(a)//2],'p95':a[int(len(a)*.95)],'over25':sum(x>25 for x in a)} if a else {}
 print(name,'keys',len(d['keys']),'SF',stat(intervals),'RAF',stat(raf),'firstFrame',times[0]/1e9,'firstKey',nav+d['keys'][0]['time']/1000 if d['keys'] else None)



