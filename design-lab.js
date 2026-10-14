'use strict';
// Design recipes use the existing image/text model so projects remain portable.
const designPalettes = [
 ['インク','#101827','#26364e','#ffffff','#7dd3fc'],['ミルク','#faf7f0','#e9dfcf','#252525','#b45309'],
 ['ラベンダー','#ede9fe','#c4b5fd','#312e81','#7c3aed'],['ミント','#e7faf2','#a7e8ce','#064e3b','#059669'],
 ['サンセット','#ffedd5','#fda4af','#7c2d12','#e11d48'],['コバルト','#172554','#2563eb','#ffffff','#fde047'],
 ['ローズ','#fff1f2','#fecdd3','#881337','#be123c'],['フォレスト','#052e24','#166534','#ffffff','#bef264'],
 ['モノクロ','#ffffff','#e5e7eb','#111827','#4b5563'],['ネオン','#09090b','#27203d','#ffffff','#c084fc'],
 ['オーシャン','#083344','#0e7490','#ffffff','#67e8f9'],['テラコッタ','#f5e6d3','#d6ad8b','#431407','#c2410c']
];
const designLayouts=['ヒーロー','左右分割','エディトリアル','ビッグナンバー','機能カード','引用・レビュー','ステップガイド','比較','ミニマル','ポスター','ダブル端末','横長バナー'];
function designButton(label, action){const button=document.createElement('button');button.type='button';button.className='studio-button';button.textContent=label;button.onclick=action;return button;}
function designSection(title,parent){const section=document.createElement('section');section.className='panel-section';const heading=document.createElement('h3');heading.className='panel-title';heading.textContent=title;section.append(heading);parent.prepend(section);return section;}
function currentDesignPalette(){return designPalettes[Number($('design-palette').value)||0];}
function paintDesignBackground(kind){
 if(busy)return;const [,a,b]=currentDesignPalette();commit();
 const layer={gradient:`linear-gradient(135deg, ${a}, ${b})`,solid:a,
  glow:`radial-gradient(ellipse at 20% 15%, ${b}, transparent 65%), linear-gradient(135deg, ${a}, ${a})`,
  stripes:`repeating-linear-gradient(135deg, transparent 0px, transparent 80px, ${b} 80px, ${b} 84px), linear-gradient(135deg, ${a}, ${a})`,
  grid:`repeating-linear-gradient(0deg, transparent 0px, transparent 99px, ${b} 99px, ${b} 101px), repeating-linear-gradient(90deg, ${a} 0px, ${a} 99px, ${b} 99px, ${b} 101px)`};
 canvas.style.background=layer[kind];$('bg-c1').value=a;$('bg-c2').value=b;$('bg-overlay').checked=false;toggleOverlay();commit();
}
function designText(ja,en,x,y,size,width,color,align='left'){
 addTextObj(escapeHTML(ja).replace(/\n/g,'<br>'),escapeHTML(en).replace(/\n/g,'<br>'),x,y,size,color,align,width,'none',"'Noto Sans JP', sans-serif",'normal');
 return elementsContainer.lastElementChild;
}
function designCard(x,y,w,h,color,radius=40){
 const el=document.createElement('div');el.className='element image-asset';el.dataset.type='image';el.dataset.name='カラーカード';
 const buffer=document.createElement('canvas');buffer.width=64;buffer.height=64;const ctx=buffer.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,64,64);
 const img=document.createElement('img');img.src=buffer.toDataURL();img.style.cssText=`display:block;width:100%;height:100%;border-radius:${radius}px`;img.draggable=false;
 el.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${radius}px;z-index:2;`;
 const handle=document.createElement('div');handle.className='resize-handle';el.append(img,handle);elementsContainer.append(el);makeDraggableAndSelectable(el,'image');return el;
}
function applyDesignLayout(index){
 if(busy||!workspaceReady)return;
 if(pages.length>=MAX_PAGES){toast('ページ数の上限です。不要なページを削除してください');return;}
 commit();addPage();const [,a,b,ink,accent]=currentDesignPalette();
 if(index===11)updateCanvasSize('iphone-landscape');
 const w=canvas.offsetWidth,h=canvas.offsetHeight,m=w*.08,unit=Math.min(w,h),headline=unit*.075;
 canvas.style.background=`linear-gradient(135deg, ${a}, ${b})`;$('bg-c1').value=a;$('bg-c2').value=b;$('bg-overlay').checked=false;toggleOverlay();
 const text=(ja,en,x,y,size,width,color=ink)=>designText(ja,en,x,y,size,width,color);
 const phone=(x,y,scale)=>addDeviceObj('iphone-black',x,y,0,0,scale);
 const label=(ja,en,y)=>text(ja,en,m,y,unit*.025,w*.84,accent);
 label('YOUR APP / 新しい体験','YOUR APP / A NEW EXPERIENCE',h*.045);
 switch(index){
 case 0:text('毎日を、もっと自由に。','Make every day your own.',m,h*.12,headline,w*.84);text('あなたのための、新しいスタンダード。','A new standard, built for you.',m,h*.25,headline*.4,w*.84);phone(w*.19,h*.38,w*.001);break;
 case 1:designCard(w*.54,h*.1,w*.5,h*.9,accent);text('好きなことに、\n集中しよう。','Focus on\nwhat you love.',m,h*.18,headline,w*.45);phone(w*.57,h*.38,w*.0007);break;
 case 2:text('日常を\nデザインする。','Design your\neveryday.',m,h*.12,headline*1.45,w*.84);designCard(m,h*.49,w*.84,h*.003,accent,0);text('01 — シンプルな操作\n02 — 直感的な体験\n03 — 自分らしい使い方','01 — Simple controls\n02 — Intuitive experience\n03 — Make it your own',m,h*.57,headline*.5,w*.84);break;
 case 3:text('01','01',m,h*.1,unit*.37,w*.84,accent);text('ひとつ先の\n体験へ。','Take the\nnext step.',m,h*.39,headline*1.2,w*.84);label('ここから、新しい毎日が始まる。','Your next chapter starts here.',h*.82);break;
 case 4:text('必要な機能を、ひとつに。','Everything in one place.',m,h*.12,headline,w*.84);for(let i=0;i<3;i++){designCard(m,h*(.33+i*.19),w*.84,h*.16,b);text(['かんたん操作','記録をひと目で','自由にカスタマイズ'][i],['Easy to use','See your progress','Make it yours'][i],m*1.4,h*(.36+i*.19),headline*.55,w*.7);}break;
 case 5:text('“','“',m,h*.12,unit*.3,w*.8,accent);text('毎日使いたくなる。\nそんなアプリを。','An app you’ll want\nto use every day.',m,h*.32,headline,w*.84);label('ユーザーの声をここに入力','Add a real user’s review here',h*.68);break;
 case 6:text('はじめるのは、簡単。','Getting started is easy.',m,h*.12,headline,w*.84);for(let i=0;i<3;i++){text('0'+(i+1),'0'+(i+1),m,h*(.34+i*.2),headline, w*.2,accent);text(['選ぶ','設定する','使ってみる'][i],['Choose','Customize','Enjoy'][i],w*.32,h*(.35+i*.2),headline*.65,w*.6);}break;
 case 7:text('違いを、実感する。','See the difference.',m,h*.12,headline,w*.84);for(let i=0;i<2;i++){designCard(m+i*w*.44,h*.33,w*.4,h*.5,i?accent:b);text(i?'AFTER':'BEFORE',i?'AFTER':'BEFORE',m*1.2+i*w*.44,h*.37,headline*.45,w*.36,i?a:ink);}break;
 case 8:text('余白から、\n生まれる体験。','Room for\nsomething better.',m,h*.35,headline,w*.84);label('必要なものだけを、美しく。','Only what matters. Beautifully.',h*.75);break;
 case 9:designCard(w*.45,h*.23,w*.7,w*.7,accent,w);text('もっと、\nあなたらしく。','More you.\nMore possibilities.',m,h*.13,headline*1.25,w*.84);text('自由な発想を、ここから。','Let your ideas take shape.',m,h*.77,headline*.5,w*.84);break;
 case 10:text('つながる体験。','Better together.',m,h*.12,headline,w*.84);phone(m,h*.34,w*.00072);phone(w*.51,h*.46,w*.00072);break;
 case 11:text('大きく広がる、\n新しい可能性。','More room for\nnew possibilities.',m,h*.25,headline*1.3,w*.52);phone(w*.68,h*.12,h*.0008);break;
 }
 pages[activePage].name=designLayouts[index]+' / '+currentDesignPalette()[0];clearSelection();commit();resetZoom();toast('新しいページにデザインを作成しました。文章・色・端末は編集できます');
}
const designPanel=designSection('デザインスタジオ · 12レイアウト × 12配色',$('tab-templates'));
const paletteSelect=document.createElement('select');paletteSelect.id='design-palette';paletteSelect.className='inspector-input';paletteSelect.setAttribute('aria-label','デザインの配色');
designPalettes.forEach((p,i)=>{const option=document.createElement('option');option.value=i;option.textContent=p[0];paletteSelect.append(option);});designPanel.append(paletteSelect);
const designGrid=document.createElement('div');designGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px';designPanel.append(designGrid);
designLayouts.forEach((name,i)=>designGrid.append(designButton(name,()=>applyDesignLayout(i))));
const designHint=document.createElement('p');designHint.className='asset-help';designHint.textContent='配色を選び、レイアウトを押すと新しいページを作成します。';designPanel.append(designHint);
const patternPanel=designSection('背景アレンジ',$('tab-design'));
const paletteHint=document.createElement('p');paletteHint.className='asset-help';paletteHint.textContent='テンプレートの「デザインスタジオ」で選んだ配色を使用します。';patternPanel.append(paletteHint);
for(const [key,label] of [['gradient','グラデーション'],['solid','単色'],['glow','光彩'],['stripes','ストライプ'],['grid','グリッド']])patternPanel.append(designButton(label,()=>paintDesignBackground(key)));
const shapePanel=designSection('編集できるカード・ラベル',$('tab-materials'));
for(const [name,radius,ratio] of [['カード',40,1.4],['丸',1000,1],['ピル',1000,3],['スクエア',0,1],['ライン',0,12]])shapePanel.append(designButton(name,()=>{if(busy)return;commit();const w=canvas.offsetWidth*.5;const el=designCard(canvas.offsetWidth*.25,canvas.offsetHeight*.35,w,w/ratio,currentDesignPalette()[4],radius);el.dataset.name=name;selectElement(el,'image');commit();}));
for(const label of ['NEW','UPDATE','PRO','01','02','03','ポイント','おすすめ'])shapePanel.append(designButton(label,()=>{if(busy)return;commit();addBadgeObj(label,label,'dark',canvas.offsetWidth*.1,canvas.offsetHeight*.2);selectElement(elementsContainer.lastElementChild,'badge');commit();}));
const geometryPanel=designSection('精密調整 · 選択中の要素',$('prop-global'));
const geometryFields={};
for(const [key,label] of [['left','横位置 px'],['top','縦位置 px'],['width','幅 px'],['opacity','透明度 %']]){
 const row=document.createElement('label');row.textContent=label;row.style.display='block';const input=document.createElement('input');input.type='number';input.className='inspector-input';input.setAttribute('aria-label',label);if(key==='opacity'){input.min=0;input.max=100;}else if(key==='width')input.min=1;
 input.onchange=()=>{if(busy||!selectedElement||selectedElement.dataset.locked==='true')return;const value=Number(input.value);if(!Number.isFinite(value)||input.value==='')return;commit();selectedElement.style[key]=key==='opacity'?String(Math.max(0,Math.min(100,value))/100):(key==='width'?Math.max(1,value):value)+'px';commit();};row.append(input);geometryPanel.append(row);geometryFields[key]=input;
}
const selectBeforeDesign=selectElement;
selectElement=function(el,type){selectBeforeDesign(el,type);for(const [key,input] of Object.entries(geometryFields))input.value=key==='opacity'?Math.round((Number(el.style.opacity||1))*100):Math.round(parseFloat(el.style[key])||(key==='width'?el.offsetWidth:0));};
