// Browser API simulation: tests application behavior, not real device pixels or OS saves.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const code=fs.readFileSync('app.js','utf8');
function setup(){
  const h={delays:[],downloads:[],urls:new Map(),revoked:[],created:[],requests:[],stopped:0,events:{}};
  class Element{
    constructor(tag='div'){
      this.tagName=tag;this.children=[];this.firstChild={textContent:''};this.attrs={};this.style={};this.hidden=false;this.value='';this.textContent='';this.disabled=false;this.width=400;this.height=300;this.naturalWidth=800;this.naturalHeight=600;this.videoWidth=1280;this.videoHeight=720;this.ops=[];this.classList={add(){},remove(){}};
      const ctx={filter:'none',fillStyle:'',font:'',save(){this.saved={filter:this.filter};},restore(){Object.assign(this,this.saved);},measureText:t=>({width:t.length*8})};
      for(const method of ['drawImage','fillRect','clearRect','strokeRect','beginPath','arc','fill','fillText','translate','scale','moveTo','lineTo','closePath'])ctx[method]=(...args)=>{this.ops.push({method,args,filter:ctx.filter,fillStyle:ctx.fillStyle});};
      this.ctx=ctx;h.created.push(this);
    }
    getContext(){return this.ctx;}
    toDataURL(type='image/png'){if(this.failExport)throw Error('Export failed');return `data:${type};base64,MOCK-${this.width}-${this.height}`;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k];}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(){this.children=[];}
    querySelector(){return this.paragraph ||=new Element('p');}
    showModal(){this.open=true;}
    close(){this.open=false;}
    click(){if(this.disabled)return;if(this.tagName==='a')h.downloads.push({href:this.href,name:this.download});else{this.clicked=true;return this.onclick?.();}}
    remove(){this.removed=true;}
    focus(){h.focused=this;}
    scrollIntoView(){h.scrolled=this;}
    getBoundingClientRect(){return {left:100,top:100,right:500,bottom:700};}
    async play(){if(h.playError)throw h.playError;}
    async decode(){const file=h.urls.get(this.src);if(file?.bad)throw Error('Corrupt image');this.videoWidth=0;this.videoHeight=0;this.naturalWidth=file?.w||800;this.naturalHeight=file?.h||600;}
  }
  const ids=[...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)];
  h.el=Object.fromEntries(ids.map(([tag,id])=>{const e=new Element();e.hidden=/\shidden(?:\s|>)/.test(tag);e.disabled=/\sdisabled(?:\s|>)/.test(tag);return [id,e];}));
  h.el['camera-target'].value='4';h.el['upload-target'].value='4';h.el.timer.value='0';
  h.el['effect-x'].value='200';h.el['effect-y'].value='135';h.el['effect-size'].value='100';
  h.track={addEventListener:(name,fn)=>{h.ended=fn;},stop:()=>h.stopped++};
  h.stream={getTracks:()=>[h.track],getVideoTracks:()=>[h.track]};
  const sandbox={console,Date,Math,Image:Element,URL:{createObjectURL:file=>{const url=`blob:${h.urls.size}`;h.urls.set(url,file);return url;},revokeObjectURL:url=>h.revoked.push(url)},setTimeout:(fn,ms)=>{h.delays.push(ms);h.onDelay?.(ms);queueMicrotask(fn);},window:{addEventListener:(name,fn)=>{h.events[name]=fn;},matchMedia:()=>({matches:!!h.reducedMotion})},navigator:{mediaDevices:{getUserMedia:async options=>{h.requests.push(options);if(h.cameraError)throw h.cameraError;return h.stream;}}},document:{getElementById:id=>{assert.ok(h.el[id],`Missing element ${id}`);return h.el[id];},createElement:tag=>new Element(tag),body:new Element('body'),documentElement:{dataset:{theme:html.match(/data-theme="([^"]+)"/)[1]}},fonts:{ready:Promise.resolve()}}};
  vm.createContext(sandbox);h.run=source=>vm.runInContext(source,sandbox);h.run(code);h.state=expression=>h.run(expression);return h;
}
async function cameraPrint(h,count=4,timer=0){
  h.el['camera-target'].value=String(count);h.el.timer.value=String(timer);
  await h.run('enableCamera()');await h.run('captureBurst()');
  for(const index of [3,1,0,2].slice(0,count))h.el.gallery.children[index].click();
  await h.el['build-strip'].click();
}
test('camera -> ordered selection -> 4-frame strip -> modal -> PNG request',async()=>{
  const h=setup();await cameraPrint(h);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].audio,false);
  assert.equal(h.state('pool.length'),7);assert.equal(h.state('shots.length'),4);
  assert.equal(h.state('shots[0]===pool[3] && shots[1]===pool[1]'),true);
  const captures=h.run('pool');
  for(const c of captures){assert.deepEqual(c.ops.filter(x=>x.method==='scale')[0].args,[-1,1]);assert.equal(c.ops.filter(x=>x.method==='drawImage').length,1);}
  assert.equal(h.el.strip.width,464);assert.equal(h.el.strip.height,1422);assert.equal(h.el.strip.hidden,false);
  assert.equal(h.downloads.length,0);h.el['preview-button'].click();assert.equal(h.el['preview-modal'].open,true);
  assert.equal(h.downloads.length,0);h.el['download-png'].click();assert.equal(h.downloads.length,1);
  assert.match(h.downloads[0].name,/^flashbox-\d{4}-\d{2}-\d{2}\.png$/);
  assert.equal(h.downloads[0].href,h.el.strip.toDataURL('image/png'));
  assert.equal(h.created.find(e=>e.tagName==='a').removed,true);
});
for(const seconds of [0,3,5,10])test(`3-frame burst with ${seconds}s timer`,async()=>{
  const h=setup();await cameraPrint(h,3,seconds);
  assert.equal(h.state('pool.length'),6);assert.equal(h.el.strip.height,1106);
  assert.equal(h.delays.filter(ms=>ms===700).length,6*seconds+1);
  assert.equal(h.el.countdown.hidden,true);assert.equal(h.state('busy'),false);
});
test('grid is visual only and source captures keep their original filter',async()=>{
  const h=setup();h.el['grid-toggle'].click();assert.equal(h.el.grid.hidden,false);
  h.el.filters.children[5].click();await cameraPrint(h,3);
  for(const c of h.run('pool'))assert.equal(c.ops.find(x=>x.method==='drawImage').filter,'none');
  assert.equal(h.el.strip.ops.find(x=>x.method==='drawImage').filter,'grayscale(1) contrast(1.5) brightness(.9)');
});
test('permission denial, missing device, unsupported media API, and playback failure recover',async()=>{
  for(const name of ['NotAllowedError','NotFoundError','NotReadableError']){const h=setup();h.cameraError={name};await h.run('enableCamera()');assert.equal(h.state('busy'),false);assert.equal(h.state('stream'),null);assert.ok(h.el.status.textContent.length);assert.equal(h.el['enable-camera'].disabled,false);}
  const absent=setup();absent.run('navigator.mediaDevices=undefined');await absent.run('enableCamera()');assert.match(absent.el.status.textContent,/localhost or HTTPS/);
  const playback=setup();playback.playError=Error('Playback');await playback.run('enableCamera()');assert.equal(playback.stopped,1);assert.equal(playback.el.video.srcObject,null);
});
test('same mode preserves choices and duplicate camera requests are ignored',async()=>{
  const h=setup();await cameraPrint(h,3);h.el['camera-tab'].click();h.el['ready-cancel'].click();assert.equal(h.state('pool.length'),6);
  await h.run('enableCamera()');assert.equal(h.requests.length,1);
});
test('disconnect cancels countdown and permits a new camera connection',async()=>{
  const h=setup();await h.run('enableCamera()');h.el.timer.value='3';let disconnected=false;
  h.onDelay=ms=>{if(ms===700&&!disconnected){disconnected=true;h.ended();}};
  await h.run('captureBurst()');assert.equal(h.state('busy'),false);assert.equal(h.state('capturing'),false);assert.equal(h.state('pool.length'),0);assert.equal(h.el.countdown.hidden,true);
  await h.run('enableCamera()');assert.equal(h.requests.length,2);
});
test('camera disconnect during printing does not unlock reset or corrupt output',async()=>{
  const h=setup();await h.run('enableCamera()');await h.run('captureBurst()');for(const i of [0,1,2,3])h.el.gallery.children[i].click();
  h.onDelay=ms=>{if(ms===700){h.ended();assert.equal(h.state('busy'),true);assert.equal(h.el.reset.disabled,true);}};
  await h.el['build-strip'].click();assert.equal(h.el['print-output'].getAttribute('data-print-state'),'ready');assert.equal(h.state('shots.length'),4);
});
test('uploads cap at 8, center-crop portrait and landscape, revoke URLs, and export',async()=>{
  const h=setup();h.el['upload-tab'].click();
  const files=Array.from({length:9},(_,i)=>({type:'image/png',w:i%2?1600:600,h:i%2?900:900}));
  await h.el['file-input'].onchange({target:{files}});
  assert.equal(h.state('pool.length'),8);assert.equal(h.revoked.length,8);assert.match(h.el.status.textContent,/first 8/);
  const portrait=h.run('pool[0]').ops.find(x=>x.method==='drawImage').args;
  assert.equal(portrait[1],0);assert.equal(portrait[2],225);assert.equal(portrait[3],600);assert.equal(portrait[4],450);
  const landscape=h.run('pool[1]').ops.find(x=>x.method==='drawImage').args;
  assert.equal(landscape[1],200);assert.equal(landscape[2],0);assert.equal(landscape[3],1200);assert.equal(landscape[4],900);
  for(const i of [7,0,3,5])h.el.gallery.children[i].click();await h.el['build-strip'].click();h.el['preview-button'].click();h.el['download-png'].click();assert.equal(h.downloads.length,1);
});
test('invalid files, insufficient images, cancel, and reselecting same uploads',async()=>{
  const h=setup();h.el['upload-tab'].click();const files=[{type:'text/plain'},{type:'image/png',bad:true},{type:'image/jpeg'}];
  await h.el['file-input'].onchange({target:{files}});assert.equal(h.state('pool.length'),1);assert.equal(h.revoked.length,2);assert.equal(h.el['build-strip'].disabled,true);assert.match(h.el.status.textContent,/2 files could not be read/);
  await h.el['file-input'].onchange({target:{files:[]}});assert.equal(h.state('pool.length'),1);
  await h.el['file-input'].onchange({target:{files:[files[2],files[2],files[2],files[2]]}});assert.equal(h.state('pool.length'),4);assert.equal(h.el['file-input'].value,'');
});
test('selection limits, deselection order, 3/4 target changes, and live filters/colors',async()=>{
  const h=setup();await h.run('enableCamera()');await h.run('captureBurst()');
  for(const i of [4,1,6,0,2])h.el.gallery.children[i].click();assert.equal(h.state('picks.join()'),'4,1,6,0');
  h.el.gallery.children[1].click();assert.equal(h.state('picks.join()'),'4,6,0');assert.equal(h.el['build-strip'].disabled,true);
  h.el['camera-target'].value='3';h.el['camera-target'].onchange();assert.equal(h.el['build-strip'].disabled,false);
  await h.el['build-strip'].click();
  for(let i=0;i<9;i++){h.el.filters.children[i].click();assert.equal(h.state('filter===filters['+i+'][1]'),true);h.el.colors.children[i].click();assert.equal(h.state('stripColor===colors['+i+'][1]'),true);}
  h.el.caption.value='A <lovely> day & friends';h.el.caption.oninput();assert.ok(h.el.strip.ops.some(x=>x.method==='fillText'&&x.args[0]===h.el.caption.value));
});
test('modal editing, backdrop and close buttons, export error retry, and reset',async()=>{
  const h=setup();await cameraPrint(h,3);h.el['preview-button'].click();
  h.el['modal-preview'].src='old';h.el.filters.children[1].click();assert.notEqual(h.el['modal-preview'].src,'old');
  h.el.strip.failExport=true;h.el['download-png'].click();assert.match(h.el['download-error'].textContent,/Could not save/);assert.equal(h.downloads.length,0);
  h.el.strip.failExport=false;h.el['download-png'].click();assert.equal(h.downloads.length,1);
  h.el['preview-modal'].onclick({target:h.el['preview-modal'],clientX:110,clientY:110});assert.equal(h.el['preview-modal'].open,true);
  h.el['preview-modal'].onclick({target:h.el['preview-modal'],clientX:0,clientY:0});assert.equal(h.el['preview-modal'].open,false);
  h.el['preview-button'].click();h.el['keep-editing'].click();assert.equal(h.el['preview-modal'].open,false);
  h.el['preview-button'].click();h.el['close-modal'].click();assert.equal(h.el['preview-modal'].open,false);
  h.el.retake.click();assert.equal(h.state('shots.length'),3);assert.equal(h.state('pool.length'),0);
  h.el.reset.click();assert.equal(h.state('shots.length'),0);assert.equal(h.el['print-output'].getAttribute('data-print-state'),'empty');assert.equal(h.run('document.documentElement.dataset.theme'),'light');
  h.el['download-png'].click();assert.equal(h.downloads.length,1);
});
test('keyboard upload, reduced-motion print timing, and page cleanup',async()=>{
  const h=setup();h.el['upload-tab'].click();let prevented=false;h.el['upload-slot'].onkeydown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(h.el['file-input'].clicked,true);
  h.el['go-photos'].click();assert.equal(h.focused,h.el['upload-slot']);
  h.el['camera-tab'].click();h.reducedMotion=true;await cameraPrint(h,3);assert.ok(!h.delays.includes(1500));
  h.events.pagehide();assert.equal(h.stopped,1);
});
test('all 6 layouts and 6 frame designs export 3/4 photos in order without overflow',async()=>{
  const h=setup();assert.equal(h.el.layouts.children.length,6);assert.equal(h.el['frame-designs'].children.length,6);
  for(const count of [3,4]){
    h.el.reset.click();await cameraPrint(h,count);h.el['preview-button'].click();
    for(let layout=0;layout<6;layout++){
      h.el.layouts.children[layout].click();const geometry=h.run(`layoutGeometry(${count})`);
      assert.equal(h.el.strip.width,geometry.width);assert.equal(h.el.strip.height,geometry.height);
      assert.equal(geometry.cells.length,layout===1?count*2:count);
      for(const cell of geometry.cells){assert.ok(cell.x>=0&&cell.y>=0);assert.ok(cell.x+cell.w<=geometry.width);assert.ok(cell.y+cell.h<geometry.height-96);}
      for(let frame=0;frame<6;frame++){
        h.el.strip.ops=[];h.el['frame-designs'].children[frame].click();
        const draws=h.el.strip.ops.filter(op=>op.method==='drawImage');assert.equal(draws.length,geometry.cells.length);
        geometry.cells.forEach((cell,i)=>{assert.equal(draws[i].args[0],h.run(`shots[${cell.index}]`));assert.equal(draws[i].args[5],cell.x);assert.equal(draws[i].args[6],cell.y);});
        const before=h.downloads.length;h.el['download-png'].click();assert.equal(h.downloads.length,before+1);assert.equal(h.downloads.at(-1).href,h.el.strip.toDataURL());
      }
    }
    h.el['close-modal'].click();
  }
  h.el['reset-style'].click();assert.equal(h.state('printLayout'),'strip');assert.equal(h.state('frameDesign'),'film');
});
test('camera readiness -> full-window capture -> more photos -> selection preserves all picks',async()=>{
  const h=setup();h.el['camera-tab'].click();assert.equal(h.el['camera-ready'].open,true);assert.equal(h.requests.length,0);
  h.el['ready-cancel'].click();assert.equal(h.el['camera-ready'].open,false);assert.equal(h.requests.length,0);
  h.el['enable-camera'].click();await h.el['ready-start'].click();assert.equal(h.requests.length,1);assert.equal(h.el['camera-ready'].open,false);assert.equal(h.el['camera-studio'].open,true);
  assert.equal(h.el['studio-video'].srcObject,h.stream);assert.equal(h.state('pool.length'),0);
  await h.el['studio-snap'].click();assert.equal(h.state('pool.length'),7);
  h.el['studio-done'].click();assert.equal(h.el['camera-studio'].open,false);
  h.el.gallery.children[2].click();h.el.gallery.children[5].click();const first=h.run('pool[2]');
  h.el['take-more'].click();await h.el['ready-start'].click();await h.el['studio-snap'].click();
  assert.equal(h.state('pool.length'),14);assert.equal(h.run('pool[2]'),first);assert.equal(h.state('picks.join()'),'2,5');assert.equal(h.requests.length,1);
  h.el['studio-done'].click();h.el.gallery.children[8].click();h.el.gallery.children[12].click();await h.el['build-strip'].click();
  assert.equal(h.run('shots[0]'),first);assert.equal(h.state('shots.length'),4);
});
test('exit full-window capture cancels countdown, keeps previous photos, and enables controls',async()=>{
  const h=setup();await h.run('enableCamera()');await h.run('captureBurst()');await h.run('openStudio()');
  h.el['studio-timer'].value='3';h.el['studio-timer'].onchange();let exited=false;
  h.onDelay=ms=>{if(ms===700&&!exited){exited=true;h.el['studio-exit'].click();}};
  await h.el['studio-snap'].click();assert.equal(h.state('pool.length'),7);assert.equal(h.state('busy'),false);assert.equal(h.el['camera-studio'].open,false);assert.equal(h.el['studio-countdown'].hidden,true);
});
test('all camera effects draw into captured photos, match preview, and preserve earlier captures',async()=>{
  const h=setup();await h.run('enableCamera()');assert.equal(h.el['camera-effects'].children.length,6);
  for(let effect=0;effect<6;effect++){
    h.el['camera-effects'].children[effect].click();
    h.el['camera-effect-preview'].ops=[];h.run('renderCameraEffect()');
    const preview=h.el['camera-effect-preview'].ops.filter(op=>op.method!=='clearRect');
    const index=h.state('pool.length');await h.run('captureBurst()');const frame=h.run(`pool[${index}]`);
    const overlay=frame.ops.filter(op=>!['drawImage','translate','scale'].includes(op.method));
    assert.deepEqual(overlay,preview);
    assert.equal(h.el['face-guide'].hidden,effect===0);
    if(effect===0)assert.equal(overlay.length,0);else assert.ok(overlay.length>0);
  }
  assert.equal(h.state('pool.length'),42);
  assert.equal(h.run('pool[0]').ops.filter(op=>op.method==='fillText').length,0);
  h.el['effect-x'].value='250';h.el['effect-y'].value='150';h.el['effect-size'].value='120';h.el['effect-x'].oninput();
  assert.equal(h.el['face-guide'].style.left,'62.5%');
  h.el['reset-effect-position'].click();assert.equal(h.el['effect-x'].value,'200');
  for(const i of [7,14,21,28])h.el.gallery.children[i].click();await h.el['build-strip'].click();
  h.el['preview-button'].click();h.el['download-png'].click();assert.equal(h.downloads.length,1);
});
