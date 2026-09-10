const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const draws = [];
class Element {
  constructor() { this.children=[]; this.firstChild={textContent:''}; this.attrs={}; this.value=''; this.hidden=false; this.style={}; this.classList={remove(){},add(){}}; }
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  querySelector(){return new Element();}
  getContext(){return {fillRect(){},clearRect(){},save(){},restore(){},drawImage(...args){draws.push(args);},strokeRect(){},beginPath(){},arc(){},fill(){},fillText(){},measureText(t){return {width:t.length*8};},translate(){},scale(){}};}
  toDataURL(){return 'data:image/png;base64,test';}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const html=fs.readFileSync('index.html','utf8');
const elements=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
elements['camera-target'].value='4';elements['upload-target'].value='4';elements.timer.value='0';
const sandbox={console,setTimeout:fn=>{fn();},window:{addEventListener(){}},navigator:{},document:{getElementById:id=>{assert.ok(elements[id],`Missing DOM id: ${id}`);return elements[id];},createElement:()=>new Element(),documentElement:{dataset:{theme:'dark'}},fonts:{ready:Promise.resolve()},body:new Element()},Image:Element,URL,Math,Date};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync('app.js','utf8'),sandbox);
vm.runInContext(`
  if ($('filters').children.length!==9 || $('colors').children.length!==9) throw Error('Missing styles');
  pool=Array.from({length:7},()=>document.createElement('canvas')); drawGallery();
  $('gallery').children[4].onclick(); $('gallery').children[1].onclick(); $('gallery').children[6].onclick();
  if (!$('build-strip').disabled) throw Error('Build enabled too soon');
  $('gallery').children[0].onclick();
  if (picks.join(',')!=='4,1,6,0' || $('build-strip').disabled) throw Error('Selection order or readiness');
  $('gallery').children[2].onclick(); if(picks.length!==4) throw Error('Selection overflow');
`,sandbox);
(async()=>{
  await vm.runInContext('finalizeStrip()',sandbox);
  assert.equal(elements.strip.width,464);assert.equal(elements.strip.height,1422);
  assert.equal(elements.strip.hidden,false);assert.equal(elements['preview-button'].disabled,false);
  assert.equal(elements['print-output'].getAttribute('data-print-state'),'ready');
  assert.equal(elements['go-photos'].hidden,true);
  assert.equal(elements['preview-button'].hidden,false);
  vm.runInContext(`$('filters').children[5].onclick(); if(filter!==filters[5][1])throw Error('Filter'); $('colors').children[1].onclick(); if(stripColor!=='#1A1625')throw Error('Color'); $('caption').value='Our favorite day'; $('caption').oninput(); $('preview-button').onclick(); if(!$('preview-modal').open)throw Error('Preview'); $('keep-editing').onclick(); $('retake').onclick(); if(shots.length!==4 || pool.length)throw Error('Retake lost print'); $('theme-toggle').onclick(); switchMode('upload'); $('reset').onclick(); if(shots.length || pool.length || picks.length || $('caption').value || mode!=='upload' || document.documentElement.dataset.theme!=='light')throw Error('Reset'); if(!$('strip').hidden || $('tray-empty').hidden || !$('preview-button').disabled)throw Error('Empty state');`,sandbox);
  assert.ok(draws.length>=12);
  vm.runInContext(`
    showEditorSection('filter');
    if($('filter-pane').hidden||!$('style-pane').hidden||!$('paper-pane').hidden)throw Error('Editor tab visibility');
    if($('filter-tab').getAttribute('aria-selected')!=='true')throw Error('Editor tab accessibility');
    $('reset-style').onclick();
    if(filter!=='none'||stripColor!=='#FFF8ED'||paperStyle!=='classic')throw Error('Style reset');
    if(!$('filters').children[0].children[0].previewSource)throw Error('Photo filter preview');
  `,sandbox);
  vm.runInContext(`
    if($('presets').children.length!==4)throw Error('Missing presets');
    $('presets').children[1].onclick();
    if(paperStyle!=='neon'||filter!==filters[7][1]||stripColor!=='#1A1625')throw Error('Preset coordination');
    if($('live-strip').height!==1422)throw Error('Live preview dimensions');
    $('filters').children[0].onclick();
    if($('preset-name').textContent!=='Your own mix')throw Error('Custom override');
    $('upload-target').value='3';$('upload-target').onchange();
    if($('live-strip').height!==1106)throw Error('Three-frame preview');
    shots=sampleFrames.slice(0,3);$('preview-modal').showModal();renderStrip();
    if(!$('modal-preview').src.startsWith('data:image/png'))throw Error('Modal live update');
  `,sandbox);
  console.log('PASS: style presets, custom overrides, live preview frame count, and modal redraw.');
  console.log('PASS: 9 filters, 9 colors, selection order and limit, build gating, strip dimensions, live redraws, preview, retake preservation, reset and theme/mode preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
