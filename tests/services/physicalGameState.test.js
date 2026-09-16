const { derivePhysicalGameState, validatePhysicalGameState } = require('../../src/services/physicalGameState.cjs');
test('composition verdict is invalidated by changed phone pixels, state or requirements',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {verifiedInstructionalSequence}=require('../../src/services/physicalGameState.cjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-sequence-'));
 const file=path.join(folder,'pixels');fs.writeFileSync(file,'unit-fixture-pixels');
 const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const requirement={requiredObjects:['track'],trackStateRequired:true};
 const frames=[1,2].map(n=>({id:`frame-${n}`,stage:{position:n},outputPath:file,phonePath:file,sourceImageSha256:hash(),sourcePixelsPerDisplayPixel:1}));
 const sequence={contract:'mobius-source-measured-track-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',sceneId:'scene',assetId:'asset',frames,review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{
 visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',sequenceContract:'mobius-source-measured-track-sequence-v2',requirement,
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
 const sequence={contract:'mobius-source-measured-state-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',sceneId:'scene',assetId:'card-asset',sourceAssets:[
   {assetId:'card-asset',sourceImageSha256:hash(first)},{assetId:'discard-asset',sourceImageSha256:hash(second)}],frames,
   review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',sequenceContract:'mobius-source-measured-state-sequence-v2',requirement,
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

test('an omitted physical quantity remains unknown instead of becoming a false zero', () => {
 const state = derivePhysicalGameState({
   id: 'unquantified-card', sourceRefs: [{ page: 8 }], confidence: .95, reviewState: 'accepted',
   visualRequirement: { requiredObjects: ['deck'], transitionRequired: true,
     beforeState: 'The deck is separate', afterState: 'The deck is ready' },
 });
 expect(state.stages.map(stage => stage.items[0].quantity)).toEqual([null, null]);
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
 const sequence={contract:'mobius-source-grounded-semantic-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',semanticTeaching:true,sceneId:'scene',assetId:'card-asset',sourceTeaching:teaching,
   sourceAssets:[{assetId:'card-asset',sourceImageSha256:hash(source)}],frames,
   review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',sequenceContract:'mobius-source-grounded-semantic-sequence-v2',requirement,
     semanticTeaching:{contract:'mobius-source-grounded-semantic-sequence-v2',sourceTeaching:JSON.parse(JSON.stringify(teaching))},sequenceFrames:frames.map(f=>({id:f.id,stage:f.stage,imageSha256:hash(frame),phoneSha256:hash(frame)}))},
     objects:[{requiredObject:'card',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:false,purposeSatisfied:true,phoneReadable:true}]}]}]}};
 const candidate={id:'card-asset',filePath:source,instructionalSequences:[sequence]};
 expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBe(sequence);
 sequence.review.scenes[0].candidates[0].evidencePacket.requirement.requiredState='Continue play';
 sequence.review.scenes[0].candidates[0].evidencePacket.requirement.requiredRelationship='Resolve the effect';
 expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBe(sequence);
 sequence.review.scenes[0].candidates[0].evidencePacket.semanticTeaching.sourceTeaching[1].instructionalText='Unsourced replacement';
 expect(verifiedInstructionalSequence(candidate,requirement,'scene')).toBeNull();
  fs.rmSync(folder,{recursive:true,force:true});
});

test('placement state applies the cited destination and orientation only after the action', () => {
 const state = derivePhysicalGameState({
   id: 'setup-deck', placement: 'On the board.', orientation: 'Face down.', sourceRefs: [{ page: 5 }],
   confidence: .95, reviewState: 'accepted',
   visualRequirement: { requiredObjects: ['deck'], transitionRequired: true, setupPlacementRequired: true,
     requiredRelationship: 'On the board.', requiredOrientation: 'Face down.' },
 });
 expect(state.stages).toHaveLength(2);
 expect(state.stages[0].items[0]).toMatchObject({ location: null, faceState: 'NOT_APPLICABLE' });
 expect(state.stages[1].items[0]).toMatchObject({ location: 'On the board.', faceState: 'FACE_DOWN' });
});

test('an explicit cited result can establish a face-down state without a separate orientation field', () => {
 const state = derivePhysicalGameState({
   id: 'discard-card', stateAfter: 'Place the resolved card face down in the discard pile.',
   sourceRefs: [{ page: 9 }], confidence: .95, reviewState: 'accepted',
   visualRequirement: { requiredObjects: ['card'], transitionRequired: true, discardPileRequired: true },
 });
 expect(state.stages).toHaveLength(2);
 expect(state.stages[0].items[0].faceState).toBe('NOT_APPLICABLE');
 expect(state.stages[1].items[0].faceState).toBe('FACE_DOWN');
});

test('a source-grounded placement changes the movable object, not its support', () => {
 const state = derivePhysicalGameState({
   id: 'place-card-on-board', placement: 'Place the Criminal card on the Planet board.',
   stateBefore: 'The Planet board is free.', stateChange: 'The Criminal card arrives.',
   stateAfter: 'The Criminal card occupies the Planet board.', sourceRefs: [{ page: 8 }],
   confidence: .95, reviewState: 'accepted', componentRefs: ['planet-board', 'criminal-card'],
   visualRequirement: { requiredObjects: ['planet-board', 'criminal-card'], transitionRequired: true,
     requiredRelationship: 'Place the Criminal card on the Planet board.',
     requiredObjectDescriptors: [
       { id: 'planet-board', name: 'Planet board', category: 'board' },
       { id: 'criminal-card', name: 'Criminal card', category: 'card' },
     ] },
 });
 const after = state.stages.at(-1);
 expect(after.items.find((item) => item.id === 'planet-board')).toMatchObject({ role: 'ANCHOR', location: null });
 expect(after.items.find((item) => item.id === 'criminal-card')).toMatchObject({
   role: 'MOVABLE', arrangement: 'ON_ANCHOR', anchorRef: 'planet-board',
   location: 'Place the Criminal card on the Planet board.',
 });
});

test('a cited deck plus market row keeps both physical representations and quantity', () => {
 const state = derivePhysicalGameState({
   id: 'prepare-market', placement: 'The Common Deck is on the Common Deck board; the 5 cards are in a line.',
   orientation: 'The Common Deck is face down and the 5 cards are face up.',
   stateBefore: 'The Common Deck cards are not prepared.',
   stateAfter: 'A face-down Common Deck is on its board and 5 face-up cards are in a line.',
   sourceRefs: [{ page: 4 }], confidence: .95, reviewState: 'accepted', componentRefs: ['common-cards', 'common-board'],
   visualRequirement: { requiredObjects: ['common-cards', 'common-board'], transitionRequired: true,
     setupPlacementRequired: true, requiredObjectDescriptors: [
       { id: 'common-cards', name: 'Common Deck cards', category: 'card' },
       { id: 'common-board', name: 'Common Deck board', category: 'board' },
     ] },
 });
 const cards = state.stages.at(-1).items.find((item) => item.id === 'common-cards');
 const board = state.stages.at(-1).items.find((item) => item.id === 'common-board');
 expect(cards).toMatchObject({ role: 'MOVABLE', anchorRef: 'common-board', quantity: 5, faceState: 'FACE_DOWN' });
 expect(cards.representations).toEqual(expect.arrayContaining([
   expect.objectContaining({ id: 'deck', arrangement: 'STACK', faceState: 'FACE_DOWN' }),
   expect.objectContaining({ id: 'row', arrangement: 'LINE', quantity: 5, faceState: 'FACE_UP' }),
 ]));
 expect(board.faceState).toBe('NOT_APPLICABLE');
});

test('an instructional diagram stays bound to exact component pixels, labels and the full physical requirement',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {verifiedInstructionalSequence}=require('../../src/services/physicalGameState.cjs');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-instructional-diagram-'));
 const board=path.join(folder,'board'),token=path.join(folder,'token'),frame=path.join(folder,'frame');
 fs.writeFileSync(board,'board pixels');fs.writeFileSync(token,'token pixels');fs.writeFileSync(frame,'final diagram pixels');
 const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const requirement={requiredObjects:['board','token'],transitionRequired:true,requiredRelationship:'Place token on board',beforeState:'Board is ready',actionState:'Place token',afterState:'Token is on board'};
 const teaching=[['before','Avant','Le plateau est prêt.'],['action','Action','Placez le jeton sur le plateau.'],['after','Résultat','Le jeton reste sur le plateau.']].map(([id,label,instructionalText])=>({id,label,instructionalText,sourceRefs:[{page:5}]}));
 const frames=teaching.map((stage,index)=>({id:`frame-${index+1}`,stage,outputPath:frame,phonePath:frame,sourcePixelsPerDisplayPixel:1}));
 const sequence={contract:'mobius-source-grounded-instructional-diagram-v2',materializerContract:'mobius-visual-plan-materializer-v8',instructionalDiagram:true,sceneId:'scene',assetId:'board',sourceTeaching:teaching,
   sourceAssets:[{assetId:'board',sourceImageSha256:hash(board)},{assetId:'token',sourceImageSha256:hash(token)}],frames,
   review:{scenes:[{scene_id:'scene',candidates:[{status:'MEASURED',evidencePacket:{visualRole:'COMPOSITION',responseContract:'normalized-composition-sequence-v2',materializerContract:'mobius-visual-plan-materializer-v8',sequenceContract:'mobius-source-grounded-instructional-diagram-v2',requirement,
     instructionalDiagram:{contract:'mobius-source-grounded-instructional-diagram-v2',sourceTeaching:JSON.parse(JSON.stringify(teaching))},sequenceFrames:frames.map(f=>({id:f.id,stage:f.stage,imageSha256:hash(frame),phoneSha256:hash(frame)}))},objects:[
       {requiredObject:'board',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:true,purposeSatisfied:true,phoneReadable:true},
       {requiredObject:'token',visualRole:'COMPOSITION',method:'provider-pixel-analysis',confidence:.98,present:true,complete:true,isolated:true,stateCompatible:true,purposeSatisfied:true,phoneReadable:true},
     ]}]}]}};
 expect(verifiedInstructionalSequence({id:'board',filePath:board,instructionalSequences:[sequence]},requirement,'scene')).toBe(sequence);
 expect(verifiedInstructionalSequence({id:'token',filePath:token,instructionalSequences:[sequence]},requirement,'scene')).toBe(sequence);
 sequence.review.scenes[0].candidates[0].objects[0].stateCompatible=false;
 expect(verifiedInstructionalSequence({id:'board',filePath:board,instructionalSequences:[sequence]},requirement,'scene')).toBeNull();
 sequence.review.scenes[0].candidates[0].objects[0].stateCompatible=true;
 sequence.review.scenes[0].candidates[0].evidencePacket.instructionalDiagram.sourceTeaching[1].instructionalText='Unsourced';
 expect(verifiedInstructionalSequence({id:'board',filePath:board,instructionalSequences:[sequence]},requirement,'scene')).toBeNull();
 fs.rmSync(folder,{recursive:true,force:true});
});
