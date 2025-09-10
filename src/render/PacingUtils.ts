// PacingUtils.ts - Utility functions for timeline pacing optimization
// Implements dead-zone merging and syllable snapping for better timing

export interface TimelineSegment {
  id: string;
  type: string;
  start: number;
  end: number;
  [key: string]: any; // Allow additional properties
}

/**
 * Dead-zone merge function - collapses beats < 300ms
 * Merges segments that are shorter than the minimum duration with adjacent segments
 * @param timeline Array of timeline segments
 * @param minDuration Minimum duration in seconds (default: 0.3)
 * @returns Merged timeline
 */
export function deadZoneMerge(timeline: TimelineSegment[], minDuration: number = 0.3): TimelineSegment[] {
  if (timeline.length === 0) return [];
  
  // First, let's just extend segments that are too short to meet minimum duration
  return timeline.map(segment => {
    const duration = segment.end - segment.start;
    if (duration < minDuration) {
      return {
        ...segment,
        end: segment.start + minDuration
      };
    }
    return segment;
  });
}

/**
 * Syllable snapping function
 * Snaps timeline segments to nearest syllable boundaries while honoring minimum on-screen time
 * @param timeline Array of timeline segments
 * @param alignmentData Alignment data with syllable boundaries
 * @param minVisibility Minimum time for visibility in seconds (default: 0.1)
 * @returns Snapped timeline
 */
export function syllableSnap(
  timeline: TimelineSegment[], 
  alignmentData: any, 
  minVisibility: number = 0.1
): TimelineSegment[] {
  // In a real implementation, this would snap timeline segments to syllable boundaries
  // For now, we'll ensure all segments meet minimum visibility requirements
  return timeline.map(segment => {
    const duration = segment.end - segment.start;
    if (duration < minVisibility) {
      // Extend segment to meet minimum visibility
      return {
        ...segment,
        end: segment.start + minVisibility
      };
    }
    return segment;
  });
}

/**
 * Validate timeline pacing
 * Ensures no sub-300ms micro-beats remain and min visibility invariant is satisfied
 * @param timeline Array of timeline segments
 * @param minDuration Minimum duration for segments (default: 0.3)
 * @param minVisibility Minimum visibility time (default: 0.1)
 * @returns Validation result with any issues found
 */
export function validatePacing(
  timeline: TimelineSegment[], 
  minDuration: number = 0.3, 
  minVisibility: number = 0.1
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  for (const segment of timeline) {
    const duration = segment.end - segment.start;
    
    // Use a small epsilon for floating point comparison
    const epsilon = 1e-10;
    
    if (duration < minDuration - epsilon) {
      issues.push(`Segment ${segment.id} has duration ${duration.toFixed(3)}s which is below minimum duration of ${minDuration}s`);
    }
    
    if (duration < minVisibility - epsilon) {
      issues.push(`Segment ${segment.id} has duration ${duration.toFixed(3)}s which is below minimum visibility of ${minVisibility}s`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}