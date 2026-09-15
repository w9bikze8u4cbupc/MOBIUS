const t=require('../../src/services/projectStateTransport.cjs');
test('shared evidence remains exact and loadable while plans/scenes/reviews keep only stable references',()=>{
 const candidate={assetId:'a',thumbnailPath:'owned/a.png',rejectionReasons:['detail'],confidence:.3,sourceRefs:[{page:4}],objectAnalysisAttempts:[{sceneId:'s',evidencePacket:{quote:'official '.repeat(1000)}}]};
 const item={id:'r',candidates:[candidate]};
 const body={projectContext:{visualReviewItems:[item],visualPlans:[{review:item}]},scenes:[{review:item}]};
 const compact=t.compactVisualEvidence(body);
 expect(t.bytes(compact)).toBeLessThan(t.bytes(body)/2);
 expect(Object.keys(compact.projectContext.visualEvidence.entries)).toHaveLength(1);
 expect(t.hydrateVisualReviewItem(compact.projectContext.visualReviewItems[0],compact.projectContext.visualEvidence).candidates[0]).toMatchObject(candidate);
 expect(t.compactVisualEvidence(compact)).toEqual(compact);
 expect(t.unpackProjectState(t.packProjectState(compact))).toEqual(compact);
 const bad=JSON.parse(JSON.stringify(compact));bad.projectContext.visualEvidence.entries={};expect(()=>t.validateVisualEvidenceReferences(bad)).toThrow(/Missing/);
});
test('rich ranked candidates retain one full entry with resolvable identity',()=>{
 const candidate={id:'asset',objectAnalysisAttempts:[{quote:'pixels'.repeat(1000)}]};
 const body={projectContext:{plans:Array.from({length:10},()=>({ranked:[{candidate,confidence:.2}]}))}};
 const compact=t.compactVisualEvidence(body),row=compact.projectContext.plans[0].ranked[0];
 expect(compact.projectContext.visualEvidence.entries[row.candidate.visualEvidenceRef]).toEqual(candidate);
 expect(t.bytes(compact)).toBeLessThan(t.bytes(body)/3);
 expect(t.compactVisualEvidence(compact)).toEqual(compact);
});
