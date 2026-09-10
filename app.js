'use strict';
const $ = id => document.getElementById(id);
const filters = [['Original','none'],['Classic B&W','grayscale(1) contrast(1.15)'],['Vintage Warm','sepia(.35) saturate(1.4) contrast(1.05) brightness(1.05)'],['Cool Fade','hue-rotate(-10deg) saturate(1.2) brightness(1.08) contrast(.95)'],['Vivid Pop','saturate(1.8) contrast(1.2)'],['Noir','grayscale(1) contrast(1.5) brightness(.9)'],['Dreamy Soft','blur(0.5px) brightness(1.12) saturate(.85) contrast(.95)'],['Duotone Pink','grayscale(1) sepia(1) hue-rotate(280deg) saturate(3.5)'],['Golden Hour','sepia(.25) saturate(1.5) brightness(1.1) hue-rotate(-8deg) contrast(1.05)']];
const colors = [['Cream','#FFF8ED'],['Ink Black','#1A1625'],['Hot Pink','#FF3D81'],['Golden Yellow','#FFC93C'],['Lavender','#B8A9E8'],['Mint','#8FE3C6'],['Sky Blue','#7FB8FF'],['Coral','#FF7A59'],['Pure White','#FFFFFF']];
let mode='camera', stream=null, pool=[], picks=[], shots=[], filter='none', stripColor=colors[0][1], busy=false, generation=0, audio=null, capturing=false;
let printLayout='strip', frameDesign='film', cameraEffect='none';
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const target = () => Number($(mode+'-target').value);
function status(message=''){ $('status').textContent=message; }
function audioReady(){try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});}catch{}}
function tone(kind,progress=0){if(!audio)return;try{const now=audio.currentTime,gain=audio.createGain();gain.connect(audio.destination);if(kind==='shutter'){const buffer=audio.createBuffer(1,audio.sampleRate*.09,audio.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const source=audio.createBufferSource(),high=audio.createBiquadFilter();source.buffer=buffer;high.type='highpass';high.frequency.value=1500;source.connect(high);high.connect(gain);gain.gain.setValueAtTime(.2,now);gain.gain.exponentialRampToValueAtTime(.001,now+.09);source.start();source.stop(now+.1);return;}const osc=audio.createOscillator(),hum=kind==='hum';osc.type=hum?'sawtooth':'sine';osc.frequency.setValueAtTime(hum?90:440+220*progress,now);if(hum)osc.frequency.exponentialRampToValueAtTime(220,now+.55);osc.connect(gain);gain.gain.setValueAtTime(.001,now);gain.gain.linearRampToValueAtTime(hum?.035:.09,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+(hum?.6:.12));osc.start();osc.stop(now+(hum?.62:.14));}catch{}}
function setBusy(value){busy=value;for(const id of ['camera-tab','upload-tab','timer','camera-target','upload-target','enable-camera','invite-start','invite-upload','shutter','file-input','retake','reset','take-more','studio-snap','studio-done','studio-timer','ready-start','ready-cancel','ready-close','effect-x','effect-y','effect-size','reset-effect-position'])$(id).disabled=value;$('build-strip').disabled=value||picks.length!==target();$('studio-done').disabled=value||pool.length<target();for(const button of $('camera-effects').children)button.disabled=value;}
function updatePreview(){renderLiveStrip();$('invite-start').firstChild.textContent=mode==='camera'?'Step inside ':'Choose your photos ';const src=mode==='upload'&&pool.length?pool[pool.length-1].toDataURL():null;$('upload-preview').hidden=!src;if(src)$('upload-preview').src=src;$('video').hidden=mode!=='camera'||!stream;$('viewfinder-empty').hidden=!!src||(mode==='camera'&&!!stream);$('finder-status').textContent=src?'PHOTOS FED. PICK YOUR FAVORITES.':stream&&mode==='camera'?'LIVE · STRIKE A POSE':'BOOTH ON STANDBY';$('viewfinder-empty').querySelector('p').textContent=mode==='camera'?'Bring your people. Or just your best weird face.':'Your camera roll deserves a main-character moment.';}
function switchMode(next){if(busy||next===mode)return;mode=next;pool=[];picks=[];$('file-input').value='';$('upload-hint').textContent='Choose up to 8 images · cropped to 4:3';$('gallery-section').hidden=true;for(const value of ['camera','upload']){$(value+'-tab').setAttribute('aria-selected',String(value===mode));$(value+'-controls').hidden=value!==mode;}status();updatePreview();}
function crop(source,mirror=false){const c=document.createElement('canvas');c.width=400;c.height=300;const ctx=c.getContext('2d');const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;if(!w||!h)throw new Error('This image has no readable pixels.');const scale=Math.max(400/w,300/h),sw=400/scale,sh=300/scale;if(mirror){ctx.translate(400,0);ctx.scale(-1,1);}ctx.drawImage(source,(w-sw)/2,(h-sh)/2,sw,sh,0,0,400,300);return c;}
function drawGallery(){const gallery=$('gallery');gallery.replaceChildren();pool.forEach((frame,index)=>{const button=document.createElement('button');button.className='thumbnail';button.setAttribute('aria-label',`Select photo ${index+1}`);button.setAttribute('aria-pressed',String(picks.includes(index)));const img=document.createElement('img');img.src=frame.toDataURL();img.alt=`Photo ${index+1}`;button.append(img);const position=picks.indexOf(index);if(position!==-1){const badge=document.createElement('span');badge.className='pick-badge';badge.textContent=position+1;button.append(badge);}button.onclick=()=>{if(busy)return;const at=picks.indexOf(index);if(at>=0)picks.splice(at,1);else if(picks.length<target())picks.push(index);else{status('Deselect a photo first to choose a different one.');return;}status();drawGallery();};gallery.append(button);});const remaining=target()-picks.length;$('selection-hint').textContent=remaining?`Select ${remaining} more photo${remaining===1?'':'s'}`:'All set — build your strip';$('build-strip').disabled=busy||remaining!==0;$('gallery-section').hidden=!pool.length;$('take-more').hidden=mode!=='camera';renderLiveStrip();}
async function enableCamera(){
  if(busy||stream)return;
  audioReady();
  if(!navigator.mediaDevices?.getUserMedia){status('Camera access needs localhost or HTTPS. You can still use Feed in photos.');return;}
  setBusy(true);status('Connecting to your camera…');
  try{
    const connected=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:960},facingMode:'user'},audio:false});
    stream=connected;$('video').srcObject=connected;await $('video').play();
    $('enable-camera').hidden=true;$('shutter').hidden=false;status();updatePreview();
    connected.getVideoTracks()[0].addEventListener('ended',()=>{
      if(stream!==connected)return;
      stream=null;$('video').srcObject=null;$('enable-camera').hidden=false;$('shutter').hidden=true;
      if(capturing){generation++;capturing=false;setBusy(false);$('countdown').hidden=true;drawGallery();}
      closeStudio();updatePreview();status('Your camera disconnected. Turn it on again to continue.');
    });
  }catch(error){
    if(stream)stream.getTracks().forEach(track=>track.stop());
    stream=null;$('video').srcObject=null;$('enable-camera').hidden=false;$('shutter').hidden=true;updatePreview();
    status(error.name==='NotAllowedError'?'Camera permission was declined. Allow camera access in your browser, or feed in photos.':error.name==='NotFoundError'?'No camera found. Connect one, or use Feed in photos.':'Could not start your camera. Check that another app is not using it, or feed in photos.');
  }finally{setBusy(false);}
}
function setCountdown(value){for(const id of ['countdown','studio-countdown']){$(id).textContent=value||'';$(id).hidden=!value;}}
async function captureBurst(){
  if(busy||!stream)return;audioReady();capturing=true;setBusy(true);status();
  const token=++generation,seconds=Number($('timer').value),count=Math.min(target()+3,7);
  try{
    for(let i=0;i<count;i++){
      if(token!==generation)return;
      const hint=`Pose ${i+1} of ${count} — make it yours.`;$('capture-hint').textContent=hint;$('studio-status').textContent=hint;
      for(let tick=seconds;tick>0;tick--){setCountdown(tick);tone('beep',seconds===1?1:(seconds-tick)/(seconds-1));await delay(700);if(token!==generation)return;}
      setCountdown(0);const frame=crop($('video'),true);if(cameraEffect!=='none')drawCameraEffect(frame.getContext('2d'));pool.push(frame);tone('shutter');
      for(const id of ['flash-pop','studio-flash']){$(id).classList.remove('pop');void $(id).offsetWidth;$(id).classList.add('pop');}
      await delay(350);
    }
    drawGallery();$('capture-hint').textContent='Pick your favorites below, or take more photos.';
    $('studio-status').textContent=`${pool.length} photos captured. Take more, or choose your ${target()} favorites.`;
    $('studio-snap').textContent='MORE!';
  }catch{status('The camera frame could not be captured. Please try again.');$('studio-status').textContent='Could not capture that frame. Try again.';drawGallery();}
  finally{if(token===generation){capturing=false;setCountdown(0);setBusy(false);}}
}
async function loadUploads(event){if(busy)return;const files=Array.from(event.target.files||[]);if(!files.length)return;audioReady();setBusy(true);pool=[];picks=[];drawGallery();status('Reading your photos…');let failed=0;for(const file of files.slice(0,8)){if(!file.type.startsWith('image/')){failed++;continue;}const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();pool.push(crop(img));}catch{failed++;}finally{URL.revokeObjectURL(url);}}$('upload-hint').textContent=`${pool.length} photo${pool.length===1?'':'s'} loaded · choose again to replace`;$('file-input').value='';setBusy(false);drawGallery();updatePreview();const notices=[];if(files.length>8)notices.push('Only the first 8 files were loaded.');if(failed)notices.push(`${failed} file${failed===1?' could':'s could'} not be read. Try JPG, PNG, or WebP.`);if(pool.length<target())notices.push(`Choose at least ${target()} readable photos to build a strip.`);status(notices.join(' '));}
function layoutGeometry(count,layout=printLayout){
  const cells=[];let width=464,height=32+count*316+126;
  if(layout==='strip'||layout==='double'){
    if(layout==='double')width=952;
    for(let copy=0;copy<(layout==='double'?2:1);copy++)for(let i=0;i<count;i++)cells.push({index:i,x:32+copy*488,y:32+i*316,w:400,h:300});
  }else if(layout==='grid'||layout==='polaroid'){
    const card=layout==='polaroid',rows=Math.ceil(count/2),step=card?364:316;
    width=880;height=32+rows*step+126;
    for(let i=0;i<count;i++)cells.push({index:i,x:count%2&&i===count-1?240:32+(i%2)*416,y:32+Math.floor(i/2)*step,w:400,h:300});
  }else if(layout==='postcard'){
    width=880;height=790;
    cells.push({index:0,x:32,y:32,w:816,h:408});
    const w=(816-(count-2)*16)/(count-1);
    for(let i=1;i<count;i++)cells.push({index:i,x:32+(i-1)*(w+16),y:456,w,h:198});
  }else{
    width=32+count*416+16;height=474;
    for(let i=0;i<count;i++)cells.push({index:i,x:32+i*416,y:32,w:400,h:300});
  }
  return {width,height,cells};
}
function drawStrip(c,frames){
  const {width,height,cells}=layoutGeometry(frames.length);c.width=width;c.height=height;
  const ctx=c.getContext('2d');ctx.fillStyle=stripColor;ctx.fillRect(0,0,width,height);
  const rgb=stripColor.slice(1).match(/../g).map(v=>parseInt(v,16));
  const luminance=rgb.reduce((sum,v,i)=>sum+[.2126,.7152,.0722][i]*(v/255<=.04045?v/255/12.92:((v/255+.055)/1.055)**2.4),0);
  const ink=luminance<.18?'#FFF8ED':'#1A1625';
  if(frameDesign==='checker'){
    ctx.fillStyle=ink;
    for(let y=0;y<height;y+=12)for(const x of [0,12,width-24,width-12])if((Math.floor(x/12)+y/12)%2===0)ctx.fillRect(x,y,12,12);
  }
  cells.forEach(({index,x,y,w,h})=>{
    if(printLayout==='polaroid'){ctx.fillStyle='#FFF8ED';ctx.fillRect(x-7,y-7,w+14,h+47);}
    const source=frames[index],sw=source.width,sh=source.height,scale=Math.max(w/sw,h/sh),cw=w/scale,ch=h/scale;
    ctx.save();ctx.filter=filter;ctx.drawImage(source,(sw-cw)/2,(sh-ch)/2,cw,ch,x,y,w,h);ctx.restore();
    ctx.strokeStyle='#100c1833';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,w-2,h-2);
    if(paperStyle!=='classic'){ctx.strokeStyle=paperStyle==='neon'?'#FF3D81':paperStyle==='wedding'?'#b99b63':'#6e7860';ctx.lineWidth=paperStyle==='neon'?4:2;ctx.strokeRect(x-5,y-5,w+10,h+10);}
    if(printLayout==='polaroid'){ctx.fillStyle='#1A1625';ctx.font='italic 16px Georgia, serif';ctx.textAlign='center';ctx.fillText('little moment '+String(index+1).padStart(2,'0'),x+w/2,y+h+26);}
  });
  if(frameDesign==='film'){
    ctx.fillStyle=ink;for(let y=22;y<height-12;y+=30)for(const x of printLayout==='double'?[13,451,501,939]:[13,width-13]){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}
  }else if(['hearts','stars','botanical'].includes(frameDesign)){
    ctx.fillStyle=ink;ctx.textAlign='center';ctx.font=frameDesign==='botanical'?'17px Georgia, serif':'16px Arial, sans-serif';
    const symbol={hearts:'♥',stars:'✦',botanical:'❧'}[frameDesign];
    for(let y=32;y<height-20;y+=49){ctx.fillText(symbol,13,y);ctx.fillText(symbol,width-13,y);}
  }
  const centers=printLayout==='double'?[232,720]:[width/2],y=height-96;
  for(const center of centers){
    ctx.fillStyle=ink;ctx.textAlign='center';ctx.font=paperStyle==='wedding'?'italic 30px Georgia, serif':paperStyle==='scrapbook'?'bold 29px Georgia, serif':'32px Anton, sans-serif';ctx.fillText('FLASHBOX',center,y);
    const caption=$('caption').value.trim();if(caption){let size=14;ctx.font='14px "Space Grotesk", sans-serif';while(ctx.measureText(caption).width>386&&size>8)ctx.font=`${--size}px "Space Grotesk", sans-serif`;ctx.fillText(caption,center,y+29);}
    ctx.font='10px "Space Grotesk", sans-serif';ctx.fillText(new Date().toLocaleDateString('en-US',{month:'short',day:'2-digit',year:'numeric'}).toUpperCase()+'  •  A LITTLE MOMENT, FOREVER',center,y+61);
  }
}
function renderStrip(){window.invalidateQrShare?.();renderLiveStrip();if(!shots.length)return;drawStrip($('strip'),shots);$('shot-counter').textContent=`${shots.length} PHOTOS · ONE LITTLE MEMORY`;if($('preview-modal').open)$('modal-preview').src=$('strip').toDataURL('image/png');}
async function finalizeStrip(){
  if(busy||picks.length!==target()||picks.some(index=>!pool[index]))return;
  audioReady();const previous=shots;
  shots=picks.map(index=>pool[index]);$('gallery-section').hidden=true;$('strip').hidden=true;
  $('tray-empty').hidden=true;$('developing').hidden=false;setPrintState('developing');$('preview-button').disabled=true;setBusy(true);tone('hum');
  try{
    await delay(700);renderStrip();$('developing').hidden=true;$('strip').hidden=false;
    $('strip').classList.remove('eject');void $('strip').offsetWidth;$('strip').classList.add('eject');
    await delay(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1500);
    $('preview-button').disabled=false;setPrintState('ready');status();
  }catch{
    shots=previous;$('strip').hidden=!shots.length;$('tray-empty').hidden=!!shots.length;
    setPrintState(shots.length?'ready':'empty');$('preview-button').disabled=!shots.length;
    drawGallery();status('The strip could not be printed. Please try Build strip again.');
  }finally{$('developing').hidden=true;setBusy(false);}
}
filters.forEach(([name,value],index)=>{const button=document.createElement('button');button.className='filter-button';button.setAttribute('aria-pressed',String(index===0));button.setAttribute('aria-label',name);const swatch=document.createElement('canvas');swatch.width=120;swatch.height=90;swatch.setAttribute('aria-hidden','true');swatch.className='filter-swatch';swatch.style.filter=value;const label=document.createElement('span');label.className='filter-label';label.textContent=name;button.append(swatch,label);button.onclick=()=>{markCustom();filter=value;for(const b of $('filters').children)b.setAttribute('aria-pressed',String(b===button));$('filter-count').textContent=name;renderStrip();};$('filters').append(button);});
colors.forEach(([name,value],index)=>{const button=document.createElement('button');button.className='color-button';button.style.background=value;button.style.color=index===1?'#FFF8ED':'#1A1625';button.title=name;button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(index===0));button.textContent=index===0?'✓':'';button.onclick=()=>{markCustom();stripColor=value;$('color-name').textContent=name;for(const b of $('colors').children){b.setAttribute('aria-pressed',String(b===button));b.textContent=b===button?'✓':'';}renderStrip();};$('colors').append(button);});
$('theme-toggle').onclick=()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';$('theme-toggle').textContent=light?'☾':'☀';$('theme-toggle').setAttribute('aria-label',`Switch to ${light?'dark':'light'} theme`);$('theme-toggle').title=$('theme-toggle').getAttribute('aria-label');};
$('camera-tab').onclick=()=>{if(busy)return;switchMode('camera');requestCamera();};$('upload-tab').onclick=()=>switchMode('upload');for(const value of ['camera','upload'])$(value+'-tab').onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();switchMode(mode==='camera'?'upload':'camera');$(mode+'-tab').focus();}};
$('grid-toggle').onclick=()=>{const active=$('grid-toggle').getAttribute('aria-pressed')!=='true';$('grid-toggle').setAttribute('aria-pressed',String(active));$('grid').hidden=!active;};
$('enable-camera').onclick=requestCamera;$('shutter').onclick=openStudio;$('file-input').onchange=loadUploads;$('build-strip').onclick=finalizeStrip;
for(const id of ['camera-target','upload-target'])$(id).onchange=()=>{picks=picks.slice(0,target());drawGallery();};
$('caption').oninput=()=>{$('caption-count').textContent=$('caption').value.length;renderStrip();};
$('retake').onclick=()=>{pool=[];picks=[];drawGallery();$('upload-hint').textContent='Choose up to 8 images · cropped to 4:3';$('capture-hint').textContent='A few poses. A little chaos. A keeper.';status();updatePreview();};
$('reset').onclick=()=>{window.invalidateQrShare?.();generation++;pool=[];picks=[];shots=[];drawGallery();$('strip').hidden=true;$('strip').getContext('2d').clearRect(0,0,$('strip').width,$('strip').height);$('tray-empty').hidden=false;$('developing').hidden=true;$('preview-button').disabled=true;$('caption').value='';$('caption-count').textContent='0';$('file-input').value='';$('upload-hint').textContent='Choose up to 8 images · cropped to 4:3';$('capture-hint').textContent='A few poses. A little chaos. A keeper.';setPrintState('empty');$('shot-counter').textContent='✦ YOUR PRINT STATION';status();updatePreview();};
$('preview-button').onclick=()=>{if(!shots.length||$('preview-button').disabled)return;try{$('modal-preview').src=$('strip').toDataURL('image/png');$('download-error').textContent='';$('preview-modal').showModal();}catch{status('The preview could not be opened. Please try building your strip again.');}};
for(const id of ['close-modal','keep-editing'])$(id).onclick=()=>$('preview-modal').close();
$('preview-modal').onclick=event=>{if(event.target===$('preview-modal')){const rect=$('preview-modal').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)$('preview-modal').close();}};
$('download-png').onclick=()=>{
  if(!shots.length||!$('preview-modal').open)return;
  let link;
  try{
    link=document.createElement('a');const today=new Date();
    const date=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    link.download=`flashbox-${date}.png`;link.href=$('strip').toDataURL('image/png');
    document.body.append(link);link.click();$('download-error').textContent='';
  }catch{$('download-error').textContent='Could not save your PNG. Please try again.';}
  finally{link?.remove();}
};
initializeStyles();
document.fonts.ready.then(()=>renderStrip());window.addEventListener('pagehide',()=>{generation++;if(stream)stream.getTracks().forEach(track=>track.stop());});

// Both the style proof and the downloadable print use the same drawing routine.
var paperStyle = 'classic';
var sampleFrames;
function makeSamples(){
  return Array.from({length:4},(_,i)=>{
    const c=document.createElement('canvas');c.width=400;c.height=300;
    const ctx=c.getContext('2d');
    ctx.fillStyle=['#B8A9E8','#EAAF93','#8FE3C6','#7FB8FF'][i];ctx.fillRect(0,0,400,300);
    ctx.fillStyle=['#FF3D81','#7A1440','#375548','#42366B'][i];
    ctx.beginPath();ctx.arc(305,65,90,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#FFF8ED';ctx.font='100px Georgia';ctx.textAlign='center';ctx.fillText(['✦','♡','☀','✳'][i],200,160);
    ctx.font='bold 17px "Space Grotesk", sans-serif';ctx.fillText(['GOOD TIMES','YOUR PEOPLE','STAY GOLDEN','BE HERE NOW'][i],200,245);
    return c;
  });
}
function renderLiveStrip(){
  if(!$('live-strip'))return;
  sampleFrames ||= makeSamples();
  const selecting=!$('gallery-section').hidden;
  const frames=selecting?Array.from({length:target()},(_,i)=>picks[i]!==undefined?pool[picks[i]]:sampleFrames[i]):shots.length?shots:sampleFrames.slice(0,target());
  drawStrip($('live-strip'),frames);
  const source=selecting?(picks.length?pool[picks[0]]:pool[0]||sampleFrames[0]):shots[0]||pool[0]||sampleFrames[0];
  for(const button of $('filters').children){const thumb=button.children[0];if(thumb.previewSource!==source){thumb.getContext('2d').drawImage(source,0,0,120,90);thumb.previewSource=source;}}
  $('proof-hint').textContent=selecting?`${picks.length} of ${target()} picked · in your chosen order.`:shots.length?'Your print · updated as you edit.':'Sample artwork · your photos go here.';
}
function markCustom(){
  $('preset-name').textContent='Your own mix';
  for(const b of $('presets').children)b.setAttribute('aria-pressed','false');
}
function initializeStyles(){
  const presets=[['Vintage Arcade','Warm & wonderfully nostalgic',2,0,'classic','✳'],['Tokyo Neon','After-dark, electric energy',7,1,'neon','↗'],['Wedding Guestbook','Soft light. Forever feelings.',6,8,'wedding','♡'],['Scrapbook','Little pieces of a good day',8,5,'scrapbook','✦']];
  presets.forEach(([name,description,fi,ci,style,icon])=>{
    const button=document.createElement('button');button.className='preset-button '+style;
    button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',name);
    const symbol=document.createElement('span');symbol.className='preset-symbol';symbol.textContent=icon;
    const copy=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=name;detail.textContent=description;copy.append(title,detail);button.append(symbol,copy);
    button.onclick=()=>{
      $('filters').children[fi].onclick();$('colors').children[ci].onclick();paperStyle=style;
      for(const b of $('presets').children)b.setAttribute('aria-pressed',String(b===button));
      $('preset-name').textContent=name;document.documentElement.dataset.boothStyle=style;renderStrip();
    };
    $('presets').append(button);
  });
}

$('invite-start').onclick=()=>{if(busy)return;if(mode==='upload')$('file-input').click();else requestCamera();};
$('upload-slot').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)$('file-input').click();}};
$('invite-upload').onclick=()=>{if(busy)return;switchMode('upload');$('file-input').click();};

const editorSections=['style','frame','filter','paper'];
function showEditorSection(name){
  for(const section of editorSections){const selected=section===name;$(section+'-tab').setAttribute('aria-selected',String(selected));$(section+'-tab').tabIndex=selected?0:-1;$(section+'-pane').hidden=!selected;}
}
for(const name of editorSections){
  $(name+'-tab').onclick=()=>showEditorSection(name);
  $(name+'-tab').onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const index=editorSections.indexOf(name);
    const next=event.key==='Home'?0:event.key==='End'?editorSections.length-1:(index+(event.key==='ArrowRight'?1:editorSections.length-1))%editorSections.length;
    showEditorSection(editorSections[next]);$(editorSections[next]+'-tab').focus();
  };
}
$('reset-style').onclick=()=>{printLayout='strip';frameDesign='film';syncFrameChoices();paperStyle='classic';document.documentElement.dataset.boothStyle='classic';$('filters').children[0].onclick();$('colors').children[0].onclick();renderStrip();};

function setPrintState(state){
  setMascotMood(state==='ready'?'celebrate':state==='developing'?'thinking':'hello');
  $('print-output').setAttribute('data-print-state',state);
  const ready=state==='ready',developing=state==='developing';
  $('printer-status').textContent=ready?'PRINT COMPLETE':developing?'PRINTING':'READY';
  $('print-kicker').textContent=ready?"IT’S A KEEPER":developing?'A LITTLE PATIENCE':'LET’S MAKE SOMETHING';
  $('print-title').textContent=ready?'Made by you. Kept forever.':developing?'Good things take a moment.':'Your people. Your pocket-sized keepsake.';
  $('print-description').textContent=ready?'Your strip is ready. Preview it, save the PNG, or keep changing the style above.':developing?'Your photos are developing. Your finished strip will be ready to preview in a moment.':'Take or upload photos, pick your favorites, then hit Build strip. We’ll print it right here.';
  $('go-photos').hidden=state!=='empty';$('preview-button').hidden=!ready;$('reset').hidden=!ready;
}
$('go-photos').onclick=()=>{
  const destination=pool.length?$('gallery-section'):$(mode+'-controls');
  destination.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  const control=pool.length?$('gallery').children[0]:mode==='camera'?(stream?$('shutter'):$('enable-camera')):$('upload-slot');
  control?.focus({preventScroll:true});
};

const layoutOptions=[
  ['strip','Classic strip','Your picks in one classic vertical strip.'],
  ['double','Double strip','Two identical strips side by side. Save one, share one.'],
  ['grid','Photo grid','A 2-column print. With 3 picks, the last photo is centered.'],
  ['polaroid','Instant cards','White instant-photo borders with numbered captions.'],
  ['postcard','Postcard','Your first pick is the hero; the others sit below. Photos are center-cropped.'],
  ['wide','Wide strip','All your picks in one horizontal strip.']
];
const frameOptions=[['film','Film roll','▦'],['clean','Minimal','□'],['hearts','Hearts','♥'],['stars','Stars','✦'],['checker','Checker','▧'],['botanical','Botanical','❧']];
function syncFrameChoices(){
  for(let i=0;i<layoutOptions.length;i++)$('layouts').children[i].setAttribute('aria-pressed',String(layoutOptions[i][0]===printLayout));
  for(let i=0;i<frameOptions.length;i++)$('frame-designs').children[i].setAttribute('aria-pressed',String(frameOptions[i][0]===frameDesign));
  const selected=layoutOptions.find(option=>option[0]===printLayout);
  $('layout-name').textContent=selected[1];$('layout-help').textContent=selected[2];$('frame-name').textContent=frameOptions.find(option=>option[0]===frameDesign)[1];
  document.documentElement.dataset.printLayout=printLayout;
}
for(const [key,name] of layoutOptions){
  const button=document.createElement('button');button.className='layout-option';button.setAttribute('aria-label',name);
  const icon=document.createElement('span');icon.className='layout-icon icon-'+key;icon.setAttribute('aria-hidden','true');
  for(let i=0;i<(key==='double'?8:4);i++)icon.append(document.createElement('i'));
  const label=document.createElement('span');label.textContent=name;button.append(icon,label);
  button.onclick=()=>{printLayout=key;syncFrameChoices();renderStrip();};$('layouts').append(button);
}
for(const [key,name,symbol] of frameOptions){
  const button=document.createElement('button');button.className='frame-option';button.setAttribute('aria-label',name+' frame');
  const icon=document.createElement('span');icon.textContent=symbol;icon.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=name;button.append(icon,label);
  button.onclick=()=>{frameDesign=key;syncFrameChoices();renderStrip();};$('frame-designs').append(button);
}
syncFrameChoices();

function requestCamera(){
  if(busy)return;
  $('ready-error').textContent='';
  $('ready-summary').textContent=`One burst takes ${Math.min(target()+3,7)} photos. Choose ${target()} for your print. Timer: ${Number($('timer').value)?$('timer').value+'s':'off'}.`;
  $('camera-ready').showModal();
}
async function openStudio(){
  if(busy||!stream)return;
  renderCameraEffect();$('studio-video').srcObject=stream;$('studio-timer').value=$('timer').value;
  $('studio-grid').hidden=$('grid').hidden;$('studio-grid-toggle').setAttribute('aria-pressed',$('grid-toggle').getAttribute('aria-pressed')||'false');
  $('studio-status').textContent=pool.length?`${pool.length} photos saved. Take more, or choose your favorites.`:'Get comfortable, then press Snap.';
  $('studio-snap').textContent=pool.length?'MORE!':'SNAP!';$('studio-done').disabled=pool.length<target();
  try{await $('studio-video').play();$('camera-studio').showModal();$('studio-snap').focus();}
  catch{status('Could not open the camera view. Please try again.');}
}
function closeStudio(){
  const wasOpen=$('camera-studio').open;
  if(capturing){generation++;capturing=false;setBusy(false);}
  setCountdown(0);$('camera-studio').close();$('studio-video').srcObject=null;
  if(wasOpen&&pool.length)drawGallery();
}
$('ready-start').onclick=async()=>{
  await enableCamera();
  if(stream){$('camera-ready').close();await openStudio();}
  else $('ready-error').textContent=$('status').textContent;
};
for(const id of ['ready-close','ready-cancel'])$(id).onclick=()=>$('camera-ready').close();
$('camera-ready').oncancel=event=>{if(busy)event.preventDefault();};
$('studio-snap').onclick=captureBurst;
$('studio-exit').onclick=closeStudio;
$('camera-studio').oncancel=event=>{event.preventDefault();closeStudio();};
$('studio-done').onclick=()=>{if(busy)return;closeStudio();$('gallery-section').scrollIntoView({behavior:'smooth',block:'center'});$('gallery').children[0]?.focus({preventScroll:true});};
$('studio-timer').onchange=()=>{$('timer').value=$('studio-timer').value;};
$('studio-grid-toggle').onclick=()=>{$('grid-toggle').onclick();$('studio-grid').hidden=$('grid').hidden;$('studio-grid-toggle').setAttribute('aria-pressed',$('grid-toggle').getAttribute('aria-pressed'));};
$('take-more').onclick=requestCamera;

const cameraEffects=[['none','Original','○'],['cat','Cat ears','🐱'],['crown','Crown','👑'],['shades','Shades','🕶️'],['hearts','Hearts','💕'],['sparkles','Sparkles','✨']];
function drawCameraEffect(ctx){
  if(cameraEffect==='none')return;
  const x=Number($('effect-x').value),y=Number($('effect-y').value),s=Number($('effect-size').value)/100;
  ctx.save();ctx.fillStyle='#FFF8ED';ctx.textAlign='center';ctx.textBaseline='middle';
  function emoji(text,dx,dy,size){ctx.font=`${size*s}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;ctx.fillText(text,x+dx*s,y+dy*s);}
  if(cameraEffect==='crown')emoji('👑',0,-66,78);
  if(cameraEffect==='shades')emoji('🕶️',0,-5,102);
  if(cameraEffect==='hearts'){emoji('💕',-76,-35,43);emoji('💕',76,-35,43);emoji('💗',0,-81,28);}
  if(cameraEffect==='sparkles'){emoji('✨',-76,-30,50);emoji('✨',75,30,45);emoji('⭐',40,-83,28);}
  if(cameraEffect==='cat'){
    for(const direction of [-1,1]){
      const cx=x+direction*42*s;
      const triangle=(size,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(cx-size*s,y-51*s);ctx.lineTo(cx+direction*10*s,y-(51+size*2)*s);ctx.lineTo(cx+size*s,y-51*s);ctx.closePath();ctx.fill();};
      triangle(24,'#29212F');triangle(15,'#FF8FB7');
    }
    emoji('♥',0,27,17);
  }
  ctx.restore();
}
function renderCameraEffect(){
  const ctx=$('camera-effect-preview').getContext('2d');ctx.clearRect(0,0,400,300);drawCameraEffect(ctx);
  $('face-guide').hidden=cameraEffect==='none';
  $('face-guide').style.left=Number($('effect-x').value)/4+'%';$('face-guide').style.top=Number($('effect-y').value)/3+'%';
  $('face-guide').style.width=29*Number($('effect-size').value)/100+'%';$('face-guide').style.height=51*Number($('effect-size').value)/100+'%';
}
for(const [key,name,emoji] of cameraEffects){
  const button=document.createElement('button');button.className='camera-effect';button.setAttribute('aria-label',name+' camera effect');button.setAttribute('aria-pressed',String(key==='none'));
  const icon=document.createElement('span');icon.textContent=emoji;icon.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=name;button.append(icon,label);
  button.onclick=()=>{if(busy)return;cameraEffect=key;for(const b of $('camera-effects').children)b.setAttribute('aria-pressed',String(b===button));$('effect-hint').textContent=key==='none'?'No emoji effect. Your original camera photo.':'Line up your face with the oval. Use Adjust fit to position the effect — no face tracking.';renderCameraEffect();};
  $('camera-effects').append(button);
}
for(const id of ['effect-x','effect-y','effect-size'])$(id).oninput=renderCameraEffect;
$('reset-effect-position').onclick=()=>{$('effect-x').value='200';$('effect-y').value='135';$('effect-size').value='100';renderCameraEffect();};

function jumpToSection(section,control){
  $(section).scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  $(control).focus({preventScroll:true});
}
$('jump-photos').onclick=()=>jumpToSection('camera-tab',mode+'-tab');
$('jump-style').onclick=()=>jumpToSection('style-panel',editorSections.find(name=>$(name+'-tab').getAttribute('aria-selected')==='true')+'-tab');
$('jump-print').onclick=()=>jumpToSection('print-output',$('preview-button').hidden||$('preview-button').disabled?'go-photos':'preview-button');

let mascotReaction=0;
function setMascotMood(mood){
  $('mascot').setAttribute('data-mood',mood);
  $('mascot-message').textContent=mood==='celebrate'?'That’s a keeper. You did that!':mood==='thinking'?'Cooking up some good memories…':'hey, you. let’s make a memory.';
}
$('mascot').onclick=()=>{
  const reactions=[['wave','Oh hey! Your good side? All of them.'],['dance','A little wiggle before the shutter.'],['celebrate','Main-character energy. Confirmed.']];
  const [mood,message]=reactions[mascotReaction++%reactions.length];setMascotMood(mood);$('mascot-message').textContent=message;
};
$('mascot').onpointermove=event=>{
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const box=$('mascot').getBoundingClientRect();
  const x=Math.max(-3,Math.min(3,(event.clientX-(box.left+box.right)/2)/20));
  const y=Math.max(-3,Math.min(3,(event.clientY-(box.top+box.bottom)/2)/20));
  $('pix-pupils').style.transform=`translate(${x}px, ${y}px)`;
};
$('mascot').onpointerleave=()=>{$('pix-pupils').style.transform='translate(0px, 0px)';};
