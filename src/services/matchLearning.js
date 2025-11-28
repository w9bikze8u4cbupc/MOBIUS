import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DB_DATA_DIR || path.resolve(process.cwd(), 'data');
const LEARNING_FILE = path.join(DATA_DIR, 'match-learning.json');

let learningStore = {
  feedback: [],
  patterns: {},
  componentPatterns: {},
};

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  if (fs.existsSync(LEARNING_FILE)) {
    try {
      learningStore = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf-8'));
    } catch (err) {
      console.warn('Failed to load learning store:', err);
    }
  }
}

function persist() {
  fs.writeFileSync(LEARNING_FILE, JSON.stringify(learningStore, null, 2), 'utf-8');
}

function normalizeComponentKey(component) {
  const name = (component.name || '').toLowerCase().trim();
  const category = (component.category || '').toLowerCase().trim();
  return `${category}:${name}`;
}

function normalizeImageKey(image) {
  const source = (image.source || '').toLowerCase();
  const tags = (image.tags || []).map(t => t.toLowerCase()).sort().join(',');
  return `${source}:${tags}`;
}

function saveMatchFeedback(projectId, feedback) {
  const entry = {
    projectId,
    timestamp: new Date().toISOString(),
    gameName: feedback.gameName || '',
    componentId: feedback.componentId,
    componentName: feedback.componentName,
    componentCategory: feedback.componentCategory,
    imageId: feedback.imageId,
    imageTags: feedback.imageTags || [],
    imageSource: feedback.imageSource,
    isCorrect: feedback.isCorrect,
    correctedImageId: feedback.correctedImageId || null,
  };
  
  learningStore.feedback.push(entry);
  
  const compKey = normalizeComponentKey({
    name: feedback.componentName,
    category: feedback.componentCategory,
  });
  
  if (!learningStore.componentPatterns[compKey]) {
    learningStore.componentPatterns[compKey] = {
      successfulTags: {},
      failedTags: {},
      successfulSources: {},
      failedSources: {},
      examples: [],
    };
  }
  
  const pattern = learningStore.componentPatterns[compKey];
  
  if (feedback.isCorrect) {
    (feedback.imageTags || []).forEach(tag => {
      pattern.successfulTags[tag] = (pattern.successfulTags[tag] || 0) + 1;
    });
    pattern.successfulSources[feedback.imageSource] = 
      (pattern.successfulSources[feedback.imageSource] || 0) + 1;
  } else {
    (feedback.imageTags || []).forEach(tag => {
      pattern.failedTags[tag] = (pattern.failedTags[tag] || 0) + 1;
    });
    pattern.failedSources[feedback.imageSource] = 
      (pattern.failedSources[feedback.imageSource] || 0) + 1;
  }
  
  pattern.examples.push({
    gameName: feedback.gameName,
    imageId: feedback.isCorrect ? feedback.imageId : feedback.correctedImageId,
    wasCorrect: feedback.isCorrect,
  });
  
  if (pattern.examples.length > 20) {
    pattern.examples = pattern.examples.slice(-20);
  }
  
  persist();
  return entry;
}

function getMatchPatterns(componentName, componentCategory) {
  const compKey = normalizeComponentKey({ name: componentName, category: componentCategory });
  return learningStore.componentPatterns[compKey] || null;
}

function getLearnedPatterns() {
  const patterns = [];
  
  for (const [key, data] of Object.entries(learningStore.componentPatterns)) {
    const [category, name] = key.split(':');
    
    const successTags = Object.entries(data.successfulTags)
      .filter(([_, count]) => count >= 2)
      .map(([tag]) => tag);
    
    const failTags = Object.entries(data.failedTags)
      .filter(([_, count]) => count >= 2)
      .map(([tag]) => tag);
    
    if (successTags.length > 0 || failTags.length > 0) {
      patterns.push({
        category,
        name,
        preferTags: successTags,
        avoidTags: failTags,
        successCount: Object.values(data.successfulTags).reduce((a, b) => a + b, 0),
        failCount: Object.values(data.failedTags).reduce((a, b) => a + b, 0),
      });
    }
  }
  
  return patterns;
}

function getFeedbackStats() {
  const total = learningStore.feedback.length;
  const correct = learningStore.feedback.filter(f => f.isCorrect).length;
  const incorrect = total - correct;
  
  return {
    total,
    correct,
    incorrect,
    accuracy: total > 0 ? (correct / total * 100).toFixed(1) : 0,
    patternCount: Object.keys(learningStore.componentPatterns).length,
  };
}

function generateMatchingHints(components, images) {
  const hints = {};
  
  for (const component of components) {
    const pattern = getMatchPatterns(component.name, component.category);
    if (pattern) {
      const preferTags = Object.entries(pattern.successfulTags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag);
      
      const avoidTags = Object.entries(pattern.failedTags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([tag]) => tag);
      
      if (preferTags.length > 0 || avoidTags.length > 0) {
        hints[component.id] = { preferTags, avoidTags };
      }
    }
  }
  
  return hints;
}

ensureStorage();

export {
  saveMatchFeedback,
  getMatchPatterns,
  getLearnedPatterns,
  getFeedbackStats,
  generateMatchingHints,
};
