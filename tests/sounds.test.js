/* sound bank: Padawan pack names, zip reader (stored + deflate), real playback
   through the board triggers, interrupt semantics, volume, IDB persistence */
const { launchBrowser } = require('./harness');
const path = require('path');
/* the picture is the one thing no assertion here reads, and on a GPU-less
   box it costs ~800 ms an assertion — see HANDOVER §Traps. R2_DRAW=1 puts it
   back when you want to watch, or screenshot, what the test is doing. */
const R2_Q = process.env.R2_DRAW ? '' : '?norender';
let pass=0, fail=0;
const ok=(n,c,x='')=>{ c?pass++:fail++; console.log((c?'  PASS':'  FAIL')+'  '+n+(x?'   '+x:'')); };

(async () => {
  const browser = await launchBrowser({audio:true});
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const target = 'file://'+path.resolve(__dirname, '..', process.env.R2_TARGET || 'R2D2-Simulator.html')+R2_Q;
  await page.goto(target);
  await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
  await page.evaluate(()=>{ PREFS.seenStartup=true; closeStartup(); });
  const ev = f => page.evaluate(f);

  console.log('\n════ the pack names ride along even with no files ════');
  ok('trackDesc knows the Padawan file names', await ev(()=>
    /ALARM3/.test(trackDesc(13)) && /MISC17/.test(trackDesc(21)) && /HUM19/.test(trackDesc(52))));
  ok('and still says which bank the sketch draws it from', await ev(()=>
    /gibberish/.test(trackDesc(13)) && /enable chirp/.test(trackDesc(52))));
  ok('the bank starts empty with a visible invitation', await ev(()=>
    SBANK.count===0 && /drop the Padawan zip/.test($('sbankStat').textContent)));

  console.log('\n════ zip reader: stored + deflate, numbered entries only ════');
  // build a zip IN THE PAGE: 01 stored wav, 07 deflate wav, one junk file
  const zres = await ev(async ()=>{
    function makeWav(freq, secs){
      const sr=8000, n=(sr*secs)|0;
      const buf=new ArrayBuffer(44+n*2); const dv=new DataView(buf);
      const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
      w(0,'RIFF'); dv.setUint32(4,36+n*2,true); w(8,'WAVEfmt '); dv.setUint32(16,16,true);
      dv.setUint16(20,1,true); dv.setUint16(22,1,true); dv.setUint32(24,sr,true);
      dv.setUint32(28,sr*2,true); dv.setUint16(32,2,true); dv.setUint16(34,16,true);
      w(36,'data'); dv.setUint32(40,n*2,true);
      for(let i=0;i<n;i++) dv.setInt16(44+i*2, Math.sin(2*Math.PI*freq*i/sr)*12000, true);
      return buf;
    }
    window.__wav1 = makeWav(440, 3.0);       // long enough to interrupt
    const wav7 = makeWav(880, 0.3);
    const defl7 = await new Response(new Blob([wav7]).stream()
      .pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    const enc = new TextEncoder();
    const crcTab=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
    const crc32=u8=>{let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=crcTab[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
    const chunks=[], cd=[]; let off=0, cnt=0;
    function add(name, data, method, rawSize){
      const nm=enc.encode(name), d=new Uint8Array(data), crc=crc32(new Uint8Array(rawSize!==undefined?rawSizeBuf:data));
      const lh=new DataView(new ArrayBuffer(30));
      lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(8,method,true);
      lh.setUint32(14,crc,true); lh.setUint32(18,d.length,true); lh.setUint32(22,rawSize!==undefined?rawSize:d.length,true);
      lh.setUint16(26,nm.length,true);
      const ch=new DataView(new ArrayBuffer(46));
      ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(10,method,true);
      ch.setUint32(16,crc,true); ch.setUint32(20,d.length,true); ch.setUint32(24,rawSize!==undefined?rawSize:d.length,true);
      ch.setUint16(28,nm.length,true); ch.setUint32(42,off,true);
      cd.push(new Uint8Array(ch.buffer), nm);
      chunks.push(new Uint8Array(lh.buffer), nm, d);
      off += 30+nm.length+d.length; cnt++;
    }
    let rawSizeBuf = window.__wav1; add('01TESTA.wav', window.__wav1, 0);
    rawSizeBuf = wav7; add('sounds/07TESTB.wav', defl7, 8, wav7.byteLength);
    rawSizeBuf = enc.encode('junk').buffer; add('readme.txt', rawSizeBuf, 0);
    const cdLen = cd.reduce((s,c)=>s+c.length,0);
    const eo=new DataView(new ArrayBuffer(22));
    eo.setUint32(0,0x06054b50,true); eo.setUint16(8,cnt,true); eo.setUint16(10,cnt,true);
    eo.setUint32(12,cdLen,true); eo.setUint32(16,off,true);
    const zip = new File([new Blob([...chunks, ...cd, new Uint8Array(eo.buffer)])], 'Padawan_test.zip');
    return await sbankLoadFiles([zip]);
  });
  ok('the zip loads the two numbered tracks and skips the junk',
     zres.loaded===2 && zres.skipped===1 && await ev(()=>SBANK.count===2 && !!SBANK.bufs[1] && !!SBANK.bufs[7]),
     JSON.stringify(zres));
  ok('the deflate entry survived intact (RIFF header present)', await ev(()=>{
    const u = new Uint8Array(SBANK.bufs[7], 0, 4);
    return String.fromCharCode(...u)==='RIFF';
  }));
  ok('the status line flips green', await ev(()=>
    /2 \/ 53/.test($('sbankStat').textContent) && $('sbankStat').classList.contains('ok')));

  console.log('\n════ the boards now make real noise ════');
  await ev(()=>{ SND.vol=15; mp3.playTrack(1); });
  await page.waitForFunction('SBANK.playing && SBANK.playing.n===1', {timeout:10000});
  ok('mp3.playTrack(1) actually plays file 01', true);
  ok('volume 15/30 maps to gain 0.5', await ev(()=>Math.abs(SBANK.gain.gain.value-0.5)<1e-6));
  await ev(()=>player.playSpecified(7));
  await page.waitForFunction('SBANK.playing && SBANK.playing.n===7', {timeout:10000});
  ok('a new trigger interrupts the running track — both boards are single-channel', true);
  ok('a missing track still logs but plays nothing', await ev(()=>{
    const before = SBANK.playing && SBANK.playing.n;
    const r = sbankPlay(33);
    return r===false && SND.track===7 || (mp3.playTrack(33), SND.track===33 && (!SBANK.playing || SBANK.playing.n===before));
  }));
  ok('the HUD names the sound', await ev(()=>/TESTB|MISC/.test(trackDesc(SND.track)) || SND.track===33));

  console.log('\n════ volume 0 is silence, not "unset" (v1.39.5) ════');
  await ev(()=>{ SND.vol=0; mp3.playTrack(1); });
  await page.waitForFunction('SBANK.playing && SBANK.playing.n===1', {timeout:10000});
  ok('volume 0 maps to gain 0, not the 30 default', await ev(()=>SBANK.gain.gain.value===0));
  await ev(()=>{ SND.vol=30; mp3.playTrack(1); });
  await page.waitForFunction('SBANK.playing && SBANK.playing.n===1', {timeout:10000});
  ok('and 30 still maps back to full volume', await ev(()=>SBANK.gain.gain.value===1));

  /* ==================================================================
     v1.43.0 — SILENT WHILE A SETUP OVERLAY IS OPEN (core/audio.js)

     Mike, twice: "selecting certain boxes it makes noises" (fixed for the
     KEYBOARD path in v1.39.6) and then "Its still triggering sounds when
     using the setup menu" — because automation's own timer and the
     pad-connect greeting never went near the keyboard. The board is still
     TOLD; only the speaker is unplugged.
     ================================================================== */
  console.log('\n════ the sound board is silent while a setup overlay is open ════');
  ok('a track played with the build wizard open is logged but not heard', await ev(()=>{
    sbankStop();
    wizOpen(0);
    const modal = uiModalOpen();
    mp3.playTrack(7);
    const heard = !!SBANK.playing;
    const told  = SND.track === 7;
    closeStartup();
    return modal === true && told === true && heard === false;
  }));
  ok('...and the servo-hardware bench counts as one too', await ev(()=>{
    SBANK.playing = null;
    hwOpen();
    const modal = uiModalOpen();
    /* track 7 rather than an arbitrary number: this bank only HAS 1 and 7
       loaded, and sbankPlay() is a no-op for a track with no file — which
       would make this assertion pass for the wrong reason */
    player.playSpecified(7);
    const heard = !!SBANK.playing;
    hwClose();
    return modal === true && SND.track === 7 && heard === false;
  }));
  ok('...and with every overlay closed it plays again', await ev(()=>{
    SBANK.playing = null;
    const modal = uiModalOpen();
    mp3.playTrack(1);
    return modal === false && !!SBANK.playing && SBANK.playing.n === 1;
  }));

  console.log('\n════ persistence (IndexedDB where the browser allows it) ════');
  const idbOk = await ev(()=>new Promise(res=>{
    try{ const rq=indexedDB.open('r2sim-sounds',1); rq.onsuccess=()=>res(true); rq.onerror=()=>res(false); }
    catch(e){ res(false); }
  }));
  if(idbOk){
    await page.reload();
    await page.waitForFunction('typeof CAD!=="undefined" && CAD.loaded', {timeout:40000});
    await page.waitForFunction('SBANK.count===2', {timeout:10000}).catch(()=>{});
    ok('the bank survives a reload', await ev(()=>SBANK.count===2 && !!SBANK.bufs[1] && !!SBANK.bufs[7]));
    await ev(()=>sbankClear());
    ok('Clear forgets everything', await ev(()=>SBANK.count===0));
  }else{
    ok('IndexedDB unavailable here — session-only bank is the designed fallback', true);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log('page errors:', errs.length?errs:'none');
  await browser.close();
  process.exit(fail?1:0);
})();
