'use strict';
/* =====================================================================
   CAD DROID — loads the .r2m container built from the Fusion exports and
   drives it from the same ACT actuator values as the procedural model.

   Container: 'R2M1' | uint32 headerLen | header JSON | int16[3]*V positions
              | int8[3]*V normals | uint32[3]*T indices
   Positions are quantised over the model bbox; hinge pivots/axes/travel for
   every moving part were derived from the CAD itself (including its own
   breadpan and dataport hinge bodies) and live in the header.
   ===================================================================== */
const CAD = {
  loaded:false, header:null, fileName:'',
  root:null, dome:null, body:null,
  moving:[],            // {part, group, mesh, rig, act, sign}
  kindGroups:{},        // kind -> THREE.Group holding the merged statics
  mats:[],
  show:{ shell:true, pie:true, panel:true, anim:true, leg:true, internal:false, outlier:false },
  yOffset:0.30, procLegs:true, active:false, stats:null
};

/* ------------------------------------------------------------------ decode */
function decodeR2M(buf){
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3));
  if(magic!=='R2M1') throw new Error('not an .r2m container');
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen)));
  let off = 8 + hlen;
  const V = header.vertexCount, T = header.triCount;
  /* Typed-array views need their element alignment and the header length varies,
     so fall back to a copy whenever the offset does not line up. */
  const view = (Ctor, count)=>{
    const bytes = count * Ctor.BYTES_PER_ELEMENT;
    let out;
    if(off % Ctor.BYTES_PER_ELEMENT === 0) out = new Ctor(buf, off, count);
    else { out = new Ctor(count); new Uint8Array(out.buffer).set(new Uint8Array(buf, off, bytes)); }
    off += bytes;
    return out;
  };
  const q   = view(Int16Array,  V*3);
  const n   = view(Int8Array,   V*3);
  const idx = view(Uint32Array, T*3);

  const lo = header.bboxLo, span = header.bboxSpan;
  const pos = new Float32Array(V*3);
  for(let i=0;i<V;i++){
    pos[i*3  ] = lo[0] + (q[i*3  ]+32767)/65534*span[0];
    pos[i*3+1] = lo[1] + (q[i*3+1]+32767)/65534*span[1];
    pos[i*3+2] = lo[2] + (q[i*3+2]+32767)/65534*span[2];
  }
  const nrm = new Float32Array(V*3);
  for(let i=0;i<V*3;i++) nrm[i] = Math.max(-1, n[i]/127);
  return {header, pos, nrm, idx};
}

async function inflateB64(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  if(typeof DecompressionStream === 'undefined')
    throw new Error('this browser has no DecompressionStream — drop the .r2m file in instead');
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}
