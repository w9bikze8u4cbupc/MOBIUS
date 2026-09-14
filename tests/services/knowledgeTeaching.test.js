import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {materializeKnowledgeTeaching,applyKnowledgeTeaching,teachingPacket,validateTeaching} from '../../src/services/knowledgeTeaching.js';

const model={sourcePdfSha256:'a'.repeat(64),ruleAtoms:[{id:'rule-fixture',reviewState:'accepted',trigger:'After ending a turn',result:'Keep the remaining counters',sourceRefs:[{page:2,quote:'Keep remaining counters.'}],teaching:{narration:'Keep counters',heading:'Counters',sequence:1}}]};
const result={lessons:[{atomId:'rule-fixture',heading:'Conserver les marqueurs',narration:'À la fin du tour, conservez les marqueurs qui restent pour le tour suivant.',displayLines:['Conservez vos marqueurs'],sourcePages:[2]}]};
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
});
test('unknown IDs and out-of-source or zero pages are refused',()=>{
 const packet=teachingPacket(model,'fr-CA');
 for(const change of [{atomId:'other'},{sourcePages:[0]},{sourcePages:[3]}]) expect(()=>validateTeaching({lessons:[{...result.lessons[0],...change}]},packet)).toThrow();
});
