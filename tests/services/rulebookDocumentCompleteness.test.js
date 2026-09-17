const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildRulebookKnowledgeModel,completeRulebookDocumentCoverage}=require('../../src/services/rulebookKnowledge.cjs');
test('full-page recovery includes clauses beyond a keyword window, preserves prior atoms and replays without calls',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-completeness-'));
 const text='Setup. Place the board in the center. '+ 'Additional official explanation. '.repeat(30)+'Maximum reserve is seven.';
 const model=buildRulebookKnowledgeModel({projectSeed:{sourcePdfSha256:'a'.repeat(64),components:[{id:'board',name:'Board'}]},pages:[{page:1,text}]});
 let calls=0;
 const domainSynthesize=async packet=>{calls++;expect(packet.evidence[0].quote).toContain('Maximum reserve is seven.');return{result:{atoms:[{
 domain:'setup',coverageDomains:['complete_setup'],title:'Place board',actor:'players',procedureSteps:['Place board in center'],placement:'center',componentRefs:['board'],sourceRefs:[{evidenceId:packet.evidence[0].id}]}]}};};
 const first=await completeRulebookDocumentCoverage({model,cacheDir:folder,domainSynthesize});
 const second=await completeRulebookDocumentCoverage({model,cacheDir:folder,domainSynthesize});
 expect(first.model.ruleAtoms).toHaveLength(1);expect(second.model.ruleAtoms[0].id).toBe(first.model.ruleAtoms[0].id);expect(calls).toBe(1);
 expect(second.cacheHits).toBe(1);expect(second.providerCalls).toBe(0);
 fs.rmSync(folder,{recursive:true,force:true});
});
