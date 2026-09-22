'use strict';
// Original, locally generated assets and imported images share the same persistent library.
const assetDB = new Promise((resolve, reject) => {
    const request = indexedDB.open('formcross-library', 2);
    request.onupgradeneeded = () => { for (const store of ['assets','workspace']) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, {keyPath:'id'}); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});
async function assetStore(action, value) {
    const db = await assetDB;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('assets', action === 'getAll' ? 'readonly' : 'readwrite');
        const request = tx.objectStore('assets')[action](value);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
}
let importedAssets = [], builtinAssets = [], assetFilter = '', importing = false;
function imageInfo(url) { return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('画像を読み込めませんでした'));image.src=url;}); }
async function addImageAsset(asset) {
    const image=await imageInfo(asset.url);
    const el=document.createElement('div'); el.className='element image-asset';el.dataset.type='image';el.dataset.name=asset.name;
    const width=Math.min(700, canvas.offsetWidth*.65, image.naturalWidth);
    el.style.width=width+'px';el.style.left=((canvas.offsetWidth-width)/2)+'px';el.style.top='350px';
    const img=document.createElement('img');img.src=asset.url;img.alt='';img.draggable=false;
    const handle=document.createElement('div');handle.className='resize-handle';el.append(img,handle);
    elementsContainer.append(el);makeDraggableAndSelectable(el,'image');selectElement(el,'image');commit();
}
async function useAssetBackground(asset) {
    await imageInfo(asset.url);
    canvas.style.background=`url("${asset.url}") center center / cover no-repeat`;
    $('background-fit').value='cover';$('bg-overlay').checked=false;toggleOverlay();commit();toast('背景を適用しました');
}
async function importAssets(files, asBackground=false) {
    if(importing)return;importing=true;
    let added=0; const failures=[];
    try {
        for(const file of [...files].slice(0,30)) {
            try {
                const url=await readImage(file);
                const asset={id:crypto.randomUUID(),name:file.name,url};
                await assetStore('put',asset);importedAssets.unshift(asset);added++;
                if(asBackground && added===1)await useAssetBackground(asset);
            }catch(error){failures.push(`${file.name}: ${error.message}`);}
        }
        renderAssetLibrary();
        toast(`${added}件をライブラリに保存しました${failures.length?' ／ '+failures.join('、'):''}${files.length>30?' ／ 一度に30枚まで取り込めます':''}`);
    } finally { importing=false; }
}
function renderAssetLibrary() {
    const grid=$('imported-assets');grid.replaceChildren();
    const assets=importedAssets.filter(a=>a.name.toLowerCase().includes(assetFilter.toLowerCase()));
    $('library-count').textContent=`マイ素材 · ${importedAssets.length}枚`;
    if(!assets.length){const empty=document.createElement('p');empty.className='asset-help';empty.textContent=importedAssets.length?'一致する素材がありません':'画像を読み込むとここに表示されます。アプリを閉じても残ります。';grid.append(empty);}
    for(const asset of assets) {
        const card=document.createElement('div');card.className='library-card';
        const image=document.createElement('img');image.src=asset.url;image.alt=asset.name;image.loading='lazy';card.append(image);
        const name=document.createElement('span');name.textContent=asset.name;name.title=asset.name;card.append(name);
        const actions=document.createElement('div');actions.className='library-actions';
        for(const [label,action] of [['配置',()=>addImageAsset(asset)],['背景',()=>useAssetBackground(asset)],['削除',async()=>{await assetStore('delete',asset.id);importedAssets=importedAssets.filter(a=>a.id!==asset.id);renderAssetLibrary();toast('ライブラリから削除しました。配置済みの画像は残ります');}]]) {
            const button=document.createElement('button');button.className='studio-button';button.textContent=label;button.setAttribute('aria-label',`${asset.name}を${label}`);button.onclick=()=>Promise.resolve(action()).catch(error=>toast(error.message));actions.append(button);
        }
        card.append(actions);grid.append(card);
    }
}
const library=document.createElement('section');library.className='panel-section';library.innerHTML=`<div class="panel-title" id="library-count">マイ素材</div><button class="studio-button" id="import-assets-button">＋ 画像素材をインポート</button><input id="asset-files" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden><p class="asset-help">PNG・JPEG・WebP / 1枚12MBまで<br>この欄へ画像をドラッグ＆ドロップできます。<br>透過PNGは透過したまま配置できます。</p><input id="asset-search" class="inspector-input" placeholder="ファイル名で検索" aria-label="マイ素材を検索"><div class="library-grid" id="imported-assets"></div>`;
$('tab-materials').prepend(library);
$('import-assets-button').onclick=()=>$('asset-files').click();
$('asset-files').onchange=e=>{const files=[...e.target.files];e.target.value='';importAssets(files).catch(error=>toast(error.message));};
$('asset-search').oninput=e=>{assetFilter=e.target.value;renderAssetLibrary();};
function dropZone(element, background) {
    element.addEventListener('dragover',e=>{e.preventDefault();element.classList.add('drop-active');});
    element.addEventListener('dragleave',e=>{if(!element.contains(e.relatedTarget))element.classList.remove('drop-active');});
    element.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();element.classList.remove('drop-active');importAssets(e.dataTransfer.files,background).catch(error=>toast(error.message));});
}
dropZone(library,false);
// Prevent dropped files from navigating away from the editor.
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>e.preventDefault());
const bgImporter=document.createElement('section');bgImporter.className='panel-section';bgImporter.innerHTML=`<div class="panel-title">自分の画像を背景に</div><button class="studio-button" onclick="document.getElementById('background-file').click()">＋ 背景画像をインポート</button><input hidden id="background-file" type="file" accept="image/png,image/jpeg,image/webp"><p class="asset-help">ここに画像をドロップしても設定できます。<br>読み込んだ背景は「マイ素材」にも保存されます。</p><label class="asset-help">画像の表示方法<select id="background-fit" class="inspector-input"><option value="cover">画面いっぱい（はみ出しを切り取り）</option><option value="contain">画像全体を表示</option></select></label><button class="studio-button" id="clear-image-background">画像を外してグラデーションに戻す</button>`;
$('tab-design').prepend(bgImporter);dropZone(bgImporter,true);
$('background-file').onchange=e=>{const files=[...e.target.files];e.target.value='';importAssets(files,true).catch(error=>toast(error.message));};
$('background-fit').onchange=e=>{if(canvas.style.backgroundImage.includes('url(')){canvas.style.backgroundSize=e.target.value;canvas.style.backgroundColor=$('bg-c1').value;commit();}};
$('clear-image-background').onclick=()=>{customColor();commit();};
const imagePanel=document.createElement('section');imagePanel.className='panel-section prop-section';imagePanel.id='prop-image';imagePanel.innerHTML=`<div class="panel-title">画像素材を編集</div><label>幅（px）<input class="inspector-input" id="image-width" type="number" min="20" max="8000"></label><p class="asset-help">縦横比を保って拡大・縮小します。右下のハンドルでも変更できます。</p><label>不透明度<input id="image-opacity" type="range" min="0" max="100" value="100"></label><label>回転<input id="image-rotation" type="range" min="-180" max="180" value="0"></label><button class="studio-button" onclick="deleteSelected();commit()">画像を削除</button>`;
document.querySelector('.sidebar-right').append(imagePanel);
const selectBeforeAssets=selectElement;
selectElement=function(el,type){selectBeforeAssets(el,type);if(type==='image'){$('image-width').value=Math.round(parseFloat(el.style.width));$('image-opacity').value=Math.round(Number(el.style.opacity||1)*100);$('image-rotation').value=Number((el.style.transform.match(/rotate\((-?[\d.]+)deg\)/)||[])[1]||0);}};
$('image-width').oninput=e=>{if(selectedElement?.dataset.type==='image' && e.target.value!==''){selectedElement.style.width=Math.max(20,Math.min(8000,Number(e.target.value)))+'px';}};
$('image-opacity').oninput=e=>{if(selectedElement?.dataset.type==='image')selectedElement.style.opacity=Number(e.target.value)/100;};
$('image-rotation').oninput=e=>{if(selectedElement?.dataset.type==='image')selectedElement.style.transform=`rotate(${Number(e.target.value)}deg)`;};
// Procedural artwork is bundled in code: no remote downloads or image rights dependencies.
function createBuiltinAssets() {
    for(let i=0;i<24;i++){
        const c=document.createElement('canvas');c.width=c.height=640;const ctx=c.getContext('2d');const colors=palettes[i%12].slice(1);
        if(i<12){ctx.fillStyle=colors[1];if(i%4===0){ctx.beginPath();ctx.arc(320,320,260,0,Math.PI*2);ctx.fill();}else if(i%4===1){ctx.beginPath();ctx.roundRect(60,120,520,400,100);ctx.fill();}else if(i%4===2){ctx.beginPath();for(let n=0;n<16;n++){const r=n%2?155:290;const a=n*Math.PI/8-Math.PI/2;ctx.lineTo(320+Math.cos(a)*r,320+Math.sin(a)*r);}ctx.closePath();ctx.fill();}else{ctx.lineWidth=85;ctx.strokeStyle=colors[1];ctx.beginPath();ctx.arc(320,320,220,0,2*Math.PI);ctx.stroke();}}
        else{const gradient=ctx.createLinearGradient(0,0,640,640);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);ctx.fillStyle=gradient;ctx.fillRect(0,0,640,640);ctx.fillStyle='#ffffff40';ctx.strokeStyle='#ffffff40';ctx.lineWidth=2;for(let x=0;x<800;x+=50){if(i%3===0){for(let y=25;y<640;y+=50){ctx.beginPath();ctx.arc(x+25,y,4,0,7);ctx.fill();}}else if(i%3===1){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x-640,640);ctx.stroke();}else{ctx.beginPath();ctx.arc(320,320,x,0,7);ctx.stroke();}}}
        builtinAssets.push({id:'builtin-'+i,name:i<12?`${palettes[i%12][0]}・${['サークル','角丸カード','スター','リング'][i%4]}`:`${palettes[i%12][0]}・${['ドット','ストライプ','波紋'][i%3]}`,url:c.toDataURL('image/png')});
    }
    const section=document.createElement('section');section.className='panel-section';section.innerHTML='<div class="panel-title">図形12種・パターン背景12種</div><div class="library-grid"></div>';
    builtinAssets.forEach((asset,i)=>{const button=document.createElement('button');button.className='builtin-card';const img=document.createElement('img');img.src=asset.url;img.alt='';button.append(img,document.createTextNode(asset.name));button.onclick=()=>{(i<12?addImageAsset(asset):useAssetBackground(asset)).catch(error=>toast(error.message));};section.lastElementChild.append(button);});$('tab-materials').append(section);
}
createBuiltinAssets();
const restoreBeforeAssets=restore;
restore=function(data){restoreBeforeAssets(data);$('background-fit').value=canvas.style.backgroundSize==='contain'?'contain':'cover';};
const libraryReady=assetStore('getAll').then(assets=>{importedAssets=assets.reverse();renderAssetLibrary();}).catch(()=>toast('素材ライブラリを開けませんでした。アプリを再起動してください。'));
