// tests/unit/scriptLocalization.test.js
// Unit tests for script localization module

import {
  createLocalizedScript,
  validateLocalization,
  buildLocalizationPrompt,
  parseLocalizationResponse,
  isLocalizationConfirmed,
  getConfirmedLocalization,
  LocalizationErrorCode
} from '../scriptLocalization.js';
import { LocalizationStatus, SupportedLanguages } from '../scriptArtifact.js';

describe('Script Localization', () => {
  
  // Mock authoritative EN script
  const mockEnScript = {
    id: 'script-en-123',
    projectId: 1,
    language: 'en',
    status: 'authoritative',
    scriptSegments: [
      { type: 'introduction', content: 'Welcome to this tutorial for Sushi Go!' },
      { type: 'component_overview', content: 'The game includes 108 cards.' },
      { type: 'setup', content: 'Shuffle the deck and deal 7 cards to each player.' }
    ],
    localizations: {}
  };
  
  describe('createLocalizedScript', () => {
    
    it('should create a valid FR localization', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(
        mockEnScript,
        'fr',
        translatedSegments,
        { model: 'gpt-4' }
      );
      
      expect(localization).toBeDefined();
      expect(localization.language).toBe('fr');
      expect(localization.sourceScriptId).toBe('script-en-123');
      expect(localization.sourceLanguage).toBe('en');
      expect(localization.status).toBe(LocalizationStatus.PENDING);
      expect(localization.segments).toHaveLength(3);
      
      // Check segment mappings
      localization.segments.forEach((seg, index) => {
        expect(seg.segmentIndex).toBe(index);
        expect(seg.type).toBe(mockEnScript.scriptSegments[index].type);
        expect(seg.enSegmentRef).toBeDefined();
        expect(seg.enSegmentRef.index).toBe(index);
        expect(seg.enSegmentRef.contentHash).toBeDefined();
      });
    });
    
    it('should throw error if source script is not EN', () => {
      const nonEnScript = { ...mockEnScript, language: 'fr' };
      
      expect(() => {
        createLocalizedScript(nonEnScript, 'fr', []);
      }).toThrow('Authoritative script must be in English');
    });
    
    it('should throw error for unsupported target language', () => {
      expect(() => {
        createLocalizedScript(mockEnScript, 'es', []);
      }).toThrow('Unsupported target language: es');
    });
    
    it('should throw error on segment count mismatch', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' }
        // Missing third segment
      ];
      
      expect(() => {
        createLocalizedScript(mockEnScript, 'fr', translatedSegments);
      }).toThrow('Segment count mismatch');
    });
    
    it('should include metadata', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(
        mockEnScript,
        'fr',
        translatedSegments,
        { model: 'gpt-4', translationMethod: 'llm' }
      );
      
      expect(localization.metadata.model).toBe('gpt-4');
      expect(localization.metadata.translationMethod).toBe('llm');
      expect(localization.metadata.segmentCount).toBe(3);
      expect(localization.metadata.wordCount).toBeGreaterThan(0);
    });
  });
  
  describe('validateLocalization', () => {
    
    it('should validate a correct localization', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(mockEnScript, 'fr', translatedSegments);
      const validation = validateLocalization(localization, mockEnScript);
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
    
    it('should detect source script ID mismatch', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(mockEnScript, 'fr', translatedSegments);
      
      // Tamper with source script ID
      localization.sourceScriptId = 'wrong-id';
      
      const validation = validateLocalization(localization, mockEnScript);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('Source script ID mismatch'))).toBe(true);
    });
    
    it('should detect segment count mismatch', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(mockEnScript, 'fr', translatedSegments);
      
      // Tamper with segments
      localization.segments.push({
        segmentIndex: 3,
        type: 'extra',
        content: 'Extra segment'
      });
      
      const validation = validateLocalization(localization, mockEnScript);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('Segment count mismatch'))).toBe(true);
    });
    
    it('should detect segment type mismatch', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(mockEnScript, 'fr', translatedSegments);
      
      // Tamper with segment type
      localization.segments[1].type = 'wrong_type';
      
      const validation = validateLocalization(localization, mockEnScript);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('type mismatch'))).toBe(true);
    });
    
    it('should detect missing EN segment reference', () => {
      const translatedSegments = [
        { content: 'Bienvenue dans ce tutoriel pour Sushi Go!' },
        { content: 'Le jeu comprend 108 cartes.' },
        { content: 'Mélangez le paquet et distribuez 7 cartes à chaque joueur.' }
      ];
      
      const localization = createLocalizedScript(mockEnScript, 'fr', translatedSegments);
      
      // Remove EN reference
      delete localization.segments[0].enSegmentRef;
      
      const validation = validateLocalization(localization, mockEnScript);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('missing EN segment reference'))).toBe(true);
    });
  });
  
  describe('buildLocalizationPrompt', () => {
    
    it('should build a valid prompt', () => {
      const prompt = buildLocalizationPrompt(mockEnScript, 'fr');
      
      expect(prompt).toContain('French');
      expect(prompt).toContain('Sushi Go!');
      expect(prompt).toContain('introduction');
      expect(prompt).toContain('component_overview');
      expect(prompt).toContain('setup');
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('3 segments'); // Segment count
    });
    
    it('should include all segments', () => {
      const prompt = buildLocalizationPrompt(mockEnScript, 'fr');
      
      mockEnScript.scriptSegments.forEach(seg => {
        expect(prompt).toContain(seg.content);
      });
    });
  });
  
  describe('parseLocalizationResponse', () => {
    
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        segments: [
          { index: 0, type: 'introduction', content: 'Bienvenue' },
          { index: 1, type: 'component_overview', content: 'Le jeu' },
          { index: 2, type: 'setup', content: 'Mélangez' }
        ]
      });
      
      const segments = parseLocalizationResponse(response);
      
      expect(segments).toHaveLength(3);
      expect(segments[0].content).toBe('Bienvenue');
    });
    
    it('should extract JSON from markdown code blocks', () => {
      const response = '```json\n' + JSON.stringify({
        segments: [
          { index: 0, type: 'introduction', content: 'Bienvenue' }
        ]
      }) + '\n```';
      
      const segments = parseLocalizationResponse(response);
      
      expect(segments).toHaveLength(1);
    });
    
    it('should throw error on invalid JSON', () => {
      const response = 'This is not JSON';
      
      expect(() => {
        parseLocalizationResponse(response);
      }).toThrow('No JSON found in localization response');
    });
    
    it('should throw error on missing segments array', () => {
      const response = JSON.stringify({ data: 'no segments' });
      
      expect(() => {
        parseLocalizationResponse(response);
      }).toThrow('missing segments array');
    });
  });
  
  describe('isLocalizationConfirmed', () => {
    
    it('should return true for confirmed localization', () => {
      const scriptWithLocalization = {
        ...mockEnScript,
        localizations: {
          fr: {
            status: LocalizationStatus.CONFIRMED
          }
        }
      };
      
      expect(isLocalizationConfirmed(scriptWithLocalization, 'fr')).toBe(true);
    });
    
    it('should return false for pending localization', () => {
      const scriptWithLocalization = {
        ...mockEnScript,
        localizations: {
          fr: {
            status: LocalizationStatus.PENDING
          }
        }
      };
      
      expect(isLocalizationConfirmed(scriptWithLocalization, 'fr')).toBe(false);
    });
    
    it('should return false for missing localization', () => {
      expect(isLocalizationConfirmed(mockEnScript, 'fr')).toBe(false);
    });
    
    it('should return false for null script', () => {
      expect(isLocalizationConfirmed(null, 'fr')).toBe(false);
    });
  });
  
  describe('getConfirmedLocalization', () => {
    
    it('should return confirmed localization', () => {
      const frLocalization = {
        id: 'loc-fr-123',
        status: LocalizationStatus.CONFIRMED,
        language: 'fr'
      };
      
      const scriptWithLocalization = {
        ...mockEnScript,
        localizations: {
          fr: frLocalization
        }
      };
      
      const result = getConfirmedLocalization(scriptWithLocalization, 'fr');
      
      expect(result).toBe(frLocalization);
    });
    
    it('should return null for pending localization', () => {
      const scriptWithLocalization = {
        ...mockEnScript,
        localizations: {
          fr: {
            status: LocalizationStatus.PENDING
          }
        }
      };
      
      const result = getConfirmedLocalization(scriptWithLocalization, 'fr');
      
      expect(result).toBeNull();
    });
    
    it('should return null for missing localization', () => {
      const result = getConfirmedLocalization(mockEnScript, 'fr');
      
      expect(result).toBeNull();
    });
  });
});
