
const CORE_VERSION="2026-09-22.10";
/* AgISO Pool Editor core — model + parser + renderer + serializer.
   Byte layouts mirror AgIsoStack++ isobus_virtual_terminal_working_set_base.cpp */

const T = {0:'workingset',1:'datamask',2:'alarmmask',3:'container',4:'softkeymask',5:'key',6:'button',
7:'inputboolean',8:'inputstring',9:'inputnumber',10:'inputlist',11:'outputstring',12:'outputnumber',
13:'outputline',14:'outputrectangle',15:'outputellipse',16:'outputpolygon',17:'outputmeter',
18:'outputlinearbargraph',19:'outputarchedbargraph',20:'picturegraphic',21:'numbervariable',
22:'stringvariable',23:'fontattributes',24:'lineattributes',25:'fillattributes',26:'inputattributes',
27:'objectpointer',28:'macro',29:'auxfunctiontype1',30:'auxinputtype1',31:'auxfunctiontype2',
32:'auxinputtype2',34:'windowmask',35:'keygroup',37:'outputlist'};
const TAG = {}; for (const k in T) TAG[T[k]] = +k;

const ISO_COLORS = [
 ['black','#000000'],['white','#FFFFFF'],['green','#009900'],['teal','#009999'],['maroon','#990000'],
 ['purple','#990099'],['olive','#999900'],['silver','#CCCCCC'],['grey','#999999'],['blue','#0000FF'],
 ['lime','#00FF00'],['cyan','#00FFFF'],['red','#FF0000'],['magenta','#FF00FF'],['yellow','#FFFF00'],
 ['navy','#000099']];
const COLORS = {}; ISO_COLORS.forEach(([n,h])=>COLORS[n]=h);
let _rgbCache=null;
function colorRGB(i){
  if(!_rgbCache){
    _rgbCache=[];
    for(let k=0;k<256;k++){
      if(k<=15){ const h=ISO_COLORS[k][1]; _rgbCache[k]=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
      else if(k<=231){ const idx=k-16; _rgbCache[k]=[51*Math.floor(idx/36),51*(Math.floor(idx/6)%6),51*(idx%6)]; }
      else if(k<=255){ const v=Math.round(10+234*(k-232)/23); _rgbCache[k]=[v,v,v]; }
      else _rgbCache[k]=[128,128,128];
    }
  }
  return _rgbCache[i]||[128,128,128];
}
function isoColor(i){
  if(i<=15) return ISO_COLORS[i][1];
  if(i<=231){ const idx=i-16;
    return `rgb(${51*Math.floor(idx/36)},${51*(Math.floor(idx/6)%6)},${51*(idx%6)})`; }
  if(i>=232&&i<=255){ const v=Math.round(10+234*(i-232)/23); return `rgb(${v},${v},${v})`; }
  return '#808080';
}
const FONTS = [[6,8],[8,8],[8,12],[12,16],[16,16],[16,24],[24,32],[32,32],[32,48],[48,64],[64,64],[64,96],[96,128],[128,128],[128,192]];
const JUST = {left:0,center:1,right:2}, VALIGN = {top:0,middle:1,bottom:2};
const INLINE = new Set(['softkeymask','key','button','container','keygroup']);

/* ---------- MODEL ---------- */
let POOL = new Map();     // id -> object
let ORDER = [];           // ids in binary order (parent before inline children)
let LANGS = ['hu','en'];
let activeLang = 'hu';
let selectedId = null;
let undoStack = [], redoStack = [];

function snapshot(){ undoStack.push(JSON.stringify({p:[...POOL],o:ORDER,l:LANGS})); if(undoStack.length>40) undoStack.shift(); redoStack.length=0; }
function undo(){ if(!undoStack.length) return; redoStack.push(JSON.stringify({p:[...POOL],o:ORDER,l:LANGS}));
  const s=JSON.parse(undoStack.pop()); POOL=new Map(s.p); ORDER=s.o; LANGS=s.l; selectedId=null; refreshAll(); }
function redo(){ if(!redoStack.length) return; undoStack.push(JSON.stringify({p:[...POOL],o:ORDER,l:LANGS}));
  const s=JSON.parse(redoStack.pop()); POOL=new Map(s.p); ORDER=s.o; LANGS=s.l; selectedId=null; refreshAll(); }

function strValue(o){ if(o.values) return o.values[activeLang] ?? o.values[Object.keys(o.values)[0]] ?? ''; return o.value ?? ''; }
/* változó-hivatkozás feloldása: OutputString/InputString varRef -> StringVariable/NumberVariable értéke */
function varValue(o){
  const v = (o.varRef!==undefined && o.varRef!==0xFFFF) ? POOL.get(o.varRef) : null;
  if(!v) return null;
  if(v.type===22) return strValue(v);
  if(v.type===21){
    let num=(v.value??0);
    const sc=(o.scale??1), off=(o.offset??0);
    num=num*sc+off;
    return o.decimals? num.toFixed(o.decimals) : String(Math.round(num));
  }
  return null;
}

/* ---------- PARSER ---------- */
function parseIOP(buf){
  const u16=o=>buf[o]|(buf[o+1]<<8), s16=o=>{const v=u16(o);return v>=0x8000?v-0x10000:v;},
        u32=o=>(buf[o]|(buf[o+1]<<8)|(buf[o+2]<<16)|(buf[o+3]<<24))>>>0;
  const f32=o=>new DataView(buf.buffer,buf.byteOffset).getFloat32(o,true);
  let off=0; const pool=new Map(), order=[];
  const readStr=(o,l)=>{let s='';for(let i=0;i<l;i++)s+=String.fromCharCode(buf[o+i]);return s;};
  function addChild(parent,cid,x,y){ parent.children.push({id:cid,x,y}); }
  while(off+3<=buf.length){
    const id=u16(off), type=buf[off+2];
    const o={id,type,children:[]};
    switch(type){
      case 0: o.bg=buf[off+3]; o.selectable=buf[off+4]; o.activeMask=u16(off+5);
        {const n=buf[off+7],nm=buf[off+8],nl=buf[off+9]; off+=10;
         o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
         for(let i=0;i<n;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;}
         o.languages=[]; for(let i=0;i<nl;i++){o.languages.push(readStr(off,2));off+=2;} LANGS=o.languages.length?o.languages:LANGS; } break;
      case 1: { o.bg=buf[off+3]; o.softkeyMask=u16(off+4); const n=buf[off+6],nm=buf[off+7]; off+=8;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;} } break;
      case 2: { o.bg=buf[off+3]; o.softkeyMask=u16(off+4); o.priority=buf[off+6]; o.acoustic=buf[off+7];
        const n=buf[off+8],nm=buf[off+9]; off+=10;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;} } break;
      case 3: { o.w=u16(off+3); o.h=u16(off+5); o.hidden=buf[off+7]; const n=buf[off+8],nm=buf[off+9]; off+=10;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;} } break;
      case 4: { o.bg=buf[off+3]; const n=buf[off+4],nm=buf[off+5]; off+=6;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),0,0);off+=2;} } break;
      case 5: { o.bg=buf[off+3]; o.keyCode=buf[off+4]; const n=buf[off+5],nm=buf[off+6]; off+=7;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;} } break;
      case 6: { o.w=u16(off+3); o.h=u16(off+5); o.bg=buf[off+7]; o.border=buf[off+8]; o.keyCode=buf[off+9];
        o.options=buf[off+10]; const n=buf[off+11],nm=buf[off+12]; off+=13;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;} } break;
      case 7: { o.bg=buf[off+3]; o.w=u16(off+4); o.h=o.w; o.fontAttr=u16(off+6); o.varRef=u16(off+8);
        o.value=buf[off+10]; o.enabled=buf[off+11]; const nm=buf[off+12]; off+=13+nm*2; } break;
      case 8: { o.w=u16(off+3); o.h=u16(off+5); o.bg=buf[off+7]; o.fontAttr=u16(off+8); o.inputAttr=u16(off+10);
        o.options=buf[off+12]; o.varRef=u16(off+13); o.just=buf[off+15];
        const slen=buf[off+16]; o.value=readStr(off+17,slen); o.enabled=buf[off+17+slen];
        off+=18+slen; const nm=buf[off]; off+=1; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 9: { o.w=u16(off+3); o.h=u16(off+5); o.bg=buf[off+7]; o.fontAttr=u16(off+8); o.options=buf[off+10];
        o.varRef=u16(off+11); o.value=u32(off+13); o.min=u32(off+17); o.max=u32(off+21); o.offset=u32(off+25);
        o.scale=f32(off+29); o.decimals=buf[off+33]; o.format=buf[off+34]; o.just=buf[off+35]; o.options2=buf[off+36];
        const nm=buf[off+37]; off+=38+nm*2; } break;
      case 10: { o.w=u16(off+3); o.h=u16(off+5); o.varRef=u16(off+7); o.value=buf[off+9];
        const n=buf[off+10]; o.options=buf[off+11]; off+=12; const nm=buf[off]; off+=1+nm*2; o.macros=Array.from({length:nm},(_,i)=>u16(off-nm*2+i*2));
        for(let i=0;i<n;i++){addChild(o,u16(off),0,0);off+=2;} } break;
      case 11: { o.w=u16(off+3); o.h=u16(off+5); o.bg=buf[off+7]; o.fontAttr=u16(off+8); o.options=buf[off+10];
        o.varRef=u16(off+11); o.just=buf[off+13]; const slen=u16(off+14); off+=16;
        o.value=readStr(off,slen); off+=slen; const nm=buf[off]; off+=1; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 12: { o.w=u16(off+3); o.h=u16(off+5); o.bg=buf[off+7]; o.fontAttr=u16(off+8); o.options=buf[off+10];
        o.varRef=u16(off+11); o.value=u32(off+13); o.offset=u32(off+17); o.scale=f32(off+21);
        o.decimals=buf[off+25]; o.format=buf[off+26]; o.just=buf[off+27]; const nm=buf[off+28]; off+=29; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 13: { o.lineAttr=u16(off+3); o.w=u16(off+5); o.h=u16(off+7); o.direction=buf[off+9];
        const nm=buf[off+10]; off+=11; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 14: { o.lineAttr=u16(off+3); o.w=u16(off+5); o.h=u16(off+7); o.lineSuppression=buf[off+9];
        o.fillAttr=u16(off+10); const nm=buf[off+12]; off+=13; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 15: { o.lineAttr=u16(off+3); o.w=u16(off+5); o.h=u16(off+7); o.ellipseType=buf[off+9];
        o.startAngle=buf[off+10]; o.endAngle=buf[off+11]; o.fillAttr=u16(off+12); const nm=buf[off+14]; off+=15; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 16: { o.w=u16(off+3); o.h=u16(off+5); o.lineAttr=u16(off+7); o.fillAttr=u16(off+9);
        o.polygonType=buf[off+11]; const n=buf[off+12],nm=buf[off+13]; off+=14;
        o.points=[]; for(let i=0;i<n;i++){o.points.push([s16(off),s16(off+2)]);off+=4;} o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 17: { o.w=u16(off+3); o.h=o.w; o.needleColor=buf[off+5]; o.border=buf[off+6]; o.arcColor=buf[off+7];
        o.options=buf[off+8]; o.ticks=buf[off+9]; o.startAngle=buf[off+10]; o.endAngle=buf[off+11];
        o.min=u16(off+12); o.max=u16(off+14); o.varRef=u16(off+16); o.value=u16(off+18);
        const nm=buf[off+20]; off+=21; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 18: { o.w=u16(off+3); o.h=u16(off+5); o.color=buf[off+7]; o.targetColor=buf[off+8]; o.options=buf[off+9];
        o.ticks=buf[off+10]; o.min=u16(off+11); o.max=u16(off+13); o.varRef=u16(off+15); o.value=u16(off+17);
        o.targetVarRef=u16(off+19); o.targetValue=u16(off+21); const nm=buf[off+23]; off+=24; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 19: { o.w=u16(off+3); o.h=u16(off+5); o.color=buf[off+7]; o.targetColor=buf[off+8]; o.options=buf[off+9];
        o.startAngle=buf[off+10]; o.endAngle=buf[off+11]; o.barW=u16(off+12); o.min=u16(off+14); o.max=u16(off+16);
        o.varRef=u16(off+18); o.value=u16(off+20); o.targetVarRef=u16(off+22); o.targetValue=u16(off+24);
        const nm=buf[off+26]; off+=27; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 20: { o.w=u16(off+3); o.actualW=u16(off+5); o.actualH=u16(off+7);
        o.h=Math.round(o.actualH*(o.w/o.actualW)); o.format=buf[off+9];
        o.options=buf[off+10]; o.transparency=buf[off+11]; o.rawLen=u32(off+12); const nm=buf[off+16];
        off+=17; o.raw=readStr(off,Math.min(o.rawLen,65536)); off+=o.rawLen; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 21: { o.value=u32(off+3); off+=7; } break;
      case 22: { const len=u16(off+3); off+=5; o.value=readStr(off,len); off+=len; } break;
      case 23: { o.color=buf[off+3]; o.size=buf[off+4]; o.fontType=buf[off+5]; o.style=buf[off+6]; const nm=buf[off+7]; off+=8+nm*2; } break;
      case 24: { o.color=buf[off+3]; o.width=buf[off+4]; o.art=u16(off+5); const nm=buf[off+7]; off+=8+nm*2; } break;
      case 25: { o.fillType=buf[off+3]; o.color=buf[off+4]; o.pattern=u16(off+5); const nm=buf[off+7]; off+=8+nm*2; } break;
      case 26: { o.validationType=buf[off+3]&1; const slen=buf[off+4]; off+=5; o.validationString=readStr(off,slen); off+=slen; const nm=buf[off]; off+=1; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 27: { o.value=u16(off+3); off+=5; } break;
      case 28: { const nb=u16(off+3); off+=5; o.commands=Array.from({length:nb},(_,i)=>buf[off+i]); off+=nb; } break;
      case 29: case 31: { o.bg=buf[off+3]; o.functionType=buf[off+4]; const n=buf[off+5]; off+=6+n*6; } break;
      case 30: { o.bg=buf[off+3]; o.functionType=buf[off+4]; o.inputId=buf[off+5]; const n=buf[off+6]; off+=7+n*6; } break;
      case 32: { o.bg=buf[off+3]; o.functionType=buf[off+4]&0x1F; const n=buf[off+5]; off+=6+n*6; } break;
      case 34: { o.w=buf[off+3]; o.h=buf[off+4]; o.windowType=buf[off+5]; o.bg=buf[off+6]; o.options=buf[off+7];
        o.nameId=u16(off+8); o.titleId=u16(off+10); o.iconId=u16(off+12);
        const nref=buf[off+14],nch=buf[off+15],nm=buf[off+16]; off+=17; off+=nref*2;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<nch;i++){addChild(o,u16(off),s16(off+2),s16(off+4));off+=6;} } break;
      case 35: { o.options=buf[off+3]; o.nameId=u16(off+4); o.iconId=u16(off+6); const n=buf[off+8]; off+=9;
        for(let i=0;i<n;i++){addChild(o,u16(off),0,0);off+=2;} const nm=buf[off]; off+=1; o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;}); } break;
      case 37: { o.w=u16(off+3); o.h=u16(off+5); o.varRef=u16(off+7); o.value=buf[off+9];
        const n=buf[off+10],nm=buf[off+11]; off+=12;
        o.macros=Array.from({length:nm},(_,i)=>{const v=u16(off);off+=2;return v;});
        for(let i=0;i<n;i++){addChild(o,u16(off),0,0);off+=2;} } break;
      default: throw new Error(`Ismeretlen objektumtípus ${type} (id ${id}, ${off}. bájt)`);
    }
    pool.set(id,o); order.push(id);
  }
  return {pool, order};
}

/* ---------- SERIALIZER (iopgen port) ---------- */
function serializeIOP(pool, order, lang){
  const out=[];
  const u16=v=>{out.push(v&255,(v>>8)&255);}, s16=v=>{v=v<0?v+0x10000:v;u16(v);},
        u32=v=>{out.push(v&255,(v>>8)&255,(v>>16)&255,(v>>24)&255);},
        f32=v=>{const b=new Uint8Array(new Float32Array([v]).buffer);out.push(...b);},
        writeMacros=o=>{const m=o.macros||[];B(m.length);m.forEach(x=>u16(x));},
        B=(...a)=>a.forEach(x=>out.push(x&255));
  const val=o=>{ if(o.values){const v=o.values[lang]??o.values[Object.keys(o.values)[0]]??'';return v;} return o.value??''; };
  for(const id of order){
    const o=pool.get(id);
    u16(o.id); out.push(o.type);
    switch(o.type){
      case 0: { B(o.bg,o.selectable); u16(o.activeMask); const ch=o.children,mm=o.macros||[];
        B(ch.length,mm.length,o.languages.length);
        mm.forEach(x=>u16(x)); ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); o.languages.forEach(l=>B(l.charCodeAt(0),l.charCodeAt(1))); } break;
      case 1: case 2: { if(o.type===2){B(o.bg);u16(o.softkeyMask);B(o.priority??0,o.acoustic??0);} else {B(o.bg);u16(o.softkeyMask);}
        const ch=o.children,mm=o.macros||[]; B(ch.length,mm.length); mm.forEach(x=>u16(x)); ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 3: { u16(o.w||0); u16(o.h||0); B(o.hidden??0); const ch=o.children,mm=o.macros||[]; B(ch.length,mm.length);
        mm.forEach(x=>u16(x)); ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 4: { B(o.bg); const ch=o.children,mm=o.macros||[]; B(ch.length,mm.length); mm.forEach(x=>u16(x)); ch.forEach(c=>u16(c.id)); } break;
      case 5: { B(o.bg,o.keyCode??0); const ch=o.children,mm=o.macros||[]; B(ch.length,mm.length); mm.forEach(x=>u16(x));
        ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 6: { u16(o.w||0); u16(o.h||0); B(o.bg,o.border,o.keyCode??0,o.options??0);
        const ch=o.children,mm=o.macros||[]; B(ch.length,mm.length); mm.forEach(x=>u16(x)); ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 7: { B(o.bg); u16(o.w||0); u16(o.fontAttr??0xFFFF); u16(o.varRef??0xFFFF);
        B(o.value??0,o.enabled??0); writeMacros(o); } break;
      case 8: { u16(o.w||0); u16(o.h||0); B(o.bg); u16(o.fontAttr??0xFFFF); u16(o.inputAttr??0xFFFF);
        B(o.options??0); u16(o.varRef??0xFFFF); B(o.just??0); const s=val(o);
        B(s.length); for(const ch of s) B(ch.charCodeAt(0)); B(o.enabled??0); writeMacros(o); } break;
      case 9: { u16(o.w||0); u16(o.h||0); B(o.bg); u16(o.fontAttr??0xFFFF); B(o.options??0);
        u16(o.varRef??0xFFFF); u32(o.value??0); u32(o.min??0); u32(o.max??100); u32(o.offset??0);
        f32(o.scale??1); B(o.decimals??0,o.format??0,o.just??0,o.options2??0,0); } break;
      case 10: { u16(o.w||0); u16(o.h||0); u16(o.varRef??0xFFFF); B(o.value??0);
        const ch=o.children; B(ch.length,o.options??0); writeMacros(o); ch.forEach(c=>u16(c.id)); } break;
      case 11: { u16(o.w||0); u16(o.h||0); B(o.bg); u16(o.fontAttr??0xFFFF); B(o.options??0);
        u16(o.varRef??0xFFFF); B(o.just??0); const s=val(o); u16(s.length);
        for(const ch of s) B(ch.charCodeAt(0)); writeMacros(o); } break;
      case 12: { u16(o.w||0); u16(o.h||0); B(o.bg); u16(o.fontAttr??0xFFFF); B(o.options??0);
        u16(o.varRef??0xFFFF); u32(o.value??0); u32(o.offset??0); f32(o.scale??1);
        B(o.decimals??0,o.format??0,o.just??0); writeMacros(o); } break;
      case 13: { u16(o.lineAttr??0xFFFF); u16(o.w||0); u16(o.h||0); B(o.direction??0); writeMacros(o); } break;
      case 14: { u16(o.lineAttr??0xFFFF); u16(o.w||0); u16(o.h||0); B(o.lineSuppression??0);
        u16(o.fillAttr??0xFFFF); writeMacros(o); } break;
      case 15: { u16(o.lineAttr??0xFFFF); u16(o.w||0); u16(o.h||0); B(o.ellipseType??0,o.startAngle??0,o.endAngle??0);
        u16(o.fillAttr??0xFFFF); writeMacros(o); } break;
      case 16: { u16(o.w||0); u16(o.h||0); u16(o.lineAttr??0xFFFF); u16(o.fillAttr??0xFFFF);
        B(o.polygonType??0,o.points.length,(o.macros||[]).length); o.points.forEach(p=>{s16(p[0]);s16(p[1]);});
        (o.macros||[]).forEach(x=>u16(x)); } break;
      case 17: { u16(o.w||0); B(o.needleColor??1,o.border??1,o.arcColor??1,o.options??0,o.ticks??0,
        o.startAngle??0,o.endAngle??0); u16(o.min??0); u16(o.max??100); u16(o.varRef??0xFFFF);
        u16(o.value??0); writeMacros(o); } break;
      case 18: { u16(o.w||0); u16(o.h||0); B(o.color??1,o.targetColor??1,o.options??0,o.ticks??0);
        u16(o.min??0); u16(o.max??100); u16(o.varRef??0xFFFF); u16(o.value??0);
        u16(o.targetVarRef??0xFFFF); u16(o.targetValue??0); writeMacros(o); } break;
      case 19: { u16(o.w||0); u16(o.h||0); B(o.color??1,o.targetColor??1,o.options??0,o.startAngle??0,o.endAngle??0);
        u16(o.barW??4); u16(o.min??0); u16(o.max??100); u16(o.varRef??0xFFFF); u16(o.value??0);
        u16(o.targetVarRef??0xFFFF); u16(o.targetValue??0); writeMacros(o); } break;
      case 20: { u16(o.w||0); u16(o.actualW||0); u16(o.actualH||0); B(o.format??0,o.options??0,o.transparency??0);
        u32(o.rawLen||0); B((o.macros||[]).length); for(let i=0;i<(o.rawLen||0);i++) B((o.raw||' ').charCodeAt(i)); (o.macros||[]).forEach(x=>u16(x)); } break;
      case 21: u32(o.value??0); break;
      case 22: { const s=val(o); u16(s.length); for(const ch of s) B(ch.charCodeAt(0)); } break;
      case 23: B(o.color??1,o.size??4,o.fontType??0,o.style??0,0); break;
      case 24: B(o.color??1,o.width??1); u16(o.art??0); B(0); break;
      case 25: B(o.fillType??0,o.color??1); u16(o.pattern??0xFFFF); B(0); break;
      case 26: { B(o.validationType??0); const s=o.validationString||''; B(s.length);
        for(const ch of s) B(ch.charCodeAt(0)); writeMacros(o); } break;
      case 27: u16(o.value??0xFFFF); break;
      case 28: { const cmds=o.commands||[]; u16(cmds.length); cmds.forEach(b=>B(b)); } break;
      case 29: case 31: case 32: { B(o.bg,o.functionType??0); const ch=o.children; B(ch.length); ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 30: { B(o.bg,o.functionType??0,o.inputId??0); const ch=o.children; B(ch.length); ch.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 34: { B(o.w||0,o.h||0,o.windowType??0,o.bg??0,o.options??0); u16(o.nameId??0xFFFF); u16(o.titleId??0xFFFF);
        u16(o.iconId??0xFFFF); { const mm=o.macros||[]; B(0,o.children.length,mm.length); mm.forEach(x=>u16(x)); }
        o.children.forEach(c=>{u16(c.id);s16(c.x);s16(c.y);}); } break;
      case 35: { B(o.options??0); u16(o.nameId??0xFFFF); u16(o.iconId??0xFFFF); B(o.children.length);
        o.children.forEach(c=>u16(c.id)); writeMacros(o); } break;
      case 37: { u16(o.w||0); u16(o.h||0); u16(o.varRef??0xFFFF); B(o.value??0);
        const ch=o.children,mm=o.macros||[]; B(ch.length,mm.length); mm.forEach(x=>u16(x)); ch.forEach(c=>u16(c.id)); } break;
    }
  }
  return new Uint8Array(out);
}

/* ---------- RENDER ---------- */
const canvas = document.getElementById('screen');
let ctx = canvas.getContext('2d');
/* PictureGraphic dekódolás az ISO 11783-6 / AgIsoStack szerint:
   - minden sor báthatáron kezdődik (a sor végi bitek eldobása)
   - RLE (options bit 2): (hossz, értékbájt) párok
   - formátum: 0=1bpp, 1=4bpp, 2=8bpp */
function decodePicture(o){
  const w=o.actualW|0, h=o.actualH|0;
  if(!w||!h||!o.raw) return null;
  const px=new Uint8Array(w*h);
  const S=o.raw, B=i=>S.charCodeAt(i)&0xFF;
  const rle=(o.options&4)!==0;
  let pi=0;
  if(o.format===0){
    const lineBytes=Math.ceil(w/8);
    if(!rle){ for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const bit=(B(y*lineBytes+(x>>3))>>(7-(x&7)))&1; px[y*w+x]=bit; } }
    else { let lineLeft=w;
      for(let i=0;i+1<S.length&&pi<px.length;i+=2){ const cnt=B(i),val=B(i+1);
        for(let j=0;j<cnt&&pi<px.length;j++)
          for(let k=0;k<8&&pi<px.length;k++){ px[pi++]=(val>>(7-k))&1; if(--lineLeft===0){lineLeft=w;break;} } } }
  } else if(o.format===1){
    if(!rle){ for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const b=B(y*Math.ceil(w/2)+(x>>1)); px[y*w+x]=(x&1)?(b&15):(b>>4); } }
    else { let lineLeft=w;
      for(let i=0;i+1<S.length&&pi<px.length;i+=2){ const cnt=B(i),val=B(i+1);
        for(let j=0;j<cnt&&pi<px.length;j++){ px[pi++]=val>>4; if(--lineLeft===0){lineLeft=w;continue;}
          if(pi<px.length){ px[pi++]=val&15; if(--lineLeft===0)lineLeft=w; } } } }
  } else {
    if(!rle){ for(let i=0;i<px.length&&i<S.length;i++) px[i]=B(i); }
    else { for(let i=0;i+1<S.length&&pi<px.length;i+=2){ const cnt=B(i),val=B(i+1);
        for(let j=0;j<cnt&&pi<px.length;j++) px[pi++]=val; } }
  }
  return {w,h,px};
}
function fontOf(o){
  const fa = POOL.get(o.fontAttr);
  const sz = fa ? (FONTS[fa.size]||[8,8]) : [8,8];
  const st = fa ? (fa.style||0) : 0;
  return `${st&1?'bold ':''}${st&8?'italic ':''}${Math.round(sz[1]*0.92)}px monospace`;
}
function colorOf(o,key){ const a=o[key]!==undefined&&POOL.get(o[key]); return a?isoColor(a.color):'#888'; }
function drawString(o,x,y,selected){
  if(o.bg){ ctx.fillStyle=isoColor(o.bg); ctx.fillRect(x,y,o.w,o.h); }
  ctx.fillStyle=colorOf(o,'fontAttr'); ctx.font=fontOf(o); ctx.textBaseline='top';
  const s=varValue(o) ?? strValue(o), tw=ctx.measureText(s).width;
  const fa=POOL.get(o.fontAttr); const h=(fa&&(FONTS[fa.size]||[8,8])[1])||8;
  let dx=x; if(((o.just>>2)&3)===1) dx=x+(o.w-tw)/2; else if(((o.just>>2)&3)===2) dx=x+o.w-tw;
  let dy=y; if((o.just&3)===1) dy=y+(o.h-h)/2; else if((o.just&3)===2) dy=y+o.h-h;
  ctx.fillText(s,dx,dy);
}
let _ptrDepth=0;
// --- PictureGraphic cache: egyszer dekodolt kep PNG adat-URL-kent (a bongeszo skalaz) ---
const PICT_CACHE=new Map();
function pictureURL(o){
  const key=o.id+':'+o.rawLen+':'+o.format+':'+o.options+':'+o.transparency;
  if(PICT_CACHE.has(key)) return PICT_CACHE.get(key);
  const pic=decodePicture(o);
  if(!pic||!pic.w) return null;
  const c=document.createElement('canvas'); c.width=pic.w; c.height=pic.h;
  const cx=c.getContext('2d');
  const img=cx.createImageData(pic.w,pic.h);
  const transparent=(o.options&1)!==0, tcol=o.transparency??0;
  for(let i=0;i<pic.w*pic.h;i++){
    const col=pic.px[i], rgb=colorRGB(col);
    if(transparent&&col===tcol){ img.data[i*4+3]=0; continue; }
    img.data[i*4]=rgb[0]; img.data[i*4+1]=rgb[1]; img.data[i*4+2]=rgb[2]; img.data[i*4+3]=255;
  }
  cx.putImageData(img,0,0);
  const url=c.toDataURL('image/png');
  PICT_CACHE.set(key,url);
  return url;
}
const PICT_IMG=new Map();
function pictureImage(o){
  // cache-elt Image objektum (nincs ujratoltes/render-loop)
  const url=pictureURL(o);
  if(!url) return null;
  if(PICT_IMG.has(url)) return PICT_IMG.get(url);
  const im=new Image();
  PICT_IMG.set(url,im);
  im.onload=()=>{ if(typeof render==='function')render(); drawCwin(); };
  im.src=url;
  return im;
}
// --- JUCE-komponensek alapján: kitöltés/vonal szín feloldás ---
function fillColourOf(o){
  const fa=POOL.get(o.fillAttr);
  if(!fa||fa.type!==25||fa.fillType===0) return null; // NoFill
  if(fa.fillType===1) return isoColor((POOL.get(o.lineAttr)||{}).color??0); // FillWithLineColor
  return isoColor(fa.color??0); // 2=specified colour, 3=pattern → fallback
}
function lineStyleOf(o){
  const la=POOL.get(o.lineAttr);
  if(!la||la.type!==24) return null;
  return {color:isoColor(la.color??0), width:Math.max(1,la.width||1)};
}
function varNumValue(o){
  if(o.varRef&&o.varRef!==0xFFFF){ const v=POOL.get(o.varRef); if(v&&v.type===21) return v.value??0; }
  return o.value??0;
}
function vtRad(deg2){ return (deg2)*Math.PI/180; } // VT szög (2°-os egység) → canvas radián (0 = 3 óra, óramutatóval)
function drawObject(o,x,y){
  const sel = selectedId===o.id;
  switch(o.type){
    case 3: case 10: case 37: case 35:
      o.children.forEach(c=>{const co=POOL.get(c.id); if(co) drawObject(co,x+(c.x||0),y+(c.y||0));}); break;
    case 6: { // Button — ButtonComponent: arc + 4 px-es keret
      const opts=o.options??0;
      const face=(opts&0x20)?{x:0,y:0,w:o.w,h:o.h}:{x:4,y:4,w:Math.max(1,o.w-8),h:Math.max(1,o.h-8)};
      if(!(opts&0x08)){ ctx.fillStyle=isoColor(o.bg); ctx.fillRect(x+face.x,y+face.y,face.w,face.h); }
      o.children.forEach(c=>{const co=POOL.get(c.id); if(co) drawObject(co,x+face.x+(c.x||0),y+face.y+(c.y||0));});
      if(!(opts&0x20)&&!(opts&0x04)){ ctx.strokeStyle=isoColor(o.border); ctx.lineWidth=4; ctx.strokeRect(x+2,y+2,o.w-4,o.h-4); }
      return; }
    case 7: { // InputBoolean — InputBooleanComponent
      ctx.fillStyle=isoColor(o.bg); ctx.fillRect(x,y,o.w,o.h);
      let checked=(o.value??0)!==0;
      if(o.varRef&&o.varRef!==0xFFFF){ const v=POOL.get(o.varRef); if(v&&v.type===21) checked=(v.value??0)!==0; }
      const fa=POOL.get(o.fontAttr);
      ctx.strokeStyle=(fa&&fa.type===23)?isoColor(fa.color??0):'#000';
      ctx.lineWidth=1;
      if(checked){ ctx.beginPath();
        ctx.moveTo(x,y+o.h/2); ctx.lineTo(x+o.w/2,y+o.h);
        ctx.lineTo(x+o.w,y); ctx.stroke(); }
      if(!(o.enabled??1)){ ctx.fillStyle='rgba(128,128,128,0.5)'; ctx.fillRect(x,y,o.w,o.h); }
      break; }
    case 8: { if(o.bg){ctx.fillStyle=isoColor(o.bg);ctx.fillRect(x,y,o.w,o.h);}
      ctx.fillStyle=colorOf(o,'fontAttr'); ctx.font=fontOf(o); ctx.textBaseline='top';
      ctx.fillText(varValue(o) ?? strValue(o),x,y); break; }
    case 11: drawString(o,x,y); break;
    case 27: { // ObjectPointer: a hivatkozott objektum rajzolása (AgIsoVirtualTerminal ObjectPointerComponent szerint)
      const ref=POOL.get(o.value);
      if(ref){ _ptrDepth=(_ptrDepth||0)+1; if(_ptrDepth<16) drawObject(ref,x,y); _ptrDepth--; }
    } break;
    case 9: case 12: { if(o.bg){ctx.fillStyle=isoColor(o.bg);ctx.fillRect(x,y,o.w,o.h);}
      ctx.fillStyle=colorOf(o,'fontAttr'); ctx.font=fontOf(o); ctx.textBaseline='top';
      let s = varValue(o);
      if(s===null){ let v=(o.value??0)*(o.scale||1)+(o.offset||0);
        s=o.decimals? v.toFixed(o.decimals) : String(Math.round(v)); if(o.format)s=v.toExponential(); }
      const fa=POOL.get(o.fontAttr); const tw=ctx.measureText(s).width;
      const h=(fa&&(FONTS[fa.size]||[8,8])[1])||8;
      let dx=x; if(((o.just>>2)&3)===1)dx=x+(o.w-tw)/2; else if(((o.just>>2)&3)===2)dx=x+o.w-tw;
      let dy=y; if((o.just&3)===1)dy=y+(o.h-h)/2; else if((o.just&3)===2)dy=y+o.h-h;
      ctx.fillText(s,dx,dy); break; }
    case 13: { // OutputLine — OutputLineComponent: 0=TL→BR, 1=BL→TR
      const ls=lineStyleOf(o); if(!ls) break;
      ctx.strokeStyle=ls.color; ctx.lineWidth=ls.width+0.5; ctx.beginPath();
      if(o.h<=1){ ctx.moveTo(x,y); ctx.lineTo(x+o.w,y); }
      else if(o.w<=1){ ctx.moveTo(x,y); ctx.lineTo(x,y+o.h); }
      else if(o.direction===1){ ctx.moveTo(x,y+o.h); ctx.lineTo(x+o.w,y); }
      else { ctx.moveTo(x,y); ctx.lineTo(x+o.w,y+o.h); }
      ctx.stroke(); break; }
    case 14: { // OutputRectangle — fill típusok + lineSuppression
      const fc=fillColourOf(o);
      if(fc){ ctx.fillStyle=fc; ctx.fillRect(x,y,o.w,o.h); }
      const ls=lineStyleOf(o);
      if(ls){ ctx.strokeStyle=ls.color; ctx.lineWidth=ls.width; const s=o.lineSuppression||0;
        ctx.beginPath();
        if(!(s&1)){ctx.moveTo(x,y);ctx.lineTo(x+o.w,y);}
        if(!(s&2)){ctx.moveTo(x+o.w,y);ctx.lineTo(x+o.w,y+o.h);}
        if(!(s&4)){ctx.moveTo(x+o.w,y+o.h);ctx.lineTo(x,y+o.h);}
        if(!(s&8)){ctx.moveTo(x,y+o.h);ctx.lineTo(x,y);}
        ctx.stroke(); }
      break; }
    case 15: { // OutputEllipse — előbb kitöltés, utána körvonal; szögek 2°-os egységben
      const rx=o.w/2, ry=o.h/2, cx=x+rx, cy=y+ry;
      const fc=fillColourOf(o);
      if(fc&&o.ellipseType!==1){ ctx.fillStyle=fc; ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,2*Math.PI); ctx.fill(); }
      const ls=lineStyleOf(o);
      if(ls){
        ctx.strokeStyle=ls.color; ctx.lineWidth=ls.width; ctx.beginPath();
        if(o.ellipseType===0){ ctx.ellipse(cx,cy,rx,ry,0,0,2*Math.PI); }
        else { let a1=vtRad((o.startAngle||0)*2), a2=vtRad((o.endAngle||0)*2);
          if(a2<a1) a2+=2*Math.PI;
          if(fc&&o.ellipseType===2){ ctx.fillStyle=fc; ctx.ellipse(cx,cy,rx,ry,0,a1,a2); ctx.fill(); }
          ctx.ellipse(cx,cy,rx,ry,0,a1,a2); }
        ctx.stroke(); }
      break; }
    case 16: { if(o.points&&o.points.length>=3){ctx.beginPath();ctx.moveTo(x+o.points[0][0],y+o.points[0][1]);
        for(let i=1;i<o.points.length;i++)ctx.lineTo(x+o.points[i][0],y+o.points[i][1]);ctx.closePath();
        const fc=fillColourOf(o); if(fc){ctx.fillStyle=fc;ctx.fill();}
        const ls=lineStyleOf(o); if(ls){ctx.strokeStyle=ls.color;ctx.lineWidth=ls.width;ctx.stroke();}} break; }
    case 17: { // OutputMeter — szó szerint az OutputMeterComponent::paint portja
      const W=o.w, H=o.h, cx=x+W/2, cy=y+H/2;
      const val=varNumValue(o);
      // --- ív (DrawArc bit0): addCentredArc ±90° rotációval, pontonként mintavételezve ---
      if(o.options&0x01){
        let startVt=(o.startAngle??0)*2*Math.PI/180, endVt=(o.endAngle??0)*2*Math.PI/180;
        if(endVt<startVt) endVt+=2*Math.PI;
        const rot=(startVt<endVt)?-Math.PI/2:Math.PI/2;
        const rxc=W/2, ryc=H/2, cR=Math.cos(rot), sR=Math.sin(rot);
        ctx.strokeStyle='#000'; ctx.lineWidth=1; ctx.beginPath();
        for(let t=0;t<=96;t++){
          const a=startVt+(endVt-startVt)*t/96;
          // JUCE addCentredArc: 0 = 12 ora, oramutatoval: pont = (sin a, -cos a)
          const px=Math.sin(a)*rxc, py=-Math.cos(a)*ryc;
          const X=px*cR-py*sR, Y=px*sR+py*cR;
          const sx=cx+X, sy=cy+Y;
          if(t===0)ctx.moveTo(sx,sy); else ctx.lineTo(sx,sy);
        }
        ctx.stroke();
      }
      if(o.options&0x02){ ctx.strokeStyle=isoColor(o.border??0); ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,W-1,H-1); }
      // --- tű: theta = (value/maxValue)*(startDeg-endDeg); CW: end+theta, CCW: end-theta ---
      const startDeg=(o.startAngle??0)*2, endDeg0=(o.endAngle??0)*2;
      let endDeg=endDeg0; if(endDeg<startDeg) endDeg+=360;
      const theta=(val/(o.max??65535))*(startDeg-endDeg);
      const needleDeg=((o.options&0x08)!==0)? (endDeg+theta) : (endDeg-theta);
      const aRad=needleDeg*Math.PI/180;
      const xo=(W/2)*Math.cos(aRad), yo=-(W/2)*Math.sin(aRad);
      ctx.strokeStyle=isoColor(o.needleColor??0); ctx.lineWidth=3; ctx.beginPath();
      ctx.moveTo(cx+xo, W/2+y+yo); ctx.lineTo(cx, cy); ctx.stroke();
      break; }
    case 19: { // OutputArchedBarGraph — szögek 2°-ban, szektor-töltés
      const opts=o.options??0;
      const val=varNumValue(o);
      const mn=o.min??0, mx=o.max??65535;
      const frac=(mx>mn)?Math.max(0,Math.min(1,((val-mn)/(mx-mn)))):0;
      const tfrac=(mx>mn)?Math.max(0,Math.min(1,(((o.targetLineValue??0)-mn)/(mx-mn)))):0;
      const cx=x+o.w/2, cy=y+o.h;
      const rx=o.w/2-2, ry=o.h-2;
      let a1=vtRad((o.startAngle??0)*2), a2=vtRad((o.endAngle??0)*2);
      if(a2<a1) a2+=2*Math.PI;
      if(opts&0x01){ ctx.strokeStyle=isoColor(o.bg??0); ctx.lineWidth=1; ctx.strokeRect(x+.5,y+.5,o.w-1,o.h-1); }
      const bc=isoColor(o.color??7);
      ctx.strokeStyle=bc; ctx.lineWidth=6; ctx.beginPath();
      ctx.ellipse(cx,cy,rx,ry,0,a1,a1+(a2-a1)*frac); ctx.stroke();
      if(opts&0x02){ ctx.strokeStyle=isoColor(o.targetLineColour??0); ctx.lineWidth=2; ctx.beginPath();
        ctx.ellipse(cx,cy,rx-4,ry-4,0,a1,a1+(a2-a1)*tfrac); ctx.stroke(); } break; }
    case 18: { // OutputLinearBarGraph — OutputLinearBarGraphComponent
      const opts=o.options??0;
      const val=varNumValue(o);
      const mn=o.min??0, mx=o.max??65535;
      const frac=(mx>mn)?Math.max(0,Math.min(1,((val-mn)/(mx-mn)))):0;
      const tfrac=(mx>mn)?Math.max(0,Math.min(1,(((o.targetLineValue??0)-mn)/(mx-mn)))):0;
      const bc=isoColor(o.color??7), tc=isoColor(o.targetLineColour??0);
      if(opts&0x01){ ctx.strokeStyle=bc; ctx.lineWidth=3; ctx.strokeRect(x+1.5,y+1.5,o.w-3,o.h-3); }
      const horizontal=(opts&0x10)!==0, positive=(opts&0x20)!==0;
      if(horizontal){
        const pos=(positive? frac : 1-frac)*o.w, tpos=(positive? tfrac : 1-tfrac)*o.w;
        if(!(opts&0x08)){ ctx.fillStyle=bc;
          if(positive) ctx.fillRect(x,y,pos,o.h); else ctx.fillRect(x+o.w-pos,y,pos,o.h); }
        else { ctx.strokeStyle=bc; ctx.lineWidth=3; ctx.beginPath();
          ctx.moveTo(x+pos,y); ctx.lineTo(x+pos,y+o.h); ctx.stroke(); }
        if(opts&0x02){ ctx.strokeStyle=tc; ctx.lineWidth=2; ctx.beginPath();
          ctx.moveTo(x+tpos,y); ctx.lineTo(x+tpos,y+o.h); ctx.stroke(); }
      } else {
        const pos=(positive? 1-frac : frac)*o.h, tpos=(positive? 1-tfrac : tfrac)*o.h;
        if(!(opts&0x08)){ ctx.fillStyle=bc;
          if(positive) ctx.fillRect(x,y+pos,o.w,o.h-pos); else ctx.fillRect(x,y,o.w,pos); }
        else { ctx.strokeStyle=bc; ctx.lineWidth=3; ctx.beginPath();
          ctx.moveTo(x,y+pos); ctx.lineTo(x+o.w,y+pos); ctx.stroke(); }
        if(opts&0x02){ ctx.strokeStyle=tc; ctx.lineWidth=2; ctx.beginPath();
          ctx.moveTo(x,y+tpos); ctx.lineTo(x+o.w,y+tpos); ctx.stroke(); }
      } break; }
    case 20: {
      const pim=pictureImage(o);
      if(pim&&pim.complete&&pim.naturalWidth){
        ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
        ctx.drawImage(pim,x,y,o.w||pim.naturalWidth,o.h||pim.naturalHeight);
      } else { ctx.fillStyle='#333'; ctx.fillRect(x,y,o.w||10,o.h||10); }
      break; }
    case 34: { // WindowMask: keretes ablak + cím
      ctx.fillStyle=isoColor(o.bg??1); ctx.fillRect(x,y,o.w,o.h);
      ctx.strokeStyle=isoColor(o.options??0); ctx.lineWidth=2; ctx.strokeRect(x+1,y+1,o.w-2,o.h-2);
      const title=(o.values&&o.values[activeLang])||'';
      if(title){ ctx.fillStyle='#fff'; ctx.font=fontOf({fontAttr:o.fontAttr}); ctx.textBaseline='top'; ctx.fillText(title,x+4,y+4); }
    } break;
  }
  if(sel){ ctx.strokeStyle='#40FF40'; ctx.setLineDash([4,3]); ctx.strokeRect(x-2.5,y-2.5,(o.w||20)+5,(o.h||12)+5); ctx.setLineDash([]); }
}
function render(){
  const ws=[...POOL.values()].find(o=>o.type===0);
  if(!ws) return;
  const mask=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws.activeMask);
  if(!mask) return;
  const skm=POOL.get(mask.softkeyMask);
  // A VT "képernyője" = adatterület (a pool-elemek erre a szélességre vannak tervezve)
  // + a softkey-sáv KÜLÖN, attól JOBBRA. A canvas ezért kiszélesedik a softkey-sávval,
  // így a gombok NEM fedhetik az adatterület elemeit (DataMaskRenderArea + skm area).
  let baseW=canvas.width, baseH=canvas.height;
  const vs=document.getElementById('vtSize');
  if(vs){ const [w,h]=vs.value.split('x').map(Number); if(w&&h){baseW=w; baseH=h;} }
  // SoftKeyMask elhelyezés a szabvány/JUCE szerint (SoftKeyMaskComponent):
  // jobbról balra töltött oszlopok, oszloponként felülről lefelé, PADDING=10.
  const PAD=10;
  const keys=skm?skm.children.map(c=>POOL.get(c.id)).filter(k=>k):[];
  const n=keys.length;
  let areaW=0, rows=0, cols=0, keyW=0, keyH=0;
  if(n){
    keyW=keys[0].w||60; keyH=keys[0].h||80;
    rows=Math.max(1,Math.floor((baseH-PAD)/(keyH+PAD)));
    cols=Math.max(1,Math.ceil(n/rows));
    areaW=PAD+cols*(keyW+PAD);
  }
  // elhelyezés: VT terminál layout (jobbra = oszlopok; alul = vízszintes sor)
  const pos=(function(){
    const sel=document.getElementById('skmPos');
    if(sel) return sel.value;
    try{return localStorage.getItem('skmPos')||'right';}catch(e){return 'right';}
  })();
  let targetW=baseW, targetH=baseH;
  if(n){
    if(pos==='right'){ targetW=baseW+areaW; }
    else {
      // alul: egy sor, a gombok szélessége a maradék helyhez igazodik
      keyW=Math.floor((baseW-PAD*(n+1))/n); keyH=Math.min(keyH,80);
      targetH=baseH+PAD+keyH+PAD;
    }
  }
  if(canvas.width!==targetW||canvas.height!==targetH){ canvas.width=targetW; canvas.height=targetH; }
  const dataW=baseW, dataH=baseH;
  ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // adatterület + tartalom (a pool elemei a teljes adatterületet használhatják)
  ctx.fillStyle=isoColor(mask.bg); ctx.fillRect(0,0,dataW,dataH);
  mask.children.forEach(c=>{const o=POOL.get(c.id); if(o)drawObject(o,c.x,c.y);});
  // softkey sáv a terminál layout szerint
  if(n){
    if(pos==='right'){
      const skX=dataW;
      ctx.fillStyle=isoColor(skm.bg??1); ctx.fillRect(skX,0,areaW,baseH);
      keys.forEach((key,i)=>{
        const col=Math.floor(i/rows), row=i%rows;
        const x=skX+PAD+(cols-1-col)*(keyW+PAD);
        const y=PAD+row*(keyH+PAD);
        ctx.fillStyle=isoColor(key.bg??2); ctx.fillRect(x,y,keyW,keyH);
        ctx.strokeStyle='#333'; ctx.strokeRect(x+.5,y+.5,keyW-1,keyH-1);
        ctx.save(); ctx.beginPath(); ctx.rect(x,y,keyW,keyH); ctx.clip();
        key.children.forEach(ch=>{const co=POOL.get(ch.id); if(co)drawObject(co,x+ch.x,y+ch.y);});
        ctx.restore();
      });
    } else {
      const skY=dataH;
      ctx.fillStyle=isoColor(skm.bg??1); ctx.fillRect(0,skY,baseW,PAD+keyH+PAD);
      keys.forEach((key,i)=>{
        const x=PAD+i*(keyW+PAD), y=skY+PAD;
        ctx.fillStyle=isoColor(key.bg??2); ctx.fillRect(x,y,keyW,keyH);
        ctx.strokeStyle='#333'; ctx.strokeRect(x+.5,y+.5,keyW-1,keyH-1);
        ctx.save(); ctx.beginPath(); ctx.rect(x,y,keyW,keyH); ctx.clip();
        key.children.forEach(ch=>{const co=POOL.get(ch.id); if(co)drawObject(co,x+ch.x,y+ch.y);});
        ctx.restore();
      });
    }
  }
}

/* ---------- UI: tree, props, interactions ---------- */
const logEl=document.getElementById('log');
function log(s){ logEl.innerHTML+=s+'<br>'; logEl.scrollTop=1e9; }
function refreshAll(){ refreshLangs(); refreshMasks(); refreshTree(); render(); refreshProps(); drawCwin(); }

function refreshLangs(){
  const sel=document.getElementById('langSel');
  sel.innerHTML=LANGS.map(l=>`<option ${l===activeLang?'selected':''}>${l}</option>`).join('');
}
document.getElementById('langSel').onchange=e=>{activeLang=e.target.value;render();refreshProps();};

function refreshMasks(){
  const sel=document.getElementById('maskSel');
  const elozo=sel.value; // megőrizzük a választást
  const masks=[...POOL.values()].filter(o=>o.type===1||o.type===2);
  sel.innerHTML=masks.map(m=>`<option value="${m.id}">${m.id} (${T[m.type]})</option>`).join('')||'<option value="">—</option>';
  if(masks.some(m=>String(m.id)===elozo)) sel.value=elozo;
}
document.getElementById('maskSel').onchange=e=>{ render(); if(e.target.value) selectId(+e.target.value); };

/* ---------- KONTÉNER-ABLAK (hiányzó HTML elemek automatikus létrehozása) ---------- */
if(!document.getElementById('cwin')){
  const d=document.createElement('div'); d.id='cwin';
  d.innerHTML=`<div id="cwin_head"><span id="cwin_title">Konténer</span><button id="cwin_close">✕</button></div><canvas id="cwin_canvas" width="240" height="160"></canvas>`;
  document.body.appendChild(d);
}
if(!document.getElementById('zoomSel')){
  const hs=document.querySelector('header');
  if(hs){ const s=document.createElement('select'); s.id='zoomSel'; s.title='Nagyítás';
    s.innerHTML='<option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option>';
    hs.appendChild(s); }
}
if(!document.getElementById('skmPos')){
  const hs=document.querySelector('header');
  if(hs){ const s=document.createElement('select'); s.id='skmPos'; s.title='Softkey-sáv elhelyezése (VT terminál layout)';
    s.innerHTML='<option value="right">Softkey: jobbra</option><option value="bottom">Softkey: alul</option>';
    try{ s.value=localStorage.getItem('skmPos')||'right'; }catch(e){}
    s.onchange=()=>{ try{localStorage.setItem('skmPos',s.value);}catch(e){} render(); };
    hs.appendChild(s); }
}
if(!document.getElementById('vtSize')){
  const hs=document.querySelector('header');
  if(hs){ const s=document.createElement('select'); s.id='vtSize'; s.title='VT kijelző mérete';
    s.innerHTML='<option value="480x480">480×480</option><option value="640x480">640×480</option><option value="800x480">800×480</option><option value="320x240">320×240</option><option value="480x272">480×272</option><option value="240x240">240×240</option>';
    hs.appendChild(s); }
}
const cwinEl=document.getElementById('cwin');
const cwinCanvas=document.getElementById('cwin_canvas');
let cwObj=null;
function openCwin(o){
  cwObj=o;
  cwinCanvas.width=Math.min(560,Math.max(140,o.w||240));
  cwinCanvas.height=Math.min(400,Math.max(90,o.h||160));
  document.getElementById('cwin_title').textContent=`Konténer #${o.id} — ${T[o.type]} (${o.children.length} gyerek)`;
  cwinEl.style.display='block';
  drawCwin();
}
function closeCwin(){ cwinEl.style.display='none'; cwObj=null; }
function drawCwin(){
  if(!cwObj) return;
  const old=ctx;
  ctx=cwinCanvas.getContext('2d');
  ctx.fillStyle=isoColor(cwObj.bg??1); ctx.fillRect(0,0,cwinCanvas.width,cwinCanvas.height);
  cwObj.children.forEach(c=>{const co=POOL.get(c.id); if(co)drawObject(co,c.x||0,c.y||0);});
  // kijeloles kerete
  cwObj.children.forEach(c=>{ const co=POOL.get(c.id);
    if(co&&co.id===selectedId){ ctx.strokeStyle='#4ff'; ctx.strokeRect((c.x||0)+.5,(c.y||0)+.5,(co.w||24)-1,(co.h||12)-1); } });
  ctx=old;
}
document.getElementById('cwin_close').onclick=closeCwin;
// ablak huzasa a fejleccel
(function(){ let wdrag=null;
  const head=document.getElementById('cwin_head');
  head.onmousedown=e=>{ if(e.target.tagName==='BUTTON')return;
    const r=cwinEl.getBoundingClientRect(); wdrag={dx:e.clientX-r.left, dy:e.clientY-r.top};
    const move=ev=>{ if(!wdrag)return; cwinEl.style.left=(ev.clientX-wdrag.dx)+'px'; cwinEl.style.top=(ev.clientY-wdrag.dy)+'px'; cwinEl.style.right='auto'; };
    const up=()=>{ wdrag=null; document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
    document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
  };
})();
// gyerek-kivalasztas/huzas a kontener-ablakban
(function(){ let cd=null;
  cwinCanvas.onmousedown=e=>{
    if(!cwObj)return;
    const mx=e.offsetX, my=e.offsetY;
    let hit=null;
    (function find(children,ox,oy){ for(const c of children){ const co=POOL.get(c.id); if(!co)continue;
      if(mx>=ox+(c.x||0)&&mx<=ox+(c.x||0)+(co.w||24)&&my>=oy+(c.y||0)&&my<=oy+(c.y||0)+(co.h||12)) hit=c;
      if(hit) return; if([3,10,37,35].includes(co.type)) find(co.children,ox+(c.x||0),oy+(c.y||0)); } })(cwObj.children,0,0);
    if(hit){ selectId(hit.id); cd={ref:hit, sx:mx, sy:my, ox:hit.x||0, oy:hit.y||0}; snapshot(); }
  };
  cwinCanvas.onmousemove=e=>{ if(!cd||!cwObj)return;
    cd.ref.x=cd.ox+(e.offsetX-cd.sx); cd.ref.y=cd.oy+(e.offsetY-cd.sy);
    drawCwin(); render(); };
  cwinCanvas.onmouseup=()=>{ if(cd){ cd=null; refreshTree(); refreshProps(); } };
})();
function findParentRef(id){
  for(const o of POOL.values()){
    if(!o.children||!o.children.length) continue;
    const c=o.children.find(c=>c.id===id);
    if(c) return {p:o, ref:c};
  } return null;
}
function canHaveChildren(o){ return o && [0,1,2,3,4,5,6,10,34,35,37].includes(o.type); }
function reparent(id, target){
  if(!target || target.id===id) return;
  let t=target; while(t){ if(t.id===id) return log('Ciklus nem megengedett!'); t=(findParentRef(t.id)||{}).p; }
  if(!canHaveChildren(target)) return log('#'+target.id+' '+T[target.type]+' nem fogad gyereket.');
  const src=findParentRef(id);
  if(src && src.p.id===target.id) return;
  snapshot();
  if(src) src.p.children.splice(src.p.children.indexOf(src.ref),1);
  target.children.push({id, x:src?(src.ref.x||0):0, y:src?(src.ref.y||0):0});
  log('#'+id+' áthelyezve → #'+target.id+' ('+T[target.type]+')');
  selectId(id);
}
function treeRow(id, depth){
  const o=POOL.get(id);
  const accepts=canHaveChildren(o);
  return `<div class="obj ${id===selectedId?'sel':''}" data-id="${id}" draggable="true"
    style="padding-left:${8+depth*14}px" title="${accepts?'Gyerek elemeket ide lehet dobni':''}">
    ${accepts?'▸ ':''}#${id} ${T[o.type]}${o.name?' — '+o.name:''}</div>`;
}
function treeKids(id, depth){
  const o=POOL.get(id); let h='';
  for(const c of (o.children||[])) if(POOL.has(c.id)){ h+=treeRow(c.id,depth); h+=treeKids(c.id,depth+1); }
  return h;
}
function refreshTree(){
  const tree=document.getElementById('tree');
  let html='<div class="sec">Objektumok (húzd át egy másik elemre az áthelyezéshez)</div>';
  for(const id of ORDER){
    const o=POOL.get(id);
    if(findParentRef(id)) continue; // csak gyökérszintűek
    html+=treeRow(id,0)+treeKids(id,1);
  }
  tree.innerHTML=html;
  let dragId=null;
  const kijelolt=tree.querySelector('.obj.sel');
  if(kijelolt) kijelolt.scrollIntoView({block:'nearest'});
  tree.querySelectorAll('.obj').forEach(el=>{
    el.onclick=()=>{selectId(+el.dataset.id);};
    el.ondragstart=e=>{dragId=+el.dataset.id; e.dataTransfer.effectAllowed='move';};
    el.ondragover=e=>{ const o=POOL.get(+el.dataset.id); if(canHaveChildren(o)) e.preventDefault(); };
    el.ondrop=e=>{ e.preventDefault(); reparent(dragId, POOL.get(+el.dataset.id)); dragId=null; };
  });
  tree.ondragover=e=>e.preventDefault();
  tree.ondrop=e=>{ // fa hátterére dobás = az aktív maszkbA
    if(dragId===null)return; e.preventDefault();
    const ws=[...POOL.values()].find(x=>x.type===0);
    const mask=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws&&ws.activeMask);
    if(mask) reparent(dragId, mask);
    dragId=null;
  };
}
function inCwinSubtree(id){
  if(!cwObj) return false;
  let talalhato=(cwObj.id===id);
  (function walk(children){ for(const c of children){ if(c.id===id){talalhato=true;return;}
    const co=POOL.get(c.id); if(co&&[3,10,37,35,5].includes(co.type)&&!talalhato) walk(co.children); } })(cwObj.children);
  return talalhato;
}
function selectId(id){
  selectedId=id;
  const so=id!==null?POOL.get(id):null;
  if(so&&[3,10,37].includes(so.type)) openCwin(so);
  else if(!inCwinSubtree(id)) closeCwin();
  // maszk kijelolese -> a képernyo is valt arra
  if(so&&(so.type===1||so.type===2)){
    const sel=document.getElementById('maskSel');
    if(sel && sel.value!==String(id)){
      if([...sel.options].some(op=>op.value===String(id))) sel.value=String(id);
      else { sel.innerHTML=`<option value="${id}">#${id} (${T[so.type]})</option>`; sel.value=String(id); }
      render();
    }
  }
  refreshTree(); refreshProps();
  document.getElementById('selInfo').textContent=id!==null?`#${id} ${T[POOL.get(id).type]}`:'';
  render();
}

function prop(label,input){ return `<label>${label}</label>${input}`; }
function colorSelect(id,val){
  return `<select id="${id}">`+ISO_COLORS.map(([n,h],i)=>`<option value="${i}" ${i===val?'selected':''}>${n}</option>`).join('')+'</select>';
}
function refreshProps(){
  const body=document.getElementById('propBody');
  if(selectedId===null||!POOL.has(selectedId)){ body.innerHTML='<span style="color:#666">Nincs kijelölés</span>'; return; }
  const o=POOL.get(selectedId);
  const pref=findParentRef(o.id);
  let h=`<div class="sec">#${o.id} — ${T[o.type]}</div>`;
  if(pref){
    h+=`<div style="color:#9cf">Szülő: #${pref.p.id} ${T[pref.p.type]}
      <button id="p_goParent" title="Szülő kijelölése">↑</button></div>`;
    h+=prop('X (szülőhöz képest)',`<input id="p_x" value="${pref.ref.x||0}">`)+
       prop('Y (szülőhöz képest)',`<input id="p_y" value="${pref.ref.y||0}">`)+
       `<button id="p_lift" style="width:100%;margin:4px 0">Kiemelés a szülőből → aktív maszk</button>`;
  } else if(canHaveChildren(o)){
    h+=`<div style="color:#777">Önálló elem — gyerekek a fában ide dobhatók.</div>`;
  }
  h+=prop('ID (új) — óvatosan!',`<input id="p_id" value="${o.id}">`);
  if(o.w!==undefined) h+=prop('Szélesség',`<input id="p_w" value="${o.w}">`);
  if(o.h!==undefined&&o.type!==7) h+=prop('Magasság',`<input id="p_h" value="${o.h}">`);
  if(o.bg!==undefined) h+=prop('Háttér szín',colorSelect('p_bg',o.bg));
  if(o.color!==undefined) h+=prop('Szín',colorSelect('p_color',o.color));
  if(o.border!==undefined) h+=prop('Keret szín',colorSelect('p_border',o.border));
  if(o.fontAttr!==undefined){
    const fonts=[...POOL.values()].filter(x=>x.type===23);
    h+=prop('FontAttributes',`<select id="p_fontAttr"><option value="65535">—</option>`+
      fonts.map(f=>`<option value="${f.id}" ${f.id===o.fontAttr?'selected':''}>#${f.id} ${FONTS[f.size]?.join('x')||''}</option>`).join('')+'</select>');
  }
  if(o.type===11||o.type===8||o.type===22){
    const have=o.values?Object.keys(o.values).filter(k=>(o.values[k]||'').trim()):[];
    h+=`<div style="color:#777">Fordítás: ${LANGS.map(l=>(have.includes(l)?'☑':'☐')+l).join(' ')}</div>`;
    h+=prop(`Szöveg (${activeLang})`,`<input id="p_value" value="${(o.values?o.values[activeLang]:o.value)||''}">`);
    h+=prop('Összes nyelv (lang=szöveg, vesszővel)',`<input id="p_values" value="${o.values?Object.entries(o.values).map(([k,v])=>k+'='+v).join(', '):activeLang+'='+(o.value||'')}">`);
  }
  if(o.type===12||o.type===9){
    h+=prop('Érték',`<input id="p_value" value="${o.value??0}">`)+
       prop('Decimálisok',`<input id="p_decimals" value="${o.decimals??0}">`)+
       prop('Skála',`<input id="p_scale" value="${o.scale??1}">`)+
       prop('Offset',`<input id="p_offset" value="${o.offset??0}">`);
  }
  if(o.keyCode!==undefined) h+=prop('KeyCode',`<input id="p_keyCode" value="${o.keyCode??0}">`);
  if(o.just!==undefined) h+=prop('Igazítás',`<select id="p_just">
    ${[['Bal felül',0],['Közép felül',4],['Jobb felül',8],['Bal közép',1],['Közép',5],['Jobb közép',9],['Bal alul',2],['Közép alul',6],['Jobb alul',10]]
    .map(([n,v])=>`<option value="${v}" ${v===o.just?'selected':''}>${n}</option>`).join('')}</select>`);
  if(o.softkeyMask!==undefined){
    const skm=[...POOL.values()].filter(x=>x.type===4);
    h+=prop('SoftKeyMask',`<select id="p_skm">`+skm.map(s=>`<option value="${s.id}" ${s.id===o.softkeyMask?'selected':''}>#${s.id}</option>`).join('')+'</select>');
  }
  if(o.children&&o.children.length){
    h+=`<div class="sec">Gyerekek (${o.children.length})</div>`;
    h+='<div style="max-height:150px;overflow:auto;margin:2px 0">';
    o.children.forEach((c,i)=>{
      const co=POOL.get(c.id);
      if(!co){ h+=`<div style="color:#a66;font-size:12px">missing #${c.id}</div>`; return; }
      h+=`<div class="obj ${c.id===selectedId?'sel':''}" style="padding:2px 4px;cursor:pointer;font-size:12px" data-ch="${c.id}">
        #${c.id} ${T[co.type]} @(${c.x||0},${c.y||0})</div>`;
    });
    h+='</div>';
  }
  if(o.type===20){
    h+=prop('Grafika (PictureGraphic)',`<canvas id="pg_prev" style="background:#666;image-rendering:pixelated"></canvas>`)+
       `<div style="font-size:11px;color:#aaa">tényleges méret: ${o.actualW}×${o.actualH}, formátum: ${o.format}, rawLen: ${o.rawLen}</div>`+
       prop('Kép cseréje',`<input type="file" id="pg_file" accept="image/png,image/jpeg,image/bmp">`);
  }
  h+=`<button id="p_del" style="margin-top:10px;color:#f88">Objektum törlése</button>`;
  body.innerHTML=h;
  if(o.type===20){
    const pv=document.getElementById('pg_prev');
    if(pv){ const purl=pictureURL(o);
      if(purl){ const imEl=document.createElement('img');
        imEl.src=purl; imEl.id='pg_prev_img';
        imEl.style.cssText='background:repeating-conic-gradient(#555 0% 25%, #666 0% 50%) 0 0/12px 12px;display:block;max-width:180px;max-height:140px;image-rendering:auto';
        pv.replaceWith(imEl);
      } }
    try{ pgPreview(o,pv); }catch(e){}
    const pf=document.getElementById('pg_file');
    if(pf) pf.onchange=e=>{ const f=e.target.files[0]; if(f) importImageToPG(o,f); };
  }
  body.querySelectorAll('[data-ch]').forEach(el=>{
    el.onclick=()=>selectId(+el.dataset.ch);
  });
  const bind=(id,fn)=>{const el=document.getElementById(id); if(el)el.onchange=()=>{snapshot();fn(el);refreshAll();};};
  bind('p_id',el=>{const nid=+el.value; const old=o.id; o.id=nid; POOL.delete(old); POOL.set(nid,o);
    ORDER=ORDER.map(x=>x===old?nid:x);
    POOL.forEach(p=>p.children.forEach(c=>{if(c.id===old)c.id=nid;})); selectedId=nid;});
  bind('p_w',el=>o.w=+el.value); bind('p_h',el=>o.h=+el.value);
  bind('p_bg',el=>o.bg=+el.value); bind('p_color',el=>o.color=+el.value); bind('p_border',el=>o.border=+el.value);
  bind('p_fontAttr',el=>o.fontAttr=+el.value); bind('p_skm',el=>o.softkeyMask=+el.value);
  bind('p_value',el=>{if(o.values)o.values[activeLang]=el.value;else o.value=el.value;});
  bind('p_values',el=>{o.values={}; el.value.split(',').forEach(p=>{const[k,...v]=p.split('='); if(k.trim())o.values[k.trim()]=v.join('=').trim();});
    if(!o.values[activeLang]===undefined)o.value=o.values[activeLang]??o.value;});
  bind('p_decimals',el=>o.decimals=+el.value); bind('p_scale',el=>o.scale=parseFloat(el.value));
  bind('p_offset',el=>o.offset=+el.value);
  bind('p_keyCode',el=>o.keyCode=+el.value); bind('p_just',el=>o.just=+el.value);
  bind('p_x',el=>{const p=findParentRef(o.id); if(p)p.ref.x=+el.value;});
  bind('p_y',el=>{const p=findParentRef(o.id); if(p)p.ref.y=+el.value;});
  const gp=document.getElementById('p_goParent');
  if(gp) gp.onclick=()=>{const p=findParentRef(o.id); if(p)selectId(p.p.id);};
  const lift=document.getElementById('p_lift');
  if(lift) lift.onclick=()=>{
    const p=findParentRef(o.id); if(!p)return;
    const ws=[...POOL.values()].find(x=>x.type===0);
    const mask=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws&&ws.activeMask);
    if(!mask||mask.id===p.p.id) return log('Nincs hova kiemelni (a szülő maga az aktív maszk).');
    snapshot();
    p.p.children.splice(p.p.children.indexOf(p.ref),1);
    mask.children.push({id:o.id, x:p.ref.x||0, y:p.ref.y||0});
    log('#'+o.id+' kiemelve a szülőből → #'+mask.id);
    selectId(o.id);
  };
  document.getElementById('p_del').onclick=deleteSelected;
}
function deleteSelected(){
  if(selectedId===null)return; snapshot();
  const id=selectedId;
  POOL.forEach(p=>p.children=p.children.filter(c=>c.id!==id));
  POOL.delete(id); ORDER=ORDER.filter(x=>x!==id);
  selectId(null); log(`#${id} törölve.`);
}

/* drag / resize on canvas */
let drag=null;
function findHit(mx,my){
  const ws=[...POOL.values()].find(o=>o.type===0); if(!ws)return null;
  const mask=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws.activeMask); if(!mask)return null;
  const skH=64, skY=canvas.height-skH;
  function hitIn(children,ox,oy,inSoft){
    for(let i=children.length-1;i>=0;i--){
      const c=children[i], o=POOL.get(c.id); if(!o)continue;
      const x=ox+c.x, y=oy+(inSoft?skYoff():c.y);
      const w=o.w||24,h=o.h||12;
      if(mx>=x&&mx<=x+w&&my>=y&&my<=y+h)return{id:o.id,px:c,ox:x,oy:y};
      if([3,10,37,35].includes(o.type)){const r=hitIn(o.children,x,y,false); if(r)return r;}
      if(o.type===5){const r2=hitIn(o.children,x,y,false); if(r2)return r2;}
    } return null;
  }
  function skYoff(){return canvas.height-skH;}
  if(mask.softkeyMask&&POOL.get(mask.softkeyMask)&&my>=skY){
    const skm=POOL.get(mask.softkeyMask), n=skm.children.length||1;
    for(let i=n-1;i>=0;i--){
      const w=canvas.width/n, x=i*w; const key=POOL.get(skm.children[i].id); if(!key)continue;
      if(mx>=x&&mx<=x+w&&my>=skY&&my<=skY+skH){
        const r=hitIn(key.children,x+2,skY+2,false);
        return r||{id:key.id,px:skm.children[i],ox:x,oy:skY};
      }
    }
  }
  return hitIn(mask.children,0,0,false);
}
canvas.onmousedown=e=>{
  const r=canvas.getBoundingClientRect(), mx=(e.clientX-r.left)*(canvas.width/r.width), my=(e.clientY-r.top)*(canvas.height/r.height);
  // sarokfogó?
  if(selectedId!==null&&POOL.has(selectedId)){
    const o=POOL.get(selectedId);
    if(o.w!==undefined&&o.h!==undefined){
      const pos=objPos(o);
      if(pos&&Math.abs(mx-(pos.x+o.w))<6&&Math.abs(my-(pos.y+o.h))<6){
        snapshot(); drag={id:o.id,o,sx:mx,sy:my,ow:o.w,oh:o.h,mode:'resize'}; return;
      }
    }
  }
  const hit=findHit(mx,my);
  if(hit){ selectId(hit.id); snapshot();
    drag={id:hit.id,px:hit.px,sx:mx,sy:my,ox:hit.px.x,oy:hit.px.y,mode:'move'}; }
};
function objPos(o){ // az objektum képernyő-koordinátája az aktív maszkban
  const ws=[...POOL.values()].find(x=>x.type===0); if(!ws)return null;
  const mask=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws.activeMask); if(!mask)return null;
  function findIn(children){
    for(const c of children){ if(c.id===o.id) return c;
      const co=POOL.get(c.id);
      if(co&&[3,10,37,35,5].includes(co.type)){ const r=findIn(co.children); if(r) return {x:(r.__px||r).x + 0, y:0}; }
    } return null; }
  // egyszerűbb: lineáris keresés a maszk gyerekei között (gyerek-konténereken belül is)
  function deep(children,ox,oy){
    for(const c of children){ if(c.id===o.id) return {x:ox+c.x,y:oy+c.y};
      const co=POOL.get(c.id);
      if(co&&[3,10,37,35,5].includes(co.type)){ const r=deep(co.children,ox+c.x,oy+c.y); if(r) return r; } }
    return null; }
  return deep(mask.children,0,0);
}
canvas.onmousemove=e=>{
  if(!drag)return;
  const r=canvas.getBoundingClientRect(), mx=(e.clientX-r.left)*(canvas.width/r.width), my=(e.clientY-r.top)*(canvas.height/r.height);
  if(drag.mode==='resize'){ drag.o.w=Math.max(4,drag.ow+(mx-drag.sx)); drag.o.h=Math.max(4,drag.oh+(my-drag.sy)); }
  else { drag.px.x=drag.ox+(mx-drag.sx); drag.px.y=drag.oy+(my-drag.sy); }
  render();
};
canvas.onmouseup=()=>{ if(drag){drag=null;refreshTree();} };
/* ---------- ÚJ ELEM LÉTREHOZÁSA ---------- */
let nextId = 100000;
function freeId(){ while(POOL.has(nextId)) nextId++; return nextId; }
const DEFAULTS = {
  datamask:{bg:0, softkeyMask:0xFFFF, children:[]},
  softkeymask:{bg:1, children:[]},
  container:{w:60,h:40,hidden:0,children:[]},
  key:{bg:1, keyCode:1, children:[]},
  button:{w:60,h:30, bg:1, border:0, keyCode:1, options:0, children:[]},
  outputstring:{w:80,h:14, bg:0, fontAttr:0xFFFF, options:0, varRef:0xFFFF, just:0, values:null, value:''},
  outputnumber:{w:60,h:14, bg:0, fontAttr:0xFFFF, options:0, varRef:0xFFFF, value:0, offset:0, scale:1, decimals:0, format:0, just:0},
  inputnumber:{w:60,h:14, bg:1, fontAttr:0xFFFF, options:0, varRef:0xFFFF, value:0, min:0, max:100, offset:0, scale:1, decimals:0, format:0, just:0, options2:0},
  outputrectangle:{w:60,h:30, lineAttr:0xFFFF, lineSuppression:0, fillAttr:0xFFFF},
  outputline:{w:40,h:0, lineAttr:0xFFFF, direction:0},
  fontattributes:{color:1, size:4, fontType:0, style:0},
  lineattributes:{color:1, width:1, art:0},
  fillattributes:{fillType:1, color:1, pattern:0xFFFF},
  stringvariable:{value:''},
  numbervariable:{value:0},
};
document.getElementById('addSel').onchange=e=>{
  const tag=e.target.value; if(!tag) return; e.target.value='';
  if(!POOL.size) return log('Előbb tölts be egy poolt, vagy hozz létre workingsetet!');
  snapshot();
  const id=freeId();
  const o=Object.assign({id, type:TAG[tag], name:tag, children:[]}, JSON.parse(JSON.stringify(DEFAULTS[tag]||{})));
  if([11,8,22].includes(o.type)) o.values={[activeLang]:''};
  POOL.set(id,o); ORDER.push(id);
  // elhelyezés: kijelölt konténerbe / softkeymaszkba / aktív maszkbA
  const sel=selectedId!==null?POOL.get(selectedId):null;
  let hova=null;
  const kulonallo=['datamask','softkeymask','workingset'].includes(tag);
  if(!kulonallo&&sel&&canHaveChildren(sel)&&!INLINE.has(tag)&&['key','button'].includes(tag)===false){
    hova=sel; // kijelölt konténer/lista/keygroup/datamask/softkeymaszk
  } else if(['key','button'].includes(tag)){
    const ws0=[...POOL.values()].find(x=>x.type===0);
    const dm=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws0&&ws0.activeMask);
    const skm=(dm&&POOL.get(dm.softkeyMask))||[...POOL.values()].find(x=>x.type===4);
    if(skm) hova=skm;
  } else if(!INLINE.has(tag)&&!kulonallo){
    const ws0=[...POOL.values()].find(x=>x.type===0);
    hova=POOL.get(+document.getElementById('maskSel').value)||POOL.get(ws0&&ws0.activeMask);
  }
  if(kulonallo){ // maszkok: a fa gyokerebe + maszkvalaszto frissites
    log(`Új elem: #${id} ${tag} (önálló — a fa gyökerében)`); refreshMasks();
  }
  if(hova){
    const n=hova.children.length;
    hova.children.push({id, x:(hova.type===4||hova.type===5)?0:20+n*8, y:(hova.type===4||hova.type===5)?0:20+n*8});
    log(`Új elem: #${id} ${tag} → ${T[hova.type]} #${hova.id}`);
  } else if(!kulonallo) {
    log(`Új elem: #${id} ${tag} (önálló — Inline/különálló típus)`);
  }
  selectId(id);
};

/* ---------- ÁTMÉRETEZÉS ---------- */
const RESIZE_N=8;
canvas.onmousedown_orig = canvas.onmousedown;

/* ---------- XML IMPORT ---------- */
function loadXML(text,name){
  try{
    const doc=new DOMParser().parseFromString(text,'application/xml');
    if(doc.querySelector('parsererror')) throw new Error('XML hibás');
    const root=doc.querySelector('objectPool'); if(!root) throw new Error('Nincs <objectPool> gyökér');
    const lc=(root.getAttribute('langCode')||'en').trim();
    POOL=new Map(); ORDER=[]; selectedId=null;
    const wsId=freeId();
    POOL.set(wsId,{id:wsId,type:0,bg:0,selectable:1,activeMask:0xFFFF,children:[],languages:[...LANGS],name:'WS'});
    ORDER.push(wsId);
    let prevContainer=null;
    doc.querySelectorAll(':scope > *').forEach(el=>{
      const tag=el.tagName.toLowerCase(); if(!(tag in TAG)) return;
      const id=+el.getAttribute('id'); if(!id) return;
      const o={id, type:TAG[tag], children:[]};
      const A=(k)=>el.getAttribute(k);
      if(A('name'))o.name=A('name');
      if(A('w'))o.w=+A('w'); if(A('h'))o.h=+A('h');
      if(A('background'))o.bg=+A('background');
      if(A('color'))o.color=+A('color'); if(A('border'))o.border=+A('border');
      if(A('fontattributes'))o.fontAttr=+A('fontattributes');
      if(A('lineattributes'))o.lineAttr=+A('lineattributes');
      if(A('fillattributes'))o.fillAttr=+A('fillattributes');
      if(A('softkeymask'))o.softkeyMask=+A('softkeymask');
      if(A('keycode'))o.keyCode=+A('keycode');
      if(A('halign')||A('valign')) o.just=(JUST[A('halign')||'left']<<2)|(VALIGN[A('valign')||'top']);
      if(['outputnumber','inputnumber'].includes(tag)){ o.value=+A('value')||0; o.decimals=+A('decimals')||0; o.scale=parseFloat(A('scale'))||1; }
      if([11,8,22].includes(o.type)){
        o.values={};
        for(const l of LANGS){ const v=A('value_'+l); if(v!==null&&v!==undefined&&v!=='') o.values[l]=v; }
        if(!Object.keys(o.values).length) o.values={[lc]:A('value')||''};
        if(A('value')&&!Object.values(o.values).includes(A('value'))) o.values[lc]=A('value');
      }
      // gyerekek (child id x y)
      el.querySelectorAll(':scope > child').forEach(ch=>{
        o.children.push({id:+ch.getAttribute('id'), x:+ch.getAttribute('x')||0, y:+ch.getAttribute('y')||0});
      });
      if(o.type===16){ o.points=[]; el.querySelectorAll(':scope > point').forEach(p=>o.points.push([+p.getAttribute('x'),+p.getAttribute('y')])); }
      POOL.set(id,o); ORDER.push(id);
    });
    LANGS=[...new Set([lc,...LANGS])];
    activeLang=lc;
    log(`${name}: ${POOL.size-1} objektum XML-ből. Nyelv: ${lc}`);
    refreshAll();
  }catch(err){ log('HIBA (XML): '+err.message); }
}

/* ---------- XML export: child + point elemekkel ----------
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  if(e.key==='Delete')deleteSelected();
  else if(e.ctrlKey&&e.key==='z')undo();
  else if(e.ctrlKey&&e.key==='y')redo();
  else if(selectedId!==null&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    snapshot(); const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0, dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
    // nyíl mozgatás a szülői ref-en — egyszerűség: az aktív maszk gyerekén
    e.preventDefault(); log('Nyílmozgatás: jelöld meg húzással (a nyíl az aktív szülő ref-et igényli).');
  }
};

/* ---------- file I/O ---------- */
function loadIOP(buf,name){
  window._loadedName=name||''; window._loadedSize=buf.length;
  try{
    const res=parseIOP(buf); POOL=res.pool; ORDER=res.order; selectedId=null;
    const ws=[...POOL.values()].find(o=>o.type===0);
    if(ws&&ws.languages&&ws.languages.length)LANGS=ws.languages;
    activeLang=LANGS[0]||'hu';
    // a betoltott (egynyelvu) tartalmat az aktiv nyelvhez rendeljuk
    POOL.forEach(o=>{ if([8,11,22].includes(o.type)) o.values={[activeLang]: o.value||''}; });
    log(`${name}: ${POOL.size} objektum betöltve. Nyelvek: ${LANGS.join(', ')}`);
    refreshAll();
  }catch(err){ log(`HIBA: ${err.message}`); }
}
function download(bytes,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  a.download=name; a.click();
}
document.getElementById('btnExport').onclick=()=>{
  if(!POOL.size)return log('Nincs mit exportálni.');
  snapshot();
  const ws=[...POOL.values()].find(o=>o.type===0);
  const base=(ws&&ws.name?ws.name.replace(/\s+/g,'_'):'pool');
  if(LANGS.length<=1){ download(serializeIOP(POOL,ORDER,LANGS[0]),base+'.iop'); log('Export: '+base+'.iop'); }
  else LANGS.forEach(l=>{ download(serializeIOP(POOL,ORDER,l),`${base}_${l}.iop`); log(`Export: ${base}_${l}.iop`); });
};
const el_btnNew=document.getElementById('btnNew'); if(el_btnNew)el_btnNew.onclick=()=>{
  snapshot();
  POOL=new Map(); ORDER=[]; selectedId=null; nextId=1000;
  const ws=Object.assign({id:nextId++,type:0,bg:1,selectable:1,activeMask:0xFFFF,children:[],languages:[...LANGS],name:'WS'},{});
  const dm={id:nextId++,type:1,bg:0,softkeyMask:0xFFFF,children:[],name:'DataMask'};
  const skm={id:nextId++,type:4,bg:1,children:[],name:'SoftKeys'};
  ws.activeMask=dm.id; ws.children.push({id:dm.id,x:0,y:0}); dm.softkeyMask=skm.id;
  POOL.set(ws.id,ws); ORDER.push(ws.id);
  POOL.set(dm.id,dm); ORDER.push(dm.id);
  POOL.set(skm.id,skm); ORDER.push(skm.id);
  // fontattributes
  const fa={id:nextId++,type:23,color:1,size:4,fontType:0,style:0,children:[],name:'Font'};
  POOL.set(fa.id,fa); ORDER.push(fa.id);
  // 8 softkey
  for(let i=0;i<8;i++){ const k={id:nextId++,type:5,bg:1,keyCode:i+1,children:[],name:'Key'+(i+1)};
    POOL.set(k.id,k); ORDER.push(k.id); skm.children.push({id:k.id,x:0,y:0}); }
  log('Új pool sablon létrehozva (workingset + maszkok + 8 softkey + font).');
  refreshAll();
};

/* ---------- M5: PictureGraphic PNG import ---------- */
function importImageToPG(o, file, done){
  const img=new Image();
  img.onload=()=>{ try{
    snapshot();
    // a PNG sajat merete a szabalyzo — nem az objektum regi merete (az torzitana)
    const aw=img.width, ah=img.height;
    const c=document.createElement('canvas'); c.width=aw; c.height=ah;
    const cx=c.getContext('2d');
    cx.drawImage(img,0,0,aw,ah);
    const dat=cx.getImageData(0,0,aw,ah).data;
    // 8bpp: a legközelebbi szín a 256-os VT-palettáról (ISO 11783-6), átlátszóság + RLE
    const idxs=new Uint8Array(aw*ah); let transpIdx=0, hasTransp=false;
    for(let p=0;p<aw*ah;p++){
      const r=dat[p*4],g=dat[p*4+1],b=dat[p*4+2],a=dat[p*4+3];
      if(a<128){ hasTransp=true; idxs[p]=255; continue; } // átmenetileg 255 = jelölt
      let best=0,bd=1e9;
      for(let ci=0;ci<256;ci++){
        const c=colorRGB(ci);
        const dr=r-c[0],dg=g-c[1],db=b-c[2];
        const d=dr*dr*0.299+dg*dg*0.587+db*db*0.114;
        if(d<bd){bd=d;best=ci;}
      }
      idxs[p]=best;
    }
    if(hasTransp){
      // olyan palettaindexet keresünk, ami máshol nem szerepel
      const used=new Set(idxs);
      transpIdx=-1;
      for(let ci=0;ci<256;ci++) if(!used.has(ci)){transpIdx=ci;break;}
      if(transpIdx<0){ transpIdx=idxs[0]; }
      for(let p=0;p<aw*ah;p++) if(idxs[p]===255) idxs[p]=transpIdx;
    }
    // RLE (párok: hossz B + érték B), 8bpp
    const bytes=[];
    let p=0;
    while(p<idxs.length){
      const v=idxs[p]; let n=1;
      while(n<255&&p+n<idxs.length&&idxs[p+n]===v)n++;
      bytes.push(n,v); p+=n;
    }
    let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
    o.format=2; o.actualW=aw; o.actualH=ah; o.rawLen=bytes.length; o.raw=s;
    o.options=4|(hasTransp?1:0); o.transparency=hasTransp?transpIdx:(o.transparency??0);
    o.w=aw; o.h=ah;
    PICT_CACHE.clear();
    log(`Kép importálva: ${aw}x${ah}, ${bytes.length} RLE bájt (8bpp, ${hasTransp?'átlátszó, szín '+transpIdx:'nem átlátszó'}).`);
    render(); refreshProps(); drawCwin();
    if(done)done();
  }catch(err){ log('HIBA (kép): '+err.message); } };
  img.src=URL.createObjectURL(file);
}
const el_btnPng=document.getElementById('btnPng'); if(el_btnPng)el_btnPng.onclick=()=>{
  if(selectedId===null||!POOL.has(selectedId)) return log('Jelölj ki egy PictureGraphic objektumot!');
  const o=POOL.get(selectedId);
  if(o.type!==20) return log('A kijelölt objektum nem PictureGraphic (típus: '+T[o.type]+').');
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/png,image/jpeg,image/bmp';
  inp.onchange=e=>{ const f=e.target.files[0]; if(f) importImageToPG(o,f); };
  inp.click();
};
function pgPreview(o, targetCanvas){
  // A-variáns: egész számú nagyítás, pixelpontos (élsimítás nélkül)
  const maxW=180, maxH=140;
  const aw=o.actualW||o.w||32, ah=o.actualH||o.h||32;
  let sc=Math.min(maxW/aw, maxH/ah, 8);
  sc=Math.max(1,Math.floor(sc)); // csak egész lépték — nincs szabálytalan pixelátméretezés
  targetCanvas.width=aw*sc; targetCanvas.height=ah*sc;
  const cx=targetCanvas.getContext('2d');
  cx.fillStyle='#666'; cx.fillRect(0,0,targetCanvas.width,targetCanvas.height);
  const dec=decodePicture(o);
  if(!dec||!dec.w) return;
  const img=cx.createImageData(dec.w,dec.h);
  const transparent=(o.options&1)!==0;
  for(let i=0;i<dec.w*dec.h;i++){
    const col=dec.px[i], d=img.data;
    if(transparent&&col===o.transparency){ continue; }
    const rgb=colorRGB(col);
    d[i*4]=rgb[0]; d[i*4+1]=rgb[1]; d[i*4+2]=rgb[2]; d[i*4+3]=255;
  }
  const t=document.createElement('canvas'); t.width=dec.w; t.height=dec.h;
  t.getContext('2d').putImageData(img,0,0);
  cx.imageSmoothingEnabled=false;
  cx.drawImage(t,0,0,targetCanvas.width,targetCanvas.height);
}

function applyZoom(){
  const z=parseFloat(document.getElementById('zoomSel').value)||1;
  canvas.style.width=Math.round(canvas.width*z)+'px';
  canvas.style.height=Math.round(canvas.height*z)+'px';
  canvas.style.imageRendering='auto';
}
const el_zoomSel=document.getElementById('zoomSel'); if(el_zoomSel)el_zoomSel.onchange=applyZoom;
document.getElementById('vtSize').onchange=e=>{
  const [w,h]=e.target.value.split('x').map(Number);
  canvas.width=w; canvas.height=h; snapshot(); render(); applyZoom();
};
const el_btnInfo=document.getElementById('btnInfo'); if(el_btnInfo)el_btnInfo.onclick=()=>{
  const ws=[...POOL.values()].find(x=>x.type===0);
  const tipusok={};
  for(const o of POOL.values()) tipusok[T[o.type]]=(tipusok[T[o.type]]||0)+1;
  const anyag=[`<div class="sec">Pool általános infó</div>`];
  anyag.push(`<div><b>Objektumok:</b> ${POOL.size}</div>`);
  anyag.push(`<div><b>Nyelvek:</b> ${(ws&&ws.languages||[]).join(' ')||'—'}</div>`);
  if(ws){
    anyag.push(`<div><b>WorkingSet:</b> #${ws.id} — háttér ${ws.bg}, aktív maszk #${ws.activeMask}, kijelölhető: ${ws.selectable?'igen':'nem'}</div>`);
  }
  const dms=[...POOL.values()].filter(x=>x.type===1);
  anyag.push(`<div><b>Adatmaszkok (képernyők):</b> ${dms.length}${dms.length?' — '+dms.map(m=>'#'+m.id).join(', '):''}</div>`);
  const skms=[...POOL.values()].filter(x=>x.type===4);
  anyag.push(`<div><b>SoftKeyMaszkok:</b> ${skms.length}</div>`);
  anyag.push(`<div><b>Típusok:</b></div><div style="font-size:11px;color:#aaa">${Object.entries(tipusok).map(([k,v])=>k+': '+v).join(', ')}</div>`);
  if(window._loadedName) anyag.push(`<div><b>Forrás fájl:</b> ${window._loadedName}</div>`);
  if(window._loadedSize) anyag.push(`<div><b>Fájl méret:</b> ${window._loadedSize} bájt</div>`);
  anyag.push(`<div style="color:#777;margin-top:6px">Megjegyzés: név/gyártó/verzió nem része a .iop szabványnak — az ECU J1939 NAME mezőjében és (nem-szabvány) .iopx címkékben él.</div>`);
  const body=document.getElementById('propBody');
  body.innerHTML=anyag.join('')+'<button id="p_back" style="width:100%;margin-top:8px">← Vissza a tulajdonságokhoz</button>';
  document.getElementById('p_back').onclick=()=>refreshProps();
};
const el_btnMerge=document.getElementById('btnMerge'); if(el_btnMerge)el_btnMerge.onclick=()=>{
  if(!POOL.size) return log('Előbb tölts be egy .iop-t!');
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.iop';
  inp.onchange=e=>{ const f=e.target.files[0]; if(!f)return;
    const r=new FileReader();
    r.onload=()=>{ try{
      const res=parseIOP(new Uint8Array(r.result));
      let n=0;
      res.pool.forEach((o,id)=>{ if([8,11,22].includes(o.type)){
        const t=POOL.get(id);
        if(t&&t.type===o.type){ if(!t.values)t.values={}; t.values[activeLang]=strValue(o)||res.pool.get(id).value||''; n++; }
      }});
      log(`Nyelv-merge (${f.name} → ${activeLang}): ${n} szöveg frissítve.`);
      refreshAll();
    }catch(err){ log('HIBA: '+err.message); } };
    r.readAsArrayBuffer(f);
  };
  inp.click();
};
document.getElementById('btnExportXml').onclick=()=>{
  const ws=[...POOL.values()].find(o=>o.type===0);
  let x=`<objectPool version="3" langCode="${(LANGS[0]||'en').trim()}">\n`;
  for(const id of ORDER){
    const o=POOL.get(id); if(o.type===0)continue;
    let a=`  <${T[o.type]} id="${id}"`;
    if(o.name)a+=` name="${o.name}"`;
    ['w','h'].forEach(k=>{if(o[k]!==undefined)a+=` ${k}="${o[k]}"`;});
    if(o.bg!==undefined)a+=` background="${o.bg}"`;
    if(o.color!==undefined)a+=` color="${o.color}"`;
    if(o.border!==undefined)a+=` border="${o.border}"`;
    if(o.fontAttr!==undefined)a+=` fontattributes="${o.fontAttr}"`;
    if(o.lineAttr!==undefined)a+=` lineattributes="${o.lineAttr}"`;
    if(o.fillAttr!==undefined)a+=` fillattributes="${o.fillAttr}"`;
    if(o.softkeyMask!==undefined)a+=` softkeymask="${o.softkeyMask}"`;
    if(o.keyCode!==undefined)a+=` keycode="${o.keyCode}"`;
    if(o.just!==undefined)a+=` halign="${['left','center','right'][(o.just>>2)&3]}" valign="${['top','middle','bottom'][o.just&3]}"`;
    if(o.type===12||o.type===9){a+=` value="${o.value??0}" decimals="${o.decimals??0}" scale="${o.scale??1}"`;}
    if([11,8,22].includes(o.type)){
      const vals=o.values||{[activeLang]:o.value||''};
      for(const[l,v]of Object.entries(vals))a+=` value_${l}="${v.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`;
    }
    const o2=POOL.get(id);
    const kids=(o2&&o2.children)||[];
    const hasKids=kids.length||(o2&&o2.type===16&&o2.points&&o2.points.length);
    if(hasKids){
      let inner='';
      if(o2.type===16&&o2.points) for(const p of o2.points) inner+=`<point x="${p[0]}" y="${p[1]}"/>`;
      for(const c of kids) inner+=`<child id="${c.id}" x="${c.x||0}" y="${c.y||0}"/>`;
      x+=a+'>'+inner+'</'+T[o.type]+'>\n';
    } else x+=a+'/>\n';
  }
  x+='</objectPool>\n';
  download(new TextEncoder().encode(x), 'pool.xml');
  log('XML mentve.');
};
const drop=document.getElementById('drop');
drop.onclick=()=>document.getElementById('file').click();
document.getElementById('file').onchange=e=>{const f=e.target.files[0]; if(f)loadAny(f);};
drop.ondragover=e=>{e.preventDefault();drop.classList.add('hover');};
drop.ondragleave=()=>drop.classList.remove('hover');
drop.ondrop=e=>{e.preventDefault();drop.classList.remove('hover');if(e.dataTransfer.files[0])loadAny(e.dataTransfer.files[0]);};
function loadAny(f){
  const r=new FileReader();
  r.onload=()=>{
    const bytes=new Uint8Array(r.result);
    if(f.name.endsWith('.xml')) loadXML(new TextDecoder().decode(bytes),f.name);
    else loadIOP(bytes,f.name);
  };
  r.readAsArrayBuffer(f);
}
log('AgISO Pool Editor kész. Húzz be egy .iop fájlt.');

window.__genXML=()=>{
  const ws=[...POOL.values()].find(o=>o.type===0);
  let x=`<objectPool version="3" langCode="${(LANGS[0]||'en').trim()}">\n`;
  for(const id of ORDER){
    const o=POOL.get(id); if(o.type===0)continue;
    let a=`  <${T[o.type]} id="${id}"`;
    if(o.name)a+=` name="${o.name}"`;
    ['w','h'].forEach(k=>{if(o[k]!==undefined)a+=` ${k}="${o[k]}"`;});
    if(o.bg!==undefined)a+=` background="${o.bg}"`;
    if(o.color!==undefined)a+=` color="${o.color}"`;
    if(o.border!==undefined)a+=` border="${o.border}"`;
    if(o.fontAttr!==undefined)a+=` fontattributes="${o.fontAttr}"`;
    if(o.lineAttr!==undefined)a+=` lineattributes="${o.lineAttr}"`;
    if(o.fillAttr!==undefined)a+=` fillattributes="${o.fillAttr}"`;
    if(o.softkeyMask!==undefined)a+=` softkeymask="${o.softkeyMask}"`;
    if(o.keyCode!==undefined)a+=` keycode="${o.keyCode}"`;
    if(o.just!==undefined)a+=` halign="${['left','center','right'][(o.just>>2)&3]}" valign="${['top','middle','bottom'][o.just&3]}"`;
    if(o.type===12||o.type===9){a+=` value="${o.value??0}" decimals="${o.decimals??0}" scale="${o.scale??1}"`;}
    if([11,8,22].includes(o.type)){
      const vals=o.values||{[activeLang]:o.value||''};
      for(const[l,v]of Object.entries(vals))a+=` value_${l}="${v.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"`;
    }
    const o2=POOL.get(id);
    const kids=(o2&&o2.children)||[];
    const hasKids=kids.length||(o2&&o2.type===16&&o2.points&&o2.points.length);
    if(hasKids){
      let inner='';
      if(o2.type===16&&o2.points) for(const p of o2.points) inner+=`<point x="${p[0]}" y="${p[1]}"/>`;
      for(const c of kids) inner+=`<child id="${c.id}" x="${c.x||0}" y="${c.y||0}"/>`;
      x+=a+'>'+inner+'</'+T[o.type]+'>\n';
    } else x+=a+'/>\n';
  }
  x+='</objectPool>\n';
  
  log('XML mentve.');
return x;
};

if(document.getElementById('coreVer'))document.getElementById('coreVer').textContent='core: '+CORE_VERSION;
