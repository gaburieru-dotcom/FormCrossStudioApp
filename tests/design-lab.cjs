const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'design-lab-test-')));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{sandbox:true}});
 const timeout=setTimeout(()=>app.exit(1),90000);
 try{
  await win.loadFile(path.join(__dirname,'../index.html'));
  console.log(await win.webContents.executeJavaScript(`(async()=>{
   await workspaceInitialized;const assert=(v,m)=>{if(!v)throw Error(m)};
   const original=snapshot().elementsHtml;
   for(let i=0;i<designLayouts.length;i++){
    $('design-palette').value=String(i);applyDesignLayout(i);
    assert(pages.length===i+2,'new page '+i);
    const saved=snapshot();restore(saved);assert(snapshot().elementsHtml.includes('h1'),'text restore '+i);
    assert(canvas.offsetWidth>0,'canvas '+i);validateProject(snapshot());
   }
   assert(pages[0].state.elementsHtml===original,'original preserved');
   const before=JSON.stringify(captureWorkspace());undo();undo(1);assert(JSON.stringify(captureWorkspace())===before,'undo redo');
   const card=designCard(30,40,300,200,'#ff0000',30);selectElement(card,'image');commit();
   geometryFields.opacity.value='50';geometryFields.opacity.onchange();assert(card.style.opacity==='0.5','opacity');
   restore(snapshot());assert(elementsContainer.lastElementChild.style.opacity==='0.5','opacity restored');
   for(const kind of ['gradient','solid','glow','stripes','grid']){paintDesignBackground(kind);const s=snapshot(),image=canvas.style.backgroundImage,color=canvas.style.backgroundColor;restore(s);assert(canvas.style.backgroundImage===image&&canvas.style.backgroundColor===color,'background restored '+kind);}
   const s={...snapshot(),elementsHtml:'',bgOverlay:false};exportCancelled=false;
   const files=await renderPageFiles(s,'design',.1);assert(files[0].blob.size>0,'export');
   brand.applyToAll=true;commit();const beforeExport=JSON.stringify(captureWorkspace()),renderOriginal=renderPageFiles,saveOriginal=saveOutput;let rendered=0;
   try{renderPageFiles=async(state,name)=>{assert(state.bgStyle===pages[rendered++].state.bgStyle,'page background unchanged');return [{name:name+'.png',blob:new Blob(['test'])}];};saveOutput=async()=>({success:true});await exportPages(true);assert(rendered===pages.length,'all pages exported');assert(JSON.stringify(captureWorkspace())===beforeExport,'export does not mutate design');}finally{renderPageFiles=renderOriginal;saveOutput=saveOriginal;}
   await flushWorkspace();return 'PASS: 12 layouts, preserved original, project validation, undo/redo, opacity roundtrip, 5 backgrounds, PNG export and non-mutating batch export';
  })()`));clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
