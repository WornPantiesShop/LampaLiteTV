import {writeFileSync,mkdirSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
// Node.js 22+; forward the app's WebView DevTools socket to localhost:9223 first.
const exec=promisify(execFile);
const device=process.env.LAMPA_DEVICE||'192.168.31.18:5555';
const out=resolve(process.argv[2]||'diagnostics/navigation');mkdirSync(out,{recursive:true});
const page=(await(await fetch('http://127.0.0.1:9223/json')).json()).find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let seq=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true})).result.value;
await evaluate(`(()=>{document.getElementById('lampa-logo-containment-test')?.remove();Lampa.Controller.toggle('content');Lampa.Controller.collectionFocus(document.querySelector('.items-line .card'));return true})()`);
await new Promise(r=>setTimeout(r,1200));
await call('Performance.enable');const metrics=await call('Performance.getMetrics');
await evaluate(`(()=>{const p={keys:[],frames:[],until:0,running:false};window.__lampaNavProbe=p;p.key=e=>{if(e.keyCode<37||e.keyCode>40)return;const now=performance.now();p.keys.push({code:e.keyCode,time:now});p.until=now+600;if(!p.running){p.running=true;requestAnimationFrame(tick)}};function tick(t){p.frames.push(t);if(t<p.until)requestAnimationFrame(tick);else p.running=false}document.addEventListener('keydown',p.key,true);return true})()`);

const common=['-NoProfile','-ExecutionPolicy','Bypass','-File'];const adb=process.env.LAMPA_ADB||join(process.env.LOCALAPPDATA,'Android/Sdk/platform-tools/adb.exe');const repo=fileURLToPath(new URL('..',import.meta.url));
const bench=exec('powershell',[...common,repo+'/benchmark-c645.ps1','-AdbPath',adb,'-Device',device,'-Seconds','24','-OutputPath',out+'/frames.txt']);
const diag=exec('powershell',[...common,repo+'/diagnose-c645.ps1','-AdbPath',adb,'-Device',device,'-Seconds','24','-OutputDirectory',out]);
await new Promise(r=>setTimeout(r,4000));
const keys=process.argv[3]==='rows'?[20,22,22,21,21,20,22,22,21,21,20,22,21,19,22,22,21,21,19,22,22,21,21,19]:Array.from({length:4},()=>[22,22,22,21,21,21]).flat();
await exec(adb,['-s',device,'shell','CLASSPATH=/data/local/tmp/c645-navigation-driver.dex app_process /system/bin C645NavigationDriver 600 '+keys.join(' ')],{timeout:90000});
const data=JSON.parse(await evaluate(`JSON.stringify({keys:window.__lampaNavProbe.keys,frames:window.__lampaNavProbe.frames,now:performance.now(),focus:document.querySelector('.focus')?.textContent,controller:Lampa.Controller.enabled().name,rows:document.querySelectorAll('.items-line').length,compositor:window.__lampaLiteFire?.status})`));
data.metrics=metrics.metrics;writeFileSync(out+'/probe.json',JSON.stringify(data));
await evaluate(`document.removeEventListener('keydown',window.__lampaNavProbe.key,true);delete window.__lampaNavProbe;true`);
const b=await bench,d=await diag;writeFileSync(out+'/benchmark.log',b.stdout+b.stderr);writeFileSync(out+'/diagnose.log',d.stdout+d.stderr);console.log(b.stdout);console.log('keys',data.keys.length,'controller',data.controller,'raf',data.frames.length);ws.close();

