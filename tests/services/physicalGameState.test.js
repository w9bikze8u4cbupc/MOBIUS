const { derivePhysicalGameState, validatePhysicalGameState } = require('../../src/services/physicalGameState.cjs');
test('composition verdict is invalidated by changed phone pixels, state or requirements',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {verifiedInstructionalSequence}=require('../../src/services/physicalGameState.cjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-sequence-'));
 const file=path.join(folder,'pixels');fs.writeFileSync(file,'unit-fixture-pixels');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const requirement={requiredObjects:['track'],trackStateRequired:true};
 const frames=[1,2].map(n=>({id:`frame-${n}`,stage:{position:n},outputPath:file,phonePath:file,sourceImageSha256:hash(),sourcePixelsPerDisplayPixel:1}));
 const sequence={sceneId:'scene',assetId:'asset',frames,review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{
 visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',requirement,
 sequenceFrames:frames.map(f=>({id:f.id,stage:{...f.stage},imageSha256:hash(),phoneSha256:hash()}))},
 objects:[{requiredObject:'track',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:true,purposeSatisfied:true,phoneReadable:true}]}]}]}};
 const candidate={id:'asset',filePath:file,instructionalSequences:[sequence]};
 expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBe(sequence);
 expect(verifiedInstructionalSequence(candidate,{...requirement,requiredState:'different'},'scene')).toBeNull();
 frames[1].stage.position=7;expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBeNull();frames[1].stage.position=2;
 fs.writeFileSync(file,'changed fixture pixels');expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBeNull();
 fs.rmSync(folder,{recursive:true,force:true});
});

test('a multi-component source-measured sequence stays bound to every source asset',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {verifiedInstructionalSequence}=require('../../src/services/physicalGameState.cjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-multi-sequence-'));
 const first=path.join(folder,'first'),second=path.join(folder,'second'),frame=path.join(folder,'frame');
 fs.writeFileSync(first,'first pixels');fs.writeFileSync(second,'second pixels');fs.writeFileSync(frame,'final pixels');
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const requirement={requiredObjects:['card','discard'],transitionRequired:true,beforeState:'Cards are held',afterState:'Cards are discarded'};
 const frames=[1,2].map(n=>({id:`frame-${n}`,stage:{id:`stage-${n}`},outputPath:frame,phonePath:frame,sourcePixelsPerDisplayPixel:1}));
 const sequence={sceneId:'scene',assetId:'card-asset',sourceAssets:[
   {assetId:'card-asset',sourceImageSha256:hash(first)},{assetId:'discard-asset',sourceImageSha256:hash(second)}],frames,
   review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',requirement,
     sequenceFrames:frames.map(f=>({id:f.id,stage:f.stage,imageSha256:hash(frame),phoneSha256:hash(frame)}))},objects:[
       {requiredObject:'card',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:true,purposeSatisfied:true,phoneReadable:true},
       {requiredObject:'discard',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:true,purposeSatisfied:true,phoneReadable:true},
     ]}]}]}};
 expect(verifiedInstructionalSequence({id:'card-asset',filePath:first,instructionalSequences:[sequence]},requirement,'scene')).toBe(sequence);
 expect(verifiedInstructionalSequence({id:'discard-asset',filePath:second,instructionalSequences:[sequence]},requirement,'scene')).toBe(sequence);
 fs.writeFileSync(second,'changed pixels');
 expect(verifiedInstructionalSequence({id:'discard-asset',filePath:second,instructionalSequences:[sequence]},requirement,'scene')).toBeNull();
 fs.rmSync(folder,{recursive:true,force:true});
});

test('derives a reusable consumed one-shot marker transition', () => {
  const state = derivePhysicalGameState({
    id: 'threshold', domain: 'triggered_effect', componentRefs: ['penalty-token'],
    stateBefore: 'Token present', stateChange: 'Cross threshold and remove token', stateAfter: 'Token removed',
    sourceRefs: [{ page: 7 }], confidence: 0.95, reviewState: 'accepted',
    visualRequirement: { requiredObjects: ['penalty-token'], transitionRequired: true, oneShotMarkerRequired: true },
  });
  expect(state.transitionType).toBe('CONSUMED_TRIGGER');
  expect(state.stages[0].items[0].removed).toBe(false);
  expect(state.stages[1].items[0].removed).toBe(true);
  expect(validatePhysicalGameState(state)).toEqual({ valid: true, violations: [] });
});

test('derived state stages preserve their RuleAtom citations', () => {
 const state=derivePhysicalGameState({
   id:'cited-transition', sourceRefs:[{page:7,excerptHash:'source-evidence'}], confidence:.95, reviewState:'accepted',
   visualRequirement:{requiredObjects:['token'],transitionRequired:true},
 });
 expect(state.stages).toHaveLength(2);
 expect(state.stages.map(stage=>stage.sourceRefs)).toEqual([
   [{page:7,excerptHash:'source-evidence'}],
   [{page:7,excerptHash:'source-evidence'}],
 ]);
});

test('a semantic teaching sequence is accepted only with its exact source-grounded labels',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {verifiedInstructionalSequence}=require('../../src/services/physicalGameState.cjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-semantic-sequence-'));
 const source=path.join(folder,'source'),frame=path.join(folder,'frame');fs.writeFileSync(source,'source pixels');fs.writeFileSync(frame,'final pixels');
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const requirement={requiredObjects:['card'],transitionRequired:true,beforeState:'Available',actionState:'Resolve the effect',afterState:'Continue play'};
 const teaching=['Available','Resolve the effect','Continue play'].map((instructionalText,index)=>({id:['before','action','after'][index],label:['Avant','Action','Après'][index],instructionalText,sourceRefs:[{page:4}]}));
 const frames=teaching.map((stage,index)=>({id:`frame-${index + 1}`,stage:{...stage},outputPath:frame,phonePath:frame,sourcePixelsPerDisplayPixel:1}));
 const sequence={contract:'mobius-source-grounded-semantic-sequence-v1',semanticTeaching:true,sceneId:'scene',assetId:'card-asset',sourceTeaching:teaching,
   sourceAssets:[{assetId:'card-asset',sourceImageSha256:hash(source)}],frames,
   review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',requirement,
     semanticTeaching:{contract:'mobius-source-grounded-semantic-sequence-v1',sourceTeaching:JSON.parse(JSON.stringify(teaching))},sequenceFrames:frames.map(f=>({id:f.id,stage:f.stage,imageSha256:hash(frame),phoneSha256:hash(frame)}))},
     objects:[{requiredObject:'card',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:true,purposeSatisfied:true,phoneReadable:true}]}]}]}};
 const candidate={id:'card-asset',filePath:source,instructionalSequences:[sequence]};
 expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBe(sequence);
 sequence.review.scenes[0].candidates[0].evidencePacket.semanticTeaching.sourceTeaching[1].instructionalText='Unsourced replacement';
 expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBeNull();
 fs.rmSync(folder,{recursive:true,force:true});
});
