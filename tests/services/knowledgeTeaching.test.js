import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {materializeKnowledgeTeaching,applyKnowledgeTeaching,teachingPacket,validateTeaching} from '../../src/services/knowledgeTeaching.js';

const model={sourcePdfSha256:'a'.repeat(64),ruleAtoms:[{id:'rule-fixture',reviewState:'accepted',trigger:'After ending a turn',result:'Keep the remaining counters',sourceRefs:[{page:2,quote:'Keep remaining counters.'}],teaching:{narration:'Keep counters',heading:'Counters',sequence:1}}]};
const result={lessons:[{atomId:'rule-fixture',heading:'Conserver les marqueurs',narration:'À la fin du tour, conservez les marqueurs qui restent pour le tour suivant.',displayLines:['Conservez vos marqueurs'],sourcePages:[2],visualTeaching:{beforeState:null,actionState:null,afterState:null}}]};
test('source-grounded localized teaching preserves rules and replays without provider calls',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'teaching-'));
 let calls=0;
 const complete=async()=>{calls++;return {response:{choices:[{message:{content:JSON.stringify(result)}}],usage:{total_tokens:100}},provenance:{provider:'fixture'}};};
 const args={model,cachePath:path.join(dir,'teaching.json'),env:{OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture'},complete};
 const first=await materializeKnowledgeTeaching(args), replay=await materializeKnowledgeTeaching(args);
 expect(calls).toBe(1);expect(replay.providerCalls).toBe(0);
 const localized=applyKnowledgeTeaching(model,first);
 expect(localized.ruleAtoms[0].trigger).toBe(model.ruleAtoms[0].trigger);
 expect(localized.ruleAtoms[0].sourceRefs).toEqual(model.ruleAtoms[0].sourceRefs);
 expect(model.ruleAtoms[0].teaching.narration).toBe('Keep counters');
 expect(localized.ruleAtoms[0].teaching.narration).toBe(result.lessons[0].narration);
 expect(localized.ruleAtoms[0].teaching.visualTeaching).toEqual(result.lessons[0].visualTeaching);
});
test('every source visual transition receives a localized label and absent steps stay null',()=>{
 const transition={...model,ruleAtoms:[{...model.ruleAtoms[0],visualRequirement:{beforeState:'Before source fact',actionState:'Apply source fact',afterState:'After source fact'}}]};
 const packet=teachingPacket(transition,'fr-CA');
 const localized={lessons:[{...result.lessons[0],visualTeaching:{beforeState:'Avant le fait source',actionState:'Appliquez le fait source',afterState:'Après le fait source'}}]};
 expect(validateTeaching(localized,packet)).toBe(localized);
 expect(()=>validateTeaching({lessons:[{...localized.lessons[0],visualTeaching:{...localized.lessons[0].visualTeaching,actionState:null}}]},packet)).toThrow('TEACHING_VISUAL_STEP_MISSING:actionState');
 expect(()=>validateTeaching({lessons:[{...result.lessons[0],visualTeaching:{beforeState:'Ungrounded',actionState:null,afterState:null}}]},teachingPacket(model,'fr-CA'))).toThrow('TEACHING_VISUAL_STEP_UNGROUNDED:beforeState');
});
test('unknown IDs and out-of-source or zero pages are refused',()=>{
 const packet=teachingPacket(model,'fr-CA');
 for(const change of [{atomId:'other'},{sourcePages:[0]},{sourcePages:[3]}]) expect(()=>validateTeaching({lessons:[{...result.lessons[0],...change}]},packet)).toThrow();
});
