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
