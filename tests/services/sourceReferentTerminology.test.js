import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {normalizeSourceReferentTerms,locateInterleavedSourceQuote} from '../../src/services/sourceVisualSelection.js';
test('PDF interleaving recovery retains actual numbers and rejects missing or ambiguous words',()=>{
 expect(locateInterleavedSourceQuote('You may discard a card 2 1 to draw a card.','You may discard a card to draw a card.')).toBe('You may discard a card 2 1 to draw a card');
 expect(locateInterleavedSourceQuote('You may discard a card.','You may discard three cards to draw ten cards.')).toBeNull();
 expect(locateInterleavedSourceQuote('You may discard a card. You may discard a card.','You may discard a card.')).toBeNull();
});
test('source terminology keeps IDs, binds exact quotes, grants no visual acceptance and replays',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'mobius-terms-'));
 const model={sourcePdfSha256:'a'.repeat(64),components:[{id:'c',name:'You may discard a card'}],documentMap:{pages:[{humanPageNumber:2,normalizedText:'Action cards may be discarded.',textHash:'h'}]}};
 let calls=0;const complete=async()=>{calls++;return{response:{choices:[{message:{content:JSON.stringify({referents:[{id:'c',canonicalTerm:'Action cards',frenchTerm:'Cartes Action',category:'card',status:'GROUNDED',reason:'Physical card, not an action heading.',evidence:[{page:2,quote:'Action cards'}]}]})}}]}};};
 const args={model,cachePath:path.join(folder,'cache.json'),env:{OPENAI_API_KEY:'fixture',OPENAI_MODEL:'configured-model'},complete};
 const a=await normalizeSourceReferentTerms(args),b=await normalizeSourceReferentTerms(args);
 expect(a.result.referents[0].id).toBe('c');expect(a.result.referents[0].accepted).toBeUndefined();expect(b.providerCalls).toBe(0);expect(calls).toBe(1);
 fs.rmSync(folder,{recursive:true,force:true});
});
